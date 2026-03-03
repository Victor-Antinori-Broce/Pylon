<script lang="ts">
  import { Settings, Key, Plus, Trash2, Copy, CheckCircle2, ShieldAlert, Palette } from "lucide-svelte";
  import { onMount } from "svelte";
  import ThemeSelector from "$lib/components/ThemeSelector.svelte";

  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

  // State
  let activeTab = $state("general");
  let keys = $state<any[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // General Settings Form State
  let siteName = $state("Gremius CMS");
  let logoUrl = $state("/logo.png");
  let defaultMetadata = $state("{\n  \"description\": \"Powered by Gremius\"\n}");
  let savingGeneral = $state(false);

  // API Keys Tab State
  let showCreateModal = $state(false);
  let newKeyName = $state("");
  let newKeyExpiresInStr = $state("0");
  let creatingKey = $state(false);
  let newlyGeneratedToken = $state<string | null>(null);
  let copied = $state(false);

  async function saveGeneralSettings(e: Event) {
    e.preventDefault();
    savingGeneral = true;
    // Simulate API delay since endpoint doesn't exist yet as per instructions
    setTimeout(() => {
      savingGeneral = false;
    }, 800);
  }

  async function fetchKeys() {
    try {
      loading = true;
      const res = await fetch(`${API_URL}/api/keys`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load API keys.");
      keys = await res.json();
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function createKey(e: Event) {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    
    creatingKey = true;
    error = null;
    
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
      error = err.message;
    } finally {
      creatingKey = false;
    }
  }

  async function revokeKey(id: string) {
    if (!confirm("Are you sure you want to revoke this API key? This will break any integrations using it.")) return;
    
    try {
      const res = await fetch(`${API_URL}/api/keys/${id}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to revoke key");
      
      keys = keys.filter(k => k.id !== id);
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function copyToClipboard() {
    if (newlyGeneratedToken) {
      try {
        await navigator.clipboard.writeText(newlyGeneratedToken);
        copied = true;
        setTimeout(() => copied = false, 2000);
      } catch (err) {
        // Ignored
      }
    }
  }

  onMount(() => {
    fetchKeys();
  });
</script>

<div class="space-y-6 animate-fade-in">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-gremius-text flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-gremius-green/20 to-gremius-cyan/20 border border-gremius-green/20 flex items-center justify-center">
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
      class="pb-3 text-sm font-medium border-b-2 transition-colors {activeTab === 'general' ? 'border-gremius-cyan text-gremius-cyan' : 'border-transparent text-gremius-subtle hover:text-gremius-text'}"
      onclick={() => activeTab = 'general'}
    >
      General
    </button>
    <button 
      class="pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 {activeTab === 'appearance' ? 'border-gremius-cyan text-gremius-cyan' : 'border-transparent text-gremius-subtle hover:text-gremius-text'}"
      onclick={() => activeTab = 'appearance'}
    >
      <Palette class="w-4 h-4" />
      Appearance
    </button>
    <button 
      class="pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 {activeTab === 'keys' ? 'border-gremius-cyan text-gremius-cyan' : 'border-transparent text-gremius-subtle hover:text-gremius-text'}"
      onclick={() => activeTab = 'keys'}
    >
      <Key class="w-4 h-4" />
      API Keys
    </button>
  </div>

  <!-- Tab Content -->
  {#if activeTab === 'general'}
    <div class="card p-8 animate-fade-in border border-gremius-border">
      <div class="mb-6">
        <h2 class="text-xl font-bold text-gremius-text">General Configuration</h2>
        <p class="text-sm text-gremius-subtle mt-1">Manage core settings for your digital presence.</p>
      </div>
      
      <form onsubmit={saveGeneralSettings} class="space-y-6 max-w-2xl">
        <div class="space-y-2">
          <label class="label block text-xs font-semibold uppercase text-gremius-subtle tracking-wider">
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
          <label class="label block text-xs font-semibold uppercase text-gremius-subtle tracking-wider">
            Logo URL
          </label>
          <input
            bind:value={logoUrl}
            type="text"
            placeholder="https://example.com/logo.png"
            class="input w-full bg-gremius-bg text-gremius-text border border-gremius-border placeholder-gremius-text-dim"
          />
          <p class="text-xs text-gremius-subtle mt-1">Recommended size: 256x256px inside a transparent PNG.</p>
        </div>

        <div class="space-y-2">
          <label class="label block text-xs font-semibold uppercase text-gremius-subtle tracking-wider">
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
              <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2 inline-block"></div>
              Saving...
            {:else}
              Save Configuration
            {/if}
          </button>
        </div>
      </form>
    </div>
  {:else if activeTab === 'appearance'}
    <ThemeSelector />
  {:else if activeTab === 'keys'}
    <div class="space-y-6">
      
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold text-gremius-text">Machine Authentication</h3>
          <p class="text-xs text-gremius-subtle mt-1">
            API keys allow Astro, n8n, and external tools to authenticate as Admin without a user interface.
          </p>
        </div>
        <button class="btn-primary" onclick={() => showCreateModal = true}>
          <Plus class="w-4 h-4" />
          Create API Key
        </button>
      </div>

      {#if newlyGeneratedToken}
        <div class="card bg-gremius-green-10 border-gremius-green-30 p-5 mt-4">
          <div class="flex items-start gap-4">
            <div class="w-10 h-10 rounded-full bg-gremius-green-20 flex items-center justify-center shrink-0">
              <Key class="w-5 h-5 text-gremius-green" />
            </div>
            <div class="flex-1 min-w-0">
              <h4 class="text-gremius-green font-medium">API Key generated successfully!</h4>
              <p class="text-xs text-gremius-green/80 mt-1 mb-3">
                Please copy your API key using the button below. <strong>It will not be shown again.</strong> You must include it in your HTTP requests as an <code>Authorization: Bearer &lt;token&gt;</code> header.
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
              
              <button class="btn-ghost mt-4 text-xs" onclick={() => newlyGeneratedToken = null}>
                I have copied my key safely
              </button>
            </div>
          </div>
        </div>
      {/if}

      {#if error}
        <div class="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
          <ShieldAlert class="w-4 h-4 shrink-0" />
          {error}
        </div>
      {/if}

      <div class="card overflow-hidden">
        {#if loading}
          <div class="p-12 text-center text-gremius-subtle text-sm">Loading keys...</div>
        {:else if keys.length === 0}
          <div class="p-12 text-center">
            <div class="w-12 h-12 rounded-full bg-gremius-bg flex items-center justify-center mx-auto mb-3">
              <Key class="w-5 h-5 text-gremius-subtle" />
            </div>
            <p class="text-gremius-text text-sm">No API keys found.</p>
            <p class="text-gremius-subtle text-xs mt-1">Generate a key to connect external integrations.</p>
          </div>
        {:else}
          <table class="w-full text-sm text-left">
            <thead>
              <tr class="border-b border-gremius-border text-gremius-subtle text-xs uppercase tracking-wider">
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
                    <span class="font-mono text-xs bg-gremius-bg px-2 py-1 rounded text-gremius-text-dim border border-gremius-border">
                      {k.hint}
                    </span>
                  </td>
                  <td class="px-5 py-3 text-gremius-text-dim text-xs">
                    {new Date(k.createdAt).toLocaleDateString()}
                  </td>
                  <td class="px-5 py-3 text-gremius-text-dim text-xs">
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'Never'}
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
  {/if}
</div>

<!-- Create Modal -->
{#if showCreateModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
    <div class="card w-full max-w-md shadow-2xl overflow-hidden border border-gremius-border">
      <div class="px-6 py-4 border-b border-gremius-border flex items-center justify-between bg-gremius-bg/50">
        <h3 class="font-bold text-gremius-text flex items-center gap-2">
          <Key class="w-4 h-4 text-gremius-cyan" />
          Create new API Key
        </h3>
      </div>
      
      <form onsubmit={createKey} class="p-6 space-y-4">
        <div class="space-y-1.5">
          <label class="label block text-xs font-semibold uppercase text-gremius-subtle tracking-wider">
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
          <label class="label block text-xs font-semibold uppercase text-gremius-subtle tracking-wider">
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
            onclick={() => { showCreateModal = false; newKeyName = ""; }}
            disabled={creatingKey}
          >
            Cancel
          </button>
          <button 
            type="submit" 
            class="btn-primary"
            disabled={creatingKey || !newKeyName.trim()}
          >
            {creatingKey ? 'Creating...' : 'Create Key'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  :global(.bg-gremius-green-10) { background-color: rgba(16, 185, 129, 0.1); }
  :global(.bg-gremius-green-20) { background-color: rgba(16, 185, 129, 0.2); }
  :global(.border-gremius-green-30) { border-color: rgba(16, 185, 129, 0.3); }
  :global(.text-gremius-green) { color: rgb(16, 185, 129); }
</style>
