<script lang="ts">
  /**
   * DataSetEntries.svelte
   * 
   * Vista maestra para visualizar entradas de cualquier dataset.
   * CONECTADA A API REAL - Elimina datos falsos (sampleEntries).
   * 
   * ═══════════════════════════════════════════════════════════════════════════
   * PASO 3: MATAR LA FANTASÍA - Conexión real a la API
   * ═══════════════════════════════════════════════════════════════════════════
   */
  import { onMount } from "svelte";
  import { 
    Database, 
    Plus, 
    Filter, 
    LayoutGrid, 
    List, 
    Kanban,
    Settings,
    ArrowLeft,
    Loader2,
    X
  } from "lucide-svelte";
  import { slide } from "svelte/transition";
  import { DataTable, StatusBadge } from "$lib/components/ui";
  import { ImageCell, ScoreCell, RelationCell } from "$lib/components/table/cells";
  import { DynamicForm } from "$lib/components/forms";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import type { ColumnDef } from "@tanstack/svelte-table";
  import type { DatasetDefinition, DatasetEntry, FieldDefinition } from "$types/datasets";
  
  // ─── Props ───
  interface Props {
    /** ID del dataset (opcional, por defecto usa $page.params.id) */
    datasetId?: string;
  }
  
  let { datasetId = $page.params.id }: Props = $props();
  
  // ─── Estado Reactivo ───
  let loading = $state(true);
  let error = $state<string | null>(null);
  let viewMode: "table" | "grid" | "kanban" = $state("table");
  let dataset = $state<DatasetDefinition | null>(null);
  let entries = $state<DatasetEntry[]>([]);
  let showEntryForm = $state(false);
  let editingEntry = $state<DatasetEntry | null>(null);
  
  // ─── Configuración API ───
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
  
  // ─── Cargar datos reales de la API ───
  async function loadDatasetAndEntries() {
    if (!datasetId) {
      error = "No dataset ID provided";
      loading = false;
      return;
    }
    
    loading = true;
    error = null;
    
    try {
      // Cargar dataset definition
      const dsResponse = await fetch(`${API_URL}/api/datasets/${datasetId}`);
      if (!dsResponse.ok) {
        throw new Error(`Failed to load dataset: ${dsResponse.statusText}`);
      }
      dataset = await dsResponse.json();
      
      // Cargar entries
      const entriesResponse = await fetch(`${API_URL}/api/datasets/${datasetId}/entries`);
      if (!entriesResponse.ok) {
        throw new Error(`Failed to load entries: ${entriesResponse.statusText}`);
      }
      const data = await entriesResponse.json();
      entries = data.docs || [];
    } catch (err) {
      error = err instanceof Error ? err.message : "Unknown error";
      console.error("[DataSetEntries] Error loading data:", err);
    } finally {
      loading = false;
    }
  }
  
  onMount(() => {
    loadDatasetAndEntries();
  });
  
  // ─── Construir columnas dinámicamente desde el schema real ───
  function buildColumns(fields: FieldDefinition[]): ColumnDef<any>[] {
    if (!fields || fields.length === 0) {
      return [{ accessorKey: "id", header: "ID" }];
    }
    
    return fields
      .filter(field => !field.hidden)
      .map(field => {
        const baseColumn: ColumnDef<any> = {
          accessorKey: field.key,
          header: field.label,
        };
        
        switch (field.type) {
          case "image":
            return {
              ...baseColumn,
              cell: (info) => {
                const value = info.getValue() as string;
                const title = info.row.original.title || "";
                return ImageCell({ src: value, alt: title, size: "sm", rounded: true });
              }
            };
            
          case "boolean":
            return {
              ...baseColumn,
              cell: (info) => {
                const value = info.getValue() as boolean;
                return StatusBadge({ 
                  variant: value ? "success" : "inactive",
                  label: value ? "Yes" : "No",
                  size: "sm"
                });
              }
            };
            
          case "date":
            return {
              ...baseColumn,
              cell: (info) => {
                const date = info.getValue() as string;
                return date ? new Date(date).toLocaleDateString() : "—";
              }
            };
            
          case "relation":
            return {
              ...baseColumn,
              cell: (info) => {
                const items = info.getValue() as { id: string; label: string }[];
                if (!items || items.length === 0) return "—";
                return RelationCell({ items, maxItems: 2 });
              }
            };
            
          case "number":
            return {
              ...baseColumn,
              cell: (info) => {
                const value = info.getValue() as number;
                return value?.toLocaleString() ?? "—";
              }
            };
            
          default:
            return baseColumn;
        }
      });
  }
  
  let columns = $derived(dataset?.fields ? buildColumns(dataset.fields) : []);
  
  // ─── Handlers ───
  function handleRowClick(row: any) {
    editingEntry = row;
    showEntryForm = true;
  }
  
  function handleNewEntry() {
    editingEntry = null;
    showEntryForm = true;
  }
  
  function handleCloseForm() {
    showEntryForm = false;
    editingEntry = null;
  }
  
  async function handleSaveEntry(data: Record<string, any>) {
    try {
      const url = editingEntry 
        ? `${API_URL}/api/datasets/${datasetId}/entries/${editingEntry.id}`
        : `${API_URL}/api/datasets/${datasetId}/entries`;
      
      const method = editingEntry ? "PATCH" : "POST";
      
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to save entry: ${response.statusText}`);
      }
      
      // Recargar entries
      await loadDatasetAndEntries();
      showEntryForm = false;
      editingEntry = null;
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to save entry";
      console.error("[DataSetEntries] Error saving entry:", err);
    }
  }
  
  function goBack() {
    goto("/datasets");
  }
</script>

<div class="space-y-6 animate-fade-in">
  <!-- Header -->
  <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
    <div class="flex items-start gap-4">
      <button 
        class="p-2 rounded-lg hover:bg-gremius-card text-gremius-text-dim transition-colors"
        onclick={goBack}
      >
        <ArrowLeft class="w-5 h-5" />
      </button>
      
      <div>
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-bold text-gremius-text flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-20 to-purple-20 border border-cyan-20 flex items-center justify-center">
              <Database class="w-5 h-5 text-gremius-cyan" />
            </div>
            {#if loading && !dataset}
              <span class="animate-pulse">Loading...</span>
            {:else}
              {dataset?.name || datasetId}
            {/if}
          </h1>
          {#if dataset}
            <span class="badge-purple text-[10px]">DATASET</span>
          {/if}
        </div>
        <p class="text-sm text-gremius-subtle mt-1">
          {dataset?.description || `Manage entries for this dataset`}
        </p>
      </div>
    </div>
    
    <div class="flex items-center gap-2 w-full lg:w-auto">
      <!-- View Mode Toggle -->
      <div class="flex items-center bg-gremius-card border border-gremius-border rounded-lg p-0.5">
        <button
          class="p-1.5 rounded transition-colors {viewMode === 'table' ? 'bg-cyan-10 text-gremius-cyan' : 'text-gremius-text-dim hover:text-gremius-text'}"
          onclick={() => viewMode = "table"}
          title="Table view"
        >
          <List class="w-4 h-4" />
        </button>
        <button
          class="p-1.5 rounded transition-colors {viewMode === 'grid' ? 'bg-cyan-10 text-gremius-cyan' : 'text-gremius-text-dim hover:text-gremius-text'}"
          onclick={() => viewMode = "grid"}
          title="Grid view"
        >
          <LayoutGrid class="w-4 h-4" />
        </button>
        <button
          class="p-1.5 rounded transition-colors {viewMode === 'kanban' ? 'bg-cyan-10 text-gremius-cyan' : 'text-gremius-text-dim hover:text-gremius-text'}"
          onclick={() => viewMode = "kanban"}
          title="Kanban view"
        >
          <Kanban class="w-4 h-4" />
        </button>
      </div>
      
      <button class="btn-secondary">
        <Filter class="w-4 h-4" />
        Filter
      </button>
      
      <button class="btn-secondary" onclick={() => goto(`/datasets/${datasetId}/schema`)}>
        <Settings class="w-4 h-4" />
        Schema
      </button>
      
      <button class="btn-primary" onclick={handleNewEntry}>
        <Plus class="w-4 h-4" />
        New Entry
      </button>
    </div>
  </div>
  
  <!-- Error Message -->
  {#if error}
    <div class="card p-4 border-l-4 border-l-gremius-pink bg-gremius-pink/5" transition:slide>
      <div class="flex items-center justify-between">
        <p class="text-gremius-pink">{error}</p>
        <button class="text-gremius-text-dim hover:text-gremius-text" onclick={() => error = null}>
          <X class="w-4 h-4" />
        </button>
      </div>
      <button class="btn-secondary mt-3 text-sm" onclick={loadDatasetAndEntries}>
        Retry
      </button>
    </div>
  {/if}
  
  <!-- Content -->
  {#if loading && entries.length === 0}
    <div class="card p-12 text-center">
      <Loader2 class="w-8 h-8 text-gremius-cyan animate-spin mx-auto mb-4" />
      <p class="text-gremius-subtle">Loading entries...</p>
    </div>
  {:else if entries.length === 0 && !loading}
    <div class="card p-12 text-center">
      <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-gremius-cyan/10 flex items-center justify-center">
        <Database class="w-8 h-8 text-gremius-cyan/50" />
      </div>
      <h3 class="text-lg font-medium text-gremius-text mb-2">No Entries Yet</h3>
      <p class="text-sm text-gremius-subtle max-w-md mx-auto mb-6">
        Create your first entry in this dataset.
      </p>
      <button class="btn-primary" onclick={handleNewEntry}>
        <Plus class="w-4 h-4" />
        Create First Entry
      </button>
    </div>
  {:else}
    <!-- Table View -->
    {#if viewMode === "table"}
      <DataTable
        data={entries}
        {columns}
        title=""
        {loading}
        enableSorting
        enableFiltering
        enablePagination
        pageSize={10}
        onRowClick={handleRowClick}
        emptyMessage="No entries found in this dataset"
      />
    {:else if viewMode === "grid"}
      <!-- Grid View -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {#if loading}
          {#each [1, 2, 3, 4] as i}
            <div class="card p-4 animate-pulse">
              <div class="h-32 bg-gremius-border rounded-lg mb-4"></div>
              <div class="h-4 bg-gremius-border rounded w-3/4 mb-2"></div>
              <div class="h-3 bg-gremius-border rounded w-1/2"></div>
            </div>
          {/each}
        {:else}
          {#each entries as entry}
            <button 
              type="button"
              class="card p-4 hover:border-gremius-cyan/30 transition-all cursor-pointer group text-left w-full"
              onclick={() => handleRowClick(entry)}
            >
              <h3 class="font-medium text-gremius-text line-clamp-1">{entry.title}</h3>
              <p class="text-xs text-gremius-subtle mt-2">ID: {entry.id.slice(0, 8)}...</p>
            </button>
          {/each}
        {/if}
      </div>
    {:else}
      <!-- Kanban View -->
      <div class="flex gap-4 overflow-x-auto pb-4">
        {#each ["draft", "published", "archived"] as status}
          <div class="min-w-[300px] flex-1">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-medium text-gremius-text capitalize">{status}</h3>
              <span class="text-xs text-gremius-subtle">
                {entries.filter(e => e.status === status).length}
              </span>
            </div>
            
            <div class="space-y-3">
              {#each entries.filter(e => e.status === status) as entry}
                <button 
                  type="button"
                  class="card p-3 hover:border-cyan-30 transition-all cursor-pointer text-left w-full"
                  onclick={() => handleRowClick(entry)}
                >
                  <h4 class="font-medium text-gremius-text text-sm line-clamp-1">{entry.title}</h4>
                  <p class="text-xs text-gremius-subtle mt-1">ID: {entry.id.slice(0, 8)}...</p>
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<!-- Entry Form Modal -->
{#if showEntryForm && dataset}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" transition:slide={{ duration: 200 }}>
    <div class="card w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
      <div class="flex items-center justify-between p-4 border-b border-gremius-border">
        <h2 class="text-xl font-bold text-gremius-text">
          {editingEntry ? "Edit" : "New"} Entry
        </h2>
        <button class="btn-icon" onclick={handleCloseForm}>
          <X class="w-5 h-5" />
        </button>
      </div>
      
      <div class="flex-1 overflow-y-auto p-6">
        {#if dataset.fields.length > 0}
          <DynamicForm
            fields={dataset.fields}
            initialData={editingEntry?.data || {}}
            submitLabel={editingEntry ? "Update Entry" : "Create Entry"}
            onSubmit={handleSaveEntry}
            onCancel={handleCloseForm}
          />
        {:else}
          <p class="text-gremius-subtle text-center py-8">
            No fields defined for this dataset. 
            <a href={`/datasets/${datasetId}/schema`} class="text-gremius-cyan">Configure schema first</a>.
          </p>
        {/if}
      </div>
    </div>
  </div>
{/if}

