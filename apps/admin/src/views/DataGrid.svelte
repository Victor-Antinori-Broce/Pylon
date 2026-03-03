<script lang="ts">
  /**
   * DataGrid.svelte
   * 
   * Vista genérica para visualizar datos de cualquier colección.
   * Usa DataTable con columnas dinámicas.
   */
  import { onMount } from "svelte";
  import { Table2, Plus, Filter, Download } from "lucide-svelte";
  import { DataTable, StatusBadge } from "../lib/components/ui";
  import { ImageCell, ScoreCell, RelationCell } from "../lib/components/table/cells";
  import type { ColumnDef } from "@tanstack/svelte-table";
  
  // Props - en una app real vendrían de la URL o props
  let { collection = "games" } = $props();
  
  // Estado
  let loading = $state(true);
  let data = $state<any[]>([]);
  
  // Datos de ejemplo (en producción vendrían de la API)
  const sampleData = [
    { 
      id: "1", 
      name: "Cyberpunk 2077", 
      status: "published", 
      genre: "RPG", 
      rating: 85, 
      players: 12500,
      image: "https://picsum.photos/seed/cp2077/100",
      tags: [{ id: "1", label: "Open World" }, { id: "2", label: "Sci-Fi" }]
    },
    { 
      id: "2", 
      name: "Elden Ring", 
      status: "published", 
      genre: "Action RPG", 
      rating: 96, 
      players: 8900,
      image: "https://picsum.photos/seed/elden/100",
      tags: [{ id: "3", label: "Souls-like" }, { id: "4", label: "Fantasy" }]
    },
    { 
      id: "3", 
      name: "Baldur's Gate 3", 
      status: "published", 
      genre: "RPG", 
      rating: 98, 
      players: 15200,
      image: "https://picsum.photos/seed/bg3/100",
      tags: [{ id: "5", label: "D&D" }, { id: "6", label: "Turn-based" }]
    },
    { 
      id: "4", 
      name: "Starfield", 
      status: "draft", 
      genre: "RPG", 
      rating: 72, 
      players: 5400,
      image: "https://picsum.photos/seed/starfield/100",
      tags: [{ id: "1", label: "Open World" }, { id: "7", label: "Space" }]
    },
    { 
      id: "5", 
      name: "Hogwarts Legacy", 
      status: "published", 
      genre: "Action RPG", 
      rating: 88, 
      players: 9800,
      image: "https://picsum.photos/seed/hogwarts/100",
      tags: [{ id: "4", label: "Fantasy" }, { id: "8", label: "Magic" }]
    }
  ];
  
  // Definición de columnas
  const columns: ColumnDef<any>[] = [
    {
      accessorKey: "image",
      header: "Image",
      cell: (info) => {
        const value = info.getValue();
        return ImageCell({ src: value, alt: info.row.original.name, size: "sm", rounded: true });
      }
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: (info) => {
        const value = info.getValue() as string;
        return {
          component: "span",
          props: { class: "font-medium text-gremius-text" },
          children: value
        };
      }
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: (info) => {
        const value = info.getValue() as string;
        return StatusBadge({ 
          variant: value === "published" ? "success" : "warning",
          label: value,
          size: "sm"
        });
      }
    },
    {
      accessorKey: "genre",
      header: "Genre"
    },
    {
      accessorKey: "rating",
      header: "Rating",
      cell: (info) => {
        const value = info.getValue() as number;
        return ScoreCell({ value, max: 100, showBar: true, size: "sm" });
      }
    },
    {
      accessorKey: "players",
      header: "Active Players",
      cell: (info) => (info.getValue() as number).toLocaleString()
    },
    {
      accessorKey: "tags",
      header: "Tags",
      cell: (info) => {
        const items = info.getValue() as { id: string; label: string }[];
        return RelationCell({ items, maxItems: 2 });
      }
    }
  ];
  
  onMount(() => {
    // Simular carga de datos
    setTimeout(() => {
      data = sampleData;
      loading = false;
    }, 500);
  });
  
  function handleRowClick(row: any) {
    console.log("Row clicked:", row);
    // navigate(`/datasets/${collection}/${row.id}`);
  }
</script>

<div class="space-y-6 animate-fade-in">
  <!-- Header -->
  <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold text-gremius-text flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-gremius-purple/20 to-gremius-pink/20 border border-gremius-purple/20 flex items-center justify-center">
          <Table2 class="w-5 h-5 text-gremius-purple" />
        </div>
        Data Explorer: {collection}
      </h1>
      <p class="text-sm text-gremius-subtle mt-1">
        Browse and manage {collection} entries
      </p>
    </div>
    
    <div class="flex items-center gap-2">
      <button class="btn-secondary">
        <Filter class="w-4 h-4" />
        Filter
      </button>
      <button class="btn-secondary">
        <Download class="w-4 h-4" />
        Export
      </button>
      <button class="btn-primary">
        <Plus class="w-4 h-4" />
        New Entry
      </button>
    </div>
  </div>
  
  <!-- Data Table -->
  <DataTable
    {data}
    {columns}
    title=""
    {loading}
    enableSorting
    enableFiltering
    enablePagination
    pageSize={5}
    onRowClick={handleRowClick}
    emptyMessage="No entries found in this collection"
  />
</div>

