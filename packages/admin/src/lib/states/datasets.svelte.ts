/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ESTADO GLOBAL REACTIVO - Svelte 5 Runes
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este archivo implementa el estado global para datasets usando el nuevo
 * sistema de reactividad de Svelte 5 ($state, $derived).
 *
 * ⚠️ IMPORTANTE: No usar stores antiguos (writable, readable, derived).
 * Svelte 5 Runes proporciona reactividad fina sin boilerplate.
 *
 * Patrón: Clase Reactiva con $state + Instancia Singleton
 */

import type {
  DatasetDefinition,
  CreateDatasetPayload,
  UpdateDatasetPayload,
} from "@kitsuden/shared";

// ═══════════════════════════════════════════════════════════════════════════
// Configuración de API
// ═══════════════════════════════════════════════════════════════════════════

const API_URL = import.meta.env.VITE_API_URL ?? "";

/**
 * Traduce una fila de la API a `DatasetDefinition`.
 *
 * ── UN MISMO ARRAY CON DOS NOMBRES ─────────────────────────────────────────
 *
 * En la base y en la API, las columnas de un dataset viven en **`schema`**.
 * En `DatasetDefinition` de `@kitsuden/shared` —que es lo que este estado
 * declara— se llaman **`fields`**. Nadie traducía entre los dos, así que la
 * lista leía `dataset.fields` de una fila que solo traía `schema` y **todos
 * los datasets salían con «0 fields»**, incluidos los que tienen veinte
 * columnas y miles de filas. TypeScript no lo veía: la respuesta entraba
 * como `any` y el tipo decía una cosa mientras el dato traía otra.
 *
 * La traducción se hace aquí, en el borde, para que a partir de este punto
 * el tipo declarado sea verdad.
 */
function aDefinicion(fila: Record<string, unknown>): DatasetDefinition {
  const columnas = fila.schema ?? fila.fields;
  return {
    ...(fila as unknown as DatasetDefinition),
    fields: Array.isArray(columnas) ? columnas : [],
  } as DatasetDefinition;
}

// ═══════════════════════════════════════════════════════════════════════════
// Clase DatasetStore - Estado Reactivo Global
// ═══════════════════════════════════════════════════════════════════════════

export class DatasetStore {
  // ─── Estado Reactivo Core ───
  /** Lista de datasets cargados */
  datasets = $state<DatasetDefinition[]>([]);

  /** Estado de carga para operaciones async */
  isLoading = $state<boolean>(false);

  /** Dataset seleccionado actualmente (para edición/vista detalle) */
  selectedDataset = $state<DatasetDefinition | null>(null);

  /** Error actual si existe */
  error = $state<string | null>(null);

  // ─── Estado Derivado ($derived) ───
  /** Cantidad total de datasets */
  totalCount = $derived<number>(this.datasets.length);

  /** Datasets ordenados por nombre */
  sortedDatasets = $derived<DatasetDefinition[]>(
    [...this.datasets].sort((a, b) => a.name.localeCompare(b.name))
  );

  /** Indica si hay datasets cargados */
  hasDatasets = $derived<boolean>(this.datasets.length > 0);

  // ═══════════════════════════════════════════════════════════════════════════
  // Métodos CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Carga todos los datasets desde la API
   * Muta reactivamente: isLoading → datasets → error
   */
  async fetchDatasets(): Promise<void> {
    this.isLoading = true;
    this.error = null;

    try {
      const response = await fetch(`${API_URL}/api/datasets`, { credentials: "include" });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      // La API retorna { docs: DatasetDefinition[], totalDocs: number }
      this.datasets = (data.docs || []).map(aDefinicion);
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Failed to fetch datasets";
      console.error("[DatasetStore] fetchDatasets error:", err);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Obtiene un dataset por ID y lo selecciona
   */
  async fetchDatasetById(id: string): Promise<DatasetDefinition | null> {
    this.isLoading = true;
    this.error = null;

    try {
      const response = await fetch(`${API_URL}/api/datasets/${id}`, { credentials: "include" });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const dataset = aDefinicion(await response.json());
      this.selectedDataset = dataset;
      return dataset;
    } catch (err) {
      this.error = err instanceof Error ? err.message : `Failed to fetch dataset ${id}`;
      console.error(`[DatasetStore] fetchDatasetById(${id}) error:`, err);
      return null;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Crea un nuevo dataset
   * Optimistic update: agrega a la lista local inmediatamente
   */
  async createDataset(payload: CreateDatasetPayload): Promise<DatasetDefinition | null> {
    this.isLoading = true;
    this.error = null;

    try {
      const response = await fetch(`${API_URL}/api/datasets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const newDataset = aDefinicion(await response.json());
      // Mutación reactiva: agrega al array
      this.datasets = [...this.datasets, newDataset];
      return newDataset;
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Failed to create dataset";
      console.error("[DatasetStore] createDataset error:", err);
      return null;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Actualiza un dataset existente
   */
  async updateDataset(
    id: string,
    payload: UpdateDatasetPayload
  ): Promise<DatasetDefinition | null> {
    this.isLoading = true;
    this.error = null;

    try {
      const response = await fetch(`${API_URL}/api/datasets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const updatedDataset = aDefinicion(await response.json());

      // Actualiza en el array local
      this.datasets = this.datasets.map((ds) => (ds.id === id ? updatedDataset : ds));

      // Si está seleccionado, actualiza también
      if (this.selectedDataset?.id === id) {
        this.selectedDataset = updatedDataset;
      }

      return updatedDataset;
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Failed to update dataset";
      console.error(`[DatasetStore] updateDataset(${id}) error:`, err);
      return null;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Elimina un dataset
   */
  async deleteDataset(id: string): Promise<boolean> {
    this.isLoading = true;
    this.error = null;

    try {
      const response = await fetch(`${API_URL}/api/datasets/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Remueve del array local
      this.datasets = this.datasets.filter((ds) => ds.id !== id);

      // Si estaba seleccionado, limpia
      if (this.selectedDataset?.id === id) {
        this.selectedDataset = null;
      }

      return true;
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Failed to delete dataset";
      console.error(`[DatasetStore] deleteDataset(${id}) error:`, err);
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Métodos de UI State
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Selecciona un dataset para edición/vista
   */
  selectDataset(dataset: DatasetDefinition | null): void {
    this.selectedDataset = dataset;
  }

  /**
   * Limpia el error actual
   */
  clearError(): void {
    this.error = null;
  }

  /**
   * Resetea el store a estado inicial
   */
  reset(): void {
    this.datasets = [];
    this.selectedDataset = null;
    this.error = null;
    this.isLoading = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Instancia Singleton - Exportación Global
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Instancia única del DatasetStore para uso global.
 *
 * Uso en componentes Svelte:
 * ```svelte
 * <script>
 *   import { datasetStore } from '$lib/states/datasets.svelte';
 *
 *   // Acceso directo a estado reactivo
 *   $effect(() => {
 *     datasetStore.fetchDatasets();
 *   });
 * </script>
 *
 * {#if datasetStore.isLoading}
 *   <p>Loading...</p>
 * {:else}
 *   {#each datasetStore.datasets as dataset}
 *     <p>{dataset.name}</p>
 *   {/each}
 * {/if}
 * ```
 */
export const datasetStore = new DatasetStore();

// ═══════════════════════════════════════════════════════════════════════════
// Exportaciones de Tipo
// ═══════════════════════════════════════════════════════════════════════════

export type { DatasetDefinition, CreateDatasetPayload, UpdateDatasetPayload };
