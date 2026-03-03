<script lang="ts">
  /**
   * DataTable.svelte
   * 
   * Tabla de datos avanzada usando @tanstack/svelte-table.
   * Soporta: sorting, filtering, pagination, row selection, column visibility.
   */
  import {
    createSvelteTable,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    type TableOptions,
    type ColumnDef,
    type RowSelectionState
  } from "@tanstack/svelte-table";
  import { 
    ChevronLeft, 
    ChevronRight, 
    ChevronsLeft, 
    ChevronsRight,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Search,
    Settings2,
    Download,
    RefreshCw,
    Loader2
  } from "lucide-svelte";
  import { writable } from "svelte/store";
  import StatusBadge from "./StatusBadge.svelte";
  
  type TData = Record<string, any>;
  
  interface Props<T extends TData> {
    /** Datos de la tabla */
    data: T[];
    /** Definición de columnas */
    columns: ColumnDef<T, any>[];
    /** Título de la tabla */
    title?: string;
    /** Habilitar sorting */
    enableSorting?: boolean;
    /** Habilitar filtering global */
    enableFiltering?: boolean;
    /** Habilitar paginación */
    enablePagination?: boolean;
    /** Tamaño de página */
    pageSize?: number;
    /** Opciones de tamaño de página */
    pageSizeOptions?: number[];
    /** Habilitar selección de filas */
    enableRowSelection?: boolean;
    /** Habilitar ocultar columnas */
    enableColumnVisibility?: boolean;
    /** Clases adicionales */
    class?: string;
    /** Callback al cambiar selección */
    onSelectionChange?: (selected: T[]) => void;
    /** Callback al hacer click en fila */
    onRowClick?: (row: T) => void;
    /** Estado de carga */
    loading?: boolean;
    /** Mensaje cuando no hay datos */
    emptyMessage?: string;
    /** Toolbar actions slot */
    toolbar?: import("svelte").Snippet;
  }
  
  let {
    data,
    columns,
    title = "Data Table",
    enableSorting = true,
    enableFiltering = true,
    enablePagination = true,
    pageSize = 10,
    pageSizeOptions = [10, 20, 50, 100],
    enableRowSelection = false,
    enableColumnVisibility = true,
    class: className = "",
    onSelectionChange,
    onRowClick,
    loading = false,
    emptyMessage = "No data found",
    toolbar
  }: Props<any> = $props();
  
  // Estado
  let globalFilter = $state("");
  let rowSelection: RowSelectionState = $state({});
  let showColumnMenu = $state(false);
  
  // Store para la tabla (requerido por tanstack svelte table)
  const tableStore = writable<TableOptions<any>>({
    data,
    columns,
    state: {
      rowSelection,
      globalFilter,
    },
    enableRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: enableSorting ? getSortedRowModel() : undefined,
    getFilteredRowModel: enableFiltering ? getFilteredRowModel() : undefined,
    getPaginationRowModel: enablePagination ? getPaginationRowModel() : undefined,
    initialState: {
      pagination: { pageSize }
    },
    onRowSelectionChange: (updater) => {
      rowSelection = typeof updater === "function" ? updater(rowSelection) : updater;
      if (onSelectionChange) {
        const selectedRows = table.getSelectedRowModel().rows.map(r => r.original);
        onSelectionChange(selectedRows);
      }
    }
  });
  
  // Crear tabla
  const table = createSvelteTable(tableStore);
  
  // Actualizar store cuando cambian props
  $effect(() => {
    tableStore.update(options => ({
      ...options,
      data,
      state: {
        ...options.state,
        rowSelection,
        globalFilter
      }
    }));
  });
  
  // Handlers
  function handleRowClick(row: any) {
    if (onRowClick && !loading) {
      onRowClick(row.original);
    }
  }
  
  function toggleSorting(column: any) {
    if (!enableSorting) return;
    column.toggleSorting();
  }
  
  function getSortIcon(column: any) {
    const sort = column.getIsSorted();
    if (sort === "asc") return ArrowUp;
    if (sort === "desc") return ArrowDown;
    return ArrowUpDown;
  }
</script>

