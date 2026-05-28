/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUTOSAVE ESTADO REACTIVO - Svelte 5 Runes
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Gestiona versiones temporales de formularios en localStorage.
 * Patrón: Clase Reactiva con $state + Instancia Singleton
 */
export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'unsaved';
export interface AutosaveVersion {
    timestamp: number;
    data: Record<string, any>;
}
export declare class AutosaveStore {
    status: AutosaveStatus;
    currentKey: string | null;
    versions: AutosaveVersion[];
    restoredData: Record<string, any> | null;
    private intervalId;
    private lastSavedSnapshot;
    private pendingData;
    /**
     * Inicia el autosave para una clave específica.
     * @param key Identificador único (ej: `tablename_entryId` o `tablename_new`)
     * @param initialData Datos iniciales del formulario
     */
    startAutosave(key: string, initialData: Record<string, any>): void;
    /**
     * Detiene el intervalo de autosave y limpia la clave actual.
     */
    stopAutosave(): void;
    /**
     * Actualiza los datos pendientes y marca como "unsaved" si cambiaron.
     */
    updateData(data: Record<string, any>): void;
    /**
     * Fuerza el estado a "unsaved".
     */
    markDirty(): void;
    /**
     * Restaura una versión previa por índice.
     * Actualiza `restoredData` para que los componentes puedan sincronizarse.
     */
    restoreVersion(index: number): boolean;
    /**
     * Elimina todas las versiones de una clave (o la clave actual).
     */
    deleteAllVersions(key?: string): void;
    /**
     * Limpia el autosave actual y detiene el intervalo.
     */
    clearCurrentAutosave(): void;
    private getStorageKey;
    private loadVersions;
    private saveVersions;
    private performAutosave;
}
export declare const autosaveStore: AutosaveStore;
//# sourceMappingURL=autosave.svelte.d.ts.map