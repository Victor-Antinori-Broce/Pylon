<script lang="ts">
  /**
   * DataExplorer - Componente Genérico de Exploración de Datos
   *
   * Características:
   * - Soporta field types extensibles
   * - Campos calculados (frontend y backend)
   * - Búsqueda server-side
   * - Filtros multicolumna
   * - Ordenamiento
   * - Paginación
   * - Edición inline
   *
   * Props:
   * - table: string - Nombre de la tabla
   * - config: TableConfig - Configuración de columnas y fields
   * - data: any[] - Datos (opcional, puede cargar de API)
   * - apiEndpoint: string - Endpoint para cargar datos
   */

  import {
    Search,
    Filter,
    ChevronLeft,
    ChevronRight,
    Loader2,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Download,
    Edit2,
    Check,
    X,
  } from "lucide-svelte";
  import { onMount } from "svelte";

  import { api } from "$lib/api";
  import { fieldRegistry, type FieldConfig } from "$lib/data-explorer/fieldRegistry";
  import "$lib/data-explorer/registerFields";

  // ═══════════════════════════════════════════════════════════════════════════════
  // TYPES
  // ═══════════════════════════════════════════════════════════════════════════════

  interface TableConfig {
    table: string;
    label?: string;
    columns: ColumnConfig[];
    searchableFields?: string[];
    filterableFields?: string[];
    sortable?: boolean;
    pagination?: boolean | { pageSize: number };
    bulkActions?: BulkAction[];
    rowActions?: RowAction[];
  }

  interface ColumnConfig {
    field: string;
    label: string;
    width?: string;
    fieldConfig?: FieldConfig;
    sortable?: boolean;
    hidden?: boolean;
  }

  interface BulkAction {
    id: string;
    label: string;
    icon?: any;
    variant?: "default" | "danger";
    handler: (ids: string[]) => Promise<void>;
  }

  interface RowAction {
    id: string;
    label: string;
    icon?: any;
    handler: (row: any) => void;
  }

  interface PaginationInfo {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PROPS
  // ═══════════════════════════════════════════════════════════════════════════════

  interface Props {
    table: string;
    config?: Partial<TableConfig>;
    data?: any[];
    apiEndpoint?: string;
    defaultFilter?: Record<string, any>;
    onRowClick?: (row: any) => void;
  }

  const {
    table,
    config = {},
    data: initialData,
    apiEndpoint,
    defaultFilter = {},
    onRowClick,
  }: Props = $props();

  // ═══════════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════════

  let rows = $state<any[]>(initialData || []);
  let loading = $state(!initialData);
  let error = $state("");

  // Búsqueda y filtros
  let searchQuery = $state("");
  let activeFilters = $state<Record<string, any>>({ ...defaultFilter });
  let showFilterPanel = $state(false);

  // Ordenamiento
  let sortField = $state<string | null>(null);
  let sortDirection = $state<"asc" | "desc">("asc");

  // Paginación
  const pagination = $state<PaginationInfo>({
    page: 1,
    pageSize: typeof config.pagination === "object" ? config.pagination.pageSize : 20,
    total: 0,
    totalPages: 0,
  });

  // Selección
  let selectedRows = $state<Set<string>>(new Set());
  let editingRow = $state<string | null>(null);
  let editingData = $state<any>(null);

  // Configuración completa con defaults
  const fullConfig = $derived<TableConfig>({
    table,
    label: config.label || table,
    columns: config.columns || [],
    searchableFields: config.searchableFields || [],
    filterableFields: config.filterableFields || [],
    sortable: config.sortable !== false,
    pagination: config.pagination !== false,
    bulkActions: config.bulkActions || [],
    rowActions: config.rowActions || [],
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════════

  onMount(() => {
    if (!initialData && apiEndpoint) {
      loadData();
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // DATA LOADING
  // ═══════════════════════════════════════════════════════════════════════════════

  async function loadData() {
    if (!apiEndpoint) return;

    loading = true;
    error = "";

    try {
      const params = new URLSearchParams();

      // Search
      if (searchQuery) {
        params.append("search", searchQuery);
      }

      // Filters
      Object.entries(activeFilters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          params.append(`filter[${key}]`, String(value));
        }
      });

      // Sort
      if (sortField) {
        params.append("sort", `${sortDirection === "desc" ? "-" : ""}${sortField}`);
      }

      // Pagination
      if (fullConfig.pagination) {
        params.append("page", String(pagination.page));
        params.append("limit", String(pagination.pageSize));
      }

      const response: any = await api.get(`${apiEndpoint}?${params}`);

      if (response.docs || Array.isArray(response)) {
        rows = response.docs || response;
        pagination.total = response.totalDocs || rows.length;
        pagination.totalPages = Math.ceil(pagination.total / pagination.pageSize);
      } else {
        rows = response;
      }
    } catch (err: any) {
      error = err.message || "Failed to load data";
      console.error("DataExplorer load error:", err);
    } finally {
      loading = false;
    }
  }

  // Recargar cuando cambian filtros/búsqueda/ordenamiento
  $effect(() => {
    if (!initialData && apiEndpoint) {
      loadData();
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════════

  function handleSort(field: string) {
    if (!fullConfig.sortable) return;

    if (sortField === field) {
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
      sortField = field;
      sortDirection = "asc";
    }

    pagination.page = 1;
  }

  function toggleSelectAll() {
    if (selectedRows.size === rows.length) {
      selectedRows.clear();
    } else {
      selectedRows = new Set(rows.map((r) => r.id));
    }
  }

  function toggleSelectRow(id: string) {
    const newSet = new Set(selectedRows);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    selectedRows = newSet;
  }

  function startEdit(row: any) {
    editingRow = row.id;
    editingData = { ...row };
  }

  function cancelEdit() {
    editingRow = null;
    editingData = null;
  }

  async function saveEdit() {
    // Aquí se implementaría el guardado vía API
    // Por ahora solo actualizamos localmente
    const index = rows.findIndex((r) => r.id === editingRow);
    if (index !== -1) {
      rows[index] = { ...editingData };
    }
    editingRow = null;
    editingData = null;
  }

  function handleBulkAction(action: BulkAction) {
    action.handler(Array.from(selectedRows));
  }

  function exportCSV() {
    const headers = fullConfig.columns
      .filter((c) => !c.hidden)
      .map((c) => c.label)
      .join(",");

    const csvRows = rows.map((row) =>
      fullConfig.columns
        .filter((c) => !c.hidden)
        .map((c) => {
          const val = row[c.field];
          return val === null || val === undefined ? "" : `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(",")
    );

    const csv = [headers, ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${table}-export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════════

  function getFieldComponent(fieldConfig?: FieldConfig) {
    if (!fieldConfig) return fieldRegistry.get("text");
    return fieldRegistry.get(fieldConfig.type) || fieldRegistry.get("text");
  }

  function formatValue(value: any, fieldConfig?: FieldConfig): string {
    if (value === null || value === undefined) return "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "object") return JSON.stringify(value).slice(0, 50);
    return String(value);
  }
</script>

<div class="space-y-4">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-xl font-bold text-gremius-text">{fullConfig.label}</h2>
      <p class="text-sm text-gremius-text-dim mt-0.5">
        {pagination.total} records
        {#if selectedRows.size > 0}
          · {selectedRows.size} selected
        {/if}
      </p>
    </div>
    <div class="flex items-center gap-2">
      {#if fullConfig.bulkActions?.length && selectedRows.size > 0}
        <div class="flex items-center gap-1 mr-2">
          {#each fullConfig.bulkActions as action}
            <button
              class="btn-secondary-sm {action.variant === 'danger' ? 'text-gremius-pink' : ''}"
              onclick={() => handleBulkAction(action)}
            >
              {#if action.icon}
                <svelte:component this={action.icon} class="w-4 h-4" />
              {/if}
              {action.label}
            </button>
          {/each}
        </div>
      {/if}

      <button class="btn-secondary-sm" onclick={exportCSV} title="Export CSV">
        <Download class="w-4 h-4" />
      </button>

      {#if fullConfig.filterableFields?.length}
        <button
          class="btn-secondary-sm {Object.keys(activeFilters).length > 0
            ? 'bg-gremius-cyan/10 text-gremius-cyan'
            : ''}"
          onclick={() => (showFilterPanel = !showFilterPanel)}
        >
          <Filter class="w-4 h-4" />
          Filter
        </button>
      {/if}
    </div>
  </div>

  <!-- Search & Filters -->
  <div class="flex items-center gap-3">
    {#if fullConfig.searchableFields?.length}
      <div class="relative flex-1 max-w-md">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gremius-subtle" />
        <input
          type="text"
          placeholder="Search..."
          bind:value={searchQuery}
          class="w-full pl-10 pr-4 py-2 bg-gremius-card border border-gremius-border rounded-lg text-sm text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan"
        />
      </div>
    {/if}
  </div>

  <!-- Filter Panel -->
  {#if showFilterPanel && fullConfig.filterableFields?.length}
    <div class="card p-4 border-gremius-cyan/20">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-medium text-gremius-text">Filters</h3>
        <button
          class="text-sm text-gremius-subtle hover:text-gremius-text"
          onclick={() => (activeFilters = {})}
        >
          Clear all
        </button>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        {#each fullConfig.filterableFields as field}
          <div>
            <label class="text-xs text-gremius-subtle block mb-1 capitalize">{field}</label>
            <input
              type="text"
              value={activeFilters[field] || ""}
              class="w-full px-3 py-1.5 bg-gremius-bg border border-gremius-border rounded text-sm text-gremius-text focus:outline-none focus:border-gremius-cyan"
              oninput={(e) => {
                activeFilters = {
                  ...activeFilters,
                  [field]: e.currentTarget.value || undefined,
                };
              }}
            />
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Error -->
  {#if error}
    <div class="p-4 rounded-lg bg-gremius-pink/10 border border-gremius-pink/20 text-gremius-pink">
      {error}
    </div>
  {/if}

  <!-- Table -->
  <div class="card overflow-hidden">
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-gremius-surface border-b border-gremius-border">
          <tr>
            <th class="w-10 px-4 py-3">
              <input
                type="checkbox"
                checked={selectedRows.size === rows.length && rows.length > 0}
                class="rounded border-gremius-border bg-gremius-bg text-gremius-cyan"
                onchange={toggleSelectAll}
              />
            </th>
            {#each fullConfig.columns as column}
              {#if !column.hidden}
                <th
                  class="text-left px-4 py-3 font-medium text-gremius-text-dim"
                  style={column.width ? `width: ${column.width}` : ""}
                >
                  {#if column.sortable !== false && fullConfig.sortable}
                    <button
                      class="flex items-center gap-1 hover:text-gremius-text"
                      onclick={() => handleSort(column.field)}
                    >
                      {column.label}
                      {#if sortField === column.field}
                        {#if sortDirection === "asc"}
                          <ArrowUp class="w-3.5 h-3.5" />
                        {:else}
                          <ArrowDown class="w-3.5 h-3.5" />
                        {/if}
                      {:else}
                        <ArrowUpDown class="w-3.5 h-3.5 opacity-30" />
                      {/if}
                    </button>
                  {:else}
                    {column.label}
                  {/if}
                </th>
              {/if}
            {/each}
            {#if fullConfig.rowActions?.length}
              <th class="w-20 px-4 py-3"></th>
            {/if}
          </tr>
        </thead>
        <tbody>
          {#if loading}
            <tr>
              <td colspan={fullConfig.columns.length + 2} class="px-4 py-20 text-center">
                <Loader2 class="w-6 h-6 animate-spin mx-auto text-gremius-cyan" />
              </td>
            </tr>
          {:else if rows.length === 0}
            <tr>
              <td colspan={fullConfig.columns.length + 2} class="px-4 py-16 text-center">
                <p class="text-gremius-text-dim">No records found</p>
                {#if searchQuery || Object.keys(activeFilters).length > 0}
                  <button
                    class="text-sm text-gremius-cyan hover:underline mt-2"
                    onclick={() => {
                      searchQuery = "";
                      activeFilters = {};
                    }}
                  >
                    Clear filters
                  </button>
                {/if}
              </td>
            </tr>
          {:else}
            {#each rows as row (row.id)}
              {@const isEditing = editingRow === row.id}
              <tr
                class="border-b border-gremius-border/50 hover:bg-gremius-surface/30 {selectedRows.has(
                  row.id
                )
                  ? 'bg-gremius-cyan/5'
                  : ''}"
              >
                <td class="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedRows.has(row.id)}
                    class="rounded border-gremius-border bg-gremius-bg text-gremius-cyan"
                    onchange={() => toggleSelectRow(row.id)}
                  />
                </td>
                {#each fullConfig.columns as column}
                  {#if !column.hidden}
                    <td class="px-4 py-3">
                      {#if isEditing && !column.fieldConfig?.readonly}
                        {@const FieldComponent = getFieldComponent(column.fieldConfig)}
                        <FieldComponent
                          value={editingData[column.field]}
                          row={editingData}
                          config={column.fieldConfig || { type: "text" }}
                          mode="edit"
                          onChange={(val) => {
                            editingData = { ...editingData, [column.field]: val };
                          }}
                        />
                      {:else}
                        {@const FieldComponent = getFieldComponent(column.fieldConfig)}
                        <svelte:component
                          this={FieldComponent}
                          value={row[column.field]}
                          {row}
                          config={column.fieldConfig || { type: "text" }}
                          mode="view"
                        />
                      {/if}
                    </td>
                  {/if}
                {/each}
                {#if fullConfig.rowActions?.length}
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-1">
                      {#if isEditing}
                        <button
                          class="p-1.5 rounded hover:bg-gremius-green/10 text-gremius-green"
                          onclick={saveEdit}
                        >
                          <Check class="w-4 h-4" />
                        </button>
                        <button
                          class="p-1.5 rounded hover:bg-gremius-subtle/10 text-gremius-subtle"
                          onclick={cancelEdit}
                        >
                          <X class="w-4 h-4" />
                        </button>
                      {:else}
                        {#each fullConfig.rowActions as action}
                          <button
                            class="p-1.5 rounded hover:bg-gremius-cyan/10 text-gremius-subtle hover:text-gremius-cyan"
                            onclick={() => action.handler(row)}
                            title={action.label}
                          >
                            {#if action.icon}
                              <svelte:component this={action.icon} class="w-4 h-4" />
                            {:else}
                              {action.label}
                            {/if}
                          </button>
                        {/each}
                        <button
                          class="p-1.5 rounded hover:bg-gremius-cyan/10 text-gremius-subtle hover:text-gremius-cyan"
                          onclick={() => startEdit(row)}
                          title="Edit"
                        >
                          <Edit2 class="w-4 h-4" />
                        </button>
                      {/if}
                    </div>
                  </td>
                {/if}
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Pagination -->
  {#if fullConfig.pagination && pagination.totalPages > 1}
    <div class="flex items-center justify-between">
      <p class="text-sm text-gremius-subtle">
        Showing {(pagination.page - 1) * pagination.pageSize + 1} to
        {Math.min(pagination.page * pagination.pageSize, pagination.total)} of
        {pagination.total} results
      </p>
      <div class="flex items-center gap-2">
        <button
          class="btn-secondary-sm"
          disabled={pagination.page <= 1}
          onclick={() => pagination.page--}
        >
          <ChevronLeft class="w-4 h-4" />
        </button>
        <span class="text-sm text-gremius-text px-2">
          Page {pagination.page} of {pagination.totalPages}
        </span>
        <button
          class="btn-secondary-sm"
          disabled={pagination.page >= pagination.totalPages}
          onclick={() => pagination.page++}
        >
          <ChevronRight class="w-4 h-4" />
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  :global(.btn-secondary-sm) {
    @apply inline-flex items-center gap-1.5 px-3 py-1.5 bg-gremius-surface border border-gremius-border rounded-lg 
           text-sm text-gremius-text hover:border-gremius-cyan/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed;
  }
</style>
