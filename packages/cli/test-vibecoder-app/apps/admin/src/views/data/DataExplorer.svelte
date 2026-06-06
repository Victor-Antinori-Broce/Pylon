<script lang="ts">
  import { api } from "$lib/api";
  import { Search, Filter, Megaphone, X } from "lucide-svelte";
  import { onMount } from "svelte";

  interface Game {
    id: string;
    title: string;
    genre?: string;
    platform?: string[];
    rating?: number;
    releaseDate?: string;
    // Generic fields for any dataset entry
    [key: string]: any;
  }

  interface DatasetEntry {
    id: string;
    [key: string]: any;
  }

  let games = $state<Game[]>([]);
  let loading = $state(true);
  let search = $state("");
  let blogEnabled = $state(false);
  const currentDatasetId = $state("games"); // This should come from route params
  
  // Promote modal state
  let showPromoteModal = $state(false);
  let selectedEntry = $state<DatasetEntry | null>(null);
  let promoteLoading = $state(false);
  let promoteError = $state("");
  let promoteSuccess = $state("");
  
  // Promote form data
  let titleTemplate = $state("");
  let slugPrefix = $state("");
  let autoPublish = $state(false);

  const API_URL = import.meta.env.VITE_API_URL ?? "";

  const filteredGames = $derived(
    games.filter(g => 
      g.title?.toLowerCase().includes(search.toLowerCase()) ||
      g.genre?.toLowerCase().includes(search.toLowerCase())
    )
  );

  onMount(async () => {
    // Check if blog grimoire is enabled
    try {
      const res = await fetch(`${API_URL}/api/modules`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const docs = data.docs || [];
        blogEnabled = docs.some((m: any) => 
          (m.key === "blog" || m.key === "grimoire-blog") && m.enabled
        );
      }
    } catch {
      // If API fails, blog stays disabled
    }

    // Load dataset entries
    try {
      const data = await api.get<{ docs: Game[] }>("/games");
      games = data.docs || [];
    } catch {
      // empty
    } finally {
      loading = false;
    }
  });

  function openPromoteModal(entry: DatasetEntry) {
    selectedEntry = entry;
    titleTemplate = `Analysis: ${entry.title || entry.name || 'Entry'}`;
    slugPrefix = currentDatasetId;
    autoPublish = false;
    promoteError = "";
    promoteSuccess = "";
    showPromoteModal = true;
  }

  function closePromoteModal() {
    showPromoteModal = false;
    selectedEntry = null;
    promoteError = "";
    promoteSuccess = "";
  }

  async function handlePromote() {
    if (!selectedEntry) return;
    
    promoteLoading = true;
    promoteError = "";
    promoteSuccess = "";

    try {
      const res = await fetch(`${API_URL}/api/blog/promote-from-source`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: "dataset",
          datasetId: currentDatasetId,
          entryId: selectedEntry.id,
          options: {
            titleTemplate: titleTemplate || undefined,
            slugPrefix: slugPrefix || undefined,
            autoPublish,
            includeRawData: true,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        promoteError = data.error || "Failed to promote entry";
      } else {
        promoteSuccess = `Post created successfully! <a href="/posts/${data.postId}" class="text-gremius-cyan hover:underline">View post</a>`;
        setTimeout(() => {
          closePromoteModal();
        }, 3000);
      }
    } catch (err: any) {
      promoteError = err.message || "Network error";
    } finally {
      promoteLoading = false;
    }
  }

  function formatFieldValue(value: any): string {
    if (value === null || value === undefined) return "—";
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "object") return JSON.stringify(value).slice(0, 50);
    return String(value);
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-xl font-bold text-gremius-text">Data Explorer</h2>
      <p class="text-sm text-gremius-text-dim mt-0.5">Browse and query game data</p>
    </div>
  </div>

  <!-- Search and Actions -->
  <div class="flex items-center gap-3">
    <div class="relative flex-1 max-w-md">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gremius-subtle" />
      <input
        type="text"
        placeholder="Search games..."
        bind:value={search}
        class="w-full pl-10 pr-4 py-2 bg-gremius-card border border-gremius-border rounded-lg text-sm focus:outline-none focus:border-gremius-cyan"
      />
    </div>
    <button class="btn-secondary">
      <Filter class="w-4 h-4" /> Filter
    </button>
  </div>

  {#if loading}
    <div class="flex justify-center py-20">
      <div class="w-6 h-6 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div>
    </div>
  {:else}
    <div class="card overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gremius-surface border-b border-gremius-border">
          <tr>
            <th class="text-left px-4 py-3 font-medium text-gremius-text-dim">Title</th>
            <th class="text-left px-4 py-3 font-medium text-gremius-text-dim">Genre</th>
            <th class="text-left px-4 py-3 font-medium text-gremius-text-dim">Platform</th>
            <th class="text-left px-4 py-3 font-medium text-gremius-text-dim">Rating</th>
            {#if blogEnabled}
              <th class="text-left px-4 py-3 font-medium text-gremius-text-dim w-10">Actions</th>
            {/if}
          </tr>
        </thead>
        <tbody>
          {#each filteredGames as game}
            <tr class="border-b border-gremius-border/50 hover:bg-gremius-surface/50">
              <td class="px-4 py-3 font-medium">{game.title}</td>
              <td class="px-4 py-3 text-gremius-text-dim">{game.genre || "—"}</td>
              <td class="px-4 py-3">
                {#if game.platform}
                  <div class="flex gap-1">
                    {#each game.platform as p}
                      <span class="px-1.5 py-0.5 text-[10px] bg-gremius-surface rounded">{p}</span>
                    {/each}
                  </div>
                {:else}
                  <span class="text-gremius-subtle">—</span>
                {/if}
              </td>
              <td class="px-4 py-3">
                {#if game.rating}
                  <span class="text-gremius-cyan">{game.rating}/10</span>
                {:else}
                  <span class="text-gremius-subtle">—</span>
                {/if}
              </td>
              {#if blogEnabled}
                <td class="px-4 py-3">
                  <button 
                    class="p-1.5 rounded-lg hover:bg-gremius-cyan/10 text-gremius-subtle hover:text-gremius-cyan transition-colors"
                    title="Promote to Content"
                    onclick={() => openPromoteModal(game)}
                  >
                    <Megaphone class="w-4 h-4" />
                  </button>
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<!-- Promote to Content Modal -->
{#if showPromoteModal && selectedEntry}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-gremius-card border border-gremius-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-auto">
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-gremius-border">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <Megaphone class="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 class="text-lg font-bold text-gremius-text">Promote to Content</h3>
            <p class="text-xs text-gremius-text-dim">Convert dataset entry to blog post</p>
          </div>
        </div>
        <button 
          class="p-2 rounded-lg hover:bg-gremius-surface text-gremius-subtle"
          onclick={closePromoteModal}
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Content -->
      <div class="p-6 space-y-4">
        <!-- Source preview -->
        <div class="rounded-lg bg-gremius-surface/50 border border-gremius-border p-4">
          <p class="text-xs text-gremius-subtle mb-2">Source Entry</p>
          <p class="text-sm font-medium text-gremius-text">{selectedEntry.title || selectedEntry.name || 'Untitled'}</p>
          <p class="text-xs text-gremius-text-dim mt-1">ID: {selectedEntry.id}</p>
        </div>

        <!-- Form -->
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gremius-text mb-1.5">
              Title Template
            </label>
            <input
              type="text"
              bind:value={titleTemplate}
              placeholder="Analysis: {title}"
              class="w-full px-3 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-sm focus:outline-none focus:border-gremius-cyan"
            />
            <p class="text-xs text-gremius-subtle mt-1">
              Use {'{field}'} for dynamic values (e.g., {'{title}'}, {'{genre}'})
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gremius-text mb-1.5">
              Slug Prefix
            </label>
            <input
              type="text"
              bind:value={slugPrefix}
              placeholder="analysis"
              class="w-full px-3 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-sm focus:outline-none focus:border-gremius-cyan"
            />
            <p class="text-xs text-gremius-subtle mt-1">
              Result: /blog/{slugPrefix || 'entry'}/entry-slug
            </p>
          </div>

          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={autoPublish}
              class="w-4 h-4 rounded border-gremius-border bg-gremius-surface text-gremius-cyan focus:ring-gremius-cyan"
            />
            <span class="text-sm text-gremius-text">Auto-publish immediately</span>
          </label>
        </div>

        <!-- Messages -->
        {#if promoteError}
          <div class="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
            <p class="text-sm text-red-400">{promoteError}</p>
          </div>
        {/if}

        {#if promoteSuccess}
          <div class="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
            <p class="text-sm text-emerald-400">{@html promoteSuccess}</p>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-gremius-border">
        <button 
          class="btn-secondary"
          onclick={closePromoteModal}
          disabled={promoteLoading}
        >
          Cancel
        </button>
        <button 
          class="btn-primary flex items-center gap-2"
          onclick={handlePromote}
          disabled={promoteLoading}
        >
          {#if promoteLoading}
            <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            Creating...
          {:else}
            <Megaphone class="w-4 h-4" />
            Promote to Content
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
