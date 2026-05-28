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
import type { DatasetDefinition, CreateDatasetPayload, UpdateDatasetPayload } from "@gremius/shared";
export declare class DatasetStore {
    /** Lista de datasets cargados */
    datasets: DatasetDefinition[];
    /** Estado de carga para operaciones async */
    isLoading: boolean;
    /** Dataset seleccionado actualmente (para edición/vista detalle) */
    selectedDataset: any;
    /** Error actual si existe */
    error: string | null;
    /** Cantidad total de datasets */
    totalCount: number;
    /** Datasets ordenados por nombre */
    sortedDatasets: DatasetDefinition[];
    /** Indica si hay datasets cargados */
    hasDatasets: boolean;
    /**
     * Carga todos los datasets desde la API
     * Muta reactivamente: isLoading → datasets → error
     */
    fetchDatasets(): Promise<void>;
    /**
     * Obtiene un dataset por ID y lo selecciona
     */
    fetchDatasetById(id: string): Promise<DatasetDefinition | null>;
    /**
     * Crea un nuevo dataset
     * Optimistic update: agrega a la lista local inmediatamente
     */
    createDataset(payload: CreateDatasetPayload): Promise<DatasetDefinition | null>;
    /**
     * Actualiza un dataset existente
     */
    updateDataset(id: string, payload: UpdateDatasetPayload): Promise<DatasetDefinition | null>;
    /**
     * Elimina un dataset
     */
    deleteDataset(id: string): Promise<boolean>;
    /**
     * Selecciona un dataset para edición/vista
     */
    selectDataset(dataset: DatasetDefinition | null): void;
    /**
     * Limpia el error actual
     */
    clearError(): void;
    /**
     * Resetea el store a estado inicial
     */
    reset(): void;
}
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
export declare const datasetStore: DatasetStore;
export type { DatasetDefinition, CreateDatasetPayload, UpdateDatasetPayload };
//# sourceMappingURL=datasets.svelte.d.ts.map