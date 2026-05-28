<script lang="ts">
  import { onMount } from "svelte";
  import { 
    Search, Filter, Plus, MoreHorizontal, 
    ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
    ArrowUpDown, ArrowUp, ArrowDown,
    Eye, EyeOff, Edit, Trash2, Download, RefreshCw,
    X, Check, ExternalLink, Mail, Palette,
    ChevronDown, FileJson, Settings2, Columns3,
    Copy
  } from "lucide-svelte";
  import type { AdminConfig, AdminView, TableColumn, SchemaColumn, KanbanView, CalendarView as CalendarViewType } from "$lib/types/admin";
  import AutoFormModal from "./AutoFormModal.svelte";
  import KanbanBoard from "./KanbanBoard.svelte";
  import CalendarView from "./CalendarView.svelte";

  interface TableSchema {
    name: string;
    columns: SchemaColumn[];
    primaryKey: string;
  }
  
  interface Props {
    grimoireId: string;
    config?: AdminConfig;
    viewId?: string;
  }
  
  let { grimoireId, config, viewId }: Props = $props();
  
  // State
  let loading = $state(true);
  let data = $state<any[]>([]);
  let selectedRows = $state<Set<string>>(new Set());
  let searchQuery = $state("");
  let currentPage = $state(1);
  let pageSize = $state(25);
  let totalCount = $state(0);
  // Multi-column sort: array of { column, direction } in priority order
  let sortStack = $state<{ column: string; direction: "asc" | "desc" }[]>([]);
  // Backward-compatible single sort accessors
  let sortColumn = $derived(sortStack[0]?.column || null);
  let sortDirection = $derived<"asc" | "desc">(sortStack[0]?.direction || "asc");
  // Column visibility
  let hiddenColumns = $state<Set<string>>(new Set());
  let showColumnMenu = $state(false);
  let activeFilters = $state<Record<string, any>>({});
  let showFilters = $state(false);
  let schema = $state<TableSchema | null>(null);
  let bulkActionLoading = $state(false);

  // Modal state
  let showFormModal = $state(false);
  let editRecord = $state<Record<string, any> | null>(null);
  let showDeleteConfirm = $state(false);
  let deleteTarget = $state<any>(null);
  let deleting = $state(false);
  let showBulkDeleteConfirm = $state(false);

  // FK display cache: { "games": { "uuid-123": "Fortnite" } }
  let fkDisplayCache = $state<Record<string, Record<string, string>>>({});
  // FK options for filter dropdowns
  let filterRelationOptions = $state<Record<string, { value: string; label: string }[]>>({});
  
  // Computed
  let activeView = $derived(
    config?.views?.find(v => v.id === viewId) || 
    config?.views?.[0] ||
    { type: "grid", table: grimoireId, id: "default", title: grimoireId } as any
  );
  
  let displayTable = $derived(
    activeView?.type === "grid" ? (activeView as any).table : grimoireId
  );
  
  let columns = $derived<SchemaColumn[]>(
    schema?.columns || 
    generateColumnsFromData(data)
  );

  // Separate columns for display vs filtering
  let visibleColumns = $derived(
    columns.filter(c => !hiddenColumns.has(c.name))
  );
  let displayColumns = $derived(visibleColumns.slice(0, 12));
  let filterableColumns = $derived(
    columns.filter(c => 
      c.name !== "id" && 
      !c.name.endsWith("At") && 
      c.name !== "created_at" && 
      c.name !== "updated_at" &&
      c.type !== "json"
    )
  );

  // Search fields: all text-like columns
  let searchFields = $derived(
    columns
      .filter(c => ["text", "string", "varchar", "email", "url"].includes(c.type || "") || 
                   ["name", "title", "label", "slug", "description", "displayName", "display_name", "email"].includes(c.name))
      .map(c => c.name)
  );

  // View tabs (when config has multiple views) + discovered views
  let views = $derived([
    ...(config?.views || []),
    ...discoveredViews.filter(dv => !(config?.views || []).some((cv: any) => cv.table === dv.table)),
  ]);
  let activeViewId = $state("");
  $effect(() => {
    if (viewId && activeViewId === "") {
      activeViewId = viewId;
    }
  });

  const API_URL = import.meta.env.VITE_API_URL ?? "";

  /**
   * Build the full API endpoint for the current table.
   * 
   * Handles three cases:
   * 1. No apiEndpoint → falls back to /api/explorer/{tableName}
   * 2. Full endpoint path (e.g., /api/datasets/id/entries, /api/explorer/games) → use as-is
   * 3. Base path (e.g., /api/directory, /api/crm) → append table name
   * 
   * We detect "full path" vs "base path" by checking segment count:
   *   /api/explorer/games → 3 segments → full (used as-is)
   *   /api/datasets/id/entries → 4 segments → full (used as-is)
   *   /api/directory → 2 segments → base (needs table appended)
   *   /api/crm → 2 segments → base (needs table appended)
   */
  function getEndpoint(tblName?: string): string {
    const table = tblName || (activeView as any)?.table || grimoireId;
    const base = config?.apiEndpoint;
    if (!base) return `/api/explorer/${table}`;
    // Count path segments after removing leading slash
    const segments = base.replace(/^\//, '').split('/');
    // If 3+ segments (e.g., /api/explorer/games, /api/datasets/id/entries), it's a full path
    if (segments.length >= 3) return base;
    // 2 segments (e.g., /api/directory, /api/crm) → append table name
    return `${base}/${table}`;
  }

  /** The base API endpoint (without table) — used by AutoFormModal */
  let apiBaseEndpoint = $derived.by(() => {
    const ep = config?.apiEndpoint;
    if (!ep) return undefined;
    const segments = ep.replace(/^\//, '').split('/');
    // Only pass base paths (/api/directory, /api/crm) — 2 segments
    // Full paths (/api/explorer/games, /api/datasets/id/entries) should not be passed
    return segments.length <= 2 ? ep : undefined;
  });

  // FK column detection
  const FK_TABLE_MAP: Record<string, string> = {
    game_id: "games", gameId: "games",
    platform_id: "platforms", platformId: "platforms",
    tag_id: "tags", tagId: "tags",
    streamer_id: "streamers", streamerId: "streamers",
    collection_id: "collections", collectionId: "collections",
    user_id: "auth_users", userId: "auth_users",
    author_id: "auth_users", authorId: "auth_users",
    assigned_to_id: "auth_users", assignedToId: "auth_users",
    contact_id: "contacts", contactId: "contacts",
    dataset_id: "datasets", datasetId: "datasets",
    cover_art_id: "media", coverArtId: "media",
    featured_image_id: "media", featuredImageId: "media",
    avatar_id: "media", avatarId: "media",
    icon_id: "media", iconId: "media",
    thumbnail_id: "media", thumbnailId: "media",
    uploaded_by_id: "auth_users", uploadedById: "auth_users",
    created_by_id: "auth_users", createdById: "auth_users",
  };

  function isRelationColumn(colName: string): boolean {
    return colName.endsWith("_id") || (colName.endsWith("Id") && colName !== "id");
  }

  function getRelatedTable(colName: string): string | undefined {
    if (FK_TABLE_MAP[colName]) return FK_TABLE_MAP[colName];
    const base = colName.replace(/_id$/, "").replace(/Id$/, "");
    return base.endsWith("s") ? base : base + "s";
  }
  
  onMount(async () => {
    // If no config with explicit views, discover tables dynamically
    if (!config?.views || config.views.length === 0) {
      await discoverGrimoireTables();
    }
    // Schema-first: try loading schema before data
    await loadSchema();
    await loadData();
  });

  // Dynamic table discovery for grimoires
  let discoveredViews = $state<Array<{ id: string; type: "grid"; title: string; table: string }>>([]);

  async function discoverGrimoireTables() {
    try {
      const res = await fetch(`${API_URL}/api/explorer/discover/${grimoireId}`, { credentials: "include" });
      if (res.ok) {
        const result = await res.json();
        if (result.tables && result.tables.length > 0) {
          discoveredViews = result.tables.map((t: any) => ({
            id: `grid-${t.name}`,
            type: "grid" as const,
            title: t.name.replace(/_/g, " ").replace(/^\w/, (c: string) => c.toUpperCase()),
            table: t.name,
          }));
          // If no config, build one from discovered tables
          if (!config) {
            config = {
              name: grimoireId.replace(/^grimoire-/, "").replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase()),
              singularName: "Record",
              views: discoveredViews,
              apiEndpoint: `/api/explorer/${result.tables[0].name}`,
            };
          }
        }
      }
    } catch (e) {
      console.warn("[DataExplorer] Discovery failed, using defaults:", e);
    }
  }
  
  function generateColumnsFromData(rows: any[]): SchemaColumn[] {
    if (!rows.length) return [];
    return Object.keys(rows[0]).map(key => ({
      name: key,
      type: typeof rows[0][key],
      nullable: true
    }));
  }

  // ── Schema-first loading ──
  async function loadSchema() {
    const tableName = (activeView as any)?.table || grimoireId;
    
    // If using custom apiEndpoint (like /api/directory), skip schema introspection
    // and generate columns from data instead
    if (config?.apiEndpoint && !config.apiEndpoint.includes('/api/explorer')) {
      console.log(`[DataExplorer] Using custom API endpoint ${config.apiEndpoint}, skipping schema introspection`);
      schema = null; // Will generate columns from data
      return;
    }
    
    // Try endpoint 1: /api/explorer/schema/json/:table
    try {
      const res = await fetch(`${API_URL}/api/explorer/schema/json/${tableName}`, {
        credentials: "include"
      });
      if (res.ok) {
        const jsonSchema = await res.json();
        if (jsonSchema.properties) {
          const cols: SchemaColumn[] = Object.entries(jsonSchema.properties).map(([name, prop]: [string, any]) => ({
            name,
            type: inferTypeFromJsonSchema(prop),
            nullable: !jsonSchema.required?.includes(name),
            isPrimary: name === jsonSchema["x-gremius"]?.primaryKey,
          }));
          schema = {
            name: tableName,
            columns: cols,
            primaryKey: jsonSchema["x-gremius"]?.primaryKey || "id",
          };
          return;
        }
      }
    } catch {
      // Continue to fallback
    }
    
    // Try endpoint 2: /api/schema/tables/:table (schema introspection)
    try {
      const res = await fetch(`${API_URL}/api/schema/tables/${tableName}`, {
        credentials: "include"
      });
      if (res.ok) {
        const result = await res.json();
        if (result.table) {
          const introspected = result.table;
          const cols: SchemaColumn[] = introspected.columns.map((c: any) => ({
            name: c.name,
            type: c.type || inferTypeFromDbType(c.type),
            nullable: c.nullable !== false,
            isPrimary: introspected.primaryKey?.includes(c.name),
          }));
          schema = {
            name: tableName,
            columns: cols,
            primaryKey: introspected.primaryKey?.[0] || "id",
          };
          return;
        }
      }
    } catch {
      // Schema endpoint might not exist for this table — will infer from data
    }
  }
  
  function inferTypeFromDbType(dataType: string): string {
    const type = dataType?.toLowerCase() || "";
    if (type.includes("int")) return "number";
    if (type.includes("float") || type.includes("decimal") || type.includes("numeric")) return "number";
    if (type.includes("bool")) return "boolean";
    if (type.includes("timestamp") || type.includes("date")) return "date";
    if (type.includes("json")) return "json";
    if (type.includes("uuid")) return "uuid";
    return "text";
  }

  function inferTypeFromJsonSchema(prop: any): string {
    if (prop["x-relation"]) return "relation";
    if (prop.format === "date-time") return "date";
    if (prop.format === "email") return "email";
    if (prop.format === "uri") return "url";
    if (prop.format === "uuid" && !prop["x-relation"]) return "id";
    if (prop.type === "boolean") return "boolean";
    if (prop.type === "integer" || prop.type === "number") return "number";
    if (prop.type === "object") return "json";
    if (prop.readOnly) return "readonly";
    return "text";
  }
  
  async function loadData() {
    loading = true;
    try {
      const params = new URLSearchParams();
      params.set("limit", String(pageSize));
      params.set("page", String(currentPage));
      
      // Global search across ALL text columns
      if (searchQuery) {
        params.set("search", searchQuery);
        // Fallback for APIs that don't support global search
        if (searchFields.length > 0) {
          params.set("search_fields", searchFields.join(","));
          // Also send legacy single-field filter for backward compat
          params.set("filter_field", searchFields[0]);
          params.set("filter_op", "contains");
          params.set("filter_value", searchQuery);
        }
      }
      
      // Multi-column sort
      if (sortStack.length > 0) {
        params.set("sort", sortStack.map(s => `${s.direction === "desc" ? "-" : ""}${s.column}`).join(","));
        // Legacy single sort for backward compat
        params.set("dir", sortStack[0].direction);
      }
      
      // Apply active filters
      Object.entries(activeFilters).forEach(([key, value]) => {
        if (value !== undefined && value !== "" && value !== null) {
          params.set("filter_field", key);
          if (typeof value === "boolean") {
            params.set("filter_op", "equals");
            params.set("filter_value", String(value));
          } else {
            params.set("filter_op", "contains");
            params.set("filter_value", String(value));
          }
        }
      });
      
      const tableName = (activeView as any)?.table || grimoireId;
      const endpoint = getEndpoint(tableName);
      
      const res = await fetch(`${API_URL}${endpoint}?${params}`, {
        credentials: "include"
      });
      
      if (res.ok) {
        const result = await res.json();
        data = result.data || result.docs || result;
        totalCount = result.pagination?.total || result.totalDocs || result.total || data.length;
        
        // If we didn't get schema from the schema endpoint, infer from data
        if (!schema && result.columns && result.columns.length > 0) {
          schema = {
            name: tableName,
            columns: result.columns.map((col: any) => ({
              name: col.field,
              type: col.type,
              nullable: true
            })),
            primaryKey: "id"
          };
        }

        // Load FK display values for relation columns
        await loadFkDisplayValues();
      }
    } catch (e) {
      console.error("Failed to load data", e);
    } finally {
      loading = false;
    }
  }

  async function loadFkDisplayValues() {
    const relationCols = columns.filter(c => isRelationColumn(c.name));
    if (relationCols.length === 0 || data.length === 0) return;

    for (const col of relationCols) {
      const relTable = getRelatedTable(col.name);
      if (!relTable || fkDisplayCache[relTable]) continue;

      try {
        const res = await fetch(`${API_URL}/api/explorer/${relTable}/options`, { credentials: "include" });
        if (res.ok) {
          const result = await res.json();
          const map: Record<string, string> = {};
          const options: { value: string; label: string }[] = [];
          for (const opt of result.options || []) {
            map[String(opt.value)] = opt.label;
            options.push(opt);
          }
          fkDisplayCache[relTable] = map;
          fkDisplayCache = { ...fkDisplayCache }; // trigger reactivity
          // Store options for filter dropdowns
          filterRelationOptions[col.name] = options;
          filterRelationOptions = { ...filterRelationOptions };
        }
      } catch {
        // FK table not in registry — skip silently
      }
    }
  }

  function resolveFkDisplay(colName: string, rawValue: any): string {
    if (rawValue === null || rawValue === undefined) return "-";
    const relTable = getRelatedTable(colName);
    if (relTable && fkDisplayCache[relTable]) {
      return fkDisplayCache[relTable][String(rawValue)] || String(rawValue).slice(0, 8) + "…";
    }
    return String(rawValue).slice(0, 8) + "…";
  }
  
  async function handleInlineEdit(rowId: string, field: string, value: any) {
    const endpoint = getEndpoint();
    try {
      const res = await fetch(`${API_URL}${endpoint}/${rowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ [field]: value })
      });
      
      if (!res.ok) {
        console.error("Failed to update", await res.text());
      }
    } catch (e) {
      console.error("Error updating record", e);
    }
  }

  async function handleDelete(record: any) {
    deleting = true;
    const endpoint = getEndpoint();
    try {
      const res = await fetch(`${API_URL}${endpoint}/${record.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        showDeleteConfirm = false;
        deleteTarget = null;
        await loadData();
      } else {
        console.error("Failed to delete", await res.text());
      }
    } catch (e) {
      console.error("Error deleting record", e);
    } finally {
      deleting = false;
    }
  }

  // ── Bulk Actions ──
  function deselectAll() {
    selectedRows = new Set();
  }

  function getSelectedRows() {
    return data.filter(row => selectedRows.has(row.id));
  }

  function hasStatusField() {
    return data.length > 0 && data.some(row => row.status !== undefined);
  }

  async function handleBulkStatusUpdate(status: string) {
    if (selectedRows.size === 0) return;
    bulkActionLoading = true;
    const endpoint = getEndpoint();
    for (const id of selectedRows) {
      try {
        await fetch(`${API_URL}${endpoint}/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status })
        });
      } catch {}
    }
    bulkActionLoading = false;
    await loadData();
  }

  async function handleBulkPublish() {
    await handleBulkStatusUpdate("published");
  }

  async function handleBulkUnpublish() {
    await handleBulkStatusUpdate("draft");
  }

  async function handleBulkDuplicate() {
    if (selectedRows.size === 0) return;
    bulkActionLoading = true;
    const endpoint = getEndpoint();
    const selectedData = getSelectedRows();
    for (const row of selectedData) {
      try {
        const copy = { ...row };
        delete copy.id;
        delete copy.createdAt;
        delete copy.updatedAt;
        if (copy.status !== undefined) copy.status = "draft";
        if (copy.title) copy.title = `${copy.title} (Copy)`;
        
        await fetch(`${API_URL}${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(copy)
        });
      } catch {}
    }
    selectedRows = new Set();
    bulkActionLoading = false;
    await loadData();
  }

  function confirmBulkDelete() {
    showBulkDeleteConfirm = true;
  }

  async function executeBulkDelete() {
    showBulkDeleteConfirm = false;
    bulkActionLoading = true;
    const endpoint = getEndpoint();
    for (const id of selectedRows) {
      try {
        await fetch(`${API_URL}${endpoint}/${id}`, {
          method: "DELETE",
          credentials: "include",
        });
      } catch {}
    }
    selectedRows = new Set();
    bulkActionLoading = false;
    await loadData();
  }

  function handleExportCsv() {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(","),
      ...data.map(row => 
        headers.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return "";
          const str = typeof val === "object" ? JSON.stringify(val) : String(val);
          return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
        }).join(",")
      )
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${grimoireId}-export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function openCreateModal() {
    // Ensure schema is loaded before opening modal
    if (!schema || columns.length === 0) {
      await loadSchema();
    }
    editRecord = null;
    showFormModal = true;
  }

  async function openEditModal(row: any) {
    // Ensure schema is loaded before opening modal
    if (!schema || columns.length === 0) {
      await loadSchema();
    }
    editRecord = { ...row };
    showFormModal = true;
  }

  function confirmDelete(row: any) {
    deleteTarget = row;
    showDeleteConfirm = true;
  }
  
  function handleSort(column: string, multi = false) {
    const existing = sortStack.findIndex(s => s.column === column);
    
    if (multi) {
      // Shift+click: add/toggle column in multi-sort stack
      if (existing >= 0) {
        const current = sortStack[existing];
        if (current.direction === "desc") {
          // Third click: remove from stack
          sortStack = sortStack.filter((_, i) => i !== existing);
        } else {
          sortStack = sortStack.map((s, i) => i === existing ? { ...s, direction: "desc" } : s);
        }
      } else {
        sortStack = [...sortStack, { column, direction: "asc" }];
      }
    } else {
      // Normal click: single-column sort
      if (existing >= 0 && sortStack.length === 1) {
        const current = sortStack[0];
        if (current.direction === "desc") {
          sortStack = []; // Third click: clear sort
        } else {
          sortStack = [{ column, direction: "desc" }];
        }
      } else {
        sortStack = [{ column, direction: "asc" }];
      }
    }
    loadData();
  }

  function getSortIndex(column: string): number {
    return sortStack.findIndex(s => s.column === column);
  }

  function getSortDir(column: string): "asc" | "desc" | null {
    const s = sortStack.find(s => s.column === column);
    return s?.direction || null;
  }

  function toggleColumnVisibility(colName: string) {
    const newSet = new Set(hiddenColumns);
    if (newSet.has(colName)) {
      newSet.delete(colName);
    } else {
      newSet.add(colName);
    }
    hiddenColumns = newSet;
  }

  function showAllColumns() {
    hiddenColumns = new Set();
  }

  function handleSortClick(column: string, e: MouseEvent) {
    handleSort(column, e.shiftKey);
  }
  
  function handleSearch(e: Event) {
    searchQuery = (e.target as HTMLInputElement).value;
    currentPage = 1;
    loadData();
  }

  function applyFilter(field: string, value: any) {
    if (value === "" || value === null || value === undefined) {
      const { [field]: _, ...rest } = activeFilters;
      activeFilters = rest;
    } else {
      activeFilters = { ...activeFilters, [field]: value };
    }
    currentPage = 1;
    loadData();
  }

  function clearAllFilters() {
    activeFilters = {};
    currentPage = 1;
    loadData();
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
  
  function toggleAllSelection() {
    if (selectedRows.size === data.length) {
      selectedRows = new Set();
    } else {
      selectedRows = new Set(data.map(row => row.id));
    }
  }
  
  function getCellValue(row: any, column: string) {
    return column.split(".").reduce((obj, key) => obj?.[key], row);
  }
  
  // ── Typed Cell Rendering ──
  function getColumnType(colName: string): string {
    const col = columns.find(c => c.name === colName);
    if (col?.type) return col.type;
    // Infer from name patterns
    if (isRelationColumn(colName)) return "relation";
    if (colName.includes("url") || colName.includes("Url")) return "url";
    if (colName.includes("email")) return "email";
    if (colName.includes("color") || colName.includes("Color")) return "color";
    if (colName.endsWith("At") || colName.endsWith("_at") || colName.includes("date") || colName.includes("Date")) return "date";
    return "text";
  }

  function formatValue(value: any): string {
    if (value === null || value === undefined) return "-";
    if (typeof value === "boolean") return value ? "✓" : "✗";
    if (value instanceof Date) return value.toLocaleDateString();
    if (typeof value === "object") return JSON.stringify(value).slice(0, 50) + "...";
    return String(value);
  }

  function formatDate(value: any): string {
    if (!value) return "-";
    try {
      const d = new Date(value);
      if (isNaN(d.getTime())) return String(value);
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return String(value);
    }
  }

  function formatDateTime(value: any): string {
    if (!value) return "-";
    try {
      const d = new Date(value);
      if (isNaN(d.getTime())) return String(value);
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return String(value);
    }
  }

  function switchView(vId: string) {
    activeViewId = vId;
    const v = config?.views?.find(v => v.id === vId);
    if (v && v.type === "grid") {
      loadData();
    }
  }

  function getFilterInputType(col: SchemaColumn): string {
    if (isRelationColumn(col.name)) return "relation";
    const t = col.type?.toLowerCase() || "text";
    if (t === "boolean") return "boolean";
    if (t === "number" || t === "integer") return "number";
    if (t === "date") return "date";
    return "text";
  }
  
  const totalPages = $derived(Math.ceil(totalCount / pageSize));
  const activeFilterCount = $derived(Object.keys(activeFilters).length);
</script>

<!-- View-type routing -->
{#if activeView?.type === "kanban"}
  <KanbanBoard view={activeView as KanbanView} apiEndpoint={config?.apiEndpoint} />

{:else if activeView?.type === "calendar"}
  <CalendarView view={activeView as CalendarViewType} apiEndpoint={config?.apiEndpoint} />

{:else}
  <!-- Grid View (default) -->
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold text-gremius-text">
          {config?.name || activeView?.title || grimoireId}
        </h1>
        <p class="text-sm text-gremius-text-dim">
          {totalCount.toLocaleString()} records
        </p>
      </div>
      
      <div class="flex items-center gap-2">
        <button 
          class="group inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-gremius-cyan/5 hover:border-gremius-cyan/20 hover:text-gremius-cyan transition-all duration-200"
          onclick={() => loadData()}
          title="Actualizar"
        >
          <RefreshCw class="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
          <span class="hidden sm:inline">Actualizar</span>
        </button>
        
        <button 
          class="group inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-emerald-500/5 hover:border-emerald-500/20 hover:text-emerald-400 transition-all duration-200"
          onclick={handleExportCsv} 
          title="Exportar como CSV"
        >
          <Download class="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
          <span class="hidden sm:inline">Exportar</span>
        </button>
        
        <button 
          class="group inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-gremius-cyan to-cyan-400 text-black rounded-xl font-semibold shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-105 active:scale-95 transition-all duration-200"
          onclick={openCreateModal}
        >
          <Plus class="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
          <span>Agregar {config?.singularName || "Registro"}</span>
        </button>
      </div>
    </div>

    <!-- View Tabs (when multiple views exist) -->
    {#if views.length > 1}
      <div class="flex items-center gap-1 p-1 bg-gremius-bg border border-gremius-border rounded-lg w-fit">
        {#each views as v}
          <button
            class="px-3 py-1.5 text-sm rounded-md transition-colors {(activeViewId || views[0]?.id) === v.id ? 'bg-gremius-card text-gremius-text shadow-sm' : 'text-gremius-text-dim hover:text-gremius-text'}"
            onclick={() => switchView(v.id)}
          >
            {v.title}
          </button>
        {/each}
      </div>
    {/if}
    
    <!-- Toolbar -->
    <div class="flex items-center gap-3 p-3 bg-gremius-card border border-gremius-border rounded-lg">
      <div class="relative flex-1 max-w-md">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gremius-text-dim" />
        <input
          type="text"
          placeholder="Buscar en todos los campos..."
          class="input pl-10 w-full"
          value={searchQuery}
          oninput={handleSearch}
        />
      </div>
      
      <button 
        class="group inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-gremius-cyan/5 hover:border-gremius-cyan/20 transition-all duration-200 {showFilters ? 'bg-gremius-cyan/10 text-gremius-cyan border-gremius-cyan/30' : ''}"
        onclick={() => showFilters = !showFilters}
      >
        <Filter class="w-4 h-4 group-hover:scale-110 transition-transform" />
        <span class="hidden sm:inline">Filtros</span>
        {#if activeFilterCount > 0}
          <span class="ml-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-gremius-cyan text-white">
            {activeFilterCount}
          </span>
        {/if}
      </button>

      <!-- Column Visibility Toggle -->
      <div class="relative">
        <button
          class="group inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-gremius-cyan/5 hover:border-gremius-cyan/20 transition-all duration-200 {showColumnMenu ? 'bg-gremius-cyan/10 text-gremius-cyan border-gremius-cyan/30' : ''}"
          onclick={() => showColumnMenu = !showColumnMenu}
          title="Mostrar/ocultar columnas"
        >
          <Columns3 class="w-4 h-4 group-hover:scale-110 transition-transform" />
          <span class="hidden sm:inline">Columnas</span>
          {#if hiddenColumns.size > 0}
            <span class="ml-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500 text-white">
              {hiddenColumns.size}
            </span>
          {/if}
        </button>
        
        {#if showColumnMenu}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="fixed inset-0 z-40" onclick={() => showColumnMenu = false}></div>
          <div class="absolute right-0 top-full mt-1 z-50 w-56 bg-gremius-card border border-gremius-border rounded-lg shadow-xl p-2 max-h-80 overflow-y-auto">
            <div class="flex items-center justify-between px-2 py-1 mb-1">
              <p class="text-xs font-semibold text-gremius-subtle uppercase tracking-wider">Columns</p>
              {#if hiddenColumns.size > 0}
                <button class="text-[10px] text-gremius-cyan hover:underline" onclick={showAllColumns}>Show all</button>
              {/if}
            </div>
            {#each columns as col}
              <label class="flex items-center gap-2 px-2 py-1.5 hover:bg-gremius-bg rounded cursor-pointer">
                <input
                  type="checkbox"
                  checked={!hiddenColumns.has(col.name)}
                  onchange={() => toggleColumnVisibility(col.name)}
                  class="w-3.5 h-3.5 rounded border-gremius-border accent-gremius-cyan"
                />
                <span class="text-sm text-gremius-text-dim truncate">
                  {col.name.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()).trim()}
                </span>
              </label>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Sort indicator -->
      {#if sortStack.length > 0}
        <div class="flex items-center gap-1 text-xs text-gremius-subtle">
          <ArrowUpDown class="w-3.5 h-3.5" />
          {sortStack.length} sort{sortStack.length > 1 ? 's' : ''}
          <button class="text-gremius-cyan hover:underline ml-1" onclick={() => { sortStack = []; loadData(); }}>clear</button>
        </div>
      {/if}
    </div>

    <!-- Filter Sidebar -->
    {#if showFilters}
      <div class="p-4 bg-gremius-card border border-gremius-border rounded-lg space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold text-gremius-text">Filters</h3>
          {#if activeFilterCount > 0}
            <button 
              class="text-xs text-gremius-cyan hover:underline"
              onclick={clearAllFilters}
            >
              Clear all ({activeFilterCount})
            </button>
          {/if}
        </div>
        
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {#each filterableColumns.slice(0, 12) as col}
            {@const filterType = getFilterInputType(col)}
            <div>
              <label for="filter-{col.name}" class="block text-xs font-medium text-gremius-text-dim mb-1">
                {col.name.replace(/_id$/, "").replace(/Id$/, "").replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase()).trim()}
              </label>
              
              {#if filterType === "boolean"}
                <select 
                  id="filter-{col.name}"
                  class="input w-full text-sm"
                  value={activeFilters[col.name] ?? ""}
                  onchange={(e) => {
                    const v = (e.target as HTMLSelectElement).value;
                    applyFilter(col.name, v === "" ? null : v === "true");
                  }}
                >
                  <option value="">All</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>

              {:else if filterType === "relation"}
                <select
                  id="filter-{col.name}"
                  class="input w-full text-sm"
                  value={activeFilters[col.name] ?? ""}
                  onchange={(e) => applyFilter(col.name, (e.target as HTMLSelectElement).value || null)}
                >
                  <option value="">All</option>
                  {#if filterRelationOptions[col.name]}
                    {#each filterRelationOptions[col.name] as opt}
                      <option value={opt.value}>{opt.label}</option>
                    {/each}
                  {/if}
                </select>

              {:else if filterType === "number"}
                <input
                  id="filter-{col.name}"
                  type="number"
                  class="input w-full text-sm"
                  placeholder="Filtrar..."
                  value={activeFilters[col.name] ?? ""}
                  onchange={(e) => applyFilter(col.name, (e.target as HTMLInputElement).value || null)}
                />

              {:else if filterType === "date"}
                <input
                  id="filter-{col.name}"
                  type="date"
                  class="input w-full text-sm"
                  value={activeFilters[col.name] ?? ""}
                  onchange={(e) => applyFilter(col.name, (e.target as HTMLInputElement).value || null)}
                />

              {:else}
                <input
                  id="filter-{col.name}"
                  type="text"
                  class="input w-full text-sm"
                  placeholder="Filtrar..."
                  value={activeFilters[col.name] ?? ""}
                  oninput={(e) => applyFilter(col.name, (e.target as HTMLInputElement).value || null)}
                />
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
    
    <!-- Bulk Actions Bar -->
    {#if selectedRows.size > 0}
      <div class="sticky top-4 z-20 flex flex-wrap items-center justify-between gap-3 p-3 bg-gremius-card border border-gremius-border rounded-lg shadow-lg shadow-black/10">
        <div class="flex items-center gap-3">
          <span class="px-2.5 py-1 text-sm font-medium rounded-full bg-gremius-cyan/10 text-gremius-cyan border border-gremius-cyan/20">
            {selectedRows.size} selected
          </span>
          {#if selectedRows.size < data.length}
            <button
              class="text-xs text-gremius-text-dim hover:text-gremius-cyan transition-colors"
              onclick={() => { selectedRows = new Set(data.map(row => row.id)); }}
            >
              Select all {data.length}
            </button>
          {:else}
            <button
              class="text-xs text-gremius-text-dim hover:text-gremius-cyan transition-colors"
              onclick={deselectAll}
            >
              Deselect all
            </button>
          {/if}
        </div>
        
        <div class="flex items-center gap-2">
          {#if hasStatusField()}
            <button
              class="group inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-400 transition-all duration-200 disabled:opacity-50"
              onclick={handleBulkPublish}
              disabled={bulkActionLoading}
              title="Publish selected"
            >
              <Eye class="w-3.5 h-3.5" />
              Publish
            </button>
            <button
              class="group inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-amber-500/10 hover:border-amber-500/30 hover:text-amber-400 transition-all duration-200 disabled:opacity-50"
              onclick={handleBulkUnpublish}
              disabled={bulkActionLoading}
              title="Unpublish selected"
            >
              <EyeOff class="w-3.5 h-3.5" />
              Unpublish
            </button>
          {/if}
          
          <button
            class="group inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-gremius-cyan/10 hover:border-gremius-cyan/30 hover:text-gremius-cyan transition-all duration-200 disabled:opacity-50"
            onclick={handleBulkDuplicate}
            disabled={bulkActionLoading}
            title="Duplicate selected"
          >
            <Copy class="w-3.5 h-3.5" />
            Duplicate
          </button>
          
          <div class="w-px h-6 bg-gremius-border mx-1"></div>
          
          <button
            class="group inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-red-500/10 to-red-600/10 text-red-400 border border-red-500/20 hover:from-red-500/20 hover:to-red-600/20 hover:border-red-500/30 transition-all duration-200 disabled:opacity-50"
            onclick={confirmBulkDelete}
            disabled={bulkActionLoading}
            title="Delete selected"
          >
            <Trash2 class="w-3.5 h-3.5 group-hover:animate-pulse" />
            Delete
          </button>
        </div>
      </div>
    {/if}

    <!-- Data Table -->
    <div class="border border-gremius-border rounded-lg overflow-hidden bg-gremius-card">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gremius-border bg-gremius-bg">
              <th class="w-10 p-3">
                <input 
                  type="checkbox" 
                  checked={data.length > 0 && selectedRows.size === data.length}
                  indeterminate={selectedRows.size > 0 && selectedRows.size < data.length}
                  onchange={toggleAllSelection}
                  class="w-4 h-4 rounded border-gremius-border accent-gremius-cyan"
                />
              </th>
              {#each displayColumns as column}
                {@const dir = getSortDir(column.name)}
                {@const idx = getSortIndex(column.name)}
                <th class="p-3 text-left">
                  <button 
                    class="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition-colors {dir ? 'text-gremius-cyan' : 'text-gremius-subtle hover:text-gremius-cyan'}"
                    onclick={(e) => handleSortClick(column.name, e)}
                    title="Clic para ordenar, Shift+clic para ordenar múltiple"
                  >
                    {#if isRelationColumn(column.name)}
                      {column.name.replace(/_id$/, "").replace(/Id$/, "").replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase())}
                    {:else}
                      {column.name.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase()).trim()}
                    {/if}
                    {#if dir === "asc"}
                      <ArrowUp class="w-3 h-3" />
                    {:else if dir === "desc"}
                      <ArrowDown class="w-3 h-3" />
                    {:else}
                      <ArrowUpDown class="w-3 h-3 opacity-0 group-hover:opacity-30" />
                    {/if}
                    {#if sortStack.length > 1 && idx >= 0}
                      <span class="text-[9px] font-bold bg-gremius-cyan/20 text-gremius-cyan rounded-full w-4 h-4 flex items-center justify-center">{idx + 1}</span>
                    {/if}
                  </button>
                </th>
              {/each}
              <th class="p-3 text-right text-xs font-semibold uppercase tracking-wider text-gremius-subtle">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {#if loading}
              {#each Array(5) as _, i}
                <tr class="border-b border-gremius-border">
                  {#each Array(Math.min(displayColumns.length + 2, 10)) as __}
                    <td class="p-3">
                      <div class="h-4 bg-gremius-border/30 rounded animate-pulse"></div>
                    </td>
                  {/each}
                </tr>
              {/each}
            {:else if data.length === 0}
              <tr>
                <td colspan="100" class="p-12 text-center">
                  <div class="flex flex-col items-center gap-3">
                    <div class="w-12 h-12 rounded-full bg-gremius-border/20 flex items-center justify-center">
                      <FileJson class="w-6 h-6 text-gremius-subtle" />
                    </div>
                    <p class="text-gremius-text-dim">No se encontraron registros</p>
                    {#if searchQuery || activeFilterCount > 0}
                      <button 
                        class="text-xs px-3 py-1.5 rounded-lg bg-gremius-cyan/10 text-gremius-cyan hover:bg-gremius-cyan/20 transition-colors"
                        onclick={() => { searchQuery = ""; clearAllFilters(); }}
                      >
                        Limpiar búsqueda y filtros
                      </button>
                    {/if}
                  </div>
                </td>
              </tr>
            {:else}
              {#each data as row}
                <tr class="border-b border-gremius-border hover:bg-gremius-cyan/[0.03] transition-colors">
                  <td class="p-3">
                    <input 
                      type="checkbox" 
                      checked={selectedRows.has(row.id)}
                      onchange={() => toggleRowSelection(row.id)}
                      class="w-4 h-4 rounded border-gremius-border accent-gremius-cyan"
                    />
                  </td>
                  {#each displayColumns as column}
                    {@const value = getCellValue(row, column.name)}
                    {@const colType = getColumnType(column.name)}
                    <td class="p-3">

                      <!-- BOOLEAN: colored badge -->
                      {#if colType === "boolean"}
                        {#if value === true}
                          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <Check class="w-3 h-3" /> Sí
                          </span>
                        {:else if value === false}
                          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                            <X class="w-3 h-3" /> No
                          </span>
                        {:else}
                          <span class="text-gremius-subtle">-</span>
                        {/if}

                      <!-- DATE: formatted -->
                      {:else if colType === "date"}
                        <span class="text-gremius-text-dim text-xs" title={value ? String(value) : ""}>
                          {formatDateTime(value)}
                        </span>

                      <!-- RELATION: FK badge -->
                      {:else if colType === "relation" || isRelationColumn(column.name)}
                        <span class="inline-flex items-center px-2 py-0.5 rounded-md bg-gremius-surface text-xs font-medium text-gremius-text-dim" title={String(value || "")}>
                          {resolveFkDisplay(column.name, value)}
                        </span>

                      <!-- URL: clickable link -->
                      {:else if colType === "url"}
                        {#if value}
                          <a 
                            href={value} 
                            target="_blank" 
                            rel="noopener" 
                            class="inline-flex items-center gap-1 text-gremius-cyan hover:underline text-xs truncate max-w-[200px]"
                            onclick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink class="w-3 h-3 shrink-0" />
                            {String(value).replace(/^https?:\/\//, "").slice(0, 30)}
                          </a>
                        {:else}
                          <span class="text-gremius-subtle">-</span>
                        {/if}

                      <!-- EMAIL: clickable mailto -->
                      {:else if colType === "email"}
                        {#if value}
                          <a 
                            href="mailto:{value}" 
                            class="inline-flex items-center gap-1 text-gremius-cyan hover:underline text-xs"
                            onclick={(e) => e.stopPropagation()}
                          >
                            <Mail class="w-3 h-3 shrink-0" />
                            {value}
                          </a>
                        {:else}
                          <span class="text-gremius-subtle">-</span>
                        {/if}

                      <!-- COLOR: swatch + hex -->
                      {:else if colType === "color"}
                        {#if value}
                          <div class="flex items-center gap-2">
                            <div 
                              class="w-5 h-5 rounded border border-gremius-border shrink-0" 
                              style="background-color: {value}"
                            ></div>
                            <span class="text-xs text-gremius-text-dim font-mono">{value}</span>
                          </div>
                        {:else}
                          <span class="text-gremius-subtle">-</span>
                        {/if}

                      <!-- ID: truncated mono -->
                      {:else if colType === "id"}
                        <span class="text-xs text-gremius-subtle font-mono" title={value}>
                          {value ? String(value).slice(0, 8) + "…" : "-"}
                        </span>

                      <!-- IMAGE: thumbnail (detect by column name) -->
                      {:else if column.name === "image" || column.name === "portada" || column.name === "cover" || column.name === "thumbnailUrl" || column.name === "thumbnail_url"}
                        {#if value}
                          <img src={value} alt="" class="w-10 h-10 object-cover rounded border border-gremius-border" />
                        {:else}
                          <div class="w-10 h-10 bg-gremius-border/30 rounded flex items-center justify-center text-xs text-gremius-text-dim">
                            N/A
                          </div>
                        {/if}

                      <!-- JSON: preview -->
                      {:else if colType === "json"}
                        {#if value !== null && value !== undefined}
                          <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-gremius-surface text-gremius-subtle" title={JSON.stringify(value, null, 2)}>
                            <FileJson class="w-3 h-3" />
                            {Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`}
                          </span>
                        {:else}
                          <span class="text-gremius-subtle">-</span>
                        {/if}

                      <!-- NUMBER: formatted -->
                      {:else if colType === "number"}
                        <span class="text-gremius-text tabular-nums">
                          {value !== null && value !== undefined ? Number(value).toLocaleString() : "-"}
                        </span>

                      <!-- DEFAULT TEXT -->
                      {:else}
                        <span class="text-gremius-text truncate max-w-[250px] block">
                          {formatValue(value)}
                        </span>
                      {/if}
                    </td>
                  {/each}
                  <td class="p-3 text-right">
                    <div class="flex items-center justify-end gap-2">
                      <button 
                        class="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-gremius-cyan/10 hover:border-gremius-cyan/30 hover:text-gremius-cyan transition-all duration-200" 
                        title="Editar"
                        onclick={() => openEditModal(row)}
                      >
                        <Edit class="w-3.5 h-3.5" />
                        <span class="text-xs font-medium">Editar</span>
                      </button>
                      <button 
                        class="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 transition-all duration-200" 
                        title="Eliminar"
                        onclick={() => confirmDelete(row)}
                      >
                        <Trash2 class="w-3.5 h-3.5" />
                        <span class="text-xs font-medium">Eliminar</span>
                      </button>
                    </div>
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
      
      <!-- Pagination -->
      <div class="flex items-center justify-between p-3 border-t border-gremius-border">
        <div class="text-sm text-gremius-text-dim">
          {#if totalCount > 0}
            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount}
          {:else}
            No records
          {/if}
        </div>
        
        <div class="flex items-center gap-2">
          <select 
            class="px-3 py-2 text-sm rounded-xl bg-gremius-surface border border-gremius-border text-gremius-text focus:outline-none focus:ring-2 focus:ring-gremius-cyan/50 focus:border-gremius-cyan/50 transition-all duration-200 hover:border-gremius-cyan/30 cursor-pointer"
            bind:value={pageSize}
            onchange={() => { currentPage = 1; loadData(); }}
          >
            <option value={10}>10 por página</option>
            <option value={25}>25 por página</option>
            <option value={50}>50 por página</option>
            <option value={100}>100 por página</option>
          </select>
          
          <div class="flex items-center gap-1 bg-gremius-surface border border-gremius-border rounded-xl p-1">
            <button 
              class="group p-2 rounded-lg text-gremius-text-dim hover:bg-gremius-cyan/10 hover:text-gremius-cyan disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all duration-200"
              disabled={currentPage === 1}
              onclick={() => { currentPage = 1; loadData(); }}
              title="Primera página"
            >
              <ChevronsLeft class="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            </button>
            <button 
              class="group p-2 rounded-lg text-gremius-text-dim hover:bg-gremius-cyan/10 hover:text-gremius-cyan disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all duration-200"
              disabled={currentPage === 1}
              onclick={() => { currentPage--; loadData(); }}
              title="Página anterior"
            >
              <ChevronLeft class="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            </button>
            
            <span class="px-4 py-1 text-sm font-semibold text-gremius-text tabular-nums bg-gremius-bg rounded-lg border border-gremius-border min-w-[80px] text-center">
              {currentPage} / {totalPages || 1}
            </span>
            
            <button 
              class="group p-2 rounded-lg text-gremius-text-dim hover:bg-gremius-cyan/10 hover:text-gremius-cyan disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all duration-200"
              disabled={currentPage >= totalPages}
              onclick={() => { currentPage++; loadData(); }}
              title="Página siguiente"
            >
              <ChevronRight class="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <button 
              class="group p-2 rounded-lg text-gremius-text-dim hover:bg-gremius-cyan/10 hover:text-gremius-cyan disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all duration-200"
              disabled={currentPage >= totalPages}
              onclick={() => { currentPage = totalPages; loadData(); }}
              title="Última página"
            >
              <ChevronsRight class="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Auto-Form Modal -->
{#if showFormModal}
  <AutoFormModal
    tableName={(activeView as any)?.table || grimoireId}
    columns={columns}
    editData={editRecord}
    apiEndpoint={apiBaseEndpoint}
    onsave={() => loadData()}
    onclose={() => { showFormModal = false; editRecord = null; }}
  />
{/if}

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirm && deleteTarget}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    onclick={() => { showDeleteConfirm = false; deleteTarget = null; }}
  >
    <div class="bg-gremius-card border border-gremius-border rounded-xl shadow-2xl p-6 max-w-sm w-full" onclick={(e) => e.stopPropagation()}>
      <div class="flex items-center gap-3 mb-4">
        <div class="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
          <Trash2 class="w-6 h-6 text-red-400" />
        </div>
        <div>
          <h3 class="text-lg font-semibold text-gremius-text">¿Eliminar registro?</h3>
          <p class="text-sm text-gremius-text-dim">Esta acción no se puede deshacer.</p>
        </div>
      </div>
      <div class="flex items-center justify-end gap-3">
        <button 
          class="px-5 py-2.5 text-sm font-medium rounded-xl bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-gremius-bg transition-all duration-200"
          onclick={() => { showDeleteConfirm = false; deleteTarget = null; }}
        >
          Cancelar
        </button>
        <button
          class="group inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/25 hover:shadow-red-500/40 hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100"
          disabled={deleting}
          onclick={() => handleDelete(deleteTarget)}
        >
          <Trash2 class="w-4 h-4 group-hover:animate-bounce" />
          {deleting ? "Eliminando..." : "Eliminar"}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Bulk Delete Confirmation Modal -->
{#if showBulkDeleteConfirm}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    onclick={() => { showBulkDeleteConfirm = false; }}
  >
    <div class="bg-gremius-card border border-gremius-border rounded-xl shadow-2xl p-6 max-w-sm w-full" onclick={(e) => e.stopPropagation()}>
      <div class="flex items-center gap-3 mb-4">
        <div class="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
          <Trash2 class="w-6 h-6 text-red-400" />
        </div>
        <div>
          <h3 class="text-lg font-semibold text-gremius-text">Delete {selectedRows.size} records?</h3>
          <p class="text-sm text-gremius-text-dim">This action cannot be undone.</p>
        </div>
      </div>
      <div class="flex items-center justify-end gap-3">
        <button 
          class="px-5 py-2.5 text-sm font-medium rounded-xl bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-gremius-bg transition-all duration-200"
          onclick={() => { showBulkDeleteConfirm = false; }}
        >
          Cancel
        </button>
        <button
          class="group inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/25 hover:shadow-red-500/40 hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100"
          disabled={bulkActionLoading}
          onclick={executeBulkDelete}
        >
          <Trash2 class="w-4 h-4 group-hover:animate-bounce" />
          {bulkActionLoading ? "Deleting..." : "Delete"}
        </button>
      </div>
    </div>
  </div>
{/if}
