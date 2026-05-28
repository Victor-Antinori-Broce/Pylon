<script lang="ts">
  /**
   * DataSets.svelte
   * 
   * Vista de gestión de Datasets - CONECTADA A API REAL
   * Svelte 5 compatible (no @tanstack/svelte-table)
   */
  import { onMount } from "svelte";
  import { Zap, Plus, X, Loader2, Pencil, Trash2 } from "lucide-svelte";
  import { slide } from "svelte/transition";
  import { datasetStore } from "$lib/states/datasets.svelte";

  // ─── Estado Local ───
  let showBuilder = $state(false);

  // ─── Cargar datasets al montar ───
  onMount(() => {
    datasetStore.fetchDatasets();
  });

  // ─── Handlers ───
  function handleNewDataset() {
    // Navigate to the schema builder
    window.location.href = "/datasets/new";
  }

  function handleEditDataset(id: string) {
    window.location.href = `/datasets/${id}/edit`;
  }

  function handleViewEntries(id: string) {
    window.location.href = `/datasets/${id}/entries`;
  }

  async function handleDeleteDataset(id: string, name: string) {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;
    await datasetStore.deleteDataset(id);
  }
</script>

<div class="space-y-6 animate-fade-in">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-gremius-text flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-gremius-cyan/20 to-gremius-purple/20 border border-gremius-cyan/20 flex items-center justify-center">
          <Zap class="w-5 h-5 text-gremius-cyan" />
        </div>
        Data Sets
      </h1>
      <p class="text-sm text-gremius-subtle mt-1">
        Manage your data collections and schemas.
      </p>
    </div>
    <a href="/datasets/new" class="btn-primary inline-flex items-center gap-2">
      <Plus class="w-4 h-4" />
      New Data Set
    </a>
  </div>

  <!-- Error Message -->
  {#if datasetStore.error}
    <div class="card p-4 border-l-4 border-l-gremius-pink bg-gremius-pink/5" transition:slide>
      <div class="flex items-center justify-between">
        <p class="text-gremius-pink">{datasetStore.error}</p>
        <button class="text-gremius-text-dim hover:text-gremius-text" onclick={() => datasetStore.clearError()}>
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>
  {/if}

  <!-- Loading State -->
  {#if datasetStore.isLoading && datasetStore.datasets.length === 0}
    <div class="card p-12 text-center">
      <Loader2 class="w-8 h-8 text-gremius-cyan animate-spin mx-auto mb-4" />
      <p class="text-gremius-subtle">Loading datasets...</p>
    </div>
  <!-- Empty State -->
  {:else if datasetStore.datasets.length === 0}
    <div class="card p-12 text-center">
      <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-gremius-cyan/10 flex items-center justify-center">
        <Zap class="w-8 h-8 text-gremius-cyan/50" />
      </div>
      <h3 class="text-lg font-medium text-gremius-text mb-2">No Data Sets Yet</h3>
      <p class="text-sm text-gremius-subtle max-w-md mx-auto mb-6">
        Create your first dataset to start collecting and managing data.
      </p>
      <a href="/datasets/new" class="btn-primary inline-flex items-center gap-2">
        <Plus class="w-4 h-4" />
        Create First Data Set
      </a>
    </div>
  <!-- Data Table -->
  {:else}
    <div class="card overflow-hidden">
      <table class="w-full text-left">
        <thead>
          <tr class="border-b border-gremius-border bg-gremius-surface/50">
            <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gremius-subtle">Name</th>
            <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gremius-subtle">Slug</th>
            <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gremius-subtle">Fields</th>
            <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gremius-subtle">Description</th>
            <th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gremius-subtle text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each datasetStore.datasets as dataset}
            <tr
              class="border-b border-gremius-border/50 hover:bg-gremius-surface/30 transition-colors cursor-pointer group"
              onclick={() => handleViewEntries(dataset.id)}
            >
              <td class="px-4 py-3">
                <span class="font-medium text-gremius-text group-hover:text-gremius-cyan transition-colors">
                  {dataset.icon || "📦"} {dataset.name}
                </span>
              </td>
              <td class="px-4 py-3">
                <code class="text-xs text-gremius-subtle bg-gremius-surface px-2 py-0.5 rounded">{dataset.slug}</code>
              </td>
              <td class="px-4 py-3 text-sm text-gremius-text-dim">
                {dataset.fields?.length || 0} field{(dataset.fields?.length || 0) !== 1 ? "s" : ""}
              </td>
              <td class="px-4 py-3 text-sm text-gremius-text-dim truncate max-w-[200px]">
                {dataset.description || "—"}
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    class="p-1.5 rounded-lg hover:bg-gremius-cyan/10 text-gremius-text-dim hover:text-gremius-cyan transition-colors"
                    title="Edit schema"
                    onclick={(e) => { e.stopPropagation(); handleEditDataset(dataset.id); }}
                  >
                    <Pencil class="w-4 h-4" />
                  </button>
                  <button
                    class="p-1.5 rounded-lg hover:bg-gremius-pink/10 text-gremius-text-dim hover:text-gremius-pink transition-colors"
                    title="Delete"
                    onclick={(e) => { e.stopPropagation(); handleDeleteDataset(dataset.id, dataset.name); }}
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
