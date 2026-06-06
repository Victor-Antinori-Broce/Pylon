<script lang="ts">
  import { api } from "$lib/api";
  import { 
    Plus, 
    ChevronRight, 
    BookOpen,
    Search,
    Edit,
    Trash2
  } from "lucide-svelte";
  import { onMount } from "svelte";

  import { goto } from "$app/navigation";

  interface Curso {
    id: string;
    titulo: string;
    descripcion: string | null;
    tipoCurso: string;
    activo: boolean;
    createdAt: string;
    _count?: {
      modulos: number;
    };
  }

  let cursos = $state<Curso[]>([]);
  let loading = $state(true);
  let searchQuery = $state("");
  const filteredCursos = $derived(
    cursos.filter(c => 
      c.titulo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.descripcion?.toLowerCase() || "").includes(searchQuery.toLowerCase())
    )
  );

  onMount(async () => {
    await loadCursos();
  });

  async function loadCursos() {
    loading = true;
    try {
      const data = await api.get<{ cursos: Curso[] }>("/academy/cursos?limit=100");
      cursos = data.cursos || [];
    } catch (err) {
      console.error("Failed to load courses:", err);
    } finally {
      loading = false;
    }
  }

  function handleNewCourse() {
    goto("/academy/courses/new");
  }

  function handleEditCourse(id: string) {
    goto(`/academy/courses/${id}`);
  }

  async function handleDeleteCourse(id: string) {
    if (!confirm("¿Estás seguro de eliminar este curso?")) return;
    
    try {
      await api.delete(`/academy/cursos/${id}`);
      await loadCursos();
    } catch (err) {
      console.error("Failed to delete course:", err);
      alert("Error al eliminar el curso");
    }
  }

  const tipoCursoLabels: Record<string, string> = {
    INDUCCION: "Inducción",
    GESTION: "Gestión",
    TECNICO: "Técnico",
    HERRAMIENTAS: "Herramientas",
    DESARROLLO: "Desarrollo"
  };

  const tipoCursoColors: Record<string, string> = {
    INDUCCION: "bg-blue-500/20 text-blue-400",
    GESTION: "bg-purple-500/20 text-purple-400",
    TECNICO: "bg-orange-500/20 text-orange-400",
    HERRAMIENTAS: "bg-green-500/20 text-green-400",
    DESARROLLO: "bg-pink-500/20 text-pink-400"
  };
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-xl font-bold text-gremius-text flex items-center gap-2">
        <BookOpen class="w-6 h-6 text-gremius-cyan" />
        Cursos
      </h2>
      <p class="text-sm text-gremius-text-dim mt-0.5">
        Gestiona los cursos disponibles en la plataforma
      </p>
    </div>
    <button onclick={handleNewCourse} class="btn-primary inline-flex items-center gap-2">
      <Plus class="w-4 h-4" /> Nuevo Curso
    </button>
  </div>

  <!-- Search -->
  <div class="flex gap-4">
    <div class="relative flex-1 max-w-md">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gremius-subtle" />
      <input
        type="text"
        placeholder="Buscar cursos..."
        bind:value={searchQuery}
        class="w-full pl-10 pr-4 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan/50"
      />
    </div>
  </div>

  {#if loading}
    <div class="flex justify-center py-20">
      <div class="w-6 h-6 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div>
    </div>
  {:else if filteredCursos.length === 0}
    <div class="card p-16 text-center">
      <div class="text-4xl mb-3">📚</div>
      <p class="text-gremius-text-dim">
        {searchQuery ? "No se encontraron cursos" : "No hay cursos creados aún."}
      </p>
      {#if !searchQuery}
        <p class="text-xs text-gremius-subtle mt-1">
          Crea tu primer curso para comenzar a gestionar el aprendizaje.
        </p>
        <button onclick={handleNewCourse} class="btn-primary mt-4 inline-flex items-center gap-2">
          <Plus class="w-4 h-4" /> Crear Curso
        </button>
      {/if}
    </div>
  {:else}
    <div class="grid gap-4">
      {#each filteredCursos as curso}
        <div class="card p-4 flex items-center justify-between group">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-lg bg-gremius-surface flex items-center justify-center">
              <BookOpen class="w-5 h-5 text-gremius-cyan" />
            </div>
            <div>
              <h4 class="font-semibold text-gremius-text">
                {curso.titulo}
              </h4>
              <p class="text-xs text-gremius-subtle mt-0.5">
                {curso._count?.modulos || 0} módulos · 
                <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium {tipoCursoColors[curso.tipoCurso] || 'bg-gray-500/20 text-gray-400'}">
                  {tipoCursoLabels[curso.tipoCurso] || curso.tipoCurso}
                </span>
                {#if !curso.activo}
                  <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/20 text-red-400 ml-2">
                    Inactivo
                  </span>
                {/if}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button 
              onclick={() => handleEditCourse(curso.id)}
              class="p-2 text-gremius-subtle hover:text-gremius-cyan hover:bg-gremius-cyan/10 rounded-lg transition-colors"
              title="Editar"
            >
              <Edit class="w-4 h-4" />
            </button>
            <button 
              onclick={() => handleDeleteCourse(curso.id)}
              class="p-2 text-gremius-subtle hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              title="Eliminar"
            >
              <Trash2 class="w-4 h-4" />
            </button>
            <button 
              onclick={() => handleEditCourse(curso.id)}
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
