/**
 * Shared Module State (Svelte 5 Runes)
 *
 * Single source of truth for which kons/modules are enabled.
 * Used by both SidebarLayout (for nav filtering) and Kons view (for toggling).
 * When a kon is toggled in the Kons view, the sidebar updates instantly.
 */

const API_URL = import.meta.env.VITE_API_URL ?? "";

export interface ModuleInfo {
  key: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  icon?: string;
  color?: string;
  canToggle?: boolean;
  isGrimoireActive?: boolean;
  grimoireId?: string;
  source?: string;
  tables?: string[];
  dependsOn?: string[];
  enabledByGrimoire?: boolean;
  sidebarBadge?: string;
}

export interface UninstalledKon {
  key: string;
  name: string;
  status: "uninstalled";
  hasPreservedData: boolean;
  dataSummary: {
    totalRows: number;
    tables: Array<{ name: string; rows: number }>;
  };
  canRecover: boolean;
  canDelete: boolean;
  actions: string[];
}

export interface ModulesResponse {
  activeGrimoire?: string;
  categories: {
    core?: { modules: ModuleInfo[] };
    "grimoire-core"?: { modules: ModuleInfo[] };
    optional?: { modules: ModuleInfo[] };
    grimoire?: { modules: ModuleInfo[] };
    uninstalled?: {
      label: string;
      description: string;
      modules: UninstalledKon[];
    };
  };
  docs: ModuleInfo[];
}

class ModuleStore {
  modules = $state<ModuleInfo[]>([]);
  uninstalled = $state<UninstalledKon[]>([]);
  loading = $state(true);
  error = $state<string | null>(null);
  activeGrimoire = $state<string | null>(null);

  /**
   * Aviso pendiente de «reinicia la API para terminar de activar este kon».
   *
   * Vive en el store y no en el componente del interruptor porque el usuario
   * suele activar el kon y navegar; el aviso tiene que sobrevivir a ese cambio
   * de pantalla o no lo lee nadie. Se limpia cuando lo cierra.
   */
  avisoDeReinicio = $state<string | null>(null);

  /**
   * Set of enabled module keys — derived reactively.
   * SidebarLayout uses this to filter nav items.
   */
  enabledKeys = $derived(new Set(this.modules.filter((m) => m.enabled).map((m) => m.key)));

  /**
   * Lo mismo, pero identificando el KON y no la cadena.
   *
   * `kon-games` y `games` son el mismo kon: en la base conviven filas con
   * prefijo y sin él, heredadas de antes de la convención. La barra lateral
   * comparaba la clave exacta, así que una entrada del menú declarada como
   * `blog` no se mostraba aunque lo encendido fuera `kon-blog` — y al revés.
   */
  clavesDeKonActivas = $derived(new Set([...this.enabledKeys].map((k) => k.replace(/^kon-/, ""))));

  /**
   * ¿Está encendido este kon, venga la clave como venga?
   *
   * Es lo que debe usar cualquier filtro de navegación: un kon apagado —o uno
   * que ya no existe, que tampoco aparece en `modules`— no puede dejar su
   * enlace en el menú.
   */
  konActivo(key: string): boolean {
    return this.clavesDeKonActivas.has(key.replace(/^kon-/, ""));
  }

  /**
   * Fetch all modules from the API.
   */
  async fetchModules() {
    this.loading = true;
    this.error = null;
    try {
      const res = await fetch(`${API_URL}/api/modules`, { credentials: "include" });
      if (res.ok) {
        const data: ModulesResponse = await res.json();
        this.activeGrimoire = data.activeGrimoire || null;
        this.modules = data.docs || [];
        this.uninstalled = data.categories?.uninstalled?.modules || [];
      } else {
        this.error = "Failed to fetch modules";
      }
    } catch (e) {
      this.error = "Network error";
      // Fallback: show all nav items
    } finally {
      this.loading = false;
    }
  }

