<script lang="ts">
  import { onMount } from "svelte";
  import { 
    BarChart3, Table2, Database, Search, Filter, Plus, 
    ChevronLeft, ChevronRight, MoreHorizontal, Save, 
    RefreshCw, Eye, Edit2, Trash2, X, Check, ChevronDown,
    ChevronRight as ChevronRightIcon, Settings, Download, Upload,
    Folder, FolderOpen, Box
  } from "lucide-svelte";
  
  const API_URL = import.meta.env.VITE_API_URL ?? "";
  
  // State
  let loading = $state(true);
  let grimoires = $state<any[]>([]);
  let expandedGrimoires = $state<Set<string>>(new Set());
  let tables = $state<any[]>([]);
  let selectedTable = $state<{ schema: string; name: string } | null>(null);
  let columns = $state<any[]>([]);
  let data = $state<any[]>([]);
  let primaryKey = $state<string>("id");
  
  // Pagination
  let currentPage = $state(1);
  let pageSize = $state(25);
  let totalCount = $state(0);
  let totalPages = $state(1);
  
  // Search & Filter
  let searchQuery = $state("");
  let showFilters = $state(false);
  
  // Editing
  let editingRow = $state<string | null>(null);
  let editedData = $state<Record<string, any>>({});
  let selectedRows = $state<Set<string>>(new Set());
  
  // Modals
  let showCreateModal = $state(false);
  let showDeleteConfirm = $state<string | null>(null);
  let newRowData = $state<Record<string, any>>({});
  
  // Views sidebar
  let showSidebar = $state(true);
  
  onMount(async () => {
    await loadTables();
  });
  
  async function loadTables() {
    try {
      const res = await fetch(`${API_URL}/api/data-visualizer/tables`, {
        credentials: "include"
      });
      const result = await res.json();
      if (result.success) {
        grimoires = result.data;
        // Expand all grimoires by default
        expandedGrimoires = new Set(grimoires.map(g => g.key));
        // Flatten tables for compatibility
        tables = grimoires.flatMap(g => g.tables);
        // Auto-select first table
        const firstGrimoire = grimoires[0];
        if (firstGrimoire?.tables?.length > 0 && !selectedTable) {
          selectTable(firstGrimoire.tables[0]);
        }
      }
    } catch (err) {
      console.error("Failed to load tables:", err);
    } finally {
      loading = false;
    }
  }
  
  function toggleGrimoire(key: string) {
    const newExpanded = new Set(expandedGrimoires);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    expandedGrimoires = newExpanded;
  }
  
  async function selectTable(table: any) {
    selectedTable = { schema: table.schema, name: table.name };
    currentPage = 1;
    searchQuery = "";
    selectedRows = new Set();
    
    // Load columns
    try {
      const res = await fetch(
        `${API_URL}/api/data-visualizer/tables/${table.schema}/${table.name}/columns`,
        { credentials: "include" }
      );
      const result = await res.json();
      if (result.success) {
        columns = result.data.columns;
        primaryKey = result.data.primaryKeys[0] || 'id';
      }
    } catch (err) {
      console.error("Failed to load columns:", err);
    }
    
    await loadData();
  }
  
  async function loadData() {
    if (!selectedTable) return;
    
    loading = true;
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        pageSize: String(pageSize),
      });
      if (searchQuery) params.set("search", searchQuery);
      
      const res = await fetch(
        `${API_URL}/api/data-visualizer/data/${selectedTable.schema}/${selectedTable.name}?${params}`,
        { credentials: "include" }
      );
      const result = await res.json();
      if (result.success) {
        data = result.data;
        totalCount = result.pagination.total;
        totalPages = result.pagination.totalPages;
      }
    } catch (err) {
      console.error("Failed to load data:", err);
    } finally {
      loading = false;
    }
  }
  
  function startEdit(row: any) {
    editingRow = row[primaryKey];
    editedData = { ...row };
  }
  
  function cancelEdit() {
    editingRow = null;
    editedData = {};
  }
  
  async function saveEdit() {
    if (!selectedTable || !editingRow) return;
    
    try {
      const res = await fetch(
        `${API_URL}/api/data-visualizer/data/${selectedTable.schema}/${selectedTable.name}/${editingRow}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(editedData)
        }
      );
      
      if (res.ok) {
        editingRow = null;
        editedData = {};
        await loadData();
      }
    } catch (err) {
      console.error("Failed to save:", err);
    }
  }
  
  async function deleteRow(id: string) {
    if (!selectedTable) return;
    
    try {
      const res = await fetch(
        `${API_URL}/api/data-visualizer/data/${selectedTable.schema}/${selectedTable.name}/${id}`,
        {
          method: "DELETE",
          credentials: "include"
        }
      );
      
      if (res.ok) {
        showDeleteConfirm = null;
        await loadData();
      }
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  }
  
  async function createRow() {
    if (!selectedTable) return;
    
    try {
      const res = await fetch(
        `${API_URL}/api/data-visualizer/data/${selectedTable.schema}/${selectedTable.name}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(newRowData)
        }
      );
      
      if (res.ok) {
        showCreateModal = false;
        newRowData = {};
        await loadData();
      }
    } catch (err) {
      console.error("Failed to create:", err);
    }
  }
  
  function toggleRowSelection(id: string) {
    const newSet = new Set(selectedRows);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    selectedRows = newSet;
  }
  
  function formatCell(value: any, column: any): string {
    if (value === null || value === undefined) return "-";
    if (typeof value === "boolean") return value ? "✓" : "✗";
    if (typeof value === "object") return JSON.stringify(value).slice(0, 50);
    if (column.type === "timestamp" || column.type === "date") {
      return new Date(value).toLocaleString();
    }
    return String(value);
  }
  
  function getTypeIcon(type: string): string {
    switch (type) {
      case "uuid": return "🔑";
      case "text": return "📝";
      case "integer": return "🔢";
      case "boolean": return "☑️";
      case "timestamp": return "📅";
      case "jsonb": return "📦";
      default: return "📄";
    }
  }
