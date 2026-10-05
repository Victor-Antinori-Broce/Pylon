<script lang="ts">
  import {
    Settings,
    Key,
    Plus,
    Trash2,
    Copy,
    CheckCircle2,
    ShieldAlert,
    Palette,
    Cpu,
    Bot,
    RefreshCw,
    X,
    AlertCircle,
    Check,
    Database,
    Server,
    Link2,
    Globe,
    TestTube,
    LibraryBig,
    Users,
  } from "lucide-svelte";
  import { onMount } from "svelte";

  import MediaPicker from "$lib/components/media/MediaPicker.svelte";
  import SecretsPanel from "$lib/components/settings/SecretsPanel.svelte";
  import ThemeSelector from "$lib/components/ThemeSelector.svelte";

  const API_URL = import.meta.env.VITE_API_URL ?? "";

  // State - Read tab from URL parameter
  let activeTab = $state("general");

  // ── Pestaña Sistema ───────────────────────────────────────────────────────
  //
  // Los datos se piden al ABRIR la pestaña, no al montar la pantalla: son dos
  // consultas de administracion y la mayoria de visitas a Ajustes no entran
  // aqui. `cargadoSistema` evita repetirlas al ir y volver entre pestañas.
  interface UsuarioSistema {
    id: string;
    email: string;
    name: string | null;
    role: string;
    createdAt: string | null;
  }
  interface EstadoSistema {
    migraciones: { total: number; ultimas: { name: string; baselined: boolean }[] };
    kons: { total: number; activos: number };
    instalados: unknown[];
  }

  let usuarios = $state<UsuarioSistema[]>([]);
  let estado = $state<EstadoSistema | null>(null);
  let cargandoSistema = $state(false);
  let errorSistema = $state<string | null>(null);
  let cargadoSistema = false;

  $effect(() => {
    if (activeTab !== "sistema" || cargadoSistema) return;
    cargadoSistema = true;
    void cargarSistema();
  });

  async function cargarSistema() {
    cargandoSistema = true;
    errorSistema = null;
    try {
      const [ru, re_] = await Promise.all([
        fetch(`${API_URL}/api/sistema/usuarios`, { credentials: "include" }),
        fetch(`${API_URL}/api/sistema/estado`, { credentials: "include" }),
      ]);

      // Un 403 aqui no es un fallo: significa que quien mira no es admin. Se
      // dice tal cual en vez de dejar la pantalla vacia, que es como estaban
      // todas las que se han arreglado esta semana.
      if (ru.status === 403 || re_.status === 403) {
        errorSistema = "Esta seccion requiere rol administrador.";
        return;
      }
      if (!ru.ok || !re_.ok) throw new Error(`HTTP ${ru.status}/${re_.status}`);

      usuarios = (await ru.json()).data ?? [];
      estado = await re_.json();
    } catch (err) {
      errorSistema = `No se pudo cargar: ${err instanceof Error ? err.message : err}`;
      cargadoSistema = false; // permitir reintento al volver a entrar
    } finally {
      cargandoSistema = false;
    }
  }

  async function cambiarRol(id: string, role: string) {
    try {
      const res = await fetch(`${API_URL}/api/sistema/usuarios/${id}/rol`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role }),
      });
      const cuerpo = await res.json().catch(() => ({}));

      if (!res.ok) {
        // La API se niega a dejar la instalacion sin administradores y a que
        // alguien se degrade a si mismo. El motivo viaja en `message`; sin
        // enseñarlo, el select volveria a su sitio sin explicacion.
        alert([cuerpo.error, cuerpo.message].filter(Boolean).join("\n\n"));
        await cargarSistema();
        return;
      }

      usuarios = usuarios.map((u) => (u.id === id ? { ...u, role } : u));
    } catch (err) {
      alert(`No se pudo cambiar el rol: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Initialize tab from URL on mount
  onMount(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get("tab");
    if (
      tabParam &&
      ["general", "appearance", "keys", "secrets", "agents", "mcp", "datasources"].includes(
        tabParam
      )
    ) {
      activeTab = tabParam;
    }
    loadSettings();
  });

  // ============ API Keys Tab State ============
  let keys = $state<any[]>([]);
  let loadingKeys = $state(true);
  let errorKeys = $state<string | null>(null);

  // ============ Agents Tab State ============
  interface Agent {
    id: string;
    name: string;
    description?: string;
    scopes: string[];
    rateLimit: number;
    isActive: boolean;
    createdAt: string;
    keys: AgentKey[];
  }
  interface AgentKey {
    id: string;
    keyPrefix: string;
    createdAt: string;
    lastUsedAt?: string;
    expiresAt?: string;
  }
  interface AuditLog {
    id: string;
    action: string;
    resource?: string;
    success: boolean;
    ipAddress?: string;
    createdAt: string;
    errorMessage?: string;
  }

  let agents = $state<Agent[]>([]);
  let loadingAgents = $state(true);
  let errorAgents = $state("");
  let selectedAgent = $state<Agent | null>(null);

  // Agents Modals
  let showCreateAgentModal = $state(false);
  let showAgentDetailModal = $state(false);
  let showNewAgentKeyModal = $state(false);
  let newAgentApiKey = $state("");
  let agentKeyCopied = $state(false);

  // Agents Tabs
  let agentDetailTab = $state<"details" | "logs" | "stats">("details");
  let auditLogs = $state<AuditLog[]>([]);
  let agentStats = $state<any>(null);

  // Agents Form
  let agentFormName = $state("");
  let agentFormDescription = $state("");
  let agentFormScopes = $state("mcp:connect,read:datasets");
  let agentFormRateLimit = $state(60);
  let agentFormExpiresInDays = $state("");

  // ============ Data Sources Tab State ============
  interface DataSource {
    id: string;
    name: string;
    type: "postgresql" | "mysql" | "mongodb" | "redis" | "api" | "webhook";
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    url?: string;
    headers?: Record<string, string>;
    isActive: boolean;
    lastSyncAt?: string;
    createdAt: string;
  }

  let dataSources = $state<DataSource[]>([]);
  let loadingDataSources = $state(true);
  let errorDataSources = $state("");
  let showCreateDataSourceModal = $state(false);
  let testingConnection = $state(false);
  let testResult = $state<{ success: boolean; message: string } | null>(null);

  // Data Source Form
  let dataSourceForm = $state({
    name: "",
    type: "postgresql" as DataSource["type"],
    host: "",
    port: 5432,
    database: "",
    username: "",
    password: "",
    url: "",
    headers: "{}",
  });

  // General Settings Form State
  let siteName = $state("Kitsuden CMS");
  let siteDescription = $state("");
  let siteUrl = $state("");
  /**
   * Identidad del sitio PÚBLICO (no de este panel), con ids de la mediateca,
   * que es lo que define `site_settings.branding`.
   *
   * Antes había un campo «Logo URL» que escribía un `logoUrl` que el esquema no
   * tiene, no había dónde poner el favicon, y el frontend no leía ninguno de
   * los dos: la marca estaba escrita a mano en el código del sitio.
   *
   * `branding` se guarda ENTERO: el PATCH de ajustes reemplaza la columna, así
   * que se conserva lo que no toca este formulario (colores, el `logoUrl`
   * antiguo) en vez de borrarlo al guardar.
   */
  type CampoDeMarca = "logoId" | "faviconId" | "ogImageId";
  const CAMPOS_DE_MARCA: Array<{ clave: CampoDeMarca; etiqueta: string; ayuda: string }> = [
    { clave: "logoId", etiqueta: "Logo", ayuda: "Cabecera y pie del sitio. PNG o SVG con fondo transparente." },
    { clave: "faviconId", etiqueta: "Icono (favicon)", ayuda: "Pestaña del navegador. Cuadrado, al menos 64×64." },
    { clave: "ogImageId", etiqueta: "Imagen al compartir", ayuda: "Vista previa en redes y chats. 1200×630." },
  ];
  let branding = $state<Record<string, unknown>>({});
  let eligiendoMarca = $state<CampoDeMarca | null>(null);

  /**
   * Redes del grupo (Discord, Twitch, YouTube, X, Instagram, TikTok, Ko-fi…).
   * Se guarda en `site_settings.social`, la MISMA columna que ya usaban las
   * wikis para discord/youtube/twitch: esto es ampliarla, no crear un kon
   * nuevo. El PATCH de ajustes fusiona por columna, así que guardar solo
   * `{ social }` no toca nombre, URL ni branding.
   *
   * `canalesYoutube` alimenta el feed multi-canal de la portada: un RSS por
   * canal, mezcla ordenada por fecha, con la procedencia visible en cada
   * ficha. `id` es el identificador del canal (UC…), no el @handle.
   */
  type CanalYoutube = { id: string; nombre: string };
  type CamposDeRedes =
    | "discord"
    | "twitch"
    | "twitter"
    | "instagram"
    | "tiktok"
    | "tiktok2"
    | "facebook"
    | "facebookGroup"
    | "whatsappGroup"
    | "kofi"
    | "github";
  const CAMPOS_DE_REDES: Array<{ clave: CamposDeRedes; etiqueta: string; ayuda: string }> = [
    { clave: "discord", etiqueta: "Discord (URL de invitación)", ayuda: "https://discord.gg/… — tarjeta grande en la sección Comunidad." },
    { clave: "twitch", etiqueta: "Twitch (login del canal)", ayuda: "Solo el login, sin https://twitch.tv/ — de aquí sale el banner «En directo» y la página /comunidad." },
    { clave: "twitter", etiqueta: "X / Twitter", ayuda: "https://x.com/… — icono en la fila de redes." },
    { clave: "instagram", etiqueta: "Instagram", ayuda: "https://instagram.com/… — icono en la fila de redes." },
    { clave: "tiktok", etiqueta: "TikTok", ayuda: "https://tiktok.com/@… — icono en la fila de redes." },
    { clave: "tiktok2", etiqueta: "TikTok (2.ª cuenta)", ayuda: "https://tiktok.com/@… — la segunda cuenta, con su propio icono." },
    { clave: "facebook", etiqueta: "Facebook (página)", ayuda: "https://facebook.com/… — icono en la fila de redes." },
    { clave: "facebookGroup", etiqueta: "Grupo de Facebook", ayuda: "https://facebook.com/groups/… — tarjeta en Comunidad y bloque «Grupo de Facebook» en las entradas." },
    { clave: "whatsappGroup", etiqueta: "Grupo de WhatsApp", ayuda: "https://chat.whatsapp.com/… — solo invitaciones de grupo. Sale al lado del bloque «Grupo de Facebook» y en Comunidad. Activa «Aprobar nuevos participantes» en el grupo: quien entra ve los números de los demás." },
    { clave: "kofi", etiqueta: "Ko-fi", ayuda: "https://ko-fi.com/… — tarjeta en la sección Comunidad." },
    { clave: "github", etiqueta: "GitHub", ayuda: "https://github.com/… — icono en la fila de redes." },
  ];
  let redes = $state<Record<CamposDeRedes, string>>({
    discord: "", twitch: "", twitter: "", instagram: "", tiktok: "", tiktok2: "",
    facebook: "", facebookGroup: "", whatsappGroup: "", kofi: "", github: "",
  });
  let canalesYoutube = $state<CanalYoutube[]>([]);
  let savingRedes = $state(false);
  let errorRedes = $state("");
  let okRedes = $state(false);

  function textoDe(valor: unknown): string {
    return typeof valor === "string" ? valor : "";
  }

  function anadirCanalYoutube() {
    canalesYoutube = [...canalesYoutube, { id: "", nombre: "" }];
  }

  function quitarCanalYoutube(indice: number) {
    canalesYoutube = canalesYoutube.filter((_, i) => i !== indice);
  }

  // Sin recorte (`fit=inside`): un logo recortado a cuadrado pierde las letras
  function vistaPreviaDeMarca(clave: CampoDeMarca): string | null {
    const id = branding[clave];
    return typeof id === "string" && id ? `${API_URL}/api/media/transform/${id}?w=240&h=160&fit=inside` : null;
  }

  function quitarMarca(clave: CampoDeMarca) {
    const { [clave]: _quitado, ...resto } = branding;
    branding = resto;
  }
  let defaultMetadata = $state('{\n  "description": "Powered by Kitsuden"\n}');
  let savingGeneral = $state(false);
  let loadingSettings = $state(true);
  let errorSettings = $state("");

  // API Keys Tab State
  let showCreateModal = $state(false);
  let newKeyName = $state("");
  let newKeyExpiresInStr = $state("0");
  let creatingKey = $state(false);
  let newlyGeneratedToken = $state<string | null>(null);
  let copied = $state(false);

  // MCP Tab State
  let mcpCopied = $state(false);
  const mcpUrl = `${import.meta.env.VITE_API_URL ?? ""}/api/mcp`;

  function copyMcpUrl() {
    navigator.clipboard.writeText(mcpUrl);
    mcpCopied = true;
    setTimeout(() => (mcpCopied = false), 2000);
  }

  async function loadSettings() {
    loadingSettings = true;
    errorSettings = "";
    try {
      const res = await fetch(`${API_URL}/api/settings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load settings");
      const data = await res.json();
      siteName = data.siteName || "Kitsuden CMS";
      siteDescription = data.siteDescription || "";
      siteUrl = data.siteUrl || "";
      branding = data.branding && typeof data.branding === "object" ? { ...data.branding } : {};
      const social = data.social && typeof data.social === "object" ? (data.social as Record<string, unknown>) : {};
      redes = {
        discord: textoDe(social.discord),
        twitch: textoDe(social.twitch),
        twitter: textoDe(social.twitter),
        instagram: textoDe(social.instagram),
        tiktok: textoDe(social.tiktok),
        tiktok2: textoDe(social.tiktok2),
        facebook: textoDe(social.facebook),
        facebookGroup: textoDe(social.facebookGroup),
        whatsappGroup: textoDe(social.whatsappGroup),
        kofi: textoDe(social.kofi),
        github: textoDe(social.github),
      };
      canalesYoutube = Array.isArray(social.youtubeChannels)
        ? (social.youtubeChannels as Array<Record<string, unknown>>)
            .filter((c) => typeof c === "object" && c !== null)
            .map((c) => ({ id: textoDe(c.id), nombre: textoDe(c.nombre) }))
        : [];
      if (data.siteDescription) {
        defaultMetadata = JSON.stringify({ description: data.siteDescription }, null, 2);
      }
    } catch (err: any) {
      errorSettings = err.message || "Failed to load settings";
    } finally {
      loadingSettings = false;
    }
  }

  async function saveGeneralSettings(e: Event) {
    e.preventDefault();
    savingGeneral = true;
    errorSettings = "";
    try {
      let metadataObj: any = {};
      try {
        metadataObj = JSON.parse(defaultMetadata);
      } catch {
        /* ignore */
      }

      const payload: any = {
        siteName: siteName || "Kitsuden CMS",
        siteDescription: siteDescription || metadataObj.description || "",
        siteUrl: siteUrl || "",
        branding: { ...branding },
      };

      const res = await fetch(`${API_URL}/api/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to save settings");
      }

      const data = await res.json();
      siteName = data.siteName || siteName;
      siteDescription = data.siteDescription || siteDescription;
      siteUrl = data.siteUrl || siteUrl;
      if (data.branding && typeof data.branding === "object") branding = { ...data.branding };
    } catch (err: any) {
      errorSettings = err.message || "Failed to save settings";
    } finally {
      savingGeneral = false;
    }
  }

  async function saveRedes(e: Event) {
    e.preventDefault();
    savingRedes = true;
    errorRedes = "";
    okRedes = false;
    try {
      const payload = {
        social: {
          ...redes,
          youtubeChannels: canalesYoutube
            .map((c) => ({ id: c.id.trim(), nombre: c.nombre.trim() }))
            .filter((c) => c.id),
        },
      };
      const res = await fetch(`${API_URL}/api/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to save social links");
      }
      okRedes = true;
      setTimeout(() => (okRedes = false), 3000);
    } catch (err: any) {
      errorRedes = err.message || "Failed to save social links";
    } finally {
      savingRedes = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // API KEYS FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async function fetchKeys() {
    try {
      loadingKeys = true;
      const res = await fetch(`${API_URL}/api/keys`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load API keys.");
      keys = await res.json();
    } catch (err: any) {
      errorKeys = err.message;
    } finally {
      loadingKeys = false;
    }
  }

  async function createKey(e: Event) {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    creatingKey = true;
    errorKeys = null;

    let expiresInDays: number | null = Number(newKeyExpiresInStr);
    if (expiresInDays === 0) expiresInDays = null; // No expiration

    try {
      const res = await fetch(`${API_URL}/api/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: newKeyName, expiresInDays }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create key");

      newlyGeneratedToken = data.token;
      showCreateModal = false;
      newKeyName = "";
      newKeyExpiresInStr = "0";

      // Refresh list
      await fetchKeys();
    } catch (err: any) {
      errorKeys = err.message;
    } finally {
      creatingKey = false;
    }
  }

  async function revokeKey(id: string) {
    if (
      !confirm(
        "Are you sure you want to revoke this API key? This will break any integrations using it."
      )
    )
      return;

    try {
      const res = await fetch(`${API_URL}/api/keys/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to revoke key");

      keys = keys.filter((k) => k.id !== id);
    } catch (err: any) {
      alert(err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AGENTS FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async function loadAgents() {
    loadingAgents = true;
    errorAgents = "";
    try {
      const res = await fetch(`${API_URL}/api/admin/agents`, { credentials: "include" });
      const data = await res.json();
      if (data.success) {
        agents = data.data;
      } else {
        errorAgents = data.error || "Failed to load agents";
      }
    } catch (err: any) {
      errorAgents = err.message || "Failed to load agents";
    } finally {
      loadingAgents = false;
    }
  }

  async function createAgent() {
    try {
      const res = await fetch(`${API_URL}/api/admin/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: agentFormName,
          description: agentFormDescription,
          scopes: agentFormScopes
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean),
          rateLimit: agentFormRateLimit,
          expiresInDays: agentFormExpiresInDays ? parseInt(agentFormExpiresInDays) : undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        newAgentApiKey = data.data.apiKey;
        showCreateAgentModal = false;
        showNewAgentKeyModal = true;
        await loadAgents();
        resetAgentForm();
      } else {
        errorAgents = data.error || "Failed to create agent";
      }
    } catch (err: any) {
      errorAgents = err.message || "Failed to create agent";
    }
  }

  async function deleteAgent(agentId: string) {
    if (!confirm("Are you sure you want to delete this agent?")) return;

    try {
      const res = await fetch(`${API_URL}/api/admin/agents/${agentId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        await loadAgents();
        if (selectedAgent?.id === agentId) {
          showAgentDetailModal = false;
        }
      }
    } catch (err: any) {
      errorAgents = err.message || "Failed to delete agent";
    }
  }

  async function createAgentApiKey(agentId: string) {
    try {
      const res = await fetch(`${API_URL}/api/admin/agents/${agentId}/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          expiresInDays: agentFormExpiresInDays ? parseInt(agentFormExpiresInDays) : undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        newAgentApiKey = data.data.apiKey;
        showNewAgentKeyModal = true;
        await loadAgents();
        if (selectedAgent) await viewAgent(selectedAgent);
      }
    } catch (err: any) {
      errorAgents = err.message || "Failed to create API key";
    }
  }

  async function revokeAgentApiKey(agentId: string, keyId: string) {
    if (!confirm("Revoke this API key?")) return;

    try {
      await fetch(`${API_URL}/api/admin/agents/${agentId}/keys/${keyId}`, {
        method: "DELETE",
        credentials: "include",
      });
      await loadAgents();
      if (selectedAgent) await viewAgent(selectedAgent);
    } catch (err: any) {
      errorAgents = err.message || "Failed to revoke API key";
    }
  }

  async function viewAgent(agent: Agent) {
    selectedAgent = agent;
    showAgentDetailModal = true;
    agentDetailTab = "details";
    await Promise.all([loadAgentAuditLogs(agent.id), loadAgentStats(agent.id)]);
  }

  async function loadAgentAuditLogs(agentId: string) {
    try {
      const res = await fetch(`${API_URL}/api/admin/agents/${agentId}/logs?limit=50`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) auditLogs = data.data;
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    }
  }

  async function loadAgentStats(agentId: string) {
    try {
      const res = await fetch(`${API_URL}/api/admin/agents/${agentId}/stats?days=7`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) agentStats = data.data;
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  }

  function resetAgentForm() {
    agentFormName = "";
    agentFormDescription = "";
    agentFormScopes = "mcp:connect,read:datasets";
    agentFormRateLimit = 60;
    agentFormExpiresInDays = "";
  }

  async function copyAgentKeyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
    agentKeyCopied = true;
    setTimeout(() => (agentKeyCopied = false), 2000);
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleString();
  }

  function getScopeColor(scope: string): string {
    if (scope.startsWith("mcp:")) return "bg-purple-500/20 text-purple-400";
    if (scope.startsWith("read:")) return "bg-green-500/20 text-green-400";
    if (scope.startsWith("write:")) return "bg-amber-500/20 text-amber-400";
    if (scope.startsWith("delete:")) return "bg-red-500/20 text-red-400";
    return "bg-gray-500/20 text-gray-400";
  }

  function getActionIcon(action: string) {
    switch (action) {
      case "auth_success":
        return "✅";
      case "auth_failure":
        return "❌";
      case "mcp_connect":
        return "🔌";
      case "tool_call":
        return "🔧";
      case "rate_limited":
        return "⏱️";
      case "permission_denied":
        return "🚫";
      default:
        return "📝";
    }
  }

  async function copyToClipboard() {
    if (newlyGeneratedToken) {
      try {
        await navigator.clipboard.writeText(newlyGeneratedToken);
        copied = true;
        setTimeout(() => (copied = false), 2000);
      } catch (err) {
        // Ignored
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA SOURCES FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async function loadDataSources() {
    loadingDataSources = true;
    errorDataSources = "";
    try {
      const res = await fetch(`${API_URL}/api/admin/data-sources`, { credentials: "include" });
      const data = await res.json();
      if (data.success) {
        dataSources = data.data;
      } else {
        errorDataSources = data.error || "Failed to load data sources";
      }
    } catch (err: any) {
      errorDataSources = err.message || "Failed to load data sources";
    } finally {
      loadingDataSources = false;
    }
  }

  async function createDataSource() {
    try {
      const headers = dataSourceForm.headers ? JSON.parse(dataSourceForm.headers) : {};
      const payload = {
        name: dataSourceForm.name,
        type: dataSourceForm.type,
        ...(dataSourceForm.type === "api" || dataSourceForm.type === "webhook"
          ? { url: dataSourceForm.url, headers }
          : {
              host: dataSourceForm.host,
              port: dataSourceForm.port,
              database: dataSourceForm.database,
              username: dataSourceForm.username,
              password: dataSourceForm.password,
            }),
      };

      const res = await fetch(`${API_URL}/api/admin/data-sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        showCreateDataSourceModal = false;
        resetDataSourceForm();
        await loadDataSources();
      } else {
        errorDataSources = data.error || "Failed to create data source";
      }
    } catch (err: any) {
      errorDataSources = err.message || "Failed to create data source";
    }
  }

  async function testDataSourceConnection() {
    testingConnection = true;
    testResult = null;
    try {
      const headers = dataSourceForm.headers ? JSON.parse(dataSourceForm.headers) : {};
      const payload = {
        type: dataSourceForm.type,
        ...(dataSourceForm.type === "api" || dataSourceForm.type === "webhook"
          ? { url: dataSourceForm.url, headers }
          : {
              host: dataSourceForm.host,
              port: dataSourceForm.port,
              database: dataSourceForm.database,
              username: dataSourceForm.username,
              password: dataSourceForm.password,
            }),
      };

      const res = await fetch(`${API_URL}/api/admin/data-sources/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      testResult = {
        success: data.success,
        message: data.message || (data.success ? "Connection successful!" : "Connection failed"),
      };
    } catch (err: any) {
      testResult = { success: false, message: err.message || "Connection test failed" };
    } finally {
      testingConnection = false;
    }
  }

  async function deleteDataSource(id: string) {
    if (!confirm("Are you sure you want to delete this data source?")) return;

    try {
      const res = await fetch(`${API_URL}/api/admin/data-sources/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        await loadDataSources();
      }
    } catch (err: any) {
      errorDataSources = err.message || "Failed to delete data source";
    }
  }

  function resetDataSourceForm() {
    dataSourceForm = {
      name: "",
      type: "postgresql",
      host: "",
      port: 5432,
      database: "",
      username: "",
      password: "",
      url: "",
      headers: "{}",
    };
    testResult = null;
  }

  function getDataSourceIcon(type: string) {
    switch (type) {
      case "postgresql":
        return Database;
      case "mysql":
        return Database;
      case "mongodb":
        return Database;
      case "redis":
        return Server;
      case "api":
        return Globe;
      case "webhook":
        return Link2;
      default:
        return Database;
    }
  }

  function getDataSourceTypeColor(type: string): string {
    switch (type) {
      case "postgresql":
        return "text-blue-400 bg-blue-500/10";
      case "mysql":
        return "text-amber-400 bg-amber-500/10";
      case "mongodb":
        return "text-green-400 bg-green-500/10";
      case "redis":
        return "text-red-400 bg-red-500/10";
      case "api":
        return "text-kitsuden-accent bg-kitsuden-accent/10";
      case "webhook":
        return "text-purple-400 bg-purple-500/10";
      default:
        return "text-gray-400 bg-gray-500/10";
    }
  }

  onMount(() => {
    fetchKeys();
    loadAgents();
    loadDataSources();
  });
</script>

<div class="space-y-6 animate-fade-in">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-kitsuden-text flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-xl bg-gradient-to-br from-kitsuden-green/20 to-kitsuden-accent/20 border border-kitsuden-green/20 flex items-center justify-center"
        >
          <Settings class="w-5 h-5 text-kitsuden-green" />
        </div>
        Settings
      </h1>
      <p class="text-sm text-kitsuden-subtle mt-1">
        Configure your CMS preferences and integrations.
      </p>
    </div>
  </div>

  <!-- Tabs -->
  <div class="flex items-center gap-6 border-b border-kitsuden-border overflow-x-auto">
    <button
      class="pb-3 text-sm font-medium border-b-2 transition-colors {activeTab === 'general'
        ? 'border-kitsuden-accent text-kitsuden-accent'
        : 'border-transparent text-kitsuden-subtle hover:text-kitsuden-text'}"
      onclick={() => (activeTab = "general")}
    >
      General
    </button>
    <button
      class="pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 {activeTab ===
      'appearance'
        ? 'border-kitsuden-accent text-kitsuden-accent'
        : 'border-transparent text-kitsuden-subtle hover:text-kitsuden-text'}"
      onclick={() => (activeTab = "appearance")}
    >
      <Palette class="w-4 h-4" />
      Appearance
    </button>
    <button
      class="pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 {activeTab ===
      'keys'
        ? 'border-kitsuden-accent text-kitsuden-accent'
        : 'border-transparent text-kitsuden-subtle hover:text-kitsuden-text'}"
      onclick={() => (activeTab = "keys")}
    >
      <Key class="w-4 h-4" />
      API Keys
    </button>
    <button
      class="pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 {activeTab ===
      'secrets'
        ? 'border-kitsuden-accent text-kitsuden-accent'
        : 'border-transparent text-kitsuden-subtle hover:text-kitsuden-text'}"
      onclick={() => (activeTab = "secrets")}
    >
      <ShieldAlert class="w-4 h-4" />
      Secrets
    </button>
    <button
      class="pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 {activeTab ===
      'agents'
        ? 'border-kitsuden-accent text-kitsuden-accent'
        : 'border-transparent text-kitsuden-subtle hover:text-kitsuden-text'}"
      onclick={() => (activeTab = "agents")}
    >
      <Bot class="w-4 h-4" />
      Agents
    </button>
    <button
      class="pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 {activeTab ===
      'mcp'
        ? 'border-kitsuden-accent text-kitsuden-accent'
        : 'border-transparent text-kitsuden-subtle hover:text-kitsuden-text'}"
      onclick={() => (activeTab = "mcp")}
    >
      <Cpu class="w-4 h-4" />
      MCP
    </button>
    <button
      class="pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 {activeTab ===
      'datasources'
        ? 'border-kitsuden-accent text-kitsuden-accent'
        : 'border-transparent text-kitsuden-subtle hover:text-kitsuden-text'}"
      onclick={() => (activeTab = "datasources")}
    >
      <Database class="w-4 h-4" />
      Data Sources
    </button>
    <button
      class="pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 {activeTab ===
      'sistema'
        ? 'border-kitsuden-accent text-kitsuden-accent'
        : 'border-transparent text-kitsuden-subtle hover:text-kitsuden-text'}"
      onclick={() => (activeTab = "sistema")}
    >
      <ShieldAlert class="w-4 h-4" />
      Sistema
    </button>
  </div>

  <!-- Tab Content -->
  {#if activeTab === "general"}
    <div class="card p-8 animate-fade-in border border-kitsuden-border">
      <div class="mb-6">
        <h2 class="text-xl font-bold text-kitsuden-text">General Configuration</h2>
        <p class="text-sm text-kitsuden-subtle mt-1">
          Manage core settings for your digital presence.
        </p>
      </div>

      {#if loadingSettings}
        <div class="flex items-center justify-center py-12">
          <div
            class="w-6 h-6 border-2 border-kitsuden-accent/30 border-t-kitsuden-accent rounded-full animate-spin"
          ></div>
        </div>
      {:else}
        {#if errorSettings}
          <div
            class="mb-6 p-3 rounded-lg bg-kitsuden-accent-2/10 border border-kitsuden-accent-2/30 text-kitsuden-accent-2 text-sm flex items-center gap-2"
          >
            <AlertCircle class="w-4 h-4 shrink-0" />
            {errorSettings}
          </div>
        {/if}
        <form onsubmit={saveGeneralSettings} class="space-y-6 max-w-2xl">
          <div class="space-y-2">
            <label
              for="sitename"
              class="label block text-xs font-semibold uppercase text-kitsuden-subtle tracking-wider"
            >
              Site Name
            </label>
            <input
              id="sitename"
              bind:value={siteName}
              type="text"
              placeholder="e.g. Valhalla Legion"
              class="input w-full bg-kitsuden-bg text-kitsuden-text border border-kitsuden-border placeholder-kitsuden-text-dim"
              required
            />
            <p class="text-xs text-kitsuden-text-dim">
              El nombre del sitio público: título de la pestaña, cabecera, pie y al compartir.
              Kitsuden es el CMS; este es el nombre que ven tus visitantes.
            </p>
          </div>

          <div class="space-y-2">
            <label
              for="sitedescription"
              class="label block text-xs font-semibold uppercase text-kitsuden-subtle tracking-wider"
            >
              Site Description
            </label>
            <input
              id="sitedescription"
              bind:value={siteDescription}
              type="text"
              placeholder="Short description for SEO and meta tags"
              class="input w-full bg-kitsuden-bg text-kitsuden-text border border-kitsuden-border placeholder-kitsuden-text-dim"
            />
          </div>

          <div class="space-y-2">
            <label
              for="siteurl"
              class="label block text-xs font-semibold uppercase text-kitsuden-subtle tracking-wider"
            >
              Site URL
            </label>
            <input
              id="siteurl"
              bind:value={siteUrl}
              type="url"
              placeholder="https://example.com"
              class="input w-full bg-kitsuden-bg text-kitsuden-text border border-kitsuden-border placeholder-kitsuden-text-dim"
            />
            <!--
              Este campo NO es decorativo: de él cuelgan las direcciones del
              sitio público. Cambiarlo mueve todas las wikis de dominio, así que
              el DNS comodín y el certificado tienen que seguirle.
            -->
            <p class="text-xs text-kitsuden-text-dim">
              Dirección pública del sitio. Cada wiki se sirve en
              <code class="font-mono">&lt;wiki&gt;.{siteUrl ? siteUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "") : "este-dominio"}</code>
              y cada juego en <code class="font-mono">/&lt;juego&gt;/</code>. Cambiarlo mueve todas las wikis:
              el DNS comodín tiene que apuntar al dominio nuevo.
            </p>
          </div>

          <div class="space-y-3">
            <p class="label block text-xs font-semibold uppercase text-kitsuden-subtle tracking-wider">
              Identidad del sitio público
            </p>
            <p class="text-xs text-kitsuden-text-dim">
              Lo que ven los visitantes del sitio, no este panel. Se eligen de la mediateca.
            </p>
            <div class="grid gap-3 sm:grid-cols-3">
              {#each CAMPOS_DE_MARCA as campo (campo.clave)}
                {@const vista = vistaPreviaDeMarca(campo.clave)}
                <div class="space-y-2 rounded-lg border border-kitsuden-border p-3">
                  <p class="text-xs font-semibold text-kitsuden-text">{campo.etiqueta}</p>
                  <div class="flex h-20 items-center justify-center rounded bg-kitsuden-bg">
                    {#if vista}
                      <img src={vista} alt="" class="max-h-16 max-w-full object-contain" />
                    {:else}
                      <span class="text-xs text-kitsuden-text-dim">Sin elegir</span>
                    {/if}
                  </div>
                  <p class="text-[11px] leading-snug text-kitsuden-text-dim">{campo.ayuda}</p>
                  <div class="flex gap-2">
                    <button type="button" class="btn-secondary btn-sm" onclick={() => (eligiendoMarca = campo.clave)}>
                      {vista ? "Cambiar" : "Elegir"}
                    </button>
                    {#if vista}
                      <button type="button" class="btn-ghost btn-sm" onclick={() => quitarMarca(campo.clave)}>
                        Quitar
                      </button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>

          <MediaPicker
            open={eligiendoMarca !== null}
            title="Elegir imagen del sitio"
            onSelect={(medio) => {
              if (eligiendoMarca) branding = { ...branding, [eligiendoMarca]: medio.id };
              eligiendoMarca = null;
            }}
            onClose={() => (eligiendoMarca = null)}
          />

          <div class="space-y-2">
            <label
              for="defaultmetadata"
              class="label block text-xs font-semibold uppercase text-kitsuden-subtle tracking-wider"
            >
              Default Metadata (JSON)
            </label>
            <textarea
              id="defaultmetadata"
              bind:value={defaultMetadata}
              rows="5"
              placeholder="JSON metadata for headers"
              class="textarea w-full bg-kitsuden-bg text-kitsuden-text border border-kitsuden-border placeholder-kitsuden-text-dim font-mono text-sm"
            ></textarea>
          </div>

          <div class="pt-4 border-t border-kitsuden-border">
            <button type="submit" class="btn-primary" disabled={savingGeneral}>
              {#if savingGeneral}
                <div
                  class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2 inline-block"
                ></div>
                Saving...
              {:else}
                Save Configuration
              {/if}
            </button>
          </div>
        </form>

        <form onsubmit={saveRedes} class="mt-10 space-y-6 max-w-2xl border-t border-kitsuden-border pt-6">
          <div>
            <h3 class="text-lg font-semibold text-kitsuden-text">Redes del grupo</h3>
            <p class="text-sm text-kitsuden-text-dim mt-1">
              Discord, Twitch, YouTube y el resto de enlaces sociales que ven las webs públicas
              (sección Comunidad, banner «En directo» y página /comunidad). Se guarda aparte de la
              configuración general: cambiar una red no toca nada más.
            </p>
          </div>

          {#if errorRedes}
            <div
              class="p-3 rounded-lg bg-kitsuden-accent-2/10 border border-kitsuden-accent-2/30 text-kitsuden-accent-2 text-sm flex items-center gap-2"
            >
              <AlertCircle class="w-4 h-4 shrink-0" />
              {errorRedes}
            </div>
          {/if}
          {#if okRedes}
            <div class="p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
              Redes guardadas.
            </div>
          {/if}

          <div class="grid gap-4 sm:grid-cols-2">
            {#each CAMPOS_DE_REDES as campo (campo.clave)}
              <div class="space-y-2">
                <label
                  for={`redes-${campo.clave}`}
                  class="label block text-xs font-semibold uppercase text-kitsuden-subtle tracking-wider"
                >
                  {campo.etiqueta}
                </label>
                <input
                  id={`redes-${campo.clave}`}
                  bind:value={redes[campo.clave]}
                  type="text"
                  class="input w-full bg-kitsuden-bg text-kitsuden-text border border-kitsuden-border placeholder-kitsuden-text-dim"
                />
                <p class="text-[11px] leading-snug text-kitsuden-text-dim">{campo.ayuda}</p>
              </div>
            {/each}
          </div>

          <div class="space-y-3">
            <p class="label block text-xs font-semibold uppercase text-kitsuden-subtle tracking-wider">
              Canales de YouTube
            </p>
            <p class="text-xs text-kitsuden-text-dim">
              El bloque «Últimos vídeos» mezcla todos estos canales ordenados por fecha, con el
              nombre del canal visible en cada ficha. El <code class="font-mono">id</code> es el
              identificador del canal (empieza por UC…), no el @handle.
            </p>
            {#each canalesYoutube as canal, i (i)}
              <div class="flex flex-wrap items-end gap-2">
                <div class="flex-1 min-w-[10rem] space-y-1">
                  <span class="block text-[11px] text-kitsuden-subtle">Nombre visible</span>
                  <input
                    bind:value={canal.nombre}
                    type="text"
                    placeholder="Kitsuden"
                    class="input w-full bg-kitsuden-bg text-kitsuden-text border border-kitsuden-border placeholder-kitsuden-text-dim"
                  />
                </div>
                <div class="flex-[2] min-w-[12rem] space-y-1">
                  <span class="block text-[11px] text-kitsuden-subtle">Id del canal</span>
                  <input
                    bind:value={canal.id}
                    type="text"
                    placeholder="UCxxxxxxxxxxxxxxxxxxxxxx"
                    class="input w-full bg-kitsuden-bg text-kitsuden-text border border-kitsuden-border placeholder-kitsuden-text-dim font-mono text-sm"
                  />
                </div>
                <button type="button" class="btn-ghost btn-sm" onclick={() => quitarCanalYoutube(i)}>
                  Quitar
                </button>
              </div>
            {/each}
            <button type="button" class="btn-secondary btn-sm" onclick={anadirCanalYoutube}>
              + Añadir canal
            </button>
          </div>

          <div class="pt-4 border-t border-kitsuden-border">
            <button type="submit" class="btn-primary" disabled={savingRedes}>
              {#if savingRedes}
                <div
                  class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2 inline-block"
                ></div>
                Guardando...
              {:else}
                Guardar redes
              {/if}
            </button>
          </div>
        </form>
      {/if}
    </div>
  {:else if activeTab === "appearance"}
    <ThemeSelector />
  {:else if activeTab === "keys"}
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold text-kitsuden-text">Machine Authentication</h3>
          <p class="text-xs text-kitsuden-subtle mt-1">
            API keys allow Astro, n8n, and external tools to authenticate as Admin without a user
            interface.
          </p>
        </div>
        <button class="btn-primary" onclick={() => (showCreateModal = true)}>
          <Plus class="w-4 h-4" />
          Create API Key
        </button>
      </div>

      {#if newlyGeneratedToken}
        <div class="card bg-kitsuden-green-10 border-kitsuden-green-30 p-5 mt-4">
          <div class="flex items-start gap-4">
            <div
              class="w-10 h-10 rounded-full bg-kitsuden-green-20 flex items-center justify-center shrink-0"
            >
              <Key class="w-5 h-5 text-kitsuden-green" />
            </div>
            <div class="flex-1 min-w-0">
              <h4 class="text-kitsuden-green font-medium">API Key generated successfully!</h4>
              <p class="text-xs text-kitsuden-green/80 mt-1 mb-3">
                Please copy your API key using the button below. <strong
                  >It will not be shown again.</strong
                >
                You must include it in your HTTP requests as an
                <code>Authorization: Bearer &lt;token&gt;</code> header.
              </p>

              <div class="flex items-center gap-2 max-w-lg relative">
                <input
                  type="text"
                  readonly
                  value={newlyGeneratedToken}
                  class="input font-mono text-xs w-full pr-12 text-kitsuden-green bg-black/40 border-kitsuden-green/30"
                />
                <button
                  class="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-white/10 text-kitsuden-green transition-colors"
                  onclick={copyToClipboard}
                  title="Copy to clipboard"
                >
                  {#if copied}
                    <CheckCircle2 class="w-4 h-4" />
                  {:else}
                    <Copy class="w-4 h-4" />
                  {/if}
                </button>
              </div>

              <button class="btn-ghost mt-4 text-xs" onclick={() => (newlyGeneratedToken = null)}>
                I have copied my key safely
              </button>
            </div>
          </div>
        </div>
      {/if}

      {#if errorKeys}
        <div
          class="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2"
        >
          <ShieldAlert class="w-4 h-4 shrink-0" />
          {errorKeys}
        </div>
      {/if}

      <div class="card overflow-hidden">
        {#if loadingKeys}
          <div class="p-12 text-center text-kitsuden-subtle text-sm">Loading keys...</div>
        {:else if keys.length === 0}
          <div class="p-12 text-center">
            <div
              class="w-12 h-12 rounded-full bg-kitsuden-bg flex items-center justify-center mx-auto mb-3"
            >
              <Key class="w-5 h-5 text-kitsuden-subtle" />
            </div>
            <p class="text-kitsuden-text text-sm">No API keys found.</p>
            <p class="text-kitsuden-subtle text-xs mt-1">
              Generate a key to connect external integrations.
            </p>
          </div>
        {:else}
          <table class="w-full text-sm text-left">
            <thead>
              <tr
                class="border-b border-kitsuden-border text-kitsuden-subtle text-xs uppercase tracking-wider"
              >
                <th class="px-5 py-3 font-semibold text-left">Name</th>
                <th class="px-5 py-3 font-semibold text-left">Hint</th>
                <th class="px-5 py-3 font-semibold text-left">Created</th>
                <th class="px-5 py-3 font-semibold text-left">Last Used</th>
                <th class="px-5 py-3 font-semibold pr-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-kitsuden-border/50">
              {#each keys as k}
                <tr class="hover:bg-kitsuden-subtle/5 transition-colors group">
                  <td class="px-5 py-3">
                    <div class="font-medium text-kitsuden-text">{k.name}</div>
                  </td>
                  <td class="px-5 py-3">
                    <span
                      class="font-mono text-xs bg-kitsuden-bg px-2 py-1 rounded text-kitsuden-text-dim border border-kitsuden-border"
                    >
                      {k.hint}
                    </span>
                  </td>
                  <td class="px-5 py-3 text-kitsuden-text-dim text-xs">
                    {new Date(k.createdAt).toLocaleDateString()}
                  </td>
                  <td class="px-5 py-3 text-kitsuden-text-dim text-xs">
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "Never"}
                  </td>
                  <td class="px-5 py-3 text-right">
                    <button
                      class="btn-icon p-1.5 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-400/10 transition-all text-kitsuden-subtle rounded"
                      onclick={() => revokeKey(k.id)}
                      title="Revoke Key"
                    >
                      <Trash2 class="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>
    </div>
  {:else if activeTab === "secrets"}
    <SecretsPanel />
  {:else if activeTab === "agents"}
    <!-- AGENTS TAB -->
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold text-kitsuden-text flex items-center gap-2">
            <Bot class="w-5 h-5 text-kitsuden-accent" />
            Agent Identities
          </h3>
          <p class="text-xs text-kitsuden-subtle mt-1">
            Manage Non-Human Identities (NHI) for AI agents, MCP servers, and automation.
          </p>
        </div>
        <button
          onclick={() => (showCreateAgentModal = true)}
          class="flex items-center gap-2 px-4 py-2 bg-kitsuden-accent/10 hover:bg-kitsuden-accent/20 text-kitsuden-accent rounded-lg border border-kitsuden-accent/30 transition-colors"
        >
          <Plus class="w-4 h-4" />
          Create Agent
        </button>
      </div>

      <!-- Error Alert -->
      {#if errorAgents}
        <div
          class="flex items-center gap-3 p-4 rounded-lg bg-kitsuden-accent-2/10 border border-kitsuden-accent-2/30 text-kitsuden-accent-2"
        >
          <AlertCircle class="w-5 h-5" />
          <p>{errorAgents}</p>
          <button onclick={() => (errorAgents = "")} class="ml-auto"><X class="w-4 h-4" /></button>
        </div>
      {/if}

      <!-- Agents Grid -->
      {#if loadingAgents}
        <div class="flex justify-center py-12">
          <RefreshCw class="w-8 h-8 animate-spin text-kitsuden-accent" />
        </div>
      {:else if agents.length === 0}
        <div class="p-12 text-center border border-kitsuden-border rounded-xl bg-kitsuden-card">
          <Bot class="w-12 h-12 text-kitsuden-subtle mx-auto mb-4" />
          <h3 class="text-lg font-medium text-kitsuden-text mb-2">No agents yet</h3>
          <p class="text-kitsuden-subtle mb-4">
            Create your first AI agent to get started with MCP
          </p>
          <button
            onclick={() => (showCreateAgentModal = true)}
            class="px-4 py-2 bg-kitsuden-accent/10 text-kitsuden-accent rounded-lg border border-kitsuden-accent/30"
          >
            Create Your First Agent
          </button>
        </div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {#each agents as agent}
            <button
              onclick={() => viewAgent(agent)}
              class="p-4 text-left border border-kitsuden-border rounded-xl bg-kitsuden-card hover:border-kitsuden-accent/50 transition-colors group"
            >
              <div class="flex justify-between items-start mb-3">
                <h3
                  class="font-semibold text-lg text-kitsuden-text group-hover:text-kitsuden-accent transition-colors"
                >
                  {agent.name}
                </h3>
                <span
                  class="px-2 py-0.5 text-xs rounded-full {agent.isActive
                    ? 'bg-kitsuden-green/20 text-kitsuden-green'
                    : 'bg-kitsuden-subtle/20 text-kitsuden-subtle'}"
                >
                  {agent.isActive ? "Active" : "Inactive"}
                </span>
              </div>

              {#if agent.description}
                <p class="text-kitsuden-subtle text-sm mb-3 line-clamp-2">{agent.description}</p>
              {/if}

              <div class="flex flex-wrap gap-1 mb-3">
                {#each agent.scopes.slice(0, 3) as scope}
                  <span class="px-1.5 py-0.5 text-xs rounded {getScopeColor(scope)}">
                    {scope}
                  </span>
                {/each}
                {#if agent.scopes.length > 3}
                  <span
                    class="px-1.5 py-0.5 text-xs rounded bg-kitsuden-subtle/20 text-kitsuden-subtle"
                  >
                    +{agent.scopes.length - 3}
                  </span>
                {/if}
              </div>

              <div class="flex justify-between items-center text-sm text-kitsuden-subtle">
                <span class="flex items-center gap-1">
                  <Key class="w-4 h-4" />
                  {agent.keys.length} key{agent.keys.length !== 1 ? "s" : ""}
                </span>
                <span>{agent.rateLimit} req/min</span>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {:else if activeTab === "mcp"}
    <div class="space-y-6 animate-fade-in">
      <!-- Header -->
      <div>
        <h2 class="text-2xl font-bold text-kitsuden-text flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-xl bg-gradient-to-br from-kitsuden-accent/20 to-kitsuden-purple/20 border border-kitsuden-accent/20 flex items-center justify-center"
          >
            <LibraryBig class="w-5 h-5 text-kitsuden-accent" />
          </div>
          MCP Capabilities
        </h2>
        <p class="text-sm text-kitsuden-subtle mt-1">
          Model Context Protocol integration for external AI agents (Cursor, Claude Desktop,
          Windsurf).
        </p>
      </div>

      <!-- SSE Connection Endpoint -->
      <div class="card p-6 border-l-4 border-l-kitsuden-accent">
        <h3 class="font-semibold text-lg text-kitsuden-text mb-2 flex items-center gap-2">
          <Cpu class="w-5 h-5 text-kitsuden-accent" />
          SSE Connection Endpoint
        </h3>
        <p class="text-sm text-kitsuden-subtle mb-4">
          Use this SSE endpoint to connect your MCP clients to your Kitsuden CMS data layer and
          background workers. Authentication requires a valid Kitsuden API Key passed as a Bearer
          token.
        </p>

        <div class="flex items-center gap-2">
          <code
            class="flex-1 bg-kitsuden-bg font-mono text-sm px-4 py-3 rounded-lg border border-kitsuden-border text-kitsuden-accent select-all"
          >
            {mcpUrl}
          </code>
          <button class="btn-secondary px-4 py-3 min-w-[120px]" onclick={copyMcpUrl}>
            {#if mcpCopied}
              <Check class="w-4 h-4 text-kitsuden-green inline mr-1" /> Copied
            {:else}
              <Copy class="w-4 h-4 inline mr-1" /> Copy URL
            {/if}
          </button>
        </div>
      </div>

      <!-- Configuration Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Stdio Configuration -->
        <div class="card p-5">
          <h4 class="font-medium text-kitsuden-text mb-3 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-kitsuden-accent"></span>
            Stdio Configuration
          </h4>
          <p class="text-xs text-kitsuden-text-dim mb-3">
            For Claude Desktop, Cursor, or any local agent using stdio transport.
          </p>
          <div class="p-3 rounded-lg bg-black/40 border border-kitsuden-border font-mono text-xs">
            <code class="text-kitsuden-accent block">"kitsuden-cms": {"{"}</code>
            <code class="text-kitsuden-accent block ml-4">"command": "node",</code>
            <code class="text-kitsuden-accent block ml-4"
              >"args": ["packages/mcp-server/dist/index.js"],</code
            >
            <code class="text-kitsuden-accent block">}</code>
          </div>
          <div class="mt-3 flex gap-2">
            <button
              class="btn-ghost text-xs"
              onclick={() =>
                alert(
                  "Generate an API Key from the API Keys tab to authenticate external processes."
                )}
            >
              <Key class="w-3 h-3 inline mr-1" />
              View Docs
            </button>
          </div>
        </div>

        <!-- HTTP/SSE Configuration -->
        <div class="card p-5">
          <h4 class="font-medium text-kitsuden-text mb-3 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-kitsuden-purple"></span>
            HTTP/SSE Configuration
          </h4>
          <p class="text-xs text-kitsuden-text-dim mb-3">
            For remote agents or cloud-based AI tools using Server-Sent Events.
          </p>
          <div
            class="p-3 rounded-lg bg-black/40 border border-kitsuden-border font-mono text-xs space-y-1"
          >
            <code class="text-kitsuden-purple block">Endpoint: {mcpUrl}</code>
            <code class="text-kitsuden-subtle block">Auth: Bearer API_KEY</code>
          </div>
          <div class="mt-3 flex gap-2">
            <button class="btn-ghost text-xs" onclick={copyMcpUrl}>
              <Copy class="w-3 h-3 inline mr-1" />
              Copy Endpoint
            </button>
          </div>
        </div>
      </div>

      <!-- Resources & Tools Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="card p-5 border-t-2 border-t-kitsuden-purple/50">
          <h4 class="font-medium text-kitsuden-text mb-2 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-kitsuden-purple"></span>
            Visible Resources
          </h4>
          <p class="text-[11px] text-kitsuden-text-dim mb-3">
            AI agents can read these live schemas.
          </p>
          <ul class="text-sm text-kitsuden-subtle space-y-2 list-disc pl-4 font-mono text-xs">
            <li>kitsuden://datasets</li>
            <li>kitsuden://dataset/id</li>
            <li>kitsuden://grimoires</li>
          </ul>
        </div>

        <div class="card p-5 border-t-2 border-t-kitsuden-amber/50">
          <h4 class="font-medium text-kitsuden-text mb-2 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-kitsuden-amber"></span>
            Callable Tools
          </h4>
          <p class="text-[11px] text-kitsuden-text-dim mb-3">
            AI agents have permission to execute these actions.
          </p>
          <ul class="text-sm text-kitsuden-subtle space-y-2 list-disc pl-4 font-mono text-xs">
            <li>kitsuden_query_dataset</li>
            <li>kitsuden_insert_record</li>
            <li>kitsuden_update_record</li>
            <li>kitsuden_delete_record</li>
            <li>kitsuden_list_datasets</li>
            <li>kitsuden_dispatch_worker</li>
          </ul>
        </div>
      </div>
    </div>
  {:else if activeTab === "datasources"}
    <!-- DATA SOURCES TAB -->
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold text-kitsuden-text flex items-center gap-2">
            <Database class="w-5 h-5 text-kitsuden-accent" />
            External Data Sources
          </h3>
          <p class="text-xs text-kitsuden-subtle mt-1">
            Connect to external databases, APIs, and webhooks to sync data with your CMS.
          </p>
        </div>
        <button
          onclick={() => {
            resetDataSourceForm();
            showCreateDataSourceModal = true;
          }}
          class="group inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-kitsuden-accent to-kitsuden-accent text-black rounded-xl font-semibold shadow-lg shadow-kitsuden-accent/25 hover:shadow-kitsuden-accent/40 hover:scale-105 active:scale-95 transition-all duration-200"
        >
          <Plus class="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
          Connect Source
        </button>
      </div>

      <!-- Error Alert -->
      {#if errorDataSources}
        <div
          class="flex items-center gap-3 p-4 rounded-xl bg-kitsuden-accent-2/10 border border-kitsuden-accent-2/30 text-kitsuden-accent-2"
        >
          <AlertCircle class="w-5 h-5" />
          <p>{errorDataSources}</p>
          <button
            onclick={() => (errorDataSources = "")}
            class="ml-auto hover:rotate-90 transition-transform"><X class="w-4 h-4" /></button
          >
        </div>
      {/if}

      <!-- Data Sources Grid -->
      {#if loadingDataSources}
        <div class="flex justify-center py-12">
          <RefreshCw class="w-8 h-8 animate-spin text-kitsuden-accent" />
        </div>
      {:else if dataSources.length === 0}
        <div class="p-12 text-center border border-kitsuden-border rounded-xl bg-kitsuden-card">
          <Database class="w-12 h-12 text-kitsuden-subtle mx-auto mb-4" />
          <h3 class="text-lg font-medium text-kitsuden-text mb-2">No data sources connected</h3>
          <p class="text-kitsuden-subtle mb-6">Connect external databases or APIs to sync data</p>
          <button
            onclick={() => {
              resetDataSourceForm();
              showCreateDataSourceModal = true;
            }}
            class="group inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-kitsuden-accent to-kitsuden-accent text-black rounded-xl font-semibold shadow-lg shadow-kitsuden-accent/25 hover:shadow-kitsuden-accent/40 hover:scale-105 active:scale-95 transition-all duration-200"
          >
            <Plus class="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
            Connect First Source
          </button>
        </div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {#each dataSources as source}
            {@const Icon = getDataSourceIcon(source.type)}
            <div
              class="p-5 border border-kitsuden-border rounded-xl bg-kitsuden-card hover:border-kitsuden-accent/50 transition-colors group"
            >
              <div class="flex items-start justify-between mb-4">
                <div class="flex items-center gap-3">
                  <div
                    class="w-10 h-10 rounded-lg flex items-center justify-center {getDataSourceTypeColor(
                      source.type
                    )}"
                  >
                    <Icon class="w-5 h-5" />
                  </div>
                  <div>
                    <h3 class="font-semibold text-kitsuden-text">{source.name}</h3>
                    <span class="text-xs text-kitsuden-subtle uppercase">{source.type}</span>
                  </div>
                </div>
                <span
                  class="w-2 h-2 rounded-full {source.isActive ? 'bg-emerald-500' : 'bg-amber-500'}"
                ></span>
              </div>

              {#if source.host}
                <div class="text-xs text-kitsuden-subtle mb-1">
                  <span class="text-kitsuden-text-dim">Host:</span>
                  {source.host}:{source.port}
                </div>
              {/if}
              {#if source.database}
                <div class="text-xs text-kitsuden-subtle mb-1">
                  <span class="text-kitsuden-text-dim">Database:</span>
                  {source.database}
                </div>
              {/if}
              {#if source.url}
                <div class="text-xs text-kitsuden-subtle mb-1 truncate">
                  <span class="text-kitsuden-text-dim">URL:</span>
                  {source.url}
                </div>
              {/if}

              <div
                class="mt-4 pt-4 border-t border-kitsuden-border flex items-center justify-between"
              >
                <span class="text-xs text-kitsuden-subtle">
                  {source.lastSyncAt
                    ? `Last sync: ${new Date(source.lastSyncAt).toLocaleDateString()}`
                    : "Never synced"}
                </span>
                <button
                  onclick={() => deleteDataSource(source.id)}
                  class="p-2 rounded-lg text-kitsuden-text-dim hover:text-kitsuden-accent-2 hover:bg-kitsuden-accent-2/10 transition-all duration-200 hover:scale-110"
                  title="Delete data source"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {:else if activeTab === "sistema"}
    <!--
      SISTEMA — lo que administra la plataforma, no un kon.

      Ocupa el hueco que dejaba el visor generico de tablas al retirarse:
      usuarios y estado del esquema no pertenecen a ningun kon y no tenian
      pantalla en ninguna parte. La diferencia es que esto son dos pantallas
      concretas con su forma, no una rejilla sobre cualquier tabla de la base.
    -->
    <div class="space-y-8">
      <section>
        <h3 class="text-lg font-semibold text-kitsuden-text flex items-center gap-2">
          <Users class="w-5 h-5 text-kitsuden-accent" />
          Usuarios
        </h3>
        <p class="text-xs text-kitsuden-subtle mt-1 mb-4">
          Quien puede entrar al panel y con que rol. Las credenciales viven en otra tabla y no se
          muestran nunca.
        </p>

        {#if cargandoSistema}
          <p class="text-sm text-kitsuden-subtle">Cargando…</p>
        {:else if errorSistema}
          <p class="text-sm text-kitsuden-danger">{errorSistema}</p>
        {:else}
          <div class="overflow-x-auto rounded-lg border border-kitsuden-border">
            <table class="w-full text-sm">
              <thead class="bg-kitsuden-bg text-kitsuden-subtle">
                <tr>
                  <th class="px-4 py-2 text-left font-medium">Email</th>
                  <th class="px-4 py-2 text-left font-medium">Nombre</th>
                  <th class="px-4 py-2 text-left font-medium">Rol</th>
                  <th class="px-4 py-2 text-left font-medium">Alta</th>
                </tr>
              </thead>
              <tbody>
                {#each usuarios as u (u.id)}
                  <tr class="border-t border-kitsuden-border">
                    <td class="px-4 py-2">{u.email}</td>
                    <td class="px-4 py-2 text-kitsuden-subtle">{u.name || "—"}</td>
                    <td class="px-4 py-2">
                      <select
                        class="input py-1 text-xs"
                        value={u.role}
                        onchange={(e) => cambiarRol(u.id, e.currentTarget.value)}
                      >
                        <option value="admin">admin</option>
                        <option value="editor">editor</option>
                        <option value="user">user</option>
                      </select>
                    </td>
                    <td class="px-4 py-2 text-kitsuden-subtle">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </section>

      <section>
        <h3 class="text-lg font-semibold text-kitsuden-text flex items-center gap-2">
          <Database class="w-5 h-5 text-kitsuden-accent" />
          Estado del esquema
        </h3>
        <p class="text-xs text-kitsuden-subtle mt-1 mb-4">
          Solo lectura. El historial de migraciones se toca con el runner, nunca desde aqui:
          editarlo desincroniza historial y esquema en silencio.
        </p>

        {#if estado}
          <div class="grid gap-4 sm:grid-cols-3">
            <div class="card p-4">
              <p class="text-xs uppercase tracking-wider text-kitsuden-subtle">Migraciones</p>
              <p class="mt-1 text-2xl font-bold">{estado.migraciones.total}</p>
            </div>
            <div class="card p-4">
              <p class="text-xs uppercase tracking-wider text-kitsuden-subtle">Kons activos</p>
              <p class="mt-1 text-2xl font-bold">
                {estado.kons.activos}<span class="text-base text-kitsuden-subtle"
                  >/{estado.kons.total}</span
                >
              </p>
            </div>
            <div class="card p-4">
              <p class="text-xs uppercase tracking-wider text-kitsuden-subtle">Instalados</p>
              <p class="mt-1 text-2xl font-bold">{estado.instalados.length}</p>
            </div>
          </div>

          <p class="mt-4 mb-2 text-xs uppercase tracking-wider text-kitsuden-subtle">
            Ultimas migraciones aplicadas
          </p>
          <ul class="space-y-1 text-xs font-mono text-kitsuden-subtle">
            {#each estado.migraciones.ultimas as m (m.name)}
              <li>{m.name}{m.baselined ? "  (baseline)" : ""}</li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>
  {/if}
</div>

<!-- Create Modal -->
{#if showCreateModal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
  >
    <div class="card w-full max-w-md shadow-2xl overflow-hidden border border-kitsuden-border">
      <div
        class="px-6 py-4 border-b border-kitsuden-border flex items-center justify-between bg-kitsuden-bg/50"
      >
        <h3 class="font-bold text-kitsuden-text flex items-center gap-2">
          <Key class="w-4 h-4 text-kitsuden-accent" />
          Create new API Key
        </h3>
      </div>

      <form onsubmit={createKey} class="p-6 space-y-4">
        <div class="space-y-1.5">
          <label
            for="newkeyname"
            class="label block text-xs font-semibold uppercase text-kitsuden-subtle tracking-wider"
          >
            Key Name
          </label>
          <input
            id="newkeyname"
            bind:value={newKeyName}
            type="text"
            placeholder="e.g. Astro Frontend SSG"
            class="input w-full"
            required
            autocomplete="off"
          />
        </div>

        <div class="space-y-1.5">
          <label
            for="newkeyexpiresinstr"
            class="label block text-xs font-semibold uppercase text-kitsuden-subtle tracking-wider"
          >
            Expiration
          </label>
          <select id="newkeyexpiresinstr" bind:value={newKeyExpiresInStr} class="select w-full">
            <option value="0">Never expire</option>
            <option value="7">7 Days</option>
            <option value="30">30 Days</option>
            <option value="90">90 Days</option>
            <option value="365">1 Year</option>
          </select>
        </div>

        <div class="pt-4 flex items-center justify-end gap-3 border-t border-kitsuden-border mt-6">
          <button
            type="button"
            class="btn-ghost"
            onclick={() => {
              showCreateModal = false;
              newKeyName = "";
            }}
            disabled={creatingKey}
          >
            Cancel
          </button>
          <button type="submit" class="btn-primary" disabled={creatingKey || !newKeyName.trim()}>
            {creatingKey ? "Creating..." : "Create Key"}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- Create Agent Modal -->
{#if showCreateAgentModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
    <div class="w-full max-w-lg p-6 border border-kitsuden-border rounded-xl bg-kitsuden-card">
      <h2 class="text-xl font-semibold text-kitsuden-text mb-4">Create New Agent</h2>

      <div class="space-y-4">
        <div>
          <label for="agentformname" class="block text-sm text-kitsuden-subtle mb-1">Name *</label>
          <input
            id="agentformname"
            bind:value={agentFormName}
            placeholder="e.g., DevBot Frontend"
            class="w-full px-3 py-2 bg-kitsuden-bg border border-kitsuden-border rounded-lg text-kitsuden-text placeholder:text-kitsuden-subtle focus:outline-none focus:border-kitsuden-accent"
          />
        </div>

        <div>
          <label for="agentformdescription" class="block text-sm text-kitsuden-subtle mb-1"
            >Description</label
          >
          <input
            id="agentformdescription"
            bind:value={agentFormDescription}
            placeholder="What does this agent do?"
            class="w-full px-3 py-2 bg-kitsuden-bg border border-kitsuden-border rounded-lg text-kitsuden-text placeholder:text-kitsuden-subtle focus:outline-none focus:border-kitsuden-accent"
          />
        </div>

        <div>
          <label for="agentformscopes" class="block text-sm text-kitsuden-subtle mb-1"
            >Scopes (comma-separated)</label
          >
          <input
            id="agentformscopes"
            bind:value={agentFormScopes}
            placeholder="mcp:connect, read:datasets, write:posts"
            class="w-full px-3 py-2 bg-kitsuden-bg border border-kitsuden-border rounded-lg text-kitsuden-text placeholder:text-kitsuden-subtle focus:outline-none focus:border-kitsuden-accent"
          />
          <p class="text-xs text-kitsuden-subtle mt-1">
            Examples: mcp:connect, read:*, write:posts
          </p>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="agentformratelimit" class="block text-sm text-kitsuden-subtle mb-1"
              >Rate Limit (req/min)</label
            >
            <input
              id="agentformratelimit"
              type="number"
              bind:value={agentFormRateLimit}
              min={1}
              max={10000}
              class="w-full px-3 py-2 bg-kitsuden-bg border border-kitsuden-border rounded-lg text-kitsuden-text focus:outline-none focus:border-kitsuden-accent"
            />
          </div>

          <div>
            <label for="agentformexpiresindays" class="block text-sm text-kitsuden-subtle mb-1"
              >Key Expires (days)</label
            >
            <input
              id="agentformexpiresindays"
              type="number"
              bind:value={agentFormExpiresInDays}
              placeholder="Never"
              min={1}
              class="w-full px-3 py-2 bg-kitsuden-bg border border-kitsuden-border rounded-lg text-kitsuden-text placeholder:text-kitsuden-subtle focus:outline-none focus:border-kitsuden-accent"
            />
          </div>
        </div>
      </div>

      <div class="flex justify-end gap-2 mt-6">
        <button
          onclick={() => (showCreateAgentModal = false)}
          class="px-4 py-2 text-kitsuden-subtle hover:text-kitsuden-text transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={createAgent}
          disabled={!agentFormName}
          class="px-4 py-2 bg-kitsuden-accent/10 text-kitsuden-accent rounded-lg border border-kitsuden-accent/30 hover:bg-kitsuden-accent/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create Agent
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- New API Key Modal -->
{#if showNewAgentKeyModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
    <div class="w-full max-w-lg p-6 border border-kitsuden-border rounded-xl bg-kitsuden-card">
      <div class="flex items-center gap-3 mb-4 text-kitsuden-amber">
        <AlertCircle class="w-5 h-5" />
        <h2 class="text-xl font-semibold">API Key Created</h2>
      </div>

      <p class="text-kitsuden-subtle mb-4">
        <strong class="text-kitsuden-text">Important:</strong> Copy this API key now. You won't be able
        to see it again!
      </p>

      <div class="flex gap-2 mb-6">
        <code
          class="flex-1 p-3 bg-kitsuden-bg border border-kitsuden-border rounded-lg text-sm break-all text-kitsuden-text"
        >
          {newAgentApiKey}
        </code>
        <button
          onclick={() => copyAgentKeyToClipboard(newAgentApiKey)}
          class="px-3 py-2 bg-kitsuden-accent/10 text-kitsuden-accent rounded-lg border border-kitsuden-accent/30 hover:bg-kitsuden-accent/20"
          title="Copy to clipboard"
        >
          {#if agentKeyCopied}
            <Check class="w-5 h-5" />
          {:else}
            <Copy class="w-5 h-5" />
          {/if}
        </button>
      </div>

      <button
        onclick={() => {
          showNewAgentKeyModal = false;
          newAgentApiKey = "";
        }}
        class="w-full px-4 py-2 bg-kitsuden-accent/10 text-kitsuden-accent rounded-lg border border-kitsuden-accent/30 hover:bg-kitsuden-accent/20"
      >
        I've Saved The Key
      </button>
    </div>
  </div>
{/if}

<!-- Agent Detail Modal -->
{#if showAgentDetailModal && selectedAgent}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
    <div
      class="w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-kitsuden-border rounded-xl bg-kitsuden-card"
    >
      <!-- Header -->
      <div
        class="sticky top-0 z-10 flex items-center justify-between p-6 border-b border-kitsuden-border bg-kitsuden-card"
      >
        <div class="flex items-center gap-3">
          <h2 class="text-xl font-semibold text-kitsuden-text">{selectedAgent.name}</h2>
          <span
            class="px-2 py-0.5 text-xs rounded-full {selectedAgent.isActive
              ? 'bg-kitsuden-green/20 text-kitsuden-green'
              : 'bg-kitsuden-subtle/20 text-kitsuden-subtle'}"
          >
            {selectedAgent.isActive ? "Active" : "Inactive"}
          </span>
        </div>
        <button
          onclick={() => (showAgentDetailModal = false)}
          class="text-kitsuden-subtle hover:text-kitsuden-text"
        >
          <X class="w-6 h-6" />
        </button>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 p-2 border-b border-kitsuden-border">
        {#each [["details", "Details"], ["logs", "Audit Logs"], ["stats", "Statistics"]] as [tab, label]}
          <button
            onclick={() => (agentDetailTab = tab as any)}
            class="px-4 py-2 rounded-lg text-sm transition-colors {agentDetailTab === tab
              ? 'bg-kitsuden-accent/10 text-kitsuden-accent'
              : 'text-kitsuden-subtle hover:text-kitsuden-text'}"
          >
            {label}
          </button>
        {/each}
      </div>

      <!-- Content -->
      <div class="p-6">
        {#if agentDetailTab === "details"}
          <div class="space-y-6">
            <!-- Info -->
            <div>
              <label class="block text-sm text-kitsuden-subtle mb-1">Description</label>
              <p class="text-kitsuden-text">{selectedAgent.description || "No description"}</p>
            </div>

            <!-- Scopes -->
            <div>
              <label class="block text-sm text-kitsuden-subtle mb-2">Scopes</label>
              <div class="flex flex-wrap gap-2">
                {#each selectedAgent.scopes as scope}
                  <span class="px-2 py-1 text-sm rounded {getScopeColor(scope)}">
                    {scope}
                  </span>
                {/each}
              </div>
            </div>

            <!-- Stats -->
            <div class="grid grid-cols-2 gap-4">
              <div class="p-4 border border-kitsuden-border rounded-lg">
                <p class="text-sm text-kitsuden-subtle">Rate Limit</p>
                <p class="text-2xl font-bold text-kitsuden-text">{selectedAgent.rateLimit}</p>
                <p class="text-xs text-kitsuden-subtle">requests per minute</p>
              </div>
              <div class="p-4 border border-kitsuden-border rounded-lg">
                <p class="text-sm text-kitsuden-subtle">Created</p>
                <p class="text-kitsuden-text">{formatDate(selectedAgent.createdAt)}</p>
              </div>
            </div>

            <!-- API Keys -->
            <div>
              <div class="flex justify-between items-center mb-3">
                <label class="block text-sm text-kitsuden-subtle">API Keys</label>
                <button
                  onclick={() => selectedAgent && createAgentApiKey(selectedAgent.id)}
                  class="flex items-center gap-1 px-3 py-1 text-sm bg-kitsuden-accent/10 text-kitsuden-accent rounded border border-kitsuden-accent/30 hover:bg-kitsuden-accent/20"
                >
                  <Plus class="w-3 h-3" />
                  New Key
                </button>
              </div>

              {#if selectedAgent?.keys.length === 0}
                <p class="text-kitsuden-subtle text-sm">No API keys</p>
              {:else}
                <div class="space-y-2">
                  {#each selectedAgent?.keys || [] as key}
                    <div
                      class="flex justify-between items-center p-3 bg-kitsuden-bg border border-kitsuden-border rounded-lg"
                    >
                      <div>
                        <code class="text-sm text-kitsuden-text">{key.keyPrefix}</code>
                        <p class="text-xs text-kitsuden-subtle">
                          Created: {formatDate(key.createdAt)}
                          {#if key.lastUsedAt}
                            • Last used: {formatDate(key.lastUsedAt)}
                          {/if}
                          {#if key.expiresAt}
                            • Expires: {formatDate(key.expiresAt)}
                          {/if}
                        </p>
                      </div>
                      <button
                        onclick={() => selectedAgent && revokeAgentApiKey(selectedAgent.id, key.id)}
                        class="p-2 text-kitsuden-accent-2 hover:bg-kitsuden-accent-2/10 rounded"
                        title="Revoke key"
                      >
                        <Trash2 class="w-4 h-4" />
                      </button>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>

            <!-- Delete -->
            <div class="pt-4 border-t border-kitsuden-border">
              <button
                onclick={() => selectedAgent && deleteAgent(selectedAgent.id)}
                class="flex items-center gap-2 px-4 py-2 bg-kitsuden-accent-2/10 text-kitsuden-accent-2 rounded-lg border border-kitsuden-accent-2/30 hover:bg-kitsuden-accent-2/20"
              >
                <Trash2 class="w-4 h-4" />
                Delete Agent
              </button>
            </div>
          </div>
        {:else if agentDetailTab === "logs"}
          {#if auditLogs.length === 0}
            <p class="text-kitsuden-subtle text-center py-8">No audit logs yet</p>
          {:else}
            <div class="space-y-2">
              {#each auditLogs as log}
                <div
                  class="flex items-center gap-3 p-3 text-sm border border-kitsuden-border rounded-lg"
                >
                  <span class="text-lg">{getActionIcon(log.action)}</span>
                  <span
                    class="px-2 py-0.5 text-xs rounded {log.success
                      ? 'bg-kitsuden-green/20 text-kitsuden-green'
                      : 'bg-kitsuden-accent-2/20 text-kitsuden-accent-2'}"
                  >
                    {log.action}
                  </span>
                  <span class="flex-1 text-kitsuden-text">{log.resource || "-"}</span>
                  <span class="text-kitsuden-subtle text-xs">{formatDate(log.createdAt)}</span>
                </div>
              {/each}
            </div>
          {/if}
        {:else if agentDetailTab === "stats"}
          {#if !agentStats}
            <p class="text-kitsuden-subtle text-center py-8">Loading statistics...</p>
          {:else}
            <div class="grid grid-cols-2 gap-4 mb-6">
              <div class="p-4 border border-kitsuden-border rounded-lg">
                <p class="text-sm text-kitsuden-subtle">Total Calls</p>
                <p class="text-2xl font-bold text-kitsuden-text">{agentStats.totalCalls}</p>
              </div>
              <div class="p-4 border border-kitsuden-border rounded-lg">
                <p class="text-sm text-kitsuden-subtle">Success Rate</p>
                <p class="text-2xl font-bold text-kitsuden-text">{agentStats.successRate}</p>
              </div>
            </div>

            {#if Object.keys(agentStats.actionsByType || {}).length > 0}
              <h4 class="font-medium text-kitsuden-text mb-3">Actions Breakdown</h4>
              <div class="space-y-2">
                {#each Object.entries(agentStats.actionsByType) as [action, data]}
                  <div
                    class="flex justify-between items-center p-3 bg-kitsuden-bg border border-kitsuden-border rounded-lg"
                  >
                    <span class="text-kitsuden-text capitalize">{action.replace("_", " ")}</span>
                    <div class="flex gap-2">
                      <span
                        class="px-2 py-0.5 text-xs rounded bg-kitsuden-green/20 text-kitsuden-green"
                        >{(data as any).success} OK</span
                      >
                      {#if (data as any).failed > 0}
                        <span
                          class="px-2 py-0.5 text-xs rounded bg-kitsuden-accent-2/20 text-kitsuden-accent-2"
                          >{(data as any).failed} FAIL</span
                        >
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- Create Data Source Modal -->
{#if showCreateDataSourceModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <div
      class="w-full max-w-lg max-h-[90vh] overflow-y-auto border border-kitsuden-border rounded-xl bg-kitsuden-card"
    >
      <div class="p-6 border-b border-kitsuden-border">
        <h2 class="text-xl font-semibold text-kitsuden-text flex items-center gap-2">
          <Database class="w-5 h-5 text-kitsuden-accent" />
          Connect Data Source
        </h2>
        <p class="text-sm text-kitsuden-subtle mt-1">
          Configure connection to external database or API
        </p>
      </div>

      <div class="p-6 space-y-4">
        <!-- Name -->
        <div>
          <label for="name" class="block text-sm text-kitsuden-subtle mb-1">Name *</label>
          <input
            id="name"
            bind:value={dataSourceForm.name}
            placeholder="e.g., Production PostgreSQL"
            class="w-full px-3 py-2 bg-kitsuden-bg border border-kitsuden-border rounded-lg text-kitsuden-text placeholder:text-kitsuden-subtle focus:outline-none focus:border-kitsuden-accent"
          />
        </div>

        <!-- Type -->
        <div>
          <label for="type" class="block text-sm text-kitsuden-subtle mb-1">Type *</label>
          <select
            id="type"
            bind:value={dataSourceForm.type}
            class="w-full px-3 py-2 bg-kitsuden-bg border border-kitsuden-border rounded-lg text-kitsuden-text focus:outline-none focus:border-kitsuden-accent"
          >
            <option value="postgresql">PostgreSQL</option>
            <option value="mysql">MySQL</option>
            <option value="mongodb">MongoDB</option>
            <option value="redis">Redis</option>
            <option value="api">REST API</option>
            <option value="webhook">Webhook</option>
          </select>
        </div>

        {#if dataSourceForm.type === "api" || dataSourceForm.type === "webhook"}
          <!-- API/Webhook fields -->
          <div>
            <label for="url" class="block text-sm text-kitsuden-subtle mb-1">URL *</label>
            <input
              id="url"
              bind:value={dataSourceForm.url}
              placeholder="https://api.example.com/v1"
              class="w-full px-3 py-2 bg-kitsuden-bg border border-kitsuden-border rounded-lg text-kitsuden-text placeholder:text-kitsuden-subtle focus:outline-none focus:border-kitsuden-accent"
            />
          </div>

          <div>
            <label for="headers" class="block text-sm text-kitsuden-subtle mb-1"
              >Headers (JSON)</label
            >
            <textarea
              id="headers"
              bind:value={dataSourceForm.headers}
              placeholder={`{ "Authorization": "Bearer token" }`}
              rows="3"
              class="w-full px-3 py-2 bg-kitsuden-bg border border-kitsuden-border rounded-lg text-kitsuden-text placeholder:text-kitsuden-subtle focus:outline-none focus:border-kitsuden-accent font-mono text-sm"
            ></textarea>
          </div>
        {:else}
          <!-- Database fields -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="host" class="block text-sm text-kitsuden-subtle mb-1">Host *</label>
              <input
                id="host"
                bind:value={dataSourceForm.host}
                placeholder="localhost"
                class="w-full px-3 py-2 bg-kitsuden-bg border border-kitsuden-border rounded-lg text-kitsuden-text placeholder:text-kitsuden-subtle focus:outline-none focus:border-kitsuden-accent"
              />
            </div>
            <div>
              <label for="port" class="block text-sm text-kitsuden-subtle mb-1">Port *</label>
              <input
                id="port"
                type="number"
                bind:value={dataSourceForm.port}
                class="w-full px-3 py-2 bg-kitsuden-bg border border-kitsuden-border rounded-lg text-kitsuden-text focus:outline-none focus:border-kitsuden-accent"
              />
            </div>
          </div>

          <div>
            <label for="database" class="block text-sm text-kitsuden-subtle mb-1">Database *</label>
            <input
              id="database"
              bind:value={dataSourceForm.database}
              placeholder="mydb"
              class="w-full px-3 py-2 bg-kitsuden-bg border border-kitsuden-border rounded-lg text-kitsuden-text placeholder:text-kitsuden-subtle focus:outline-none focus:border-kitsuden-accent"
            />
          </div>

          <div>
            <label for="username" class="block text-sm text-kitsuden-subtle mb-1">Username</label>
            <input
              id="username"
              bind:value={dataSourceForm.username}
              placeholder="dbuser"
              class="w-full px-3 py-2 bg-kitsuden-bg border border-kitsuden-border rounded-lg text-kitsuden-text placeholder:text-kitsuden-subtle focus:outline-none focus:border-kitsuden-accent"
            />
          </div>

          <div>
            <label for="password" class="block text-sm text-kitsuden-subtle mb-1">Password</label>
            <input
              id="password"
              type="password"
              bind:value={dataSourceForm.password}
              placeholder="••••••••"
              class="w-full px-3 py-2 bg-kitsuden-bg border border-kitsuden-border rounded-lg text-kitsuden-text placeholder:text-kitsuden-subtle focus:outline-none focus:border-kitsuden-accent"
            />
          </div>
        {/if}

        <!-- Test Result -->
        {#if testResult}
          <div
            class="p-3 rounded-lg {testResult.success
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/10 border border-red-500/30 text-red-400'} flex items-center gap-2"
          >
            {#if testResult.success}
              <Check class="w-4 h-4" />
            {:else}
              <AlertCircle class="w-4 h-4" />
            {/if}
            <span class="text-sm">{testResult.message}</span>
          </div>
        {/if}
      </div>

      <div class="p-6 border-t border-kitsuden-border flex justify-end gap-3">
        <button
          onclick={() => {
            showCreateDataSourceModal = false;
            resetDataSourceForm();
          }}
          class="px-5 py-2.5 text-sm font-medium rounded-xl bg-kitsuden-surface border border-kitsuden-border text-kitsuden-text hover:bg-kitsuden-bg transition-all duration-200"
        >
          Cancel
        </button>
        <button
          onclick={testDataSourceConnection}
          disabled={testingConnection}
          class="group inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl bg-kitsuden-surface border border-kitsuden-border text-kitsuden-text hover:bg-kitsuden-accent/5 hover:border-kitsuden-accent/20 hover:text-kitsuden-accent transition-all duration-200 disabled:opacity-50"
        >
          {#if testingConnection}
            <RefreshCw class="w-4 h-4 animate-spin" />
            Testing...
          {:else}
            <TestTube class="w-4 h-4 group-hover:scale-110 transition-transform" />
            Test Connection
          {/if}
        </button>
        <button
          onclick={createDataSource}
          disabled={!dataSourceForm.name ||
            (dataSourceForm.type === "api" || dataSourceForm.type === "webhook"
              ? !dataSourceForm.url
              : !dataSourceForm.host || !dataSourceForm.database)}
          class="group inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-kitsuden-accent to-kitsuden-accent text-black shadow-lg shadow-kitsuden-accent/25 hover:shadow-kitsuden-accent/40 hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100"
        >
          <Plus class="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
          Connect
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(.bg-kitsuden-green-10) {
    background-color: rgba(16, 185, 129, 0.1);
  }
  :global(.bg-kitsuden-green-20) {
    background-color: rgba(16, 185, 129, 0.2);
  }
  :global(.border-kitsuden-green-30) {
    border-color: rgba(16, 185, 129, 0.3);
  }
  :global(.text-kitsuden-green) {
    color: rgb(16, 185, 129);
  }
</style>
