<script lang="ts">
  import { onMount } from "svelte";
  import { 
    Plus, 
    ChevronRight, 
    Users,
    Search,
    Edit,
    Trash2,
    UserPlus,
    Shield
  } from "lucide-svelte";
  import { api } from "$lib/api";
  import { goto } from "$app/navigation";

  interface Grupo {
    id: string;
    nombre: string;
    descripcion: string | null;
    supervisorPrincipalId: string | null;
    activo: boolean;
    createdAt: string;
    _count?: {
      miembros: number;
    };
  }

  let grupos = $state<Grupo[]>([]);
  let loading = $state(true);
  let searchQuery = $state("");
  let filteredGrupos = $derived(
    grupos.filter(g => 
      g.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (g.descripcion?.toLowerCase() || "").includes(searchQuery.toLowerCase())
    )
  );

  onMount(async () => {
    await loadGrupos();
  });

  async function loadGrupos() {
    loading = true;
    try {
      const data = await api.get<{ grupos: Grupo[] }>("/academy/grupos");
      grupos = data.grupos || [];
    } catch (err) {
      console.error("Failed to load groups:", err);
    } finally {
      loading = false;
    }
  }

  function handleNewGroup() {
    // TODO: Implementar modal o navegación para crear grupo
    alert("Funcionalidad de crear grupo en desarrollo");
  }

  function handleEditGroup(id: string) {
    // TODO: Implementar edición de grupo
    alert("Editar grupo: " + id);
  }

  async function handleDeleteGroup(id: string) {
    if (!confirm("¿Estás seguro de eliminar este grupo?")) return;
    
    try {
      await api.delete(`/academy/grupos/${id}`);
      await loadGrupos();
    } catch (err) {
      console.error("Failed to delete group:", err);
      alert("Error al eliminar el grupo");
    }
  }
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-xl font-bold text-gremius-text flex items-center gap-2">
        <Users class="w-6 h-6 text-gremius-cyan" />
        Grupos de Asignación
      </h2>
      <p class="text-sm text-gremius-text-dim mt-0.5">
        Organiza estudiantes en grupos para asignar cursos
      </p>
    </div>
    <button onclick={handleNewGroup} class="btn-primary inline-flex items-center gap-2">
      <Plus class="w-4 h-4" /> Nuevo Grupo
    </button>
  </div>

  <!-- Search -->
  <div class="flex gap-4">
    <div class="relative flex-1 max-w-md">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gremius-subtle" />
      <input
        type="text"
        placeholder="Buscar grupos..."
        bind:value={searchQuery}
        class="w-full pl-10 pr-4 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan/50"
      />
    </div>
  </div>

  {#if loading}
    <div class="flex justify-center py-20">
      <div class="w-6 h-6 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div>
    </div>
  {:else if filteredGrupos.length === 0}
    <div class="card p-16 text-center">
      <div class="text-4xl mb-3">👥</div>
      <p class="text-gremius-text-dim">
        {searchQuery ? "No se encontraron grupos" : "No hay grupos creados aún."}
      </p>
      {#if !searchQuery}
        <p class="text-xs text-gremius-subtle mt-1">
          Crea tu primer grupo para organizar estudiantes.
        </p>
        <button onclick={handleNewGroup} class="btn-primary mt-4 inline-flex items-center gap-2">
          <Plus class="w-4 h-4" /> Crear Grupo
        </button>
      {/if}
    </div>
  {:else}
    <div class="grid gap-4">
      {#each filteredGrupos as grupo}
        <div class="card p-4 flex items-center justify-between group">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-lg bg-gremius-surface flex items-center justify-center">
              <Users class="w-5 h-5 text-gremius-cyan" />
            </div>
            <div>
              <h4 class="font-semibold text-gremius-text">
                {grupo.nombre}
              </h4>
              <p class="text-xs text-gremius-subtle mt-0.5">
                {grupo._count?.miembros || 0} miembros · 
                {#if grupo.supervisorPrincipalId}
                  <span class="inline-flex items-center gap-1 text-gremius-cyan">
                    <Shield class="w-3 h-3" />
                    Con supervisor
                  </span>
                {/if}
                {#if !grupo.activo}
                  <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/20 text-red-400 ml-2">
                    Inactivo
                  </span>
                {/if}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button 
              onclick={() => handleEditGroup(grupo.id)}
              class="p-2 text-gremius-subtle hover:text-gremius-cyan hover:bg-gremius-cyan/10 rounded-lg transition-colors"
              title="Editar"
            >
              <Edit class="w-4 h-4" />
            </button>
            <button 
              onclick={() => handleDeleteGroup(grupo.id)}
              class="p-2 text-gremius-subtle hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              title="Eliminar"
            >
              <Trash2 class="w-4 h-4" />
            </button>
            <button 
              onclick={() => handleEditGroup(grupo.id)}
              class="p-2 text-gremius-subtle hover:text-gremius-cyan transition-colors"
            >
              <ChevronRight class="w-4 h-4" />
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .btn-primary {
    @apply px-4 py-2 bg-gremius-cyan text-black rounded-lg font-medium 
           hover:bg-gremius-cyan-hover transition-colors;
  }
  
  .card {
    @apply bg-gremius-card border border-gremius-border rounded-xl;
  }
</style>
