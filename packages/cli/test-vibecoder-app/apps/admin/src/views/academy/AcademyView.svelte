<script lang="ts">
  import { onMount } from "svelte";
  import { 
    Plus, 
    ChevronRight, 
    GraduationCap, 
    BookOpen, 
    Users, 
    Trophy,
    TrendingUp,
    Award,
    Route
  } from "lucide-svelte";
  import { api } from "$lib/api";

  interface Stats {
    totalCursos: number;
    totalUsuarios: number;
    totalCompletados: number;
    tasaCompletado: number;
  }

  interface Curso {
    id: string;
    titulo: string;
    descripcion: string;
    tipoCurso: string;
    activo: boolean;
    _count?: {
      modulos: number;
    };
  }

  let stats = $state<Stats>({
    totalCursos: 0,
    totalUsuarios: 0,
    totalCompletados: 0,
    tasaCompletado: 0
  });
  
  let cursos = $state<Curso[]>([]);
  let loading = $state(true);

  onMount(async () => {
    try {
      // Load recent courses (this endpoint exists)
      const cursosData = await api.get<{ cursos: Curso[] }>("/academy/cursos?limit=5");
      cursos = cursosData.cursos || [];
      stats.totalCursos = cursos.length;
    } catch (err) {
      console.error("Failed to load academy courses:", err);
    }

    try {
      // Dashboard stats endpoint may not exist yet — fail gracefully
      const statsData = await api.get<{ metricas: Stats }>("/academy/dashboard");
      if (statsData?.metricas) stats = statsData.metricas;
    } catch {
      // Dashboard endpoint not available — stats stay at defaults
    }

    loading = false;
  });

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
        <GraduationCap class="w-6 h-6 text-gremius-cyan" />
        Academy LMS
      </h2>
      <p class="text-sm text-gremius-text-dim mt-0.5">
        Gestión de cursos, módulos, evaluaciones y progreso de estudiantes
      </p>
    </div>
    <a href="/academy/courses/new" class="btn-primary inline-flex items-center gap-2">
      <Plus class="w-4 h-4" /> Nuevo Curso
    </a>
  </div>

  {#if loading}
    <div class="flex justify-center py-20">
      <div class="w-6 h-6 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div>
    </div>
  {:else}
    <!-- Stats Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Cursos -->
      <div class="card p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs text-gremius-subtle uppercase tracking-wider">Cursos</p>
            <p class="text-2xl font-bold text-gremius-text mt-1">{stats.totalCursos}</p>
          </div>
          <div class="w-10 h-10 rounded-lg bg-gremius-cyan/20 flex items-center justify-center">
            <BookOpen class="w-5 h-5 text-gremius-cyan" />
          </div>
        </div>
      </div>

      <!-- Usuarios -->
      <div class="card p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs text-gremius-subtle uppercase tracking-wider">Estudiantes</p>
            <p class="text-2xl font-bold text-gremius-text mt-1">{stats.totalUsuarios}</p>
          </div>
          <div class="w-10 h-10 rounded-lg bg-gremius-purple/20 flex items-center justify-center">
            <Users class="w-5 h-5 text-gremius-purple" />
          </div>
        </div>
      </div>

      <!-- Completados -->
      <div class="card p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs text-gremius-subtle uppercase tracking-wider">Completados</p>
            <p class="text-2xl font-bold text-gremius-text mt-1">{stats.totalCompletados}</p>
          </div>
          <div class="w-10 h-10 rounded-lg bg-gremius-green/20 flex items-center justify-center">
            <Trophy class="w-5 h-5 text-gremius-green" />
          </div>
        </div>
      </div>

      <!-- Tasa -->
      <div class="card p-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs text-gremius-subtle uppercase tracking-wider">Tasa Éxito</p>
            <p class="text-2xl font-bold text-gremius-text mt-1">{stats.tasaCompletado}%</p>
          </div>
          <div class="w-10 h-10 rounded-lg bg-gremius-yellow/20 flex items-center justify-center">
            <TrendingUp class="w-5 h-5 text-gremius-yellow" />
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <a href="/academy/courses" class="card p-4 hover:border-gremius-cyan/30 transition-colors group">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-gremius-cyan/20 flex items-center justify-center group-hover:bg-gremius-cyan/30 transition-colors">
            <BookOpen class="w-5 h-5 text-gremius-cyan" />
          </div>
          <div>
            <h3 class="font-semibold text-gremius-text">Cursos</h3>
            <p class="text-xs text-gremius-subtle">Gestionar cursos y módulos</p>
          </div>
        </div>
      </a>

      <a href="/academy/groups" class="card p-4 hover:border-gremius-cyan/30 transition-colors group">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-gremius-purple/20 flex items-center justify-center group-hover:bg-gremius-purple/30 transition-colors">
            <Users class="w-5 h-5 text-gremius-purple" />
          </div>
          <div>
            <h3 class="font-semibold text-gremius-text">Grupos</h3>
            <p class="text-xs text-gremius-subtle">Grupos de asignación</p>
          </div>
        </div>
      </a>

      <a href="/academy/learning-paths" class="card p-4 hover:border-gremius-cyan/30 transition-colors group">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-gremius-green/20 flex items-center justify-center group-hover:bg-gremius-green/30 transition-colors">
            <Route class="w-5 h-5 text-gremius-green" />
          </div>
          <div>
            <h3 class="font-semibold text-gremius-text">Learning Paths</h3>
            <p class="text-xs text-gremius-subtle">Rutas de aprendizaje</p>
          </div>
        </div>
      </a>
    </div>

    <!-- Recent Courses -->
    <div>
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold text-gremius-text">Cursos Recientes</h3>
        <a href="/academy/courses" class="text-sm text-gremius-cyan hover:underline">Ver todos</a>
      </div>

      {#if cursos.length === 0}
        <div class="card p-16 text-center">
          <div class="text-4xl mb-3">📚</div>
          <p class="text-gremius-text-dim">No hay cursos creados aún.</p>
          <p class="text-xs text-gremius-subtle mt-1">
            Crea tu primer curso para comenzar a gestionar el aprendizaje.
          </p>
        </div>
      {:else}
        <div class="space-y-2">
          {#each cursos as curso}
            <a
              href={`/academy/courses/${curso.id}`}
              class="card p-4 flex items-center justify-between group hover:border-gremius-cyan/30 transition-colors"
            >
              <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-lg bg-gremius-surface flex items-center justify-center">
                  <BookOpen class="w-5 h-5 text-gremius-cyan" />
                </div>
                <div>
                  <h4 class="font-semibold text-gremius-text group-hover:text-gremius-cyan transition-colors">
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
              <ChevronRight class="w-4 h-4 text-gremius-subtle group-hover:text-gremius-cyan transition-colors" />
            </a>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Export Actions -->
    <div class="card p-4">
      <h3 class="font-semibold text-gremius-text mb-3 flex items-center gap-2">
        <Award class="w-4 h-4 text-gremius-cyan" />
        Exportaciones
      </h3>
      <div class="flex flex-wrap gap-2">
        <a 
          href="/api/academy/exportar/asignaciones" 
          class="btn-secondary text-sm inline-flex items-center gap-2"
          target="_blank"
        >
          📊 Asignaciones
        </a>
        <a 
          href="/api/academy/exportar/progreso" 
          class="btn-secondary text-sm inline-flex items-center gap-2"
          target="_blank"
        >
          📈 Progreso
        </a>
        <a 
          href="/api/academy/exportar/encuestas" 
          class="btn-secondary text-sm inline-flex items-center gap-2"
          target="_blank"
        >
          📝 Encuestas
        </a>
      </div>
    </div>
  {/if}
</div>

<style>
  .btn-primary {
    @apply px-4 py-2 bg-gremius-cyan text-black rounded-lg font-medium 
           hover:bg-gremius-cyan-hover transition-colors;
  }
  
  .btn-secondary {
    @apply px-3 py-1.5 bg-gremius-surface border border-gremius-border rounded-lg 
           text-gremius-text hover:border-gremius-cyan/50 transition-colors;
  }
  
  .card {
    @apply bg-gremius-card border border-gremius-border rounded-xl;
  }
</style>
