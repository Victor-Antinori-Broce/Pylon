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
  } from "lucide-svelte";
  import { onMount } from "svelte";

  import ThemeSelector from "$lib/components/ThemeSelector.svelte";

  const API_URL = import.meta.env.VITE_API_URL ?? "";

  // State - Read tab from URL parameter
  let activeTab = $state("general");

  // Initialize tab from URL on mount
  onMount(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get("tab");
    if (
      tabParam &&
      ["general", "appearance", "keys", "agents", "mcp", "datasources"].includes(tabParam)
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
  let siteName = $state("Gremius CMS");
  let siteDescription = $state("");
  let siteUrl = $state("");
  let logoUrl = $state("/logo.png");
  let defaultMetadata = $state('{\n  "description": "Powered by Gremius"\n}');
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
      siteName = data.siteName || "Gremius CMS";
      siteDescription = data.siteDescription || "";
      siteUrl = data.siteUrl || "";
      if (data.branding?.logoUrl) {
        logoUrl = data.branding.logoUrl;
      }
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
        siteName: siteName || "Gremius CMS",
        siteDescription: siteDescription || metadataObj.description || "",
        siteUrl: siteUrl || "",
        branding: {
          logoUrl: logoUrl || undefined,
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
        throw new Error(errData.error || "Failed to save settings");
      }

      const data = await res.json();
      siteName = data.siteName || siteName;
      siteDescription = data.siteDescription || siteDescription;
      siteUrl = data.siteUrl || siteUrl;
      if (data.branding?.logoUrl) logoUrl = data.branding.logoUrl;
    } catch (err: any) {
      errorSettings = err.message || "Failed to save settings";
    } finally {
      savingGeneral = false;
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
        return "text-cyan-400 bg-cyan-500/10";
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
      <h1 class="text-2xl font-bold text-gremius-text flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-xl bg-gradient-to-br from-gremius-green/20 to-gremius-cyan/20 border border-gremius-green/20 flex items-center justify-center"
        >
          <Settings class="w-5 h-5 text-gremius-green" />
        </div>
        Settings
      </h1>
      <p class="text-sm text-gremius-subtle mt-1">
        Configure your CMS preferences and integrations.
      </p>
    </div>
  </div>

  <!-- Tabs -->
  <div class="flex items-center gap-6 border-b border-gremius-border overflow-x-auto">
    <button
      class="pb-3 text-sm font-medium border-b-2 transition-colors {activeTab === 'general'
        ? 'border-gremius-cyan text-gremius-cyan'
        : 'border-transparent text-gremius-subtle hover:text-gremius-text'}"
      onclick={() => (activeTab = "general")}
    >
      General
    </button>
    <button
      class="pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 {activeTab ===
      'appearance'
        ? 'border-gremius-cyan text-gremius-cyan'
        : 'border-transparent text-gremius-subtle hover:text-gremius-text'}"
      onclick={() => (activeTab = "appearance")}
    >
      <Palette class="w-4 h-4" />
      Appearance
    </button>
    <button
      class="pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 {activeTab ===
      'keys'
        ? 'border-gremius-cyan text-gremius-cyan'
        : 'border-transparent text-gremius-subtle hover:text-gremius-text'}"
      onclick={() => (activeTab = "keys")}
    >
      <Key class="w-4 h-4" />
      API Keys
    </button>
    <button
      class="pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 {activeTab ===
      'agents'
        ? 'border-gremius-cyan text-gremius-cyan'
        : 'border-transparent text-gremius-subtle hover:text-gremius-text'}"
      onclick={() => (activeTab = "agents")}
    >
      <Bot class="w-4 h-4" />
      Agents
    </button>
    <button
      class="pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 {activeTab ===
      'mcp'
        ? 'border-gremius-cyan text-gremius-cyan'
        : 'border-transparent text-gremius-subtle hover:text-gremius-text'}"
      onclick={() => (activeTab = "mcp")}
    >
      <Cpu class="w-4 h-4" />
      MCP
    </button>
    <button
      class="pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 {activeTab ===
      'datasources'
        ? 'border-gremius-cyan text-gremius-cyan'
        : 'border-transparent text-gremius-subtle hover:text-gremius-text'}"
      onclick={() => (activeTab = "datasources")}
    >
      <Database class="w-4 h-4" />
      Data Sources
    </button>
  </div>

  <!-- Tab Content -->
  {#if activeTab === "general"}
    <div class="card p-8 animate-fade-in border border-gremius-border">
      <div class="mb-6">
        <h2 class="text-xl font-bold text-gremius-text">General Configuration</h2>
        <p class="text-sm text-gremius-subtle mt-1">
          Manage core settings for your digital presence.
        </p>
      </div>

      {#if loadingSettings}
        <div class="flex items-center justify-center py-12">
          <div
            class="w-6 h-6 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"
          ></div>
        </div>
      {:else}
        {#if errorSettings}
          <div
            class="mb-6 p-3 rounded-lg bg-gremius-pink/10 border border-gremius-pink/30 text-gremius-pink text-sm flex items-center gap-2"
          >
            <AlertCircle class="w-4 h-4 shrink-0" />
            {errorSettings}
          </div>
        {/if}
        <form onsubmit={saveGeneralSettings} class="space-y-6 max-w-2xl">
          <div class="space-y-2">
            <label
              class="label block text-xs font-semibold uppercase text-gremius-subtle tracking-wider"
            >
              Site Name
            </label>
            <input
              bind:value={siteName}
              type="text"
              placeholder="e.g. My Awesome Project"
              class="input w-full bg-gremius-bg text-gremius-text border border-gremius-border placeholder-gremius-text-dim"
              required
            />
          </div>

          <div class="space-y-2">
            <label
              class="label block text-xs font-semibold uppercase text-gremius-subtle tracking-wider"
            >
              Site Description
            </label>
            <input
              bind:value={siteDescription}
              type="text"
              placeholder="Short description for SEO and meta tags"
              class="input w-full bg-gremius-bg text-gremius-text border border-gremius-border placeholder-gremius-text-dim"
            />
          </div>

          <div class="space-y-2">
            <label
              class="label block text-xs font-semibold uppercase text-gremius-subtle tracking-wider"
            >
              Site URL
            </label>
            <input
              bind:value={siteUrl}
              type="url"
              placeholder="https://example.com"
              class="input w-full bg-gremius-bg text-gremius-text border border-gremius-border placeholder-gremius-text-dim"
            />
          </div>

          <div class="space-y-2">
            <label
              class="label block text-xs font-semibold uppercase text-gremius-subtle tracking-wider"
            >
              Logo URL
            </label>
            <input
              bind:value={logoUrl}
              type="text"
              placeholder="https://example.com/logo.png"
              class="input w-full bg-gremius-bg text-gremius-text border border-gremius-border placeholder-gremius-text-dim"
            />
            <p class="text-xs text-gremius-subtle mt-1">
              Recommended size: 256x256px inside a transparent PNG.
            </p>
          </div>

          <div class="space-y-2">
            <label
              class="label block text-xs font-semibold uppercase text-gremius-subtle tracking-wider"
            >
              Default Metadata (JSON)
            </label>
            <textarea
              bind:value={defaultMetadata}
              rows="5"
              placeholder="JSON metadata for headers"
              class="textarea w-full bg-gremius-bg text-gremius-text border border-gremius-border placeholder-gremius-text-dim font-mono text-sm"
            ></textarea>
          </div>

          <div class="pt-4 border-t border-gremius-border">
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
      {/if}
    </div>
  {:else if activeTab === "appearance"}
    <ThemeSelector />
  {:else if activeTab === "keys"}
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold text-gremius-text">Machine Authentication</h3>
          <p class="text-xs text-gremius-subtle mt-1">
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
        <div class="card bg-gremius-green-10 border-gremius-green-30 p-5 mt-4">
          <div class="flex items-start gap-4">
            <div
              class="w-10 h-10 rounded-full bg-gremius-green-20 flex items-center justify-center shrink-0"
            >
              <Key class="w-5 h-5 text-gremius-green" />
            </div>
            <div class="flex-1 min-w-0">
              <h4 class="text-gremius-green font-medium">API Key generated successfully!</h4>
              <p class="text-xs text-gremius-green/80 mt-1 mb-3">
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
                  class="input font-mono text-xs w-full pr-12 text-gremius-green bg-black/40 border-gremius-green/30"
                />
                <button
                  class="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-white/10 text-gremius-green transition-colors"
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
          <div class="p-12 text-center text-gremius-subtle text-sm">Loading keys...</div>
        {:else if keys.length === 0}
          <div class="p-12 text-center">
            <div
              class="w-12 h-12 rounded-full bg-gremius-bg flex items-center justify-center mx-auto mb-3"
            >
              <Key class="w-5 h-5 text-gremius-subtle" />
            </div>
            <p class="text-gremius-text text-sm">No API keys found.</p>
            <p class="text-gremius-subtle text-xs mt-1">
              Generate a key to connect external integrations.
            </p>
          </div>
        {:else}
          <table class="w-full text-sm text-left">
            <thead>
              <tr
                class="border-b border-gremius-border text-gremius-subtle text-xs uppercase tracking-wider"
              >
                <th class="px-5 py-3 font-semibold text-left">Name</th>
                <th class="px-5 py-3 font-semibold text-left">Hint</th>
                <th class="px-5 py-3 font-semibold text-left">Created</th>
                <th class="px-5 py-3 font-semibold text-left">Last Used</th>
                <th class="px-5 py-3 font-semibold pr-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gremius-border/50">
              {#each keys as k}
                <tr class="hover:bg-gremius-subtle/5 transition-colors group">
                  <td class="px-5 py-3">
                    <div class="font-medium text-gremius-text">{k.name}</div>
                  </td>
                  <td class="px-5 py-3">
                    <span
                      class="font-mono text-xs bg-gremius-bg px-2 py-1 rounded text-gremius-text-dim border border-gremius-border"
                    >
                      {k.hint}
                    </span>
                  </td>
                  <td class="px-5 py-3 text-gremius-text-dim text-xs">
                    {new Date(k.createdAt).toLocaleDateString()}
                  </td>
                  <td class="px-5 py-3 text-gremius-text-dim text-xs">
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "Never"}
                  </td>
                  <td class="px-5 py-3 text-right">
                    <button
                      class="btn-icon p-1.5 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-400/10 transition-all text-gremius-subtle rounded"
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
  {:else if activeTab === "agents"}
    <!-- AGENTS TAB -->
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold text-gremius-text flex items-center gap-2">
            <Bot class="w-5 h-5 text-gremius-cyan" />
            Agent Identities
          </h3>
          <p class="text-xs text-gremius-subtle mt-1">
            Manage Non-Human Identities (NHI) for AI agents, MCP servers, and automation.
          </p>
        </div>
        <button
          onclick={() => (showCreateAgentModal = true)}
          class="flex items-center gap-2 px-4 py-2 bg-gremius-cyan/10 hover:bg-gremius-cyan/20 text-gremius-cyan rounded-lg border border-gremius-cyan/30 transition-colors"
        >
          <Plus class="w-4 h-4" />
          Create Agent
        </button>
      </div>

      <!-- Error Alert -->
      {#if errorAgents}
        <div
          class="flex items-center gap-3 p-4 rounded-lg bg-gremius-pink/10 border border-gremius-pink/30 text-gremius-pink"
        >
          <AlertCircle class="w-5 h-5" />
          <p>{errorAgents}</p>
          <button onclick={() => (errorAgents = "")} class="ml-auto"><X class="w-4 h-4" /></button>
        </div>
      {/if}

      <!-- Agents Grid -->
      {#if loadingAgents}
        <div class="flex justify-center py-12">
          <RefreshCw class="w-8 h-8 animate-spin text-gremius-cyan" />
        </div>
      {:else if agents.length === 0}
        <div class="p-12 text-center border border-gremius-border rounded-xl bg-gremius-card">
          <Bot class="w-12 h-12 text-gremius-subtle mx-auto mb-4" />
          <h3 class="text-lg font-medium text-gremius-text mb-2">No agents yet</h3>
          <p class="text-gremius-subtle mb-4">Create your first AI agent to get started with MCP</p>
          <button
            onclick={() => (showCreateAgentModal = true)}
            class="px-4 py-2 bg-gremius-cyan/10 text-gremius-cyan rounded-lg border border-gremius-cyan/30"
          >
            Create Your First Agent
          </button>
        </div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {#each agents as agent}
            <button
              onclick={() => viewAgent(agent)}
              class="p-4 text-left border border-gremius-border rounded-xl bg-gremius-card hover:border-gremius-cyan/50 transition-colors group"
            >
              <div class="flex justify-between items-start mb-3">
                <h3
                  class="font-semibold text-lg text-gremius-text group-hover:text-gremius-cyan transition-colors"
                >
                  {agent.name}
                </h3>
                <span
                  class="px-2 py-0.5 text-xs rounded-full {agent.isActive
                    ? 'bg-gremius-green/20 text-gremius-green'
                    : 'bg-gremius-subtle/20 text-gremius-subtle'}"
                >
                  {agent.isActive ? "Active" : "Inactive"}
                </span>
              </div>

              {#if agent.description}
                <p class="text-gremius-subtle text-sm mb-3 line-clamp-2">{agent.description}</p>
              {/if}

              <div class="flex flex-wrap gap-1 mb-3">
                {#each agent.scopes.slice(0, 3) as scope}
                  <span class="px-1.5 py-0.5 text-xs rounded {getScopeColor(scope)}">
                    {scope}
                  </span>
                {/each}
                {#if agent.scopes.length > 3}
                  <span
                    class="px-1.5 py-0.5 text-xs rounded bg-gremius-subtle/20 text-gremius-subtle"
                  >
                    +{agent.scopes.length - 3}
                  </span>
                {/if}
              </div>

              <div class="flex justify-between items-center text-sm text-gremius-subtle">
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
        <h2 class="text-2xl font-bold text-gremius-text flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-xl bg-gradient-to-br from-gremius-cyan/20 to-gremius-purple/20 border border-gremius-cyan/20 flex items-center justify-center"
          >
            <LibraryBig class="w-5 h-5 text-gremius-cyan" />
          </div>
          MCP Capabilities
        </h2>
        <p class="text-sm text-gremius-subtle mt-1">
          Model Context Protocol integration for external AI agents (Cursor, Claude Desktop,
          Windsurf).
        </p>
      </div>

      <!-- SSE Connection Endpoint -->
      <div class="card p-6 border-l-4 border-l-gremius-cyan">
        <h3 class="font-semibold text-lg text-gremius-text mb-2 flex items-center gap-2">
          <Cpu class="w-5 h-5 text-gremius-cyan" />
          SSE Connection Endpoint
        </h3>
        <p class="text-sm text-gremius-subtle mb-4">
          Use this SSE endpoint to connect your MCP clients to your Gremius CMS data layer and
          background workers. Authentication requires a valid Gremius API Key passed as a Bearer
          token.
        </p>

        <div class="flex items-center gap-2">
          <code
            class="flex-1 bg-gremius-bg font-mono text-sm px-4 py-3 rounded-lg border border-gremius-border text-gremius-cyan select-all"
          >
            {mcpUrl}
          </code>
          <button class="btn-secondary px-4 py-3 min-w-[120px]" onclick={copyMcpUrl}>
            {#if mcpCopied}
              <Check class="w-4 h-4 text-gremius-green inline mr-1" /> Copied
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
          <h4 class="font-medium text-gremius-text mb-3 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-gremius-cyan"></span>
            Stdio Configuration
          </h4>
          <p class="text-xs text-gremius-text-dim mb-3">
            For Claude Desktop, Cursor, or any local agent using stdio transport.
          </p>
          <div class="p-3 rounded-lg bg-black/40 border border-gremius-border font-mono text-xs">
            <code class="text-gremius-cyan block">"gremius-cms": {"{"}</code>
            <code class="text-gremius-cyan block ml-4">"command": "node",</code>
            <code class="text-gremius-cyan block ml-4"
              >"args": ["packages/mcp-server/dist/index.js"],</code
            >
            <code class="text-gremius-cyan block">}</code>
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
          <h4 class="font-medium text-gremius-text mb-3 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-gremius-purple"></span>
            HTTP/SSE Configuration
          </h4>
          <p class="text-xs text-gremius-text-dim mb-3">
            For remote agents or cloud-based AI tools using Server-Sent Events.
          </p>
          <div
            class="p-3 rounded-lg bg-black/40 border border-gremius-border font-mono text-xs space-y-1"
          >
            <code class="text-gremius-purple block">Endpoint: {mcpUrl}</code>
            <code class="text-gremius-subtle block">Auth: Bearer API_KEY</code>
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
        <div class="card p-5 border-t-2 border-t-gremius-purple/50">
          <h4 class="font-medium text-gremius-text mb-2 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-gremius-purple"></span>
            Visible Resources
          </h4>
          <p class="text-[11px] text-gremius-text-dim mb-3">
            AI agents can read these live schemas.
          </p>
          <ul class="text-sm text-gremius-subtle space-y-2 list-disc pl-4 font-mono text-xs">
            <li>gremius://datasets</li>
            <li>gremius://dataset/id</li>
            <li>gremius://grimoires</li>
          </ul>
        </div>

        <div class="card p-5 border-t-2 border-t-gremius-amber/50">
          <h4 class="font-medium text-gremius-text mb-2 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-gremius-amber"></span>
            Callable Tools
          </h4>
          <p class="text-[11px] text-gremius-text-dim mb-3">
            AI agents have permission to execute these actions.
          </p>
          <ul class="text-sm text-gremius-subtle space-y-2 list-disc pl-4 font-mono text-xs">
            <li>gremius_query_dataset</li>
            <li>gremius_insert_record</li>
            <li>gremius_update_record</li>
            <li>gremius_delete_record</li>
            <li>gremius_list_datasets</li>
            <li>gremius_dispatch_worker</li>
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
          <h3 class="text-lg font-semibold text-gremius-text flex items-center gap-2">
            <Database class="w-5 h-5 text-gremius-cyan" />
            External Data Sources
          </h3>
          <p class="text-xs text-gremius-subtle mt-1">
            Connect to external databases, APIs, and webhooks to sync data with your CMS.
          </p>
        </div>
        <button
          onclick={() => {
            resetDataSourceForm();
            showCreateDataSourceModal = true;
          }}
          class="group inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-gremius-cyan to-cyan-400 text-black rounded-xl font-semibold shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-105 active:scale-95 transition-all duration-200"
        >
          <Plus class="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
          Connect Source
        </button>
      </div>

      <!-- Error Alert -->
      {#if errorDataSources}
        <div
          class="flex items-center gap-3 p-4 rounded-xl bg-gremius-pink/10 border border-gremius-pink/30 text-gremius-pink"
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
          <RefreshCw class="w-8 h-8 animate-spin text-gremius-cyan" />
        </div>
      {:else if dataSources.length === 0}
        <div class="p-12 text-center border border-gremius-border rounded-xl bg-gremius-card">
          <Database class="w-12 h-12 text-gremius-subtle mx-auto mb-4" />
          <h3 class="text-lg font-medium text-gremius-text mb-2">No data sources connected</h3>
          <p class="text-gremius-subtle mb-6">Connect external databases or APIs to sync data</p>
          <button
            onclick={() => {
              resetDataSourceForm();
              showCreateDataSourceModal = true;
            }}
            class="group inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-gremius-cyan to-cyan-400 text-black rounded-xl font-semibold shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-105 active:scale-95 transition-all duration-200"
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
              class="p-5 border border-gremius-border rounded-xl bg-gremius-card hover:border-gremius-cyan/50 transition-colors group"
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
                    <h3 class="font-semibold text-gremius-text">{source.name}</h3>
                    <span class="text-xs text-gremius-subtle uppercase">{source.type}</span>
                  </div>
                </div>
                <span
                  class="w-2 h-2 rounded-full {source.isActive ? 'bg-emerald-500' : 'bg-amber-500'}"
                ></span>
              </div>

              {#if source.host}
                <div class="text-xs text-gremius-subtle mb-1">
                  <span class="text-gremius-text-dim">Host:</span>
                  {source.host}:{source.port}
                </div>
              {/if}
              {#if source.database}
                <div class="text-xs text-gremius-subtle mb-1">
                  <span class="text-gremius-text-dim">Database:</span>
                  {source.database}
                </div>
              {/if}
              {#if source.url}
                <div class="text-xs text-gremius-subtle mb-1 truncate">
                  <span class="text-gremius-text-dim">URL:</span>
                  {source.url}
                </div>
              {/if}

              <div
                class="mt-4 pt-4 border-t border-gremius-border flex items-center justify-between"
              >
                <span class="text-xs text-gremius-subtle">
                  {source.lastSyncAt
                    ? `Last sync: ${new Date(source.lastSyncAt).toLocaleDateString()}`
                    : "Never synced"}
                </span>
                <button
                  onclick={() => deleteDataSource(source.id)}
                  class="p-2 rounded-lg text-gremius-text-dim hover:text-gremius-pink hover:bg-gremius-pink/10 transition-all duration-200 hover:scale-110"
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
  {/if}
</div>

<!-- Create Modal -->
{#if showCreateModal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
  >
    <div class="card w-full max-w-md shadow-2xl overflow-hidden border border-gremius-border">
      <div
        class="px-6 py-4 border-b border-gremius-border flex items-center justify-between bg-gremius-bg/50"
      >
        <h3 class="font-bold text-gremius-text flex items-center gap-2">
          <Key class="w-4 h-4 text-gremius-cyan" />
          Create new API Key
        </h3>
      </div>

      <form onsubmit={createKey} class="p-6 space-y-4">
        <div class="space-y-1.5">
          <label
            class="label block text-xs font-semibold uppercase text-gremius-subtle tracking-wider"
          >
            Key Name
          </label>
          <input
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
            class="label block text-xs font-semibold uppercase text-gremius-subtle tracking-wider"
          >
            Expiration
          </label>
          <select bind:value={newKeyExpiresInStr} class="select w-full">
            <option value="0">Never expire</option>
            <option value="7">7 Days</option>
            <option value="30">30 Days</option>
            <option value="90">90 Days</option>
            <option value="365">1 Year</option>
          </select>
        </div>

        <div class="pt-4 flex items-center justify-end gap-3 border-t border-gremius-border mt-6">
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
    <div class="w-full max-w-lg p-6 border border-gremius-border rounded-xl bg-gremius-card">
      <h2 class="text-xl font-semibold text-gremius-text mb-4">Create New Agent</h2>

      <div class="space-y-4">
        <div>
          <label class="block text-sm text-gremius-subtle mb-1">Name *</label>
          <input
            bind:value={agentFormName}
            placeholder="e.g., DevBot Frontend"
            class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan"
          />
        </div>

        <div>
          <label class="block text-sm text-gremius-subtle mb-1">Description</label>
          <input
            bind:value={agentFormDescription}
            placeholder="What does this agent do?"
            class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan"
          />
        </div>

        <div>
          <label class="block text-sm text-gremius-subtle mb-1">Scopes (comma-separated)</label>
          <input
            bind:value={agentFormScopes}
            placeholder="mcp:connect, read:datasets, write:posts"
            class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan"
          />
          <p class="text-xs text-gremius-subtle mt-1">Examples: mcp:connect, read:*, write:posts</p>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm text-gremius-subtle mb-1">Rate Limit (req/min)</label>
            <input
              type="number"
              bind:value={agentFormRateLimit}
              min={1}
              max={10000}
              class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text focus:outline-none focus:border-gremius-cyan"
            />
          </div>

          <div>
            <label class="block text-sm text-gremius-subtle mb-1">Key Expires (days)</label>
            <input
              type="number"
              bind:value={agentFormExpiresInDays}
              placeholder="Never"
              min={1}
              class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan"
            />
          </div>
        </div>
      </div>

      <div class="flex justify-end gap-2 mt-6">
        <button
          onclick={() => (showCreateAgentModal = false)}
          class="px-4 py-2 text-gremius-subtle hover:text-gremius-text transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={createAgent}
          disabled={!agentFormName}
          class="px-4 py-2 bg-gremius-cyan/10 text-gremius-cyan rounded-lg border border-gremius-cyan/30 hover:bg-gremius-cyan/20 disabled:opacity-50 disabled:cursor-not-allowed"
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
    <div class="w-full max-w-lg p-6 border border-gremius-border rounded-xl bg-gremius-card">
      <div class="flex items-center gap-3 mb-4 text-gremius-amber">
        <AlertCircle class="w-5 h-5" />
        <h2 class="text-xl font-semibold">API Key Created</h2>
      </div>

      <p class="text-gremius-subtle mb-4">
        <strong class="text-gremius-text">Important:</strong> Copy this API key now. You won't be able
        to see it again!
      </p>

      <div class="flex gap-2 mb-6">
        <code
          class="flex-1 p-3 bg-gremius-bg border border-gremius-border rounded-lg text-sm break-all text-gremius-text"
        >
          {newAgentApiKey}
        </code>
        <button
          onclick={() => copyAgentKeyToClipboard(newAgentApiKey)}
          class="px-3 py-2 bg-gremius-cyan/10 text-gremius-cyan rounded-lg border border-gremius-cyan/30 hover:bg-gremius-cyan/20"
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
        class="w-full px-4 py-2 bg-gremius-cyan/10 text-gremius-cyan rounded-lg border border-gremius-cyan/30 hover:bg-gremius-cyan/20"
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
      class="w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gremius-border rounded-xl bg-gremius-card"
    >
      <!-- Header -->
      <div
        class="sticky top-0 z-10 flex items-center justify-between p-6 border-b border-gremius-border bg-gremius-card"
      >
        <div class="flex items-center gap-3">
          <h2 class="text-xl font-semibold text-gremius-text">{selectedAgent.name}</h2>
          <span
            class="px-2 py-0.5 text-xs rounded-full {selectedAgent.isActive
              ? 'bg-gremius-green/20 text-gremius-green'
              : 'bg-gremius-subtle/20 text-gremius-subtle'}"
          >
            {selectedAgent.isActive ? "Active" : "Inactive"}
          </span>
        </div>
        <button
          onclick={() => (showAgentDetailModal = false)}
          class="text-gremius-subtle hover:text-gremius-text"
        >
          <X class="w-6 h-6" />
        </button>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 p-2 border-b border-gremius-border">
        {#each [["details", "Details"], ["logs", "Audit Logs"], ["stats", "Statistics"]] as [tab, label]}
          <button
            onclick={() => (agentDetailTab = tab as any)}
            class="px-4 py-2 rounded-lg text-sm transition-colors {agentDetailTab === tab
              ? 'bg-gremius-cyan/10 text-gremius-cyan'
              : 'text-gremius-subtle hover:text-gremius-text'}"
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
              <label class="block text-sm text-gremius-subtle mb-1">Description</label>
              <p class="text-gremius-text">{selectedAgent.description || "No description"}</p>
            </div>

            <!-- Scopes -->
            <div>
              <label class="block text-sm text-gremius-subtle mb-2">Scopes</label>
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
              <div class="p-4 border border-gremius-border rounded-lg">
                <p class="text-sm text-gremius-subtle">Rate Limit</p>
                <p class="text-2xl font-bold text-gremius-text">{selectedAgent.rateLimit}</p>
                <p class="text-xs text-gremius-subtle">requests per minute</p>
              </div>
              <div class="p-4 border border-gremius-border rounded-lg">
                <p class="text-sm text-gremius-subtle">Created</p>
                <p class="text-gremius-text">{formatDate(selectedAgent.createdAt)}</p>
              </div>
            </div>

            <!-- API Keys -->
            <div>
              <div class="flex justify-between items-center mb-3">
                <label class="block text-sm text-gremius-subtle">API Keys</label>
                <button
                  onclick={() => selectedAgent && createAgentApiKey(selectedAgent.id)}
                  class="flex items-center gap-1 px-3 py-1 text-sm bg-gremius-cyan/10 text-gremius-cyan rounded border border-gremius-cyan/30 hover:bg-gremius-cyan/20"
                >
                  <Plus class="w-3 h-3" />
                  New Key
                </button>
              </div>

              {#if selectedAgent?.keys.length === 0}
                <p class="text-gremius-subtle text-sm">No API keys</p>
              {:else}
                <div class="space-y-2">
                  {#each selectedAgent?.keys || [] as key}
                    <div
                      class="flex justify-between items-center p-3 bg-gremius-bg border border-gremius-border rounded-lg"
                    >
                      <div>
                        <code class="text-sm text-gremius-text">{key.keyPrefix}</code>
                        <p class="text-xs text-gremius-subtle">
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
                        class="p-2 text-gremius-pink hover:bg-gremius-pink/10 rounded"
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
            <div class="pt-4 border-t border-gremius-border">
              <button
                onclick={() => selectedAgent && deleteAgent(selectedAgent.id)}
                class="flex items-center gap-2 px-4 py-2 bg-gremius-pink/10 text-gremius-pink rounded-lg border border-gremius-pink/30 hover:bg-gremius-pink/20"
              >
                <Trash2 class="w-4 h-4" />
                Delete Agent
              </button>
            </div>
          </div>
        {:else if agentDetailTab === "logs"}
          {#if auditLogs.length === 0}
            <p class="text-gremius-subtle text-center py-8">No audit logs yet</p>
          {:else}
            <div class="space-y-2">
              {#each auditLogs as log}
                <div
                  class="flex items-center gap-3 p-3 text-sm border border-gremius-border rounded-lg"
                >
                  <span class="text-lg">{getActionIcon(log.action)}</span>
                  <span
                    class="px-2 py-0.5 text-xs rounded {log.success
                      ? 'bg-gremius-green/20 text-gremius-green'
                      : 'bg-gremius-pink/20 text-gremius-pink'}"
                  >
                    {log.action}
                  </span>
                  <span class="flex-1 text-gremius-text">{log.resource || "-"}</span>
                  <span class="text-gremius-subtle text-xs">{formatDate(log.createdAt)}</span>
                </div>
              {/each}
            </div>
          {/if}
        {:else if agentDetailTab === "stats"}
          {#if !agentStats}
            <p class="text-gremius-subtle text-center py-8">Loading statistics...</p>
          {:else}
            <div class="grid grid-cols-2 gap-4 mb-6">
              <div class="p-4 border border-gremius-border rounded-lg">
                <p class="text-sm text-gremius-subtle">Total Calls</p>
                <p class="text-2xl font-bold text-gremius-text">{agentStats.totalCalls}</p>
              </div>
              <div class="p-4 border border-gremius-border rounded-lg">
                <p class="text-sm text-gremius-subtle">Success Rate</p>
                <p class="text-2xl font-bold text-gremius-text">{agentStats.successRate}</p>
              </div>
            </div>

            {#if Object.keys(agentStats.actionsByType || {}).length > 0}
              <h4 class="font-medium text-gremius-text mb-3">Actions Breakdown</h4>
              <div class="space-y-2">
                {#each Object.entries(agentStats.actionsByType) as [action, data]}
                  <div
                    class="flex justify-between items-center p-3 bg-gremius-bg border border-gremius-border rounded-lg"
                  >
                    <span class="text-gremius-text capitalize">{action.replace("_", " ")}</span>
                    <div class="flex gap-2">
                      <span
                        class="px-2 py-0.5 text-xs rounded bg-gremius-green/20 text-gremius-green"
                        >{(data as any).success} OK</span
                      >
                      {#if (data as any).failed > 0}
                        <span
                          class="px-2 py-0.5 text-xs rounded bg-gremius-pink/20 text-gremius-pink"
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
      class="w-full max-w-lg max-h-[90vh] overflow-y-auto border border-gremius-border rounded-xl bg-gremius-card"
    >
      <div class="p-6 border-b border-gremius-border">
        <h2 class="text-xl font-semibold text-gremius-text flex items-center gap-2">
          <Database class="w-5 h-5 text-gremius-cyan" />
          Connect Data Source
        </h2>
        <p class="text-sm text-gremius-subtle mt-1">
          Configure connection to external database or API
        </p>
      </div>

      <div class="p-6 space-y-4">
        <!-- Name -->
        <div>
          <label class="block text-sm text-gremius-subtle mb-1">Name *</label>
          <input
            bind:value={dataSourceForm.name}
            placeholder="e.g., Production PostgreSQL"
            class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan"
          />
        </div>

        <!-- Type -->
        <div>
          <label class="block text-sm text-gremius-subtle mb-1">Type *</label>
          <select
            bind:value={dataSourceForm.type}
            class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text focus:outline-none focus:border-gremius-cyan"
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
            <label class="block text-sm text-gremius-subtle mb-1">URL *</label>
            <input
              bind:value={dataSourceForm.url}
              placeholder="https://api.example.com/v1"
              class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan"
            />
          </div>

          <div>
            <label class="block text-sm text-gremius-subtle mb-1">Headers (JSON)</label>
            <textarea
              bind:value={dataSourceForm.headers}
              placeholder={`{ "Authorization": "Bearer token" }`}
              rows="3"
              class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan font-mono text-sm"
            ></textarea>
          </div>
        {:else}
          <!-- Database fields -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm text-gremius-subtle mb-1">Host *</label>
              <input
                bind:value={dataSourceForm.host}
                placeholder="localhost"
                class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan"
              />
            </div>
            <div>
              <label class="block text-sm text-gremius-subtle mb-1">Port *</label>
              <input
                type="number"
                bind:value={dataSourceForm.port}
                class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text focus:outline-none focus:border-gremius-cyan"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm text-gremius-subtle mb-1">Database *</label>
            <input
              bind:value={dataSourceForm.database}
              placeholder="mydb"
              class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan"
            />
          </div>

          <div>
            <label class="block text-sm text-gremius-subtle mb-1">Username</label>
            <input
              bind:value={dataSourceForm.username}
              placeholder="dbuser"
              class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan"
            />
          </div>

          <div>
            <label class="block text-sm text-gremius-subtle mb-1">Password</label>
            <input
              type="password"
              bind:value={dataSourceForm.password}
              placeholder="••••••••"
              class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan"
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

      <div class="p-6 border-t border-gremius-border flex justify-end gap-3">
        <button
          onclick={() => {
            showCreateDataSourceModal = false;
            resetDataSourceForm();
          }}
          class="px-5 py-2.5 text-sm font-medium rounded-xl bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-gremius-bg transition-all duration-200"
        >
          Cancel
        </button>
        <button
          onclick={testDataSourceConnection}
          disabled={testingConnection}
          class="group inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-gremius-cyan/5 hover:border-gremius-cyan/20 hover:text-gremius-cyan transition-all duration-200 disabled:opacity-50"
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
          class="group inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-gremius-cyan to-cyan-400 text-black shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100"
        >
          <Plus class="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
          Connect
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(.bg-gremius-green-10) {
    background-color: rgba(16, 185, 129, 0.1);
  }
  :global(.bg-gremius-green-20) {
    background-color: rgba(16, 185, 129, 0.2);
  }
  :global(.border-gremius-green-30) {
    border-color: rgba(16, 185, 129, 0.3);
  }
  :global(.text-gremius-green) {
    color: rgb(16, 185, 129);
  }
</style>
