/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUTOSAVE ESTADO REACTIVO - Svelte 5 Runes
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Gestiona versiones temporales de formularios en localStorage.
 * Patrón: Clase Reactiva con $state + Instancia Singleton
 */
// ═══════════════════════════════════════════════════════════════════════════
// Configuración
// ═══════════════════════════════════════════════════════════════════════════
const STORAGE_KEY_PREFIX = 'gremius_autosave_';
const MAX_VERSIONS = 5;
const AUTOSAVE_INTERVAL_MS = 10000;
// ═══════════════════════════════════════════════════════════════════════════
// Clase AutosaveStore
// ═══════════════════════════════════════════════════════════════════════════
export class AutosaveStore {
    // ─── Estado Reactivo Core ───
    status = $state('idle');
    currentKey = $state(null);
    versions = $state([]);
    restoredData = $state(null);
    // ─── Estado Interno ───
    intervalId = null;
    lastSavedSnapshot = '';
    pendingData = {};
    // ─── Ciclo de vida ───
    /**
     * Inicia el autosave para una clave específica.
     * @param key Identificador único (ej: `tablename_entryId` o `tablename_new`)
     * @param initialData Datos iniciales del formulario
     */
    startAutosave(key, initialData) {
        this.stopAutosave();
        this.currentKey = key;
        this.pendingData = JSON.parse(JSON.stringify(initialData));
        this.lastSavedSnapshot = JSON.stringify(initialData);
        this.status = 'saved';
        this.versions = this.loadVersions(key);
        this.intervalId = setInterval(() => {
            this.performAutosave();
        }, AUTOSAVE_INTERVAL_MS);
    }
    /**
     * Detiene el intervalo de autosave y limpia la clave actual.
     */
    stopAutosave() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.currentKey = null;
        this.status = 'idle';
        this.versions = [];
        this.restoredData = null;
    }
    /**
     * Actualiza los datos pendientes y marca como "unsaved" si cambiaron.
     */
    updateData(data) {
        this.pendingData = JSON.parse(JSON.stringify(data));
        const snapshot = JSON.stringify(this.pendingData);
        if (snapshot !== this.lastSavedSnapshot && this.status !== 'saving') {
            this.status = 'unsaved';
        }
    }
    /**
     * Fuerza el estado a "unsaved".
     */
    markDirty() {
        if (this.status !== 'saving') {
            this.status = 'unsaved';
        }
    }
    // ─── Operaciones de versiones ───
    /**
     * Restaura una versión previa por índice.
     * Actualiza `restoredData` para que los componentes puedan sincronizarse.
     */
    restoreVersion(index) {
        const version = this.versions[index];
        if (!version)
            return false;
        this.pendingData = JSON.parse(JSON.stringify(version.data));
        this.lastSavedSnapshot = JSON.stringify(version.data);
        this.status = 'saved';
        this.restoredData = JSON.parse(JSON.stringify(version.data));
        return true;
    }
    /**
     * Elimina todas las versiones de una clave (o la clave actual).
     */
    deleteAllVersions(key) {
        const targetKey = key || this.currentKey;
        if (!targetKey)
            return;
        try {
            localStorage.removeItem(this.getStorageKey(targetKey));
        }
        catch {
            // Safari private mode puede fallar
        }
        if (targetKey === this.currentKey) {
            this.versions = [];
            this.lastSavedSnapshot = '';
            this.status = 'unsaved';
        }
    }
    /**
     * Limpia el autosave actual y detiene el intervalo.
     */
    clearCurrentAutosave() {
        if (this.currentKey) {
            this.deleteAllVersions(this.currentKey);
        }
        this.stopAutosave();
    }
    // ─── Persistencia en localStorage ───
    getStorageKey(key) {
        return `${STORAGE_KEY_PREFIX}${key}`;
    }
    loadVersions(key) {
        try {
            const raw = localStorage.getItem(this.getStorageKey(key));
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed))
                    return parsed;
            }
        }
        catch {
            // Ignorar errores de localStorage
        }
        return [];
    }
    saveVersions(key, versions) {
        try {
            localStorage.setItem(this.getStorageKey(key), JSON.stringify(versions));
        }
        catch {
            // Safari private mode puede fallar
        }
    }
    performAutosave() {
        if (!this.currentKey || this.status === 'saving')
            return;
        const snapshot = JSON.stringify(this.pendingData);
        if (snapshot === this.lastSavedSnapshot)
            return;
        this.status = 'saving';
        const version = {
            timestamp: Date.now(),
            data: JSON.parse(snapshot),
        };
        const newVersions = [version, ...this.versions].slice(0, MAX_VERSIONS);
        this.versions = newVersions;
        this.saveVersions(this.currentKey, newVersions);
        this.lastSavedSnapshot = snapshot;
        // Breve delay para mostrar el estado "saving"
        setTimeout(() => {
            this.status = 'saved';
        }, 400);
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// Instancia Singleton
// ═══════════════════════════════════════════════════════════════════════════
export const autosaveStore = new AutosaveStore();
//# sourceMappingURL=autosave.svelte.js.map