  /**
   * Toggle a module's enabled state and update the API.
   * Returns true if successful.
   */
  async toggleModule(key: string): Promise<boolean> {
    const mod = this.modules.find((m) => m.key === key);
    if (!mod || mod.canToggle === false) return false;

    const newEnabled = !mod.enabled;
    try {
      const res = await fetch(`${API_URL}/api/modules/${key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled: newEnabled }),
      });

      if (res.ok) {
        // Update local state immediately — sidebar reacts instantly
        this.modules = this.modules.map((m) => (m.key === key ? { ...m, enabled: newEnabled } : m));

        /**
         * El kon puede quedar a medias, y hay que decirlo.
         *
         * Sus tablas se crean en caliente, pero las rutas de API se montan al
         * arrancar: Hono no admite `app.route()` después de la primera
         * petición. Sin este aviso el kon aparece en el menú y cada pantalla
         * suya devuelve 404 sin explicación — que es exactamente el estado que
         * hubo que depurar durante una sesión entera.
         */
        const datos = (await res.json().catch(() => ({}))) as {
          requiresRestart?: boolean;
          mountedNow?: boolean;
          restartReason?: string;
        };

        /**
         * El caso normal es que el kon quede sirviendo EN EL ACTO: la API
         * reserva la ruta de cada kon apagado durante el arranque y solo le
         * cuelga el router al activarlo (ver `lib/kons-diferidos.ts`).
         *
         * `requiresRestart` aparece únicamente cuando eso no se pudo hacer —un
         * kon cuya ruta no se reservó, o cuyo código no cargó—. Avisar es lo
         * que evita que el usuario descubra el 404 pantalla por pantalla.
         */
        if (datos.requiresRestart) {
          this.avisoDeReinicio =
            datos.restartReason ?? "Reinicia la API para completar la activación.";
        }
        return true;
      } else {
        const err = await res.json().catch(() => ({}));

        /**
         * El 409 que se niega a activar un kon roto trae TRES piezas y las tres
         * hacen falta: qué pasa, qué tablas faltan y qué hacer.
         *
         * Enseñar solo `message` dejaba al usuario con «faltan tablas» y sin
         * salida — y en el caso más común la salida es una línea de SQL que
         * viene en `hint`. Sin ella hay que ir a los logs del contenedor para
         * enterarse de algo que la API ya sabía.
         */
        const partes = [err.message || err.error || "Failed to toggle kon"];
        if (Array.isArray(err.missingTables) && err.missingTables.length > 0) {
          partes.push(`Tablas que faltan: ${err.missingTables.join(", ")}`);
        }
        if (err.hint) partes.push(err.hint);
        alert(partes.join("\n\n"));
        return false;
      }
    } catch {
      alert("Network error toggling kon");
      return false;
    }
  }

  /**
   * Uninstall a kon but preserve its data.
   * The kon will move to "Uninstalled (Data Preserved)" section.
   */
  async uninstallModule(key: string): Promise<{
    success: boolean;
    dataPreserved?: { totalRows: number; tables: any[] };
    message?: string;
  }> {
    try {
      const res = await fetch(`${API_URL}/api/modules/${key}/uninstall`, {
        method: "POST",
        credentials: "include",
      });

      if (res.ok) {
        const result = await res.json();
        // Refresh modules to update the list
        await this.fetchModules();
        return {
          success: true,
          dataPreserved: result.dataPreserved,
          message: result.message,
        };
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || err.message || "Failed to uninstall kon");
        return { success: false };
      }
    } catch {
      alert("Network error uninstalling kon");
      return { success: false };
    }
  }

  /**
   * Recover/Reinstall an uninstalled kon with its data.
   */
  async recoverModule(
    key: string
  ): Promise<{ success: boolean; dataRestored?: { totalRows: number }; message?: string }> {
    try {
      const res = await fetch(`${API_URL}/api/modules/${key}/recover`, {
        method: "POST",
        credentials: "include",
      });

      if (res.ok) {
        const result = await res.json();
        // Refresh modules to update the list
        await this.fetchModules();
        return {
          success: true,
          dataRestored: result.dataRestored,
          message: result.message,
        };
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || err.message || "Failed to recover kon");
        return { success: false };
      }
    } catch {
      alert("Network error recovering kon");
      return { success: false };
    }
  }

  /**
   * Permanently delete a kon and optionally its data.
   * @param purge - If true, also drops the tables and data
   */
  async deleteModule(
    key: string,
    purge: boolean = false
  ): Promise<{
    success: boolean;
    dataDeleted?: { tablesDropped: number; totalRows: number };
    message?: string;
  }> {
    try {
      const res = await fetch(`${API_URL}/api/modules/${key}?purge=${purge}&force=true`, {
        method: "DELETE",
        credentials: "include",
      });

      if (res.ok) {
        const result = await res.json();
        // Refresh modules to update the list
        await this.fetchModules();
        return {
          success: true,
          dataDeleted: result.dataDeleted,
          message: result.message,
        };
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || err.message || "Failed to delete kon");
        return { success: false };
      }
    } catch {
      alert("Network error deleting kon");
      return { success: false };
    }
  }

  /**
   * Check if a module is enabled by key.
   */
  isEnabled(key: string): boolean {
    return this.enabledKeys.has(key);
  }
}

export const moduleStore = new ModuleStore();
