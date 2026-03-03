<script lang="ts">
  import { 
    Webhook,
    Plus,
    RefreshCw,
    Activity,
    AlertCircle,
    Clock,
    CheckCircle,
    Eye,
    X,
    Send,
    Trash2,
    Loader2,
    FileText,
  } from "lucide-svelte";
  
  const API = import.meta.env.VITE_API_URL || "http://localhost:3001";
  
  // State
  let webhooks = $state<any[]>([]);
  let failedJobs = $state<any[]>([]);
  let logs = $state<any[]>([]);
  let loading = $state(false);
  let activeTab = $state("webhooks");
  let showCreateModal = $state(false);
  let selectedWebhook = $state<any>(null);
  let creating = $state(false);
  let testing = $state(false);
  
  // New webhook form
  let newWebhook = $state({
    name: "",
    datasetId: "",
    event: "on_create" as "on_create" | "on_update" | "on_delete",
    targetUrl: "",
    secret: "",
    enabled: true,
  });
  
  // Computed
  const activeWebhooks = $derived(webhooks.filter((w) => w.enabled));
  
  // Tabs
  const tabs = [
    { id: "webhooks", label: "Webhooks" },
    { id: "failed", label: "Failed Jobs" },
    { id: "logs", label: "All Logs" },
  ];
  
  // Load webhooks
  async function loadWebhooks() {
    loading = true;
    try {
      const res = await fetch(`${API}/api/custom/webhooks`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        webhooks = data.docs || [];
      }
    } catch (e) {
      console.error("Failed to load webhooks:", e);
    } finally {
      loading = false;
    }
  }
  
  // Create webhook
  async function createWebhook(e: Event) {
    e.preventDefault();
    creating = true;
    try {
      const res = await fetch(`${API}/api/custom/webhooks`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newWebhook),
      });
      if (res.ok) {
        showCreateModal = false;
        newWebhook = { name: "", datasetId: "", event: "on_create", targetUrl: "", secret: "", enabled: true };
        await loadWebhooks();
      }
    } catch (e) {
      console.error("Failed to create webhook:", e);
    } finally {
      creating = false;
    }
  }
  
  function formatDate(date: string | number | Date) {
    return new Date(date).toLocaleString();
  }
  
  // Load on mount
  loadWebhooks();
</script>

