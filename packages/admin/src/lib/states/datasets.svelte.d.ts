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
    datasets: {
        id: string;
        name: string;
        slug: string;
        fields: {
            id: string;
            type: "number" | "boolean" | "image" | "url" | "text" | "date" | "email" | "select" | "json" | "richtext" | "relation" | "kpi";
            key: string;
            label: string;
            order: number;
            isRequired: boolean;
            isUnique: boolean;
            hidden: boolean;
            options?: {
                value: string;
                label: string;
            }[] | undefined;
            relation?: {
                type: "one-to-one" | "one-to-many" | "many-to-many";
                target: "games" | "platforms" | "blog-posts" | "tags" | "streamers" | "dataset";
                targetDatasetId?: string | undefined;
                targetDatasetName?: string | undefined;
                displayField?: string | undefined;
            } | undefined;
            helpText?: string | undefined;
            validationRegex?: string | undefined;
            defaultValue?: string | undefined;
            minValue?: number | undefined;
            maxValue?: number | undefined;
            minLength?: number | undefined;
            maxLength?: number | undefined;
            width?: number | undefined;
        }[];
        description?: string | undefined;
        icon?: string | undefined;
        policyJson?: {
            readAccess: "admin" | "public" | "authenticated";
            writeAccess: "admin" | "authenticated";
            enableRLS: boolean;
            rlsRules?: {
                value: string;
                field: string;
                operator: "eq" | "neq" | "contains" | "gt" | "lt";
            }[] | undefined;
        } | null | undefined;
        workflowJson?: {
            requireApproval: boolean;
            approverUserIds?: string[] | undefined;
        } | null | undefined;
        createdAt?: string | undefined;
        updatedAt?: string | undefined;
    }[];
    /** Estado de carga para operaciones async */
    isLoading: boolean;
    /** Dataset seleccionado actualmente (para edición/vista detalle) */
    selectedDataset: {
        id: string;
        name: string;
        slug: string;
        fields: {
            id: string;
            type: "number" | "boolean" | "image" | "url" | "text" | "date" | "email" | "select" | "json" | "richtext" | "relation" | "kpi";
            key: string;
            label: string;
            order: number;
            isRequired: boolean;
            isUnique: boolean;
            hidden: boolean;
            options?: {
                value: string;
                label: string;
            }[] | undefined;
            relation?: {
                type: "one-to-one" | "one-to-many" | "many-to-many";
                target: "games" | "platforms" | "blog-posts" | "tags" | "streamers" | "dataset";
                targetDatasetId?: string | undefined;
                targetDatasetName?: string | undefined;
                displayField?: string | undefined;
            } | undefined;
            helpText?: string | undefined;
            validationRegex?: string | undefined;
            defaultValue?: string | undefined;
            minValue?: number | undefined;
            maxValue?: number | undefined;
            minLength?: number | undefined;
            maxLength?: number | undefined;
            width?: number | undefined;
        }[];
        description?: string | undefined;
        icon?: string | undefined;
        policyJson?: {
            readAccess: "admin" | "public" | "authenticated";
            writeAccess: "admin" | "authenticated";
            enableRLS: boolean;
            rlsRules?: {
                value: string;
                field: string;
                operator: "eq" | "neq" | "contains" | "gt" | "lt";
            }[] | undefined;
        } | null | undefined;
        workflowJson?: {
            requireApproval: boolean;
            approverUserIds?: string[] | undefined;
        } | null | undefined;
        createdAt?: string | undefined;
        updatedAt?: string | undefined;
    } | null;
    /** Error actual si existe */
    error: string | null;
    /** Cantidad total de datasets */
    totalCount: number;
    /** Datasets ordenados por nombre */
    sortedDatasets: {
        id: string;
        name: string;
        slug: string;
        fields: {
            id: string;
            type: "number" | "boolean" | "image" | "url" | "text" | "date" | "email" | "select" | "json" | "richtext" | "relation" | "kpi";
            key: string;
            label: string;
            order: number;
            isRequired: boolean;
            isUnique: boolean;
            hidden: boolean;
            options?: {
                value: string;
                label: string;
            }[] | undefined;
            relation?: {
                type: "one-to-one" | "one-to-many" | "many-to-many";
                target: "games" | "platforms" | "blog-posts" | "tags" | "streamers" | "dataset";
                targetDatasetId?: string | undefined;
                targetDatasetName?: string | undefined;
                displayField?: string | undefined;
            } | undefined;
            helpText?: string | undefined;
            validationRegex?: string | undefined;
            defaultValue?: string | undefined;
            minValue?: number | undefined;
            maxValue?: number | undefined;
            minLength?: number | undefined;
            maxLength?: number | undefined;
            width?: number | undefined;
        }[];
        description?: string | undefined;
        icon?: string | undefined;
        policyJson?: {
            readAccess: "admin" | "public" | "authenticated";
            writeAccess: "admin" | "authenticated";
            enableRLS: boolean;
            rlsRules?: {
                value: string;
                field: string;
                operator: "eq" | "neq" | "contains" | "gt" | "lt";
            }[] | undefined;
        } | null | undefined;
        workflowJson?: {
            requireApproval: boolean;
            approverUserIds?: string[] | undefined;
        } | null | undefined;
        createdAt?: string | undefined;
        updatedAt?: string | undefined;
    }[];
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