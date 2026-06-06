<script lang="ts">
  import {
    Plug,
    Plus,
    RefreshCw,
    Trash2,
    Zap,
    Database as DbIcon,
    Globe,
    TestTube,
    CheckCircle,
    XCircle,
    Loader2,
    X,
    Eye,
    Server,
    Table2,
  } from "lucide-svelte";
  import { onMount } from "svelte";

  const API_URL = import.meta.env.VITE_API_URL ?? "";

  interface Connector {
    id: string;
    name: string;
    type: "api" | "database";
    config: Record<string, any>;
    lastSyncedAt?: string;
    enabled: boolean;
    createdAt: string;
  }

  let connectors = $state<Connector[]>([]);
  let loading = $state(true);
  let showCreate = $state(false);
  let testing = $state<string | null>(null);
  let testResults = $state<Record<string, { ok: boolean; message: string }>>({});
  let creating = $state(false);
  let browsing = $state<{
    connectorId: string;
    tables?: string[];
    data?: any[];
    table?: string;
  } | null>(null);

  // Form
  let formName = $state("");
  let formType = $state<"api" | "database">("database");
  // Database fields
  let formHost = $state("localhost");
  let formPort = $state("3306");
  let formDbName = $state("");
  let formUser = $state("");
  let formPass = $state("");
  let formDialect = $state("mysql");
  // API fields
  let formBaseUrl = $state("");
  let formApiKey = $state("");
  let formHeaders = $state("{}");

  onMount(loadConnectors);

  async function loadConnectors() {
    loading = true;
    try {
      const res = await fetch(`${API_URL}/api/custom/connectors`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        connectors = data.docs || [];
      }
    } catch (e) {
      console.error("Failed to load connectors:", e);
    } finally {
      loading = false;
    }
  }

  async function createConnector(e: Event) {
    e.preventDefault();
    creating = true;
    try {
      const config =
        formType === "database"
          ? {
              host: formHost,
              port: Number(formPort),
              database: formDbName,
              user: formUser,
              password: formPass,
              dialect: formDialect,
            }
          : { baseUrl: formBaseUrl, apiKey: formApiKey, headers: JSON.parse(formHeaders || "{}") };

      const res = await fetch(`${API_URL}/api/custom/connectors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: formName, type: formType, config, enabled: true }),
      });
      if (res.ok) {
        showCreate = false;
        resetForm();
        await loadConnectors();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to create connector");
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      creating = false;
    }
  }

  async function testConnection(id: string) {
    testing = id;
    try {
      const res = await fetch(`${API_URL}/api/custom/connectors/${id}/test`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      testResults = {
        ...testResults,
        [id]: { ok: data.success || res.ok, message: data.message || data.error || "OK" },
      };
    } catch (e: any) {
      testResults = { ...testResults, [id]: { ok: false, message: e.message } };
    } finally {
      testing = null;
    }
  }

  async function browseConnector(id: string) {
    browsing = { connectorId: id };
    try {
      const res = await fetch(`${API_URL}/api/custom/connectors/${id}/data`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        browsing = { connectorId: id, tables: data.tables || [] };
      }
    } catch (e: any) {
      console.error("Browse failed:", e);
      browsing = null;
    }
  }

  async function browseTable(connectorId: string, table: string) {
    try {
      const res = await fetch(
        `${API_URL}/api/custom/connectors/${connectorId}/data/${table}?limit=50`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        browsing = { ...browsing!, table, data: data.rows || data.data || [] };
      }
    } catch (e: any) {
      console.error("Browse table failed:", e);
    }
  }

  async function deleteConnector(id: string) {
    if (!confirm("Delete this connector? This cannot be undone.")) return;
    try {
      await fetch(`${API_URL}/api/custom/connectors/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      await loadConnectors();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function toggleConnector(id: string, enabled: boolean) {
    try {
      await fetch(`${API_URL}/api/custom/connectors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled: !enabled }),
      });
      await loadConnectors();
    } catch (e: any) {
      alert(e.message);
    }
  }

  function resetForm() {
    formName = "";
    formType = "database";
    formHost = "localhost";
    formPort = "3306";
    formDbName = "";
    formUser = "";
    formPass = "";
    formDialect = "mysql";
    formBaseUrl = "";
    formApiKey = "";
    formHeaders = "{}";
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
</script>

<div class="space-y-6 animate-fade-in">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-gremius-text flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-xl bg-gradient-to-br from-gremius-purple/20 to-gremius-cyan/20 border border-gremius-purple/20 flex items-center justify-center"
        >
          <Plug class="w-5 h-5 text-gremius-purple" />
        </div>
        Data Connectors
      </h1>
      <p class="text-sm text-gremius-subtle mt-1">
        Connect external databases (MySQL, MariaDB) and APIs as read-only data sources.
      </p>
    </div>
    <div class="flex items-center gap-2">
      <button class="btn-secondary-sm" onclick={loadConnectors}>
        <RefreshCw class="w-4 h-4" />
      </button>
      <button class="btn-primary" onclick={() => (showCreate = true)}>
        <Plus class="w-4 h-4" /> New Connector
      </button>
    </div>
  </div>

  <!-- Stats -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
    <div class="card p-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-gremius-purple/10 flex items-center justify-center">
          <Plug class="w-5 h-5 text-gremius-purple" />
        </div>
        <div>
          <p class="text-2xl font-bold text-gremius-text">{connectors.length}</p>
          <p class="text-xs text-gremius-subtle uppercase tracking-wider">Total</p>
        </div>
      </div>
    </div>
    <div class="card p-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-gremius-cyan/10 flex items-center justify-center">
          <DbIcon class="w-5 h-5 text-gremius-cyan" />
        </div>
        <div>
          <p class="text-2xl font-bold text-gremius-text">
            {connectors.filter((c) => c.type === "database").length}
          </p>
          <p class="text-xs text-gremius-subtle uppercase tracking-wider">Databases</p>
        </div>
      </div>
    </div>
    <div class="card p-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-gremius-green/10 flex items-center justify-center">
          <Globe class="w-5 h-5 text-gremius-green" />
        </div>
        <div>
          <p class="text-2xl font-bold text-gremius-text">
            {connectors.filter((c) => c.type === "api").length}
          </p>
          <p class="text-xs text-gremius-subtle uppercase tracking-wider">APIs</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Create Form -->
  {#if showCreate}
    <form class="card p-6 border-gremius-purple/20 space-y-4" onsubmit={createConnector}>
      <div class="flex items-center justify-between">
        <h3 class="font-semibold text-gremius-text">New Connector</h3>
        <button
          type="button"
          class="p-1 text-gremius-subtle hover:text-gremius-text"
          onclick={() => {
            showCreate = false;
            resetForm();
          }}
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="text-xs text-gremius-subtle block mb-1">Name *</label>
          <input
            type="text"
            bind:value={formName}
            placeholder="e.g. Legacy MySQL"
            required
            class="w-full bg-gremius-bg text-gremius-text placeholder-gremius-text-dim border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none"
          />
        </div>
        <div>
          <label class="text-xs text-gremius-subtle block mb-1">Type *</label>
          <select
            bind:value={formType}
            class="w-full bg-gremius-bg text-gremius-text border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none"
          >
            <option value="database">Database (MySQL/MariaDB)</option>
            <option value="api">REST API</option>
          </select>
        </div>
      </div>

      {#if formType === "database"}
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div class="md:col-span-2">
            <label class="text-xs text-gremius-subtle block mb-1">Host</label>
            <input
              type="text"
              bind:value={formHost}
              placeholder="localhost"
              class="w-full bg-gremius-bg text-gremius-text placeholder-gremius-text-dim border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none"
            />
          </div>
          <div>
            <label class="text-xs text-gremius-subtle block mb-1">Port</label>
            <input
              type="text"
              bind:value={formPort}
              placeholder="3306"
              class="w-full bg-gremius-bg text-gremius-text placeholder-gremius-text-dim border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none"
            />
          </div>
          <div>
            <label class="text-xs text-gremius-subtle block mb-1">Dialect</label>
            <select
              bind:value={formDialect}
              class="w-full bg-gremius-bg text-gremius-text border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none"
            >
              <option value="mysql">MySQL</option>
              <option value="mariadb">MariaDB</option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label class="text-xs text-gremius-subtle block mb-1">Database *</label>
            <input
              type="text"
              bind:value={formDbName}
              placeholder="my_database"
              required
              class="w-full bg-gremius-bg text-gremius-text placeholder-gremius-text-dim border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none"
            />
          </div>
          <div>
            <label class="text-xs text-gremius-subtle block mb-1">User *</label>
            <input
              type="text"
              bind:value={formUser}
              placeholder="root"
              required
              class="w-full bg-gremius-bg text-gremius-text placeholder-gremius-text-dim border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none"
            />
          </div>
          <div>
            <label class="text-xs text-gremius-subtle block mb-1">Password</label>
            <input
              type="password"
              bind:value={formPass}
              placeholder="********"
              class="w-full bg-gremius-bg text-gremius-text placeholder-gremius-text-dim border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none"
            />
          </div>
        </div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="text-xs text-gremius-subtle block mb-1">Base URL *</label>
            <input
              type="url"
              bind:value={formBaseUrl}
              placeholder="https://api.example.com/v1"
              required
              class="w-full bg-gremius-bg text-gremius-text placeholder-gremius-text-dim border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none"
            />
          </div>
          <div>
            <label class="text-xs text-gremius-subtle block mb-1">API Key</label>
            <input
              type="password"
              bind:value={formApiKey}
              placeholder="sk-..."
              class="w-full bg-gremius-bg text-gremius-text placeholder-gremius-text-dim border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none"
            />
          </div>
        </div>
      {/if}

      <div class="flex justify-end gap-2 pt-2">
        <button
          type="button"
          class="btn-secondary-sm"
          onclick={() => {
            showCreate = false;
            resetForm();
          }}>Cancel</button
        >
        <button type="submit" class="btn-primary" disabled={creating || !formName}>
          {#if creating}<Loader2 class="w-4 h-4 animate-spin" />{/if}
          Create Connector
        </button>
      </div>
    </form>
  {/if}

  <!-- Connectors List -->
  {#if loading}
    <div class="flex justify-center py-20">
      <div
        class="w-6 h-6 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"
      ></div>
    </div>
  {:else if connectors.length === 0 && !showCreate}
    <div class="card p-16 text-center">
      <div class="flex justify-center mb-4">
        <div class="w-16 h-16 rounded-full bg-gremius-purple/10 flex items-center justify-center">
          <Plug class="w-8 h-8 text-gremius-purple" />
        </div>
      </div>
      <h3 class="text-lg font-medium text-gremius-text mb-2">No connectors configured</h3>
      <p class="text-sm text-gremius-subtle mb-4">
        Connect external databases or APIs to browse their data from within Gremius.
      </p>
      <button onclick={() => (showCreate = true)} class="btn-primary">
        <Plus class="w-4 h-4" /> Create First Connector
      </button>
    </div>
  {:else}
    <div class="space-y-3">
      {#each connectors as conn}
        <div class="card p-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
              <div
                class="w-10 h-10 rounded-lg flex items-center justify-center {conn.type ===
                'database'
                  ? 'bg-gremius-cyan/10'
                  : 'bg-gremius-green/10'}"
              >
                {#if conn.type === "database"}
                  <Server class="w-5 h-5 text-gremius-cyan" />
                {:else}
                  <Globe class="w-5 h-5 text-gremius-green" />
                {/if}
              </div>
              <div>
                <h3 class="font-semibold text-gremius-text">{conn.name}</h3>
                <div class="flex items-center gap-3 mt-0.5 text-xs text-gremius-subtle">
                  <span
                    class="uppercase font-medium {conn.type === 'database'
                      ? 'text-gremius-cyan'
                      : 'text-gremius-green'}">{conn.type}</span
                  >
                  {#if conn.config?.host}
                    <span>{conn.config.host}:{conn.config.port || 3306}</span>
                  {:else if conn.config?.baseUrl}
                    <span class="truncate max-w-[200px]">{conn.config.baseUrl}</span>
                  {/if}
                  {#if conn.lastSyncedAt}
                    <span>Last sync: {formatDate(conn.lastSyncedAt)}</span>
                  {/if}
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <!-- Test Result -->
              {#if testResults[conn.id]}
                <span
                  class="text-xs px-2 py-1 rounded-full {testResults[conn.id].ok
                    ? 'bg-gremius-green/10 text-gremius-green'
                    : 'bg-gremius-pink/10 text-gremius-pink'}"
                >
                  {#if testResults[conn.id].ok}
                    <CheckCircle class="w-3 h-3 inline mr-1" />
                  {:else}
                    <XCircle class="w-3 h-3 inline mr-1" />
                  {/if}
                  {testResults[conn.id].message}
                </span>
              {/if}

              <button
                class="btn-secondary-sm"
                onclick={() => testConnection(conn.id)}
                disabled={testing === conn.id}
                title="Test connection"
              >
                {#if testing === conn.id}
                  <Loader2 class="w-4 h-4 animate-spin" />
                {:else}
                  <TestTube class="w-4 h-4" />
                {/if}
              </button>

              <button
                class="btn-secondary-sm"
                onclick={() => browseConnector(conn.id)}
                title="Browse data"
              >
                <Eye class="w-4 h-4" />
              </button>

              <button
                class="btn-secondary-sm"
                onclick={() => toggleConnector(conn.id, conn.enabled)}
                title={conn.enabled ? "Disable" : "Enable"}
              >
                <Zap
                  class="w-4 h-4 {conn.enabled ? 'text-gremius-green' : 'text-gremius-subtle'}"
                />
              </button>

              <button
                class="p-2 rounded-lg hover:bg-gremius-pink/10 text-gremius-text-dim hover:text-gremius-pink transition-colors"
                onclick={() => deleteConnector(conn.id)}
                title="Delete"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Browse Modal -->
  {#if browsing}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        class="bg-gremius-card border border-gremius-border rounded-2xl shadow-2xl max-w-4xl w-full mx-4 max-h-[80vh] flex flex-col"
      >
        <div class="flex items-center justify-between p-4 border-b border-gremius-border">
          <h3 class="text-lg font-semibold text-gremius-text flex items-center gap-2">
            <Table2 class="w-5 h-5 text-gremius-cyan" />
            Browse: {connectors.find((c) => c.id === browsing?.connectorId)?.name || ""}
            {#if browsing.table}
              <span class="text-gremius-subtle"> / {browsing.table}</span>
            {/if}
          </h3>
          <button
            class="p-1.5 rounded-lg hover:bg-gremius-bg text-gremius-subtle"
            onclick={() => (browsing = null)}
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="flex-1 overflow-auto p-4">
          {#if !browsing.tables && !browsing.data}
            <div class="flex justify-center py-12">
              <Loader2 class="w-6 h-6 text-gremius-cyan animate-spin" />
            </div>
          {:else if browsing.tables && !browsing.table}
            <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
              {#each browsing.tables as table}
                <button
                  class="card p-3 text-left hover:border-gremius-cyan/30 transition-colors"
                  onclick={() => browseTable(browsing!.connectorId, table)}
                >
                  <div class="flex items-center gap-2">
                    <Table2 class="w-4 h-4 text-gremius-cyan" />
                    <span class="text-sm font-medium text-gremius-text">{table}</span>
                  </div>
                </button>
              {/each}
            </div>
          {:else if browsing.data}
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-gremius-border">
                    {#each Object.keys(browsing.data[0] || {}) as col}
                      <th class="p-2 text-left text-xs font-semibold uppercase text-gremius-subtle"
                        >{col}</th
                      >
                    {/each}
                  </tr>
                </thead>
                <tbody>
                  {#each browsing.data.slice(0, 50) as row}
                    <tr class="border-b border-gremius-border/50">
                      {#each Object.values(row) as val}
                        <td class="p-2 text-gremius-text-dim text-xs truncate max-w-[200px]">
                          {val === null
                            ? "-"
                            : typeof val === "object"
                              ? JSON.stringify(val).slice(0, 50)
                              : String(val)}
                        </td>
                      {/each}
                    </tr>
                  {/each}
                </tbody>
              </table>
              {#if browsing.data.length === 0}
                <p class="text-center py-8 text-gremius-subtle">No rows found</p>
              {/if}
            </div>
            <button
              class="btn-secondary-sm mt-3"
              onclick={() => (browsing = { ...browsing!, table: undefined, data: undefined })}
            >
              Back to tables
            </button>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>