<div class="space-y-4 {className}">
  <!-- Toolbar -->
  <div class="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
    {#if title}
      <h3 class="text-lg font-semibold text-gremius-text">{title}</h3>
    {/if}
    
    <div class="flex items-center gap-2 w-full sm:w-auto">
      <!-- Search -->
      {#if enableFiltering}
        <div class="relative flex-1 sm:flex-none">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gremius-subtle" />
          <input
            type="text"
            placeholder="Search..."
            class="pl-9 pr-4 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-sm text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:ring-2 focus:ring-gremius-cyan/30 focus:border-gremius-cyan/50 w-full sm:w-64"
            bind:value={globalFilter}
          />
        </div>
      {/if}
      
      <!-- Column Visibility -->
      {#if enableColumnVisibility}
        <div class="relative">
          <button
            class="p-2 rounded-lg border border-gremius-border bg-gremius-bg text-gremius-text-dim hover:text-gremius-text hover:border-gremius-subtle transition-colors"
            onclick={() => showColumnMenu = !showColumnMenu}
            title="Toggle columns"
          >
            <Settings2 class="w-4 h-4" />
          </button>
          
          {#if showColumnMenu}
            <div class="absolute right-0 top-full mt-1 z-50 w-48 bg-gremius-card border border-gremius-border rounded-lg shadow-xl p-2">
              <p class="text-xs font-semibold text-gremius-subtle uppercase tracking-wider px-2 py-1">Columns</p>
              {#each table.getAllLeafColumns() as column}
                <label class="flex items-center gap-2 px-2 py-1.5 hover:bg-gremius-bg rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={column.getIsVisible()}
                    onchange={() => column.toggleVisibility()}
                    class="accent-gremius-cyan"
                  />
                  <span class="text-sm text-gremius-text-dim">{column.columnDef.header}</span>
                </label>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
      
      <!-- Custom Toolbar -->
      {@render toolbar?.()}
    </div>
  </div>
  
  <!-- Table -->
  <div class="card overflow-hidden">
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          {#each table.getHeaderGroups() as headerGroup}
            <tr class="border-b border-gremius-border">
              {#each headerGroup.headers as header}
                <th 
                  class="px-4 py-3 text-left font-semibold text-gremius-text-dim uppercase tracking-wider text-xs whitespace-nowrap"
                  class:cursor-pointer={enableSorting && header.column.getCanSort()}
                  class:select-none={enableSorting}
                  onclick={() => toggleSorting(header.column)}
                >
                  <div class="flex items-center gap-2">
                    {#if !header.isPlaceholder}
                      <svelte:component this={flexRender(header.column.columnDef.header, header.getContext())} />
                      {#if enableSorting && header.column.getCanSort()}
                        {@const SortIcon = getSortIcon(header.column)}
                        <SortIcon class="w-3.5 h-3.5 {header.column.getIsSorted() ? 'text-gremius-cyan' : 'text-gremius-subtle opacity-0 group-hover:opacity-50'}" />
                      {/if}
                    {/if}
                  </div>
                </th>
              {/each}
            </tr>
          {/each}
        </thead>
        
        <tbody>
          {#if loading}
            <tr>
              <td colspan={columns.length} class="px-4 py-12 text-center">
                <div class="flex flex-col items-center gap-3">
                  <Loader2 class="w-8 h-8 text-gremius-cyan animate-spin" />
                  <p class="text-gremius-subtle">Loading data...</p>
                </div>
              </td>
            </tr>
          {:else if table.getRowModel().rows.length === 0}
            <tr>
              <td colspan={columns.length} class="px-4 py-12 text-center">
                <div class="flex flex-col items-center gap-3">
                  <div class="w-12 h-12 rounded-full bg-gremius-muted-20 flex items-center justify-center">
                    <Search class="w-6 h-6 text-gremius-subtle" />
                  </div>
                  <p class="text-gremius-subtle">{emptyMessage}</p>
                </div>
              </td>
            </tr>
          {:else}
            {#each table.getRowModel().rows as row}
              <tr 
                class="border-b border-gremius-border-50 hover:bg-gremius-cyan-3 transition-colors"
                class:cursor-pointer={!!onRowClick}
                onclick={() => handleRowClick(row)}
              >
                {#each row.getVisibleCells() as cell}
                  <td class="px-4 py-3 text-gremius-text">
                    <svelte:component this={flexRender(cell.column.columnDef.cell, cell.getContext())} />
                  </td>
                {/each}
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
    
    <!-- Pagination -->
    {#if enablePagination && !loading && table.getRowModel().rows.length > 0}
      <div class="flex items-center justify-between px-4 py-3 border-t border-gremius-border">
        <div class="flex items-center gap-2 text-sm text-gremius-subtle">
          <span>
            Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to {Math.min(
              (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
              table.getCoreRowModel().rows.length
            )} of {table.getCoreRowModel().rows.length} entries
          </span>
        </div>
        
        <div class="flex items-center gap-2">
          <!-- Page size selector -->
          <select
            class="px-2 py-1 bg-gremius-bg border border-gremius-border rounded text-sm text-gremius-text"
            onchange={(e) => table.setPageSize(Number(e.currentTarget.value))}
            value={table.getState().pagination.pageSize}
          >
            {#each pageSizeOptions as size}
              <option value={size}>{size}</option>
            {/each}
          </select>
          
          <!-- Navigation -->
          <div class="flex items-center gap-1">
            <button
              class="p-1.5 rounded border border-gremius-border text-gremius-text-dim hover:text-gremius-text hover:border-gremius-subtle disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              onclick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronsLeft class="w-4 h-4" />
            </button>
            <button
              class="p-1.5 rounded border border-gremius-border text-gremius-text-dim hover:text-gremius-text hover:border-gremius-subtle disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              onclick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft class="w-4 h-4" />
            </button>
            
            <span class="px-3 py-1 text-sm text-gremius-text">
              {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
            </span>
            
            <button
              class="p-1.5 rounded border border-gremius-border text-gremius-text-dim hover:text-gremius-text hover:border-gremius-subtle disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              onclick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRight class="w-4 h-4" />
            </button>
            <button
              class="p-1.5 rounded border border-gremius-border text-gremius-text-dim hover:text-gremius-text hover:border-gremius-subtle disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              onclick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              <ChevronsRight class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