<div class="space-y-6 animate-fade-in">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-gremius-text flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-gremius-cyan/20 to-gremius-purple/20 border border-gremius-cyan/20 flex items-center justify-center">
          <Webhook class="w-5 h-5 text-gremius-cyan" />
        </div>
        Webhooks
      </h1>
      <p class="text-sm text-gremius-subtle mt-1">
        Manage webhook endpoints and monitor delivery status.
      </p>
    </div>
    <button
      onclick={() => showCreateModal = true}
      class="btn-primary"
    >
      <Plus class="w-4 h-4" />
      New Webhook
    </button>
  </div>

  <!-- Stats -->
  <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
    <div class="card p-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-gremius-cyan/10 flex items-center justify-center">
          <Webhook class="w-5 h-5 text-gremius-cyan" />
        </div>
        <div>
          <p class="text-2xl font-bold text-gremius-text">{webhooks.length}</p>
          <p class="text-xs text-gremius-subtle uppercase tracking-wider">Total</p>
        </div>
      </div>
    </div>
    <div class="card p-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-gremius-green/10 flex items-center justify-center">
          <Activity class="w-5 h-5 text-gremius-green" />
        </div>
        <div>
          <p class="text-2xl font-bold text-gremius-text">{activeWebhooks.length}</p>
          <p class="text-xs text-gremius-subtle uppercase tracking-wider">Active</p>
        </div>
      </div>
    </div>
    <div class="card p-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-gremius-pink/10 flex items-center justify-center">
          <AlertCircle class="w-5 h-5 text-gremius-pink" />
        </div>
        <div>
          <p class="text-2xl font-bold text-gremius-text">{failedJobs.length}</p>
          <p class="text-xs text-gremius-subtle uppercase tracking-wider">Failed</p>
        </div>
      </div>
    </div>
    <div class="card p-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-gremius-amber/10 flex items-center justify-center">
          <Clock class="w-5 h-5 text-gremius-amber" />
        </div>
        <div>
          <p class="text-2xl font-bold text-gremius-text">{logs.length}</p>
          <p class="text-xs text-gremius-subtle uppercase tracking-wider">Logs</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Tabs -->
  <div class="border-b border-gremius-border">
    <div class="flex gap-1">
      {#each tabs as tab}
        <button
          onclick={() => activeTab = tab.id}
          class="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors"
          class:border-gremius-cyan={activeTab === tab.id}
          class:text-gremius-cyan={activeTab === tab.id}
          class:border-transparent={activeTab !== tab.id}
          class:text-gremius-text-dim={activeTab !== tab.id}
          class:hover:text-gremius-text={activeTab !== tab.id}
        >
          {tab.label}
        </button>
      {/each}
    </div>
  </div>

  <!-- Webhooks List -->
  {#if activeTab === "webhooks"}
    <div class="card overflow-hidden">
      {#if webhooks.length > 0}
        <table class="data-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Name</th>
              <th>Event</th>
              <th>Target URL</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each webhooks as webhook}
              <tr class="hover:bg-gremius-cyan/[0.03]">
                <td>
                  <span class="{webhook.enabled ? 'badge-green' : 'badge-muted'}">
                    {webhook.enabled ? "Active" : "Inactive"}
                  </span>
                </td>
                <td class="font-medium text-gremius-text">{webhook.name}</td>
                <td><span class="badge-cyan">{webhook.event}</span></td>
                <td class="font-mono text-xs text-gremius-text-dim truncate max-w-[200px]">
                  {webhook.targetUrl}
                </td>
                <td>
                  <button class="btn-icon" onclick={() => selectedWebhook = webhook}>
                    <Eye class="w-4 h-4" />
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <div class="p-12 text-center">
          <WebhookIcon class="w-12 h-12 mx-auto text-gremius-muted mb-4" />
          <h3 class="text-lg font-medium text-gremius-text mb-2">No webhooks configured</h3>
          <button onclick={() => showCreateModal = true} class="btn-primary mt-4">
            Create Webhook
          </button>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Create Modal -->
  {#if showCreateModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center">
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions a11y_missing_attribute -->
      <div 
        class="absolute inset-0 bg-black/60 backdrop-blur-sm" 
        role="button"
        tabindex="-1"
        aria-label="Close modal"
        onclick={() => showCreateModal = false}
        onkeydown={(e) => e.key === 'Escape' && (showCreateModal = false)}
      ></div>
      <div class="relative bg-gremius-card border border-gremius-border rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gremius-text">Create Webhook</h3>
          <button onclick={() => showCreateModal = false} class="btn-icon">
            <X class="w-4 h-4" />
          </button>
        </div>
        <form onsubmit={createWebhook} class="space-y-4">
          <div>
            <label class="label" for="webhook-name">Name</label>
            <input id="webhook-name" bind:value={newWebhook.name} type="text" class="w-full bg-gremius-bg text-gremius-text placeholder-gremius-text-dim border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none" required />
          </div>
          <div>
            <label class="label" for="webhook-event">Event</label>
            <select id="webhook-event" bind:value={newWebhook.event} class="w-full bg-gremius-bg text-gremius-text border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none">
              <option value="on_create">Entry Created</option>
              <option value="on_update">Entry Updated</option>
              <option value="on_delete">Entry Deleted</option>
            </select>
          </div>
          <div>
            <label class="label" for="webhook-url">Target URL</label>
            <input id="webhook-url" bind:value={newWebhook.targetUrl} type="text" placeholder="https://example.com/webhook" class="w-full bg-gremius-bg text-gremius-text placeholder-gremius-text-dim border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none" required />
          </div>
          <div class="flex justify-end gap-3 pt-4">
            <button type="button" onclick={() => showCreateModal = false} class="btn-ghost">Cancel</button>
            <button type="submit" disabled={creating} class="btn-primary">
              {#if creating}<Loader2 class="w-4 h-4 animate-spin" />{/if}
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  {/if}
</div>

