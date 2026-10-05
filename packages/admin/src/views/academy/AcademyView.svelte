<script lang="ts">
  import {
    GraduationCap,
    BookOpen,
    Users,
    TrendingUp,
    Star,
    Plus,
    Search,
    ChevronLeft,
    ChevronRight,
    ChevronFirst,
    ChevronLast,
    X,
    Eye,
    Edit2,
    Trash2,
    Route,
    UserCircle,
    CheckCircle,
    AlertCircle,
    Loader2,
    BarChart3,
    Layers,
  } from "lucide-svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  import { api } from "$lib/api";

  // ─── Types ──────────────────────────────────────────────────────────────

  interface Metricas {
    totalCursos: number;
    totalModulos: number;
    totalTemas: number;
    totalQuizzes: number;
    totalPreguntas: number;
    totalGrupos: number;
    totalAsignaciones: number;
    totalCursosCompletados: number;
    totalFeedbacks: number;
    totalEncuestas: number;
    totalHorasDisponibles: number;
    promedioDuracionCurso: number;
    tasaCompletado: number;
    promedioModulos: number;
    promedioTemas: number;
  }

  interface ReporteCurso {
    curso: { id: string; titulo: string; tipo: string };
    metricas: {
      asignaciones: number;
      completados: number;
      progresoPromedio: number;
      tasaFinalizacion: number;
      totalEncuestas: number;
      satisfaccionPromedio: number;
    };
  }

  interface CursoStats {
    totalAsignados: number;
    completados: number;
    enProgreso: number;
    noIniciados: number;
    tasaFinalizacion: number;
    progresoPromedio: number;
    aprobadosQuiz: number;
    puntajePromedioQuiz: number;
    totalEncuestas: number;
    satisfaccionPromedio: number;
    expositorPromedio: number;
  }

  interface LearningPath {
    id: string;
    nombre: string;
    descripcion?: string;
    categoria?: string;
    activo: boolean;
    totalCursos: number;
    secuencial?: boolean;
  }

  interface Grupo {
    id: string;
    nombre: string;
    descripcion?: string;
    supervisorPrincipal?: string;
    miembros: number;
  }

  interface Asignacion {
    id: string;
    cursoId: string;
    userId?: string;
    grupoId?: string;
    metodo?: string;
    fecha: string;
  }

  // ─── Constants ──────────────────────────────────────────────────────────

  const tipoCursoLabels: Record<string, string> = {
    INDUCCION: "Inducción",
    GESTION: "Gestión",
    TECNICO: "Técnico",
    HERRAMIENTAS: "Herramientas",
    DESARROLLO: "Desarrollo",
  };

  const tipoCursoColors: Record<string, string> = {
    INDUCCION: "bg-blue-500/15 text-blue-400",
    GESTION: "bg-purple-500/15 text-purple-400",
    TECNICO: "bg-orange-500/15 text-orange-400",
    HERRAMIENTAS: "bg-green-500/15 text-green-400",
    DESARROLLO: "bg-pink-500/15 text-pink-400",
  };

  const tabs = [
    { key: "courses", label: "Courses", icon: BookOpen },
    { key: "paths", label: "Learning Paths", icon: Route },
    { key: "groups", label: "Groups", icon: Users },
    { key: "assignments", label: "Assignments", icon: Layers },
  ] as const;

  const pageSize = 10;

  // ─── State ──────────────────────────────────────────────────────────────

  let loading = $state(true);
  let metricas = $state<Metricas | null>(null);
  let alertas = $state<{ tipo: string; mensaje: string }[]>([]);

  let reportes = $state<ReporteCurso[]>([]);
  let learningPaths = $state<LearningPath[]>([]);
  let grupos = $state<Grupo[]>([]);
  let asignaciones = $state<Asignacion[]>([]);

  let activeTab = $state<(typeof tabs)[number]["key"]>("courses");

  // Search / sort / pagination
  let searchQuery = $state("");
  let sortKey = $state<keyof ReporteCurso["metricas"] | "titulo">("titulo");
  let sortDir = $state<"asc" | "desc">("asc");
  let currentPage = $state(1);
  let selectedIds = $state<Set<string>>(new Set());

  // Drawer
  let drawerOpen = $state(false);
  let drawerCurso = $state<ReporteCurso | null>(null);
  let drawerStats = $state<CursoStats | null>(null);
  let drawerLoading = $state(false);

  // Modals
  let showDeleteModal = $state(false);
  let deleteTargetIds = $state<string[]>([]);
  let showAssignModal = $state(false);
  let assignCursoIds = $state<string[]>([]);
  let assignUserIds = $state("");
  let assignGroupIds = $state("");
  let assignLoading = $state(false);

  // ─── Derived ────────────────────────────────────────────────────────────

  const filteredCourses = $derived.by(() => {
    let list = [...reportes];
    const q = searchQuery.trim().toLowerCase();
    if (q) list = list.filter((r) => r.curso.titulo.toLowerCase().includes(q));
    list.sort((a, b) => {
      let av: any, bv: any;
      if (sortKey === "titulo") {
        av = a.curso.titulo;
        bv = b.curso.titulo;
      } else {
        av = a.metricas[sortKey] ?? 0;
        bv = b.metricas[sortKey] ?? 0;
      }
      if (typeof av === "string")
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return list;
  });

  const totalPages = $derived(Math.max(1, Math.ceil(filteredCourses.length / pageSize)));
  const pagedCourses = $derived(
    filteredCourses.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  );

  const allSelected = $derived(
    pagedCourses.length > 0 && pagedCourses.every((r) => selectedIds.has(r.curso.id))
  );
  const someSelected = $derived(
    pagedCourses.some((r) => selectedIds.has(r.curso.id)) && !allSelected
  );

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  onMount(() => {
    loadAll();
  });

  async function loadAll() {
    loading = true;
    await Promise.all([
      loadDashboard(),
      loadReportes(),
      loadPaths(),
      loadGroups(),
      loadAssignments(),
    ]);
    loading = false;
  }

  async function loadDashboard() {
    try {
      const data = await api.getAcademyDashboardAdmin();
      metricas = data.metricas ?? null;
      alertas = data.alertas ?? [];
    } catch (e: any) {
      toast.error("Failed to load dashboard");
    }
  }

  async function loadReportes() {
    try {
      const data = await api.getAcademyReportesCursos();
      reportes = data.reportes ?? [];
    } catch (e: any) {
      toast.error("Failed to load courses");
    }
  }

  async function loadPaths() {
    try {
      const data = await api.getAcademyLearningPaths();
      learningPaths = data.learningPaths ?? [];
    } catch (e: any) {
      toast.error("Failed to load learning paths");
    }
  }

  async function loadGroups() {
    try {
      const data = await api.getAcademyGrupos();
      grupos = data.grupos ?? [];
    } catch (e: any) {
      toast.error("Failed to load groups");
    }
  }

  async function loadAssignments() {
    try {
      const data = await api.getAcademyAsignaciones();
      asignaciones = data.asignaciones ?? [];
    } catch (e: any) {
      toast.error("Failed to load assignments");
    }
  }

  // ─── Actions ────────────────────────────────────────────────────────────

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) sortDir = sortDir === "asc" ? "desc" : "asc";
    else {
      sortKey = key;
      sortDir = "asc";
    }
    currentPage = 1;
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
  }

  function toggleSelectAll() {
    const next = new Set(selectedIds);
    if (allSelected) pagedCourses.forEach((r) => next.delete(r.curso.id));
    else pagedCourses.forEach((r) => next.add(r.curso.id));
    selectedIds = next;
  }

  function openDrawer(reporte: ReporteCurso) {
    drawerCurso = reporte;
    drawerOpen = true;
    drawerLoading = true;
    drawerStats = null;
    api
      .getAcademyCursoEstadisticas(reporte.curso.id)
      .then((d) => {
        drawerStats = d.estadisticas ?? null;
      })
      .catch(() => toast.error("Failed to load course stats"))
      .finally(() => {
        drawerLoading = false;
      });
  }

  function closeDrawer() {
    drawerOpen = false;
    drawerCurso = null;
    drawerStats = null;
  }

  function promptDelete(ids: string[]) {
    deleteTargetIds = ids;
    showDeleteModal = true;
  }

  async function confirmDelete() {
    try {
      await Promise.all(deleteTargetIds.map((id) => api.deleteAcademyCurso(id)));
      toast.success(`${deleteTargetIds.length} course(s) deleted`);
      selectedIds = new Set();
      await loadReportes();
      await loadDashboard();
      closeDrawer();
    } catch (e: any) {
      toast.error("Failed to delete course(s)");
    } finally {
      showDeleteModal = false;
      deleteTargetIds = [];
    }
  }

  function openAssignModal(ids?: string[]) {
    assignCursoIds = ids ?? Array.from(selectedIds);
    assignUserIds = "";
    assignGroupIds = "";
    showAssignModal = true;
  }

  async function submitAssign() {
    if (!assignCursoIds.length) return;
    assignLoading = true;
    try {
      await api.createAcademyAsignacionBulk({
        cursoIds: assignCursoIds,
        userIds: assignUserIds
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        grupoIds: assignGroupIds
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      toast.success("Assignments created");
      showAssignModal = false;
      await loadAssignments();
      await loadDashboard();
    } catch (e: any) {
      toast.error("Failed to create assignments");
    } finally {
      assignLoading = false;
    }
  }

  async function deletePath(id: string) {
    if (!confirm("Delete this learning path?")) return;
    try {
      await api.deleteAcademyLearningPath(id);
      toast.success("Learning path deleted");
      await loadPaths();
    } catch {
      toast.error("Failed to delete");
    }
  }

  async function deleteGroup(id: string) {
    if (!confirm("Delete this group?")) return;
    try {
      await api.deleteAcademyGrupo(id);
      toast.success("Group deleted");
      await loadGroups();
    } catch {
      toast.error("Failed to delete");
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  function fmt(n?: number) {
    return n == null ? "—" : String(n);
  }
  function fmtPct(n?: number) {
    return n == null ? "—" : `${Math.round(n)}%`;
  }
  function fmtStar(n?: number) {
    const v = Math.min(5, Math.max(0, Math.round((n ?? 0) * 10) / 10));
    return (
      "★".repeat(Math.floor(v)) +
      (v % 1 >= 0.5 ? "½" : "") +
      "☆".repeat(Math.max(0, 5 - Math.ceil(v)))
    );
  }
  function alertIcon(tipo: string) {
    return tipo === "warning" ? AlertCircle : CheckCircle;
  }
  function alertColor(tipo: string) {
    return tipo === "warning"
      ? "text-kitsuden-amber bg-kitsuden-amber/10"
      : "text-kitsuden-green bg-kitsuden-green/10";
  }
</script>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- HEADER & STATS                                                        -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
<div class="space-y-6 animate-fade-in">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-xl font-bold text-kitsuden-text flex items-center gap-2">
        <GraduationCap class="w-6 h-6 text-kitsuden-accent" />
        Academy LMS
      </h2>
      <p class="text-sm text-kitsuden-subtle mt-0.5">
        Course management, assignments &amp; analytics
      </p>
    </div>
    <a href="/g/kon-academy-lms/grid-courses" class="btn-primary inline-flex items-center gap-2">
      <Plus class="w-4 h-4" /> New Course
    </a>
  </div>

  {#if alertas.length > 0}
    <div class="space-y-2">
      {#each alertas as a}
        {@const Icon = alertIcon(a.tipo)}
        <div class="flex items-center gap-2 px-3 py-2 rounded-lg {alertColor(a.tipo)} text-sm">
          <Icon class="w-4 h-4 shrink-0" />
          <span>{a.mensaje}</span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Stats Row -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    <div class="card p-4 flex items-center gap-3">
      <div class="w-10 h-10 rounded-lg bg-kitsuden-accent/15 flex items-center justify-center">
        <BookOpen class="w-5 h-5 text-kitsuden-accent" />
      </div>
      <div>
        <p class="text-xs text-kitsuden-subtle uppercase tracking-wider">Total Courses</p>
        <p class="text-2xl font-bold text-kitsuden-text">{metricas?.totalCursos ?? 0}</p>
      </div>
    </div>
    <div class="card p-4 flex items-center gap-3">
      <div class="w-10 h-10 rounded-lg bg-purple-500/15 flex items-center justify-center">
        <Users class="w-5 h-5 text-purple-400" />
      </div>
      <div>
        <p class="text-xs text-kitsuden-subtle uppercase tracking-wider">Total Assignments</p>
        <p class="text-2xl font-bold text-kitsuden-text">{metricas?.totalAsignaciones ?? 0}</p>
      </div>
    </div>
    <div class="card p-4 flex items-center gap-3">
      <div class="w-10 h-10 rounded-lg bg-kitsuden-green/15 flex items-center justify-center">
        <TrendingUp class="w-5 h-5 text-kitsuden-green" />
      </div>
      <div class="flex-1">
        <p class="text-xs text-kitsuden-subtle uppercase tracking-wider">Completion Rate</p>
        <div class="flex items-center gap-2 mt-1">
          <p class="text-2xl font-bold text-kitsuden-text">{fmtPct(metricas?.tasaCompletado)}</p>
          <div class="flex-1 h-1.5 bg-kitsuden-bg rounded-full overflow-hidden">
            <div
              class="h-full bg-kitsuden-green rounded-full"
              style="width: {metricas?.tasaCompletado ?? 0}%"
            ></div>
          </div>
        </div>
      </div>
    </div>
    <div class="card p-4 flex items-center gap-3">
      <div class="w-10 h-10 rounded-lg bg-kitsuden-amber/15 flex items-center justify-center">
        <Star class="w-5 h-5 text-kitsuden-amber" />
      </div>
      <div>
        <p class="text-xs text-kitsuden-subtle uppercase tracking-wider">Avg Satisfaction</p>
        <p class="text-2xl font-bold text-kitsuden-text">
          {metricas?.totalEncuestas
            ? ((metricas.totalFeedbacks ?? 0) / (metricas.totalEncuestas || 1)).toFixed(1)
            : "—"}<span class="text-sm text-kitsuden-subtle font-normal"> /5</span>
        </p>
      </div>
    </div>
  </div>

  <!-- Tabs -->
  <div class="border-b border-kitsuden-border">
    <div class="flex items-center gap-1">
      {#each tabs as t}
        <button
          class="px-4 py-2 text-sm font-medium flex items-center gap-1.5 transition-colors border-b-2 {activeTab ===
          t.key
            ? 'text-kitsuden-accent border-kitsuden-accent'
            : 'text-kitsuden-subtle border-transparent hover:text-kitsuden-text hover:border-kitsuden-border'}"
          onclick={() => {
            activeTab = t.key;
            selectedIds = new Set();
            currentPage = 1;
          }}
        >
          <t.icon class="w-4 h-4" />
          {t.label}
        </button>
      {/each}
    </div>
  </div>

  {#if loading}
    <div class="flex justify-center py-20">
      <div
        class="w-6 h-6 border-2 border-kitsuden-accent/30 border-t-kitsuden-accent rounded-full animate-spin"
      ></div>
    </div>
  {:else}
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- COURSES TAB                                                       -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    {#if activeTab === "courses"}
      <div class="space-y-3">
        <!-- Toolbar -->
        <div class="flex items-center gap-3 flex-wrap">
          <div class="relative flex-1 min-w-[200px] max-w-sm">
            <Search
              class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-kitsuden-text-dim"
            />
            <input
              type="text"
              placeholder="Search courses..."
              class="w-full pl-10 pr-4 py-2 bg-kitsuden-bg border border-kitsuden-border rounded-lg text-sm text-kitsuden-text placeholder:text-kitsuden-text-dim focus:outline-none focus:border-kitsuden-accent/50"
              bind:value={searchQuery}
              oninput={() => (currentPage = 1)}
            />
          </div>
          {#if selectedIds.size > 0}
            <div class="flex items-center gap-2 ml-auto">
              <span class="text-xs text-kitsuden-subtle">{selectedIds.size} selected</span>
              <button
                class="btn-secondary text-xs inline-flex items-center gap-1"
                onclick={() => openAssignModal()}
              >
                <Users class="w-3.5 h-3.5" /> Assign
              </button>
              <button
                class="btn-danger text-xs inline-flex items-center gap-1"
                onclick={() => promptDelete(Array.from(selectedIds))}
              >
                <Trash2 class="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          {/if}
        </div>

        <!-- Table -->
        {#if filteredCourses.length === 0}
          <div class="card p-16 text-center">
            <BookOpen class="w-10 h-10 text-kitsuden-text-dim mx-auto mb-3" />
            <p class="text-kitsuden-text-dim">No courses found.</p>
          </div>
        {:else}
          <div class="card overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-left text-sm">
                <thead class="bg-kitsuden-bg sticky top-0 z-10">
                  <tr class="border-b border-kitsuden-border">
                    <th class="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        class="rounded border-kitsuden-border bg-kitsuden-bg text-kitsuden-accent"
                        checked={allSelected}
                        indeterminate={someSelected}
                        onchange={toggleSelectAll}
                      />
                    </th>
                    <th
                      class="px-4 py-3 font-medium text-kitsuden-subtle cursor-pointer select-none"
                      onclick={() => toggleSort("titulo")}
                      >Title {#if sortKey === "titulo"}<span class="text-kitsuden-accent"
                          >{sortDir === "asc" ? "▲" : "▼"}</span
                        >{/if}</th
                    >
                    <th
                      class="px-4 py-3 font-medium text-kitsuden-subtle cursor-pointer select-none"
                      onclick={() => toggleSort("asignaciones")}
                      >Assignments {#if sortKey === "asignaciones"}<span
                          class="text-kitsuden-accent">{sortDir === "asc" ? "▲" : "▼"}</span
                        >{/if}</th
                    >
                    <th
                      class="px-4 py-3 font-medium text-kitsuden-subtle cursor-pointer select-none"
                      onclick={() => toggleSort("completados")}
                      >Completed {#if sortKey === "completados"}<span class="text-kitsuden-accent"
                          >{sortDir === "asc" ? "▲" : "▼"}</span
                        >{/if}</th
                    >
                    <th
                      class="px-4 py-3 font-medium text-kitsuden-subtle cursor-pointer select-none"
                      onclick={() => toggleSort("progresoPromedio")}
                      >Avg Progress {#if sortKey === "progresoPromedio"}<span
                          class="text-kitsuden-accent">{sortDir === "asc" ? "▲" : "▼"}</span
                        >{/if}</th
                    >
                    <th
                      class="px-4 py-3 font-medium text-kitsuden-subtle cursor-pointer select-none"
                      onclick={() => toggleSort("tasaFinalizacion")}
                      >Completion {#if sortKey === "tasaFinalizacion"}<span
                          class="text-kitsuden-accent">{sortDir === "asc" ? "▲" : "▼"}</span
                        >{/if}</th
                    >
                    <th
                      class="px-4 py-3 font-medium text-kitsuden-subtle cursor-pointer select-none"
                      onclick={() => toggleSort("totalEncuestas")}
                      >Surveys {#if sortKey === "totalEncuestas"}<span class="text-kitsuden-accent"
                          >{sortDir === "asc" ? "▲" : "▼"}</span
                        >{/if}</th
                    >
                    <th
                      class="px-4 py-3 font-medium text-kitsuden-subtle cursor-pointer select-none"
                      onclick={() => toggleSort("satisfaccionPromedio")}
                      >Satisfaction {#if sortKey === "satisfaccionPromedio"}<span
                          class="text-kitsuden-accent">{sortDir === "asc" ? "▲" : "▼"}</span
                        >{/if}</th
                    >
                    <th class="px-4 py-3 font-medium text-kitsuden-subtle">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {#each pagedCourses as r}
                    <tr
                      class="border-b border-kitsuden-border hover:bg-kitsuden-bg/50 transition-colors group"
                    >
                      <td class="px-4 py-3">
                        <input
                          type="checkbox"
                          class="rounded border-kitsuden-border bg-kitsuden-bg text-kitsuden-accent"
                          checked={selectedIds.has(r.curso.id)}
                          onchange={() => toggleSelect(r.curso.id)}
                        />
                      </td>
                      <td class="px-4 py-3">
                        <div class="flex items-center gap-2">
                          <span class="font-medium text-kitsuden-text">{r.curso.titulo}</span>
                          <span
                            class="px-1.5 py-0.5 rounded text-[10px] font-medium {tipoCursoColors[
                              r.curso.tipo
                            ] || 'bg-gray-500/15 text-gray-400'}"
                            >{tipoCursoLabels[r.curso.tipo] || r.curso.tipo}</span
                          >
                        </div>
                      </td>
                      <td class="px-4 py-3 text-kitsuden-text">{r.metricas.asignaciones}</td>
                      <td class="px-4 py-3 text-kitsuden-text">{r.metricas.completados}</td>
                      <td class="px-4 py-3">
                        <div class="flex items-center gap-2">
                          <div class="w-16 h-1.5 bg-kitsuden-bg rounded-full overflow-hidden">
                            <div
                              class="h-full bg-kitsuden-accent rounded-full"
                              style="width: {r.metricas.progresoPromedio}%"
                            ></div>
                          </div>
                          <span class="text-xs text-kitsuden-subtle"
                            >{fmtPct(r.metricas.progresoPromedio)}</span
                          >
                        </div>
                      </td>
                      <td class="px-4 py-3 text-kitsuden-text"
                        >{fmtPct(r.metricas.tasaFinalizacion)}</td
                      >
                      <td class="px-4 py-3 text-kitsuden-text">{r.metricas.totalEncuestas}</td>
                      <td class="px-4 py-3 text-kitsuden-amber text-xs"
                        >{fmtStar(r.metricas.satisfaccionPromedio)}</td
                      >
                      <td class="px-4 py-3">
                        <div
                          class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <button
                            class="p-1.5 hover:bg-kitsuden-bg rounded-lg text-kitsuden-text-dim hover:text-kitsuden-accent"
                            title="View stats"
                            onclick={() => openDrawer(r)}><Eye class="w-3.5 h-3.5" /></button
                          >
                          <a
                            href="/academy/courses/{r.curso.id}/edit"
                            class="p-1.5 hover:bg-kitsuden-bg rounded-lg text-kitsuden-text-dim hover:text-kitsuden-text"
                            title="Edit"><Edit2 class="w-3.5 h-3.5" /></a
                          >
                          <button
                            class="p-1.5 hover:bg-kitsuden-bg rounded-lg text-kitsuden-text-dim hover:text-kitsuden-accent-2"
                            title="Delete"
                            onclick={() => promptDelete([r.curso.id])}
                            ><Trash2 class="w-3.5 h-3.5" /></button
                          >
                        </div>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>

            <!-- Pagination -->
            {#if totalPages > 1}
              <div
                class="p-3 border-t border-kitsuden-border bg-kitsuden-card flex items-center justify-between"
              >
                <span class="text-xs text-kitsuden-subtle"
                  >{filteredCourses.length} total · Page {currentPage} of {totalPages}</span
                >
                <div class="flex items-center gap-2">
                  <button
                    class="px-2.5 py-1.5 rounded-lg bg-kitsuden-bg border border-kitsuden-border text-kitsuden-text text-xs hover:border-kitsuden-accent/50 disabled:opacity-40"
                    disabled={currentPage === 1}
                    onclick={() => (currentPage = 1)}><ChevronFirst class="w-3.5 h-3.5" /></button
                  >
                  <button
                    class="px-2.5 py-1.5 rounded-lg bg-kitsuden-bg border border-kitsuden-border text-kitsuden-text text-xs hover:border-kitsuden-accent/50 disabled:opacity-40"
                    disabled={currentPage === 1}
                    onclick={() => currentPage--}><ChevronLeft class="w-3.5 h-3.5" /></button
                  >
                  <span class="text-xs text-kitsuden-subtle px-2">{currentPage} / {totalPages}</span
                  >
                  <button
                    class="px-2.5 py-1.5 rounded-lg bg-kitsuden-bg border border-kitsuden-border text-kitsuden-text text-xs hover:border-kitsuden-accent/50 disabled:opacity-40"
                    disabled={currentPage === totalPages}
                    onclick={() => currentPage++}><ChevronRight class="w-3.5 h-3.5" /></button
                  >
                  <button
                    class="px-2.5 py-1.5 rounded-lg bg-kitsuden-bg border border-kitsuden-border text-kitsuden-text text-xs hover:border-kitsuden-accent/50 disabled:opacity-40"
                    disabled={currentPage === totalPages}
                    onclick={() => (currentPage = totalPages)}
                    ><ChevronLast class="w-3.5 h-3.5" /></button
                  >
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- ═══════════════════════════════════════════════════════════════════ -->
      <!-- LEARNING PATHS TAB                                                -->
      <!-- ═══════════════════════════════════════════════════════════════════ -->
    {:else if activeTab === "paths"}
      <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="bg-kitsuden-bg">
              <tr class="border-b border-kitsuden-border">
                <th class="px-4 py-3 font-medium text-kitsuden-subtle">Name</th>
                <th class="px-4 py-3 font-medium text-kitsuden-subtle">Category</th>
                <th class="px-4 py-3 font-medium text-kitsuden-subtle">Courses</th>
                <th class="px-4 py-3 font-medium text-kitsuden-subtle">Sequential Approval</th>
                <th class="px-4 py-3 font-medium text-kitsuden-subtle">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each learningPaths as lp}
                <tr
                  class="border-b border-kitsuden-border hover:bg-kitsuden-bg/50 transition-colors"
                >
                  <td class="px-4 py-3">
                    <div class="font-medium text-kitsuden-text">{lp.nombre}</div>
                    {#if lp.descripcion}<div class="text-xs text-kitsuden-subtle">
                        {lp.descripcion}
                      </div>{/if}
                  </td>
                  <td class="px-4 py-3 text-kitsuden-subtle">{lp.categoria || "—"}</td>
                  <td class="px-4 py-3 text-kitsuden-text">{lp.totalCursos}</td>
                  <td class="px-4 py-3">
                    <span
                      class="px-2 py-0.5 rounded text-xs font-medium {lp.secuencial
                        ? 'bg-kitsuden-green/15 text-kitsuden-green'
                        : 'bg-kitsuden-text-dim/15 text-kitsuden-subtle'}"
                      >{lp.secuencial ? "Yes" : "No"}</span
                    >
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-1">
                      <a
                        href="/academy/learning-paths/{lp.id}/edit"
                        class="p-1.5 hover:bg-kitsuden-bg rounded-lg text-kitsuden-text-dim hover:text-kitsuden-text"
                        ><Edit2 class="w-3.5 h-3.5" /></a
                      >
                      <button
                        class="p-1.5 hover:bg-kitsuden-bg rounded-lg text-kitsuden-text-dim hover:text-kitsuden-accent-2"
                        onclick={() => deletePath(lp.id)}><Trash2 class="w-3.5 h-3.5" /></button
                      >
                    </div>
                  </td>
                </tr>
              {:else}
                <tr
                  ><td colspan="5" class="px-4 py-12 text-center text-kitsuden-text-dim"
                    ><Route class="w-8 h-8 mx-auto mb-2" />No learning paths found.</td
                  ></tr
                >
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      <!-- ═══════════════════════════════════════════════════════════════════ -->
      <!-- GROUPS TAB                                                        -->
      <!-- ═══════════════════════════════════════════════════════════════════ -->
    {:else if activeTab === "groups"}
      <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="bg-kitsuden-bg">
              <tr class="border-b border-kitsuden-border">
                <th class="px-4 py-3 font-medium text-kitsuden-subtle">Name</th>
                <th class="px-4 py-3 font-medium text-kitsuden-subtle">Members</th>
                <th class="px-4 py-3 font-medium text-kitsuden-subtle">Supervisor</th>
                <th class="px-4 py-3 font-medium text-kitsuden-subtle">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each grupos as g}
                <tr
                  class="border-b border-kitsuden-border hover:bg-kitsuden-bg/50 transition-colors"
                >
                  <td class="px-4 py-3">
                    <div class="font-medium text-kitsuden-text">{g.nombre}</div>
                    {#if g.descripcion}<div class="text-xs text-kitsuden-subtle">
                        {g.descripcion}
                      </div>{/if}
                  </td>
                  <td class="px-4 py-3 text-kitsuden-text">{g.miembros}</td>
                  <td class="px-4 py-3 text-kitsuden-subtle">{g.supervisorPrincipal || "—"}</td>
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-1">
                      <a
                        href="/academy/groups/{g.id}/edit"
                        class="p-1.5 hover:bg-kitsuden-bg rounded-lg text-kitsuden-text-dim hover:text-kitsuden-text"
                        ><Edit2 class="w-3.5 h-3.5" /></a
                      >
                      <button
                        class="p-1.5 hover:bg-kitsuden-bg rounded-lg text-kitsuden-text-dim hover:text-kitsuden-accent-2"
                        onclick={() => deleteGroup(g.id)}><Trash2 class="w-3.5 h-3.5" /></button
                      >
                    </div>
                  </td>
                </tr>
              {:else}
                <tr
                  ><td colspan="4" class="px-4 py-12 text-center text-kitsuden-text-dim"
                    ><Users class="w-8 h-8 mx-auto mb-2" />No groups found.</td
                  ></tr
                >
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      <!-- ═══════════════════════════════════════════════════════════════════ -->
      <!-- ASSIGNMENTS TAB                                                   -->
      <!-- ═══════════════════════════════════════════════════════════════════ -->
    {:else if activeTab === "assignments"}
      <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="bg-kitsuden-bg">
              <tr class="border-b border-kitsuden-border">
                <th class="px-4 py-3 font-medium text-kitsuden-subtle">Course ID</th>
                <th class="px-4 py-3 font-medium text-kitsuden-subtle">User ID</th>
                <th class="px-4 py-3 font-medium text-kitsuden-subtle">Group ID</th>
                <th class="px-4 py-3 font-medium text-kitsuden-subtle">Method</th>
                <th class="px-4 py-3 font-medium text-kitsuden-subtle">Date</th>
              </tr>
            </thead>
            <tbody>
              {#each asignaciones as a}
                <tr
                  class="border-b border-kitsuden-border hover:bg-kitsuden-bg/50 transition-colors"
                >
                  <td class="px-4 py-3 font-mono text-xs text-kitsuden-text">{a.cursoId}</td>
                  <td class="px-4 py-3 font-mono text-xs text-kitsuden-subtle">{a.userId || "—"}</td
                  >
                  <td class="px-4 py-3 font-mono text-xs text-kitsuden-subtle"
                    >{a.grupoId || "—"}</td
                  >
                  <td class="px-4 py-3 text-kitsuden-text">{a.metodo || "—"}</td>
                  <td class="px-4 py-3 text-kitsuden-subtle"
                    >{a.fecha ? new Date(a.fecha).toLocaleDateString("es-ES") : "—"}</td
                  >
                </tr>
              {:else}
                <tr
                  ><td colspan="5" class="px-4 py-12 text-center text-kitsuden-text-dim"
                    ><Layers class="w-8 h-8 mx-auto mb-2" />No assignments found.</td
                  ></tr
                >
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  {/if}
</div>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- COURSE DETAIL DRAWER                                                  -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
{#if drawerOpen}
  <div class="fixed inset-0 z-40 flex justify-end">
    <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" onclick={closeDrawer}></div>
    <div
      class="relative w-full max-w-xl bg-kitsuden-card border-l border-kitsuden-border h-full flex flex-col shadow-2xl"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between px-6 py-4 border-b border-kitsuden-border shrink-0"
      >
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            {#if drawerCurso}
              <span
                class="px-1.5 py-0.5 rounded text-[10px] font-medium {tipoCursoColors[
                  drawerCurso.curso.tipo
                ] || ''}">{tipoCursoLabels[drawerCurso.curso.tipo] || drawerCurso.curso.tipo}</span
              >
            {/if}
          </div>
          <h2 class="text-lg font-bold text-kitsuden-text truncate">
            {drawerCurso?.curso.titulo || "Course"}
          </h2>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button
            class="btn-secondary text-xs inline-flex items-center gap-1"
            onclick={() => drawerCurso && openAssignModal([drawerCurso.curso.id])}
          >
            <Users class="w-3.5 h-3.5" /> Assign
          </button>
          <button
            class="p-2 hover:bg-kitsuden-bg rounded-lg text-kitsuden-text-dim hover:text-kitsuden-text"
            onclick={closeDrawer}><X class="w-5 h-5" /></button
          >
        </div>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-6 space-y-6">
        {#if drawerLoading}
          <div class="flex items-center justify-center h-40">
            <div
              class="w-8 h-8 border-2 border-kitsuden-accent/30 border-t-kitsuden-accent rounded-full animate-spin"
            ></div>
          </div>
        {:else if !drawerStats}
          <div class="text-center text-kitsuden-subtle py-12">No stats available.</div>
        {:else}
          {@const s = drawerStats}
          <!-- Stats Grid -->
          <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
            {#each [{ label: "Assigned", value: s.totalAsignados, icon: Users, color: "text-kitsuden-accent" }, { label: "Completed", value: s.completados, icon: CheckCircle, color: "text-kitsuden-green" }, { label: "In Progress", value: s.enProgreso, icon: TrendingUp, color: "text-kitsuden-amber" }, { label: "Not Started", value: s.noIniciados, icon: AlertCircle, color: "text-kitsuden-accent-2" }, { label: "Completion Rate", value: fmtPct(s.tasaFinalizacion), icon: BarChart3, color: "text-kitsuden-green" }, { label: "Avg Progress", value: fmtPct(s.progresoPromedio), icon: TrendingUp, color: "text-kitsuden-accent" }, { label: "Quiz Passers", value: s.aprobadosQuiz, icon: CheckCircle, color: "text-kitsuden-green" }, { label: "Avg Quiz Score", value: s.puntajePromedioQuiz?.toFixed(1) ?? "—", icon: Star, color: "text-kitsuden-amber" }, { label: "Surveys", value: s.totalEncuestas, icon: Layers, color: "text-kitsuden-accent" }, { label: "Satisfaction", value: fmtStar(s.satisfaccionPromedio), icon: Star, color: "text-kitsuden-amber" }, { label: "Instructor Rating", value: s.expositorPromedio?.toFixed(1) ?? "—", icon: UserCircle, color: "text-purple-400" }] as stat}
              <div
                class="bg-kitsuden-bg border border-kitsuden-border rounded-lg p-3 flex items-center gap-3"
              >
                <div
                  class="w-8 h-8 rounded-lg bg-kitsuden-card flex items-center justify-center shrink-0"
                >
                  <stat.icon class="w-4 h-4 {stat.color}" />
                </div>
                <div>
                  <p class="text-xs text-kitsuden-subtle">{stat.label}</p>
                  <p class="text-sm font-semibold text-kitsuden-text">{stat.value}</p>
                </div>
              </div>
            {/each}
          </div>

          <!-- Mini Bar Chart -->
          <div class="bg-kitsuden-bg border border-kitsuden-border rounded-lg p-4">
            <h3 class="text-sm font-semibold text-kitsuden-text mb-3">Student Distribution</h3>
            <div class="space-y-2">
              {#each [{ label: "Completed", value: s.completados, color: "bg-kitsuden-green" }, { label: "In Progress", value: s.enProgreso, color: "bg-kitsuden-amber" }, { label: "Not Started", value: s.noIniciados, color: "bg-kitsuden-accent-2" }] as bar}
                {@const max = Math.max(s.totalAsignados || 1, 1)}
                <div class="flex items-center gap-3">
                  <span class="w-20 text-xs text-kitsuden-subtle text-right">{bar.label}</span>
                  <div class="flex-1 h-3 bg-kitsuden-card rounded-full overflow-hidden">
                    <div
                      class="h-full {bar.color} rounded-full"
                      style="width: {Math.min(100, ((bar.value || 0) / max) * 100)}%"
                    ></div>
                  </div>
                  <span class="w-8 text-xs text-kitsuden-text text-right">{bar.value}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- DELETE CONFIRMATION MODAL                                           -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
{#if showDeleteModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center">
    <div
      class="absolute inset-0 bg-black/50 backdrop-blur-sm"
      onclick={() => (showDeleteModal = false)}
    ></div>
    <div
      class="relative bg-kitsuden-card border border-kitsuden-border rounded-xl p-6 w-full max-w-sm shadow-2xl"
    >
      <h3 class="text-lg font-bold text-kitsuden-text mb-2">Delete Course(s)?</h3>
      <p class="text-sm text-kitsuden-subtle mb-4">
        This will permanently delete {deleteTargetIds.length} course(s). This action cannot be undone.
      </p>
      <div class="flex items-center justify-end gap-2">
        <button class="btn-secondary" onclick={() => (showDeleteModal = false)}>Cancel</button>
        <button class="btn-danger" onclick={confirmDelete}><Trash2 class="w-4 h-4" /> Delete</button
        >
      </div>
    </div>
  </div>
{/if}

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- ASSIGN MODAL                                                        -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
{#if showAssignModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center">
    <div
      class="absolute inset-0 bg-black/50 backdrop-blur-sm"
      onclick={() => (showAssignModal = false)}
    ></div>
    <div
      class="relative bg-kitsuden-card border border-kitsuden-border rounded-xl p-6 w-full max-w-md shadow-2xl"
    >
      <h3 class="text-lg font-bold text-kitsuden-text mb-1">
        Assign {assignCursoIds.length} Course(s)
      </h3>
      <p class="text-xs text-kitsuden-subtle mb-4">Enter comma-separated IDs</p>
      <div class="space-y-3">
        <div>
          <label for="assignuserids" class="block text-xs text-kitsuden-subtle mb-1">User IDs</label
          >
          <input
            id="assignuserids"
            class="w-full px-3 py-2 bg-kitsuden-bg border border-kitsuden-border rounded-lg text-sm text-kitsuden-text focus:outline-none focus:border-kitsuden-accent/50"
            placeholder="user1, user2..."
            bind:value={assignUserIds}
          />
        </div>
        <div>
          <label for="assigngroupids" class="block text-xs text-kitsuden-subtle mb-1"
            >Group IDs</label
          >
          <input
            id="assigngroupids"
            class="w-full px-3 py-2 bg-kitsuden-bg border border-kitsuden-border rounded-lg text-sm text-kitsuden-text focus:outline-none focus:border-kitsuden-accent/50"
            placeholder="group1, group2..."
            bind:value={assignGroupIds}
          />
        </div>
      </div>
      <div class="flex items-center justify-end gap-2 mt-4">
        <button class="btn-secondary" onclick={() => (showAssignModal = false)}>Cancel</button>
        <button
          class="btn-primary inline-flex items-center gap-2"
          onclick={submitAssign}
          disabled={assignLoading}
        >
          {#if assignLoading}<Loader2 class="w-4 h-4 animate-spin" />{/if}
          <Users class="w-4 h-4" /> Assign
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .card {
    @apply bg-kitsuden-card border border-kitsuden-border rounded-xl;
  }
  .btn-primary {
    @apply px-4 py-2 bg-kitsuden-accent text-black rounded-lg font-medium hover:bg-kitsuden-accent-hover transition-colors disabled:opacity-50;
  }
  .btn-secondary {
    @apply px-3 py-1.5 bg-kitsuden-surface border border-kitsuden-border rounded-lg text-kitsuden-text hover:border-kitsuden-accent/50 transition-colors;
  }
  .btn-danger {
    @apply px-3 py-1.5 bg-kitsuden-accent-2/15 text-kitsuden-accent-2 border border-kitsuden-accent-2/30 rounded-lg font-medium hover:bg-kitsuden-accent-2/25 transition-colors;
  }
</style>
