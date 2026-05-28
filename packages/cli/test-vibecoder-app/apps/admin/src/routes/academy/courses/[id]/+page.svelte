<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { 
    ArrowLeft, Save, BookOpen, Loader2, Trash2, Plus, Check,
    Layers, ChevronDown, ChevronRight, Play, Video, FileText
  } from "lucide-svelte";
  import { api } from "$lib/api";
  import { goto } from "$app/navigation";
  import YouTubeVideoInput from "$lib/components/academy/YouTubeVideoInput.svelte";

  // ═══════════════════════════════════════════════════════════════════════════
  // TYPES
  // ═══════════════════════════════════════════════════════════════════════════
  interface Curso {
    id: string;
    titulo: string;
    descripcion: string | null;
    tipoCurso: "INDUCCION" | "GESTION" | "TECNICO" | "HERRAMIENTAS" | "DESARROLLO";
    activo: boolean;
    colorPortada?: string;
    createdAt: string;
    updatedAt: string;
  }

  interface Modulo {
    id: string;
    titulo: string;
    descripcion?: string;
    orden: number;
    activo: boolean;
    temas?: Tema[];
    expanded?: boolean;
  }

  interface Tema {
    id: string;
    titulo: string;
    contenido: string;
    orden: number;
    videoYoutube?: string;
    videoLocal?: string;
    imagen?: string;
    activo: boolean;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════
  let cursoId = $derived($page.params.id);
  let curso = $state<Curso | null>(null);
  let modulos = $state<Modulo[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let activeTab = $state<"general" | "contenido">("general");

  // Form curso
  let form = $state({
    titulo: "",
    descripcion: "",
    tipoCurso: "INDUCCION" as const,
    colorPortada: "#009c3c",
    activo: true
  });

  // Modal estado
  let showModuloModal = $state(false);
  let editingModulo = $state<Modulo | null>(null);
  let moduloForm = $state({ titulo: "", descripcion: "" });

  let showTemaModal = $state(false);
  let editingTema = $state<Tema | null>(null);
  let temaForm = $state({
    titulo: "",
    contenido: "",
    videoYoutube: "",
    videoInfo: null as any
  });
  let currentModuloId = $state<string | null>(null);

  const tipoCursoOptions = [
    { value: "INDUCCION", label: "Inducción" },
    { value: "GESTION", label: "Gestión" },
    { value: "TECNICO", label: "Técnico" },
    { value: "HERRAMIENTAS", label: "Herramientas" },
    { value: "DESARROLLO", label: "Desarrollo" }
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════
  onMount(async () => {
    await loadCurso();
  });

  async function loadCurso() {
    loading = true;
    error = null;
    
    try {
      const data = await api.get<{ curso: Curso }>(`/academy/cursos/${cursoId}`);
      curso = data.curso;
      
      form = {
        titulo: data.curso.titulo,
        descripcion: data.curso.descripcion || "",
        tipoCurso: data.curso.tipoCurso,
        colorPortada: data.curso.colorPortada || "#009c3c",
        activo: data.curso.activo
      };

      await loadModulos();
    } catch (err: any) {
      error = err.message || "Error al cargar el curso";
    } finally {
      loading = false;
    }
  }

  async function loadModulos() {
    try {
      const data = await api.getAcademyModulosByCurso(cursoId);
      modulos = (data.modulos || []).map((m: Modulo) => ({ ...m, expanded: false }));
    } catch (err) {
      console.error("Error cargando módulos:", err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CURSO
  // ═══════════════════════════════════════════════════════════════════════════
  async function handleSaveCurso(e: Event) {
    e.preventDefault();
    saving = true;
    error = null;

    try {
      await api.put(`/academy/cursos/${cursoId}`, form);
      await loadCurso();
    } catch (err: any) {
      error = err.message || "Error al actualizar el curso";
    } finally {
      saving = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MÓDULOS
  // ═══════════════════════════════════════════════════════════════════════════
  function openModuloModal(modulo?: Modulo) {
    if (modulo) {
      editingModulo = modulo;
      moduloForm = { titulo: modulo.titulo, descripcion: modulo.descripcion || "" };
    } else {
      editingModulo = null;
      moduloForm = { titulo: "", descripcion: "" };
    }
    showModuloModal = true;
  }

  async function handleSaveModulo() {
    if (!moduloForm.titulo.trim()) return;

    try {
      if (editingModulo) {
        await api.put(`/academy/modulos/${editingModulo.id}`, moduloForm);
      } else {
        await api.createAcademyModulo({
          ...moduloForm,
          cursoId,
          orden: modulos.length + 1
        });
      }
      await loadModulos();
      showModuloModal = false;
    } catch (err: any) {
      error = err.message || "Error al guardar el módulo";
    }
  }

  async function handleDeleteModulo(modulo: Modulo) {
    if (!confirm(`¿Eliminar el módulo "${modulo.titulo}"?`)) return;
    try {
      await api.deleteAcademyModulo(modulo.id);
      await loadModulos();
    } catch (err: any) {
      error = err.message || "Error al eliminar el módulo";
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMAS
  // ═══════════════════════════════════════════════════════════════════════════
  function openTemaModal(moduloId: string, tema?: Tema) {
    currentModuloId = moduloId;
    if (tema) {
      editingTema = tema;
      temaForm = {
        titulo: tema.titulo,
        contenido: tema.contenido,
        videoYoutube: tema.videoYoutube || "",
        videoInfo: null
      };
    } else {
      editingTema = null;
      temaForm = { titulo: "", contenido: "", videoYoutube: "", videoInfo: null };
    }
    showTemaModal = true;
  }

  async function handleSaveTema() {
    if (!temaForm.titulo.trim() || !currentModuloId) return;

    try {
      const modulo = modulos.find(m => m.id === currentModuloId);
      const orden = modulo?.temas?.length || 0;

      const payload = {
        titulo: temaForm.titulo,
        contenido: temaForm.contenido,
        moduloId: currentModuloId,
        videoYoutube: temaForm.videoYoutube,
        orden: editingTema ? editingTema.orden : orden + 1
      };

      if (editingTema) {
        await api.updateAcademyTema(editingTema.id, payload);
      } else {
        await api.createAcademyTema(payload);
      }
      
      await loadModulos();
      showTemaModal = false;
    } catch (err: any) {
      error = err.message || "Error al guardar el tema";
    }
  }

  async function handleDeleteTema(tema: Tema) {
    if (!confirm(`¿Eliminar el tema "${tema.titulo}"?`)) return;
    try {
      await api.deleteAcademyTema(tema.id);
      await loadModulos();
    } catch (err: any) {
      error = err.message || "Error al eliminar el tema";
    }
  }

  function toggleModulo(modulo: Modulo) {
    modulo.expanded = !modulo.expanded;
    modulos = [...modulos];
  }

  function goBack() {
    goto("/academy/courses");
  }
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-4">
      <button onclick={goBack} class="p-2 text-gremius-subtle hover:text-gremius-text hover:bg-gremius-surface rounded-lg transition-colors">
        <ArrowLeft class="w-5 h-5" />
      </button>
      <div>
        <h2 class="text-xl font-bold text-gremius-text flex items-center gap-2">
          <BookOpen class="w-6 h-6 text-gremius-cyan" />
          {#if loading}Cargando...{:else if curso}{curso.titulo}{:else}Curso no encontrado{/if}
        </h2>
        <p class="text-sm text-gremius-text-dim mt-0.5">Editar curso y gestionar contenido</p>
      </div>
    </div>
  </div>

  {#if error}
    <div class="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg">{error}</div>
  {/if}

  {#if loading}
    <div class="flex justify-center py-20"><Loader2 class="w-8 h-8 animate-spin text-gremius-cyan" /></div>
  {:else if !curso}
    <div class="card p-16 text-center">
      <p class="text-gremius-text-dim">Curso no encontrado</p>
      <button onclick={goBack} class="btn-primary mt-4">Volver</button>
    </div>
  {:else}
    <!-- Tabs -->
    <div class="border-b border-gremius-border">
      <div class="flex gap-6">
        {#each [{id: "general", label: "General"}, {id: "contenido", label: "Contenido"}] as tab}
          <button
            onclick={() => activeTab = tab.id as any}
            class="pb-3 text-sm font-medium transition-colors relative {activeTab === tab.id ? 'text-gremius-cyan' : 'text-gremius-subtle hover:text-gremius-text'}"
          >
            {tab.label}
            {#if activeTab === tab.id}
              <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-gremius-cyan"></div>
            {/if}
          </button>
        {/each}
      </div>
    </div>

    <!-- TAB: GENERAL -->
    {#if activeTab === "general"}
      <form onsubmit={handleSaveCurso} class="card p-6 space-y-6 max-w-2xl">
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gremius-text mb-1">Título <span class="text-red-400">*</span></label>
            <input bind:value={form.titulo} required class="input w-full" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gremius-text mb-1">Descripción</label>
            <textarea bind:value={form.descripcion} rows={4} class="input w-full resize-none"></textarea>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gremius-text mb-1">Tipo</label>
              <select bind:value={form.tipoCurso} class="input w-full">
                {#each tipoCursoOptions as opt}<option value={opt.value}>{opt.label}</option>{/each}
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gremius-text mb-1">Color</label>
              <input type="color" bind:value={form.colorPortada} class="input w-full h-10" />
            </div>
          </div>
          <div class="flex items-center gap-3">
            <input type="checkbox" bind:checked={form.activo} class="w-4 h-4" />
            <label class="text-sm text-gremius-text">Curso activo</label>
          </div>
        </div>
        <div class="flex justify-end gap-3 pt-4 border-t border-gremius-border">
          <button type="button" onclick={() => activeTab = "contenido"} class="px-4 py-2 text-gremius-text hover:bg-gremius-surface rounded-lg">Ir a Contenido →</button>
          <button type="submit" disabled={saving} class="btn-primary">
            {#if saving}<Loader2 class="w-4 h-4 animate-spin mr-2" />{/if}
            Guardar
          </button>
        </div>
      </form>

    <!-- TAB: CONTENIDO (MÓDULOS Y TEMAS) -->
    {:else}
      <div class="space-y-6">
        <!-- Botón agregar módulo -->
        <div class="flex justify-between items-center">
          <h3 class="text-lg font-semibold text-gremius-text">Módulos del curso</h3>
          <button onclick={() => openModuloModal()} class="btn-primary inline-flex items-center gap-2">
            <Plus class="w-4 h-4" /> Agregar Módulo
          </button>
        </div>

        <!-- Lista de módulos -->
        {#if modulos.length === 0}
          <div class="card p-12 text-center">
            <Layers class="w-12 h-12 text-gremius-subtle mx-auto mb-4" />
            <p class="text-gremius-text-dim">No hay módulos creados aún</p>
            <button onclick={() => openModuloModal()} class="btn-primary mt-4">Crear primer módulo</button>
          </div>
        {:else}
          <div class="space-y-4">
            {#each modulos as modulo (modulo.id)}
              <div class="card overflow-hidden">
                <!-- Módulo header -->
                <div class="flex items-center justify-between p-4 bg-gremius-surface/30">
                  <button onclick={() => toggleModulo(modulo)} class="flex items-center gap-3 flex-1 text-left">
                    {#if modulo.expanded}
                      <ChevronDown class="w-5 h-5 text-gremius-cyan" />
                    {:else}
                      <ChevronRight class="w-5 h-5 text-gremius-subtle" />
                    {/if}
                    <div class="w-8 h-8 rounded-lg bg-gremius-cyan/20 flex items-center justify-center text-sm font-medium text-gremius-cyan">
                      {modulo.orden}
                    </div>
                    <div>
                      <h4 class="font-semibold text-gremius-text">{modulo.titulo}</h4>
                      <p class="text-xs text-gremius-subtle">{modulo.temas?.length || 0} temas</p>
                    </div>
                  </button>
                  <div class="flex items-center gap-2">
                    <button onclick={() => openTemaModal(modulo.id)} class="btn-secondary text-sm inline-flex items-center gap-1">
                      <Plus class="w-3 h-3" /> Tema
                    </button>
                    <button onclick={() => openModuloModal(modulo)} class="p-2 text-gremius-subtle hover:text-gremius-cyan rounded-lg">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    <button onclick={() => handleDeleteModulo(modulo)} class="p-2 text-gremius-subtle hover:text-red-400 rounded-lg">
                      <Trash2 class="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <!-- Temas del módulo -->
                {#if modulo.expanded && modulo.temas}
                  <div class="border-t border-gremius-border">
                    {#if modulo.temas.length === 0}
                      <div class="p-4 text-center text-sm text-gremius-subtle">
                        Sin temas. <button onclick={() => openTemaModal(modulo.id)} class="text-gremius-cyan hover:underline">Agregar uno</button>
                      </div>
                    {:else}
                      <div class="divide-y divide-gremius-border">
                        {#each modulo.temas as tema (tema.id)}
                          <div class="p-4 flex items-center justify-between hover:bg-gremius-surface/20">
                            <div class="flex items-center gap-3">
                              <div class="w-8 h-8 rounded-lg bg-gremius-surface flex items-center justify-center text-gremius-subtle">
                                {#if tema.videoYoutube}
                                  <Video class="w-4 h-4 text-gremius-cyan" />
                                {:else}
                                  <FileText class="w-4 h-4" />
                                {/if}
                              </div>
                              <div>
                                <p class="text-sm font-medium text-gremius-text">{tema.titulo}</p>
                                {#if tema.videoYoutube}
                                  <span class="text-xs text-gremius-cyan inline-flex items-center gap-1">
                                    <Play class="w-3 h-3" /> Video de YouTube
                                  </span>
                                {/if}
                              </div>
                            </div>
                            <div class="flex items-center gap-1">
                              <button onclick={() => openTemaModal(modulo.id, tema)} class="p-2 text-gremius-subtle hover:text-gremius-cyan rounded-lg">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                              </button>
                              <button onclick={() => handleDeleteTema(tema)} class="p-2 text-gremius-subtle hover:text-red-400 rounded-lg">
                                <Trash2 class="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<!-- MODAL: MÓDULO -->
{#if showModuloModal}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="card w-full max-w-md p-6 space-y-4">
      <h3 class="text-lg font-semibold text-gremius-text">
        {editingModulo ? "Editar Módulo" : "Nuevo Módulo"}
      </h3>
      <div>
        <label class="block text-sm font-medium text-gremius-text mb-1">Título <span class="text-red-400">*</span></label>
        <input bind:value={moduloForm.titulo} class="input w-full" />
      </div>
      <div>
        <label class="block text-sm font-medium text-gremius-text mb-1">Descripción</label>
        <textarea bind:value={moduloForm.descripcion} rows={3} class="input w-full resize-none"></textarea>
      </div>
      <div class="flex justify-end gap-3 pt-4 border-t border-gremius-border">
        <button onclick={() => showModuloModal = false} class="px-4 py-2 text-gremius-text hover:bg-gremius-surface rounded-lg">Cancelar</button>
        <button onclick={handleSaveModulo} class="btn-primary">{editingModulo ? "Guardar" : "Crear"}</button>
      </div>
    </div>
  </div>
{/if}

<!-- MODAL: TEMA (CON VIDEO) -->
{#if showTemaModal}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
    <div class="card w-full max-w-2xl p-6 space-y-4 my-8">
      <h3 class="text-lg font-semibold text-gremius-text">
        {editingTema ? "Editar Tema" : "Nuevo Tema"}
      </h3>
      
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gremius-text mb-1">Título <span class="text-red-400">*</span></label>
          <input bind:value={temaForm.titulo} class="input w-full" />
        </div>

        <div>
          <label class="block text-sm font-medium text-gremius-text mb-1">Contenido</label>
          <textarea bind:value={temaForm.contenido} rows={6} class="input w-full resize-none font-mono text-sm" placeholder="Contenido del tema..."></textarea>
        </div>

        <!-- Video de YouTube -->
        <YouTubeVideoInput 
          value={temaForm.videoYoutube}
          onChange={(url, info) => { temaForm.videoYoutube = url; temaForm.videoInfo = info; }}
          label="Video de YouTube (opcional)"
        />

        {#if temaForm.videoYoutube && temaForm.videoInfo}
          <div class="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
            <p class="text-sm text-green-400 flex items-center gap-2">
              <Check class="w-4 h-4" />
              Video vinculado correctamente
            </p>
          </div>
        {/if}
      </div>

      <div class="flex justify-end gap-3 pt-4 border-t border-gremius-border">
        <button onclick={() => showTemaModal = false} class="px-4 py-2 text-gremius-text hover:bg-gremius-surface rounded-lg">Cancelar</button>
        <button onclick={handleSaveTema} class="btn-primary">{editingTema ? "Guardar" : "Crear"}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .input {
    @apply px-4 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan/50;
  }
  .btn-primary {
    @apply px-4 py-2 bg-gremius-cyan text-black rounded-lg font-medium hover:bg-gremius-cyan-hover transition-colors inline-flex items-center;
  }
  .btn-secondary {
    @apply px-3 py-1.5 bg-gremius-surface border border-gremius-border text-gremius-text rounded-lg hover:border-gremius-cyan/50 transition-colors;
  }
  .card {
    @apply bg-gremius-card border border-gremius-border rounded-xl;
  }
</style>
