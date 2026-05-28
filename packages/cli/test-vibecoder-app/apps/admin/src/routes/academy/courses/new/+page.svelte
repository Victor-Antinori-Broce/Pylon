<script lang="ts">
  import { onMount } from "svelte";
  import { 
    ArrowLeft, 
    Save,
    BookOpen,
    Loader2
  } from "lucide-svelte";
  import { api } from "$lib/api";
  import { goto } from "$app/navigation";

  interface CursoForm {
    titulo: string;
    descripcion: string;
    tipoCurso: "INDUCCION" | "GESTION" | "TECNICO" | "HERRAMIENTAS" | "DESARROLLO";
    colorPortada: string;
    duracionHoras: number | null;
    fechaInicio: string;
    fechaFin: string;
    activo: boolean;
  }

  let form = $state<CursoForm>({
    titulo: "",
    descripcion: "",
    tipoCurso: "INDUCCION",
    colorPortada: "#009c3c",
    duracionHoras: null,
    fechaInicio: "",
    fechaFin: "",
    activo: true
  });

  let saving = $state(false);
  let error = $state<string | null>(null);

  const tipoCursoOptions = [
    { value: "INDUCCION", label: "Inducción" },
    { value: "GESTION", label: "Gestión" },
    { value: "TECNICO", label: "Técnico" },
    { value: "HERRAMIENTAS", label: "Herramientas" },
    { value: "DESARROLLO", label: "Desarrollo" }
  ];

  function goBack() {
    goto("/academy/courses");
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    saving = true;
    error = null;

    try {
      // Preparar datos para el API
      const payload: any = {
        titulo: form.titulo,
        descripcion: form.descripcion,
        tipoCurso: form.tipoCurso,
        colorPortada: form.colorPortada,
        activo: form.activo
      };
      
      // Solo incluir duracionHoras si tiene valor
      if (form.duracionHoras && form.duracionHoras > 0) {
        payload.duracionHoras = form.duracionHoras;
      }
      
      // Convertir fechas a ISO si existen
      if (form.fechaInicio) {
        payload.fechaInicio = new Date(form.fechaInicio).toISOString();
      }
      if (form.fechaFin) {
        payload.fechaFin = new Date(form.fechaFin).toISOString();
      }
      
      await api.post("/academy/cursos", payload);
      goto("/academy/courses");
    } catch (err: any) {
      console.error("Failed to create course:", err);
      error = err.message || "Error al crear el curso";
      saving = false;
    }
  }
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex items-center gap-4">
    <button 
      onclick={goBack}
      class="p-2 text-gremius-subtle hover:text-gremius-text hover:bg-gremius-surface rounded-lg transition-colors"
    >
      <ArrowLeft class="w-5 h-5" />
    </button>
    <div>
      <h2 class="text-xl font-bold text-gremius-text flex items-center gap-2">
        <BookOpen class="w-6 h-6 text-gremius-cyan" />
        Nuevo Curso
      </h2>
      <p class="text-sm text-gremius-text-dim mt-0.5">
        Crea un nuevo curso para la plataforma
      </p>
    </div>
  </div>

  {#if error}
    <div class="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg">
      {error}
    </div>
  {/if}

  <form onsubmit={handleSubmit} class="card p-6 space-y-6 max-w-2xl">
    <div class="space-y-4">
      <!-- Título -->
      <div>
        <label for="titulo" class="block text-sm font-medium text-gremius-text mb-1">
          Título <span class="text-red-400">*</span>
        </label>
        <input
          id="titulo"
          type="text"
          bind:value={form.titulo}
          required
          placeholder="Ej: Introducción a la empresa"
          class="w-full px-4 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan/50"
        />
      </div>

      <!-- Descripción -->
      <div>
        <label for="descripcion" class="block text-sm font-medium text-gremius-text mb-1">
          Descripción
        </label>
        <textarea
          id="descripcion"
          bind:value={form.descripcion}
          rows={4}
          placeholder="Describe el contenido y objetivos del curso..."
          class="w-full px-4 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan/50 resize-none"
        ></textarea>
      </div>

      <!-- Tipo de Curso -->
      <div>
        <label for="tipoCurso" class="block text-sm font-medium text-gremius-text mb-1">
          Tipo de Curso
        </label>
        <select
          id="tipoCurso"
          bind:value={form.tipoCurso}
          class="w-full px-4 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-gremius-text focus:outline-none focus:border-gremius-cyan/50"
        >
          {#each tipoCursoOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>

      <!-- Color de Portada -->
      <div>
        <label for="colorPortada" class="block text-sm font-medium text-gremius-text mb-1">
          Color de Portada
        </label>
        <div class="flex items-center gap-3">
          <input
            id="colorPortada"
            type="color"
            bind:value={form.colorPortada}
            class="w-12 h-10 bg-gremius-surface border border-gremius-border rounded cursor-pointer"
          />
          <input
            type="text"
            bind:value={form.colorPortada}
            placeholder="#009c3c"
            class="flex-1 px-4 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-gremius-text focus:outline-none focus:border-gremius-cyan/50"
          />
        </div>
      </div>

      <!-- Duración en Horas -->
      <div>
        <label for="duracion" class="block text-sm font-medium text-gremius-text mb-1">
          Duración (horas)
        </label>
        <input
          id="duracion"
          type="number"
          bind:value={form.duracionHoras}
          min="0"
          step="0.5"
          placeholder="Ej: 8"
          class="w-full px-4 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan/50"
        />
      </div>

      <!-- Fechas -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label for="fechaInicio" class="block text-sm font-medium text-gremius-text mb-1">
            Fecha Inicio
          </label>
          <input
            id="fechaInicio"
            type="date"
            bind:value={form.fechaInicio}
            class="w-full px-4 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-gremius-text focus:outline-none focus:border-gremius-cyan/50"
          />
        </div>
        <div>
          <label for="fechaFin" class="block text-sm font-medium text-gremius-text mb-1">
            Fecha Fin
          </label>
          <input
            id="fechaFin"
            type="date"
            bind:value={form.fechaFin}
            class="w-full px-4 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-gremius-text focus:outline-none focus:border-gremius-cyan/50"
          />
        </div>
      </div>

      <!-- Activo -->
      <div class="flex items-center gap-3">
        <input
          id="activo"
          type="checkbox"
          bind:checked={form.activo}
          class="w-4 h-4 rounded border-gremius-border bg-gremius-surface text-gremius-cyan focus:ring-gremius-cyan/50"
        />
        <label for="activo" class="text-sm text-gremius-text">
          Curso activo (visible para los usuarios)
        </label>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex items-center justify-end gap-3 pt-4 border-t border-gremius-border">
      <button
        type="button"
        onclick={goBack}
        class="px-4 py-2 text-gremius-text hover:bg-gremius-surface rounded-lg transition-colors"
      >
        Cancelar
      </button>
      <button
        type="submit"
        disabled={saving}
        class="btn-primary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {#if saving}
          <Loader2 class="w-4 h-4 animate-spin" />
          Creando...
        {:else}
          <Save class="w-4 h-4" />
          Crear Curso
        {/if}
      </button>
    </div>
  </form>
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
