<script lang="ts">
  import { onMount } from "svelte";
  import { 
    Plus, 
    ChevronRight, 
    Route,
    Search,
    Edit,
    Trash2,
    BookOpen,
    GraduationCap
  } from "lucide-svelte";
  import { api } from "$lib/api";
  import { goto } from "$app/navigation";

  interface LearningPath {
    id: string;
    nombre: string;
    descripcion: string | null;
    categoria: string | null;
    duracionEstimadaHoras: string | null;
    activo: boolean;
    createdAt: string;
    totalCursos?: number;
  }

  let learningPaths = $state<LearningPath[]>([]);
  let loading = $state(true);
  let searchQuery = $state("");
  let filteredPaths = $derived(
    learningPaths.filter(lp => 
      lp.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lp.descripcion?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
      (lp.categoria?.toLowerCase() || "").includes(searchQuery.toLowerCase())
    )
  );

  onMount(async () => {
    await loadLearningPaths();
  });

  async function loadLearningPaths() {
    loading = true;
    try {
      const data = await api.get<{ learningPaths: LearningPath[] }>("/academy/learning-paths");
      learningPaths = data.learningPaths || [];
    } catch (err) {
      console.error("Failed to load learning paths:", err);
    } finally {
      loading = false;
    }
  }

  function handleNewPath() {
    // TODO: Implementar modal o navegación para crear learning path
    alert("Funcionalidad de crear learning path en desarrollo");
  }

  function handleEditPath(id: string) {
    // TODO: Implementar edición de learning path
    alert("Editar learning path: " + id);
  }

  async function handleDeletePath(id: string) {
    if (!confirm("¿Estás seguro de eliminar este learning path?")) return;
    
    try {
      await api.delete(`/academy/learning-paths/${id}`);
      await loadLearningPaths();
    } catch (err) {
      console.error("Failed to delete learning path:", err);
      alert("Error al eliminar el learning path");
    }
  }

  function formatDuration(hours: string | null): string {
    if (!hours) return "Duración no especificada";
    const h = parseFloat(hours);
    if (h >= 1) return `${Math.round(h)} horas`;
    return `${Math.round(h * 60)} minutos`;
  }
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-xl font-bold text-gremius-text flex items-center gap-2">
        <Route class="w-6 h-6 text-gremius-cyan" />
        Learning Paths
      </h2>
      <p class="text-sm text-gremius-text-dim mt-0.5">
        Rutas de aprendizaje secuenciales para formación estructurada
      </p>
    </div>
    <button onclick={handleNewPath} class="btn-primary inline-flex items-center gap-2">
      <Plus class="w-4 h-4" /> Nuevo Learning Path
    </button>
  </div>

  <!-- Search -->
  <div class="flex gap-4">
    <div class="relative flex-1 max-w-md">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gremius-subtle" />
      <input
        type="text"
        placeholder="Buscar learning paths..."
        bind:value={searchQuery}
        class="w-full pl-10 pr-4 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan/50"
      />
    </div>
  </div>

  {#if loading}
    <div class="flex justify-center py-20">
      <div class="w-6 h-6 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div>
    </div>
  {:else if filteredPaths.length === 0}
    <div class="card p-16 text-center">
      <div class="text-4xl mb-3">🎯</div>
      <p class="text-gremius-text-dim">
        {searchQuery ? "No se encontraron learning paths" : "No hay learning paths creados aún."}
      </p>
      {#if !searchQuery}
        <p class="text-xs text-gremius-subtle mt-1">
          Crea tu primera ruta de aprendizaje para guiar a los estudiantes.
        </p>
        <button onclick={handleNewPath} class="btn-primary mt-4 inline-flex items-center gap-2">
          <Plus class="w-4 h-4" /> Crear Learning Path
        </button>
      {/if}
    </div>
  {:else}
    <div class="grid gap-4">
      {#each filteredPaths as path}
        <div class="card p-4 flex items-center justify-between group">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-lg bg-gremius-surface flex items-center justify-center">
              <GraduationCap class="w-5 h-5 text-gremius-cyan" />
            </div>
            <div>
              <h4 class="font-semibold text-gremius-text">
                {path.nombre}
              </h4>
              <p class="text-xs text-gremius-subtle mt-0.5">
                <span class="inline-flex items-center gap-1">
                  <BookOpen class="w-3 h-3" />
                  {path.totalCursos || 0} cursos
                </span>
                {#if path.categoria}
                  <span class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gremius-cyan/20 text-gremius-cyan">
                    {path.categoria}
                  </span>
                {/if}
                {#if path.duracionEstimadaHoras}
                  <span class="ml-2 text-gremius-text-dim">
                    · {formatDuration(path.duracionEstimadaHoras)}
                  </span>
                {/if}
                {#if !path.activo}
                  <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/20 text-red-400 ml-2">
                    Inactivo
                  </span>
                {/if}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button 
              onclick={() => handleEditPath(path.id)}
              class="p-2 text-gremius-subtle hover:text-gremius-cyan hover:bg-gremius-cyan/10 rounded-lg transition-colors"
              title="Editar"
            >
              <Edit class="w-4 h-4" />
            </button>
            <button 
              onclick={() => handleDeletePath(path.id)}
              class="p-2 text-gremius-subtle hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              title="Eliminar"
            >
              <Trash2 class="w-4 h-4" />
            </button>
            <button 
              onclick={() => handleEditPath(path.id)}
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