</script>

<div class="h-[calc(100vh-4rem)] flex">
  <!-- Sidebar - Tables List -->
  {#if showSidebar}
    <div class="w-64 border-r border-gremius-border bg-gremius-card flex flex-col">
      <div class="p-4 border-b border-gremius-border">
        <div class="flex items-center gap-2 mb-3">
          <Database class="w-5 h-5 text-gremius-cyan" />
          <span class="font-semibold text-gremius-text">Tables</span>
        </div>
        <div class="relative">
          <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gremius-text-dim" />
          <input
            type="text"
            placeholder="Search tables..."
            class="w-full pl-9 pr-3 py-2 text-sm bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text placeholder:text-gremius-text-dim focus:outline-none focus:border-gremius-cyan/50"
          />
        </div>
      </div>
      
      <div class="flex-1 overflow-y-auto p-2 space-y-1">
        {#each grimoires as grimoire}
          <div class="mb-1">
            <!-- Grimoire Header -->
            <button
              class="w-full text-left px-2 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 text-gremius-text hover:bg-gremius-bg"
              onclick={() => toggleGrimoire(grimoire.key)}
            >
              {#if expandedGrimoires.has(grimoire.key)}
                <ChevronDown class="w-4 h-4 text-gremius-text-dim" />
              {:else}
                <ChevronRightIcon class="w-4 h-4 text-gremius-text-dim" />
              {/if}
              <span class="text-lg">{grimoire.icon}</span>
              <span class="font-medium truncate">{grimoire.name}</span>
              <span class="ml-auto text-xs text-gremius-subtle bg-gremius-bg px-1.5 py-0.5 rounded">
                {grimoire.tables.length}
              </span>
            </button>
            
            <!-- Tables in Grimoire -->
            {#if expandedGrimoires.has(grimoire.key)}
              <div class="ml-4 mt-1 space-y-0.5 border-l-2 border-gremius-border pl-2">
                {#each grimoire.tables as table}
                  <button
                    class="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 {selectedTable?.name === table.name ? 'bg-gremius-cyan/10 text-gremius-cyan' : 'text-gremius-text-dim hover:text-gremius-text hover:bg-gremius-bg'}"
                    onclick={() => selectTable(table)}
                  >
                    <Table2 class="w-4 h-4" />
                    <span class="truncate">{table.name}</span>
                    <span class="ml-auto text-xs opacity-60">{table.column_count}</span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
      
      <div class="p-3 border-t border-gremius-border">
        <button class="w-full flex items-center gap-2 px-3 py-2 text-sm text-gremius-subtle hover:text-gremius-text hover:bg-gremius-bg rounded-lg transition-colors">
          <Settings class="w-4 h-4" />
          Configure Views
        </button>
      </div>
    </div>
  {/if}
  
  <!-- Main Content -->
  <div class="flex-1 flex flex-col min-w-0">
    <!-- Header -->
    <div class="p-4 border-b border-gremius-border bg-gremius-card flex items-center justify-between">
      <div class="flex items-center gap-3">
        <button
          class="p-2 rounded-lg hover:bg-gremius-bg text-gremius-text-dim"
          onclick={() => showSidebar = !showSidebar}
        >
          <Database class="w-5 h-5" />
        </button>
        
        {#if selectedTable}
          <div>
            <h1 class="text-lg font-semibold text-gremius-text flex items-center gap-2">
              {selectedTable.name}
              <span class="text-xs text-gremius-subtle font-normal">({totalCount} rows)</span>
            </h1>
            <p class="text-xs text-gremius-subtle">
              {columns.length} columns • {primaryKey} (PK)
            </p>
          </div>
        {:else}
          <h1 class="text-lg font-semibold text-gremius-text">Select a table</h1>
        {/if}
      </div>
      
      <div class="flex items-center gap-2">
        {#if selectedTable}
          <div class="relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gremius-text-dim" />
            <input
              type="text"
              bind:value={searchQuery}
              oninput={() => { currentPage = 1; loadData(); }}
              placeholder="Search all columns..."
              class="pl-9 pr-4 py-2 text-sm bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text placeholder:text-gremius-text-dim focus:outline-none focus:border-gremius-cyan/50 w-64"
            />
          </div>
          
          <button
            class="group inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-gremius-cyan/5 hover:border-gremius-cyan/20 transition-all duration-200"
            onclick={() => showFilters = !showFilters}
          >
            <Filter class="w-4 h-4 group-hover:scale-110 transition-transform" />
            Filter
          </button>
          
          <button
            class="group inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-gremius-cyan/5 hover:border-gremius-cyan/20 transition-all duration-200"
            onclick={() => loadData()}
          >
            <RefreshCw class="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
          </button>
          
          <button
            class="group inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-gremius-cyan to-cyan-400 text-black rounded-xl font-semibold shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-105 active:scale-95 transition-all duration-200"
            onclick={() => { newRowData = {}; showCreateModal = true; }}
          >
            <Plus class="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
            Add Row
          </button>
        {/if}
      </div>
    </div>
    
    <!-- Data Grid -->
    {#if selectedTable}
      <div class="flex-1 overflow-auto">
        <table class="w-full text-sm">
          <thead class="bg-gremius-bg sticky top-0 z-10">
            <tr>
              <th class="w-10 p-3 border-b border-gremius-border">
                <input type="checkbox" class="rounded border-gremius-border" />
              </th>
              {#each columns.slice(0, 8) as column}
                <th class="p-3 text-left text-xs font-semibold text-gremius-subtle uppercase tracking-wider border-b border-gremius-border whitespace-nowrap">
                  <div class="flex items-center gap-1">
                    <span>{getTypeIcon(column.type)}</span>
                    <span>{column.name}</span>
                    {#if column.name === primaryKey}
                      <span class="text-gremius-cyan">🔑</span>
                    {/if}
                  </div>
                </th>
              {/each}
              {#if columns.length > 8}
                <th class="p-3 text-left text-xs font-semibold text-gremius-subtle uppercase tracking-wider border-b border-gremius-border">
                  +{columns.length - 8} more
                </th>
              {/if}
              <th class="p-3 text-right border-b border-gremius-border">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gremius-border/50">
            {#each data as row}
              <tr class="hover:bg-gremius-cyan/[0.03] group">
                <td class="p-3">
                  <input 
                    type="checkbox" 
                    checked={selectedRows.has(row[primaryKey])}
                    onchange={() => toggleRowSelection(row[primaryKey])}
                    class="rounded border-gremius-border"
                  />
                </td>
                {#each columns.slice(0, 8) as column}
                  <td class="p-3 text-gremius-text">
                    {#if editingRow === row[primaryKey]}
                      <input
                        type="text"
                        bind:value={editedData[column.name]}
                        class="w-full px-2 py-1 text-sm bg-gremius-bg border border-gremius-cyan/50 rounded"
                      />
                    {:else}
                      <span class="truncate block max-w-[200px]" title={formatCell(row[column.name], column)}>
                        {formatCell(row[column.name], column)}
                      </span>
                    {/if}
                  </td>
                {/each}
                {#if columns.length > 8}
                  <td class="p-3 text-gremius-subtle">...</td>
                {/if}
                <td class="p-3 text-right">
                  <div class="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {#if editingRow === row[primaryKey]}
                      <button
                        class="p-2 rounded-xl text-emerald-400 hover:bg-emerald-500/10 transition-all hover:scale-110"
                        onclick={saveEdit}
                      >
                        <Check class="w-4 h-4" />
                      </button>
                      <button
                        class="p-2 rounded-xl text-gremius-text-dim hover:text-gremius-pink hover:bg-gremius-pink/10 transition-all hover:scale-110"
                        onclick={cancelEdit}
                      >
                        <X class="w-4 h-4" />
                      </button>
                    {:else}
                      <button
                        class="p-2 rounded-xl text-gremius-text-dim hover:text-gremius-cyan hover:bg-gremius-cyan/10 transition-all hover:scale-110"
                        onclick={() => startEdit(row)}
                      >
                        <Edit2 class="w-4 h-4" />
                      </button>
                      <button
                        class="p-2 rounded-xl text-gremius-text-dim hover:text-gremius-pink hover:bg-gremius-pink/10 transition-all hover:scale-110"
                        onclick={() => showDeleteConfirm = row[primaryKey]}
                      >
                        <Trash2 class="w-4 h-4" />
                      </button>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      
      <!-- Pagination -->
      <div class="p-4 border-t border-gremius-border bg-gremius-card flex items-center justify-between">
        <div class="text-sm text-gremius-subtle">
          Showing {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalCount)} of {totalCount}
        </div>
        <div class="flex items-center gap-1 bg-gremius-bg rounded-xl p-1">
          <button
            class="p-2 rounded-lg text-gremius-text-dim hover:text-gremius-cyan hover:bg-gremius-surface transition-all hover:scale-110 disabled:opacity-30"
            disabled={currentPage === 1}
            onclick={() => { currentPage--; loadData(); }}
          >
            <ChevronLeft class="w-4 h-4" />
          </button>
          <span class="px-4 py-1.5 text-sm font-semibold text-gremius-text bg-gremius-surface rounded-lg border border-gremius-border min-w-[80px] text-center">
            {currentPage} / {totalPages}
          </span>
          <button
            class="p-2 rounded-lg text-gremius-text-dim hover:text-gremius-cyan hover:bg-gremius-surface transition-all hover:scale-110 disabled:opacity-30"
            disabled={currentPage >= totalPages}
            onclick={() => { currentPage++; loadData(); }}
          >
            <ChevronRight class="w-4 h-4" />
          </button>
        </div>
      </div>
    {:else}
      <div class="flex-1 flex items-center justify-center">
        <div class="text-center">
          <Database class="w-16 h-16 text-gremius-cyan/30 mx-auto mb-4" />
          <h3 class="text-lg font-semibold text-gremius-text mb-2">Select a table to start</h3>
          <p class="text-gremius-subtle max-w-sm">
            Choose a table from the sidebar to explore and edit data
          </p>
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- Create Row Modal -->
{#if showCreateModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <div class="w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gremius-border rounded-xl bg-gremius-card">
      <div class="p-6 border-b border-gremius-border">
        <h2 class="text-xl font-semibold text-gremius-text">Add New Row</h2>
        <p class="text-sm text-gremius-subtle mt-1">Create a new record in {selectedTable?.name}</p>
      </div>
      
      <div class="p-6 space-y-4">
        {#each columns.filter(c => c.name !== primaryKey || c.type !== 'uuid') as column}
          <div>
            <label class="block text-sm text-gremius-subtle mb-1 flex items-center gap-2">
              <span>{getTypeIcon(column.type)}</span>
              {column.name}
              {#if column.nullable === 'NO'}
                <span class="text-gremius-pink">*</span>
              {/if}
            </label>
            {#if column.type === 'boolean'}
              <select
                bind:value={newRowData[column.name]}
                class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text focus:outline-none focus:border-gremius-cyan"
              >
                <option value={null}>NULL</option>
                <option value={true}>True</option>
                <option value={false}>False</option>
              </select>
            {:else if column.type === 'jsonb'}
              <textarea
                bind:value={newRowData[column.name]}
                placeholder="{'{ }'}"
                rows="3"
                class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan font-mono text-sm"
              ></textarea>
            {:else}
              <input
                type={column.type === 'integer' || column.type === 'numeric' ? 'number' : 'text'}
                bind:value={newRowData[column.name]}
                placeholder={column.default_value || ''}
                class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan"
              />
            {/if}
          </div>
        {/each}
      </div>
      
      <div class="p-6 border-t border-gremius-border flex justify-end gap-3">
        <button
          onclick={() => { showCreateModal = false; newRowData = {}; }}
          class="px-5 py-2.5 text-sm font-medium rounded-xl bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-gremius-bg transition-all duration-200"
        >
          Cancel
        </button>
        <button
          onclick={createRow}
          class="group inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-gremius-cyan to-cyan-400 text-black shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-105 active:scale-95 transition-all duration-200"
        >
          <Plus class="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
          Create Row
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirm}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <div class="w-full max-w-sm border border-gremius-border rounded-xl bg-gremius-card p-6">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
          <Trash2 class="w-6 h-6 text-red-400" />
        </div>
        <div>
          <h3 class="text-lg font-semibold text-gremius-text">Delete row?</h3>
          <p class="text-sm text-gremius-text-dim">This action cannot be undone.</p>
        </div>
      </div>
      
      <div class="flex justify-end gap-3">
        <button
          onclick={() => showDeleteConfirm = null}
          class="px-5 py-2.5 text-sm font-medium rounded-xl bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-gremius-bg transition-all duration-200"
        >
          Cancel
        </button>
        <button
          onclick={() => showDeleteConfirm && deleteRow(showDeleteConfirm)}
          class="group inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/25 hover:shadow-red-500/40 hover:scale-105 active:scale-95 transition-all duration-200"
        >
          <Trash2 class="w-4 h-4 group-hover:animate-bounce" />
          Delete
        </button>
      </div>
    </div>
  </div>
{/if}
