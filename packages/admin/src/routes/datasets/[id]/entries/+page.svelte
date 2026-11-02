<script lang="ts">
  /**
   * Entradas de un dataset: listar, crear, editar y borrar.
   *
   * Antes esta pantalla reutilizaba el DataExplorer genérico de tablas con
   * `views: []`. Sin vista no había tabla activa, así que «Añadir» no hacía
   * nada (el aviso iba a un toast que nadie pintaba), no salía ninguna columna
   * del esquema, el título era el uuid del dataset y editar o borrar pedían
   * rutas de /api/explorer que no son de datasets. Aquí se usa lo que el
   * dataset ya sabe de sí mismo: su esquema pinta las columnas y el formulario
   * (DynamicForm), y las escrituras van a /api/datasets/:id/entries.
   */
  import { t, localeFormato } from "$lib/i18n";
  import { ArrowLeft, Pencil, Plus, RefreshCw, Trash2 } from "lucide-svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  import { api } from "$lib/api";
  import DynamicForm from "$lib/components/forms/DynamicForm.svelte";
  import Modal from "$lib/components/ui/Modal.svelte";
  import type { FieldDefinition } from "$types/datasets";

  import { page } from "$app/stores";

  interface Entrada {
    id: string;
    title?: string;
    status?: string;
    data?: Record<string, unknown>;
    updatedAt?: string;
  }

  const datasetId = $derived($page.params.id ?? "");

  let nombre = $state("");
  let campos = $state<FieldDefinition[]>([]);
  let entradas = $state<Entrada[]>([]);
  let cargando = $state(true);
  let error = $state<string | null>(null);
  let formularioAbierto = $state(false);
  let editando = $state<Entrada | null>(null);
  let guardando = $state(false);

  const visibles = $derived(
    campos.filter((c) => !c.hidden).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).slice(0, 6)
  );

  async function cargar() {
    cargando = true;
    error = null;
    try {
      const [ds, lista] = await Promise.all([
        api.get<{ name: string; schema?: FieldDefinition[] }>(`/datasets/${datasetId}`),
        api.get<{ docs?: Entrada[] }>(`/datasets/${datasetId}/entries?limit=100`),
      ]);
      nombre = ds.name;
      campos = Array.isArray(ds.schema) ? ds.schema : [];
      entradas = lista.docs ?? [];
    } catch (err) {
      error = (err as Error)?.message ?? String(err);
    } finally {
      cargando = false;
    }
  }

  onMount(cargar);

  function abrirAlta() {
    editando = null;
    formularioAbierto = true;
  }

  function abrirEdicion(e: Entrada) {
    editando = e;
    formularioAbierto = true;
  }

  /** El título de la entrada sale del primer campo de texto con valor. */
  function tituloDe(datos: Record<string, unknown>): string {
    const texto = campos.find((c) => typeof datos[c.key] === "string" && String(datos[c.key]).trim());
    return texto ? String(datos[texto.key]).slice(0, 200) : t("entriesPage.sinTitulo");
  }

  async function guardar(datos: Record<string, unknown>) {
    guardando = true;
    try {
      const cuerpo = { title: tituloDe(datos), data: datos };
      if (editando) {
        await api.patch(`/datasets/${datasetId}/entries/${editando.id}`, cuerpo);
        toast.success(t("entriesPage.entradaActualizada"));
      } else {
        await api.post(`/datasets/${datasetId}/entries`, cuerpo);
        toast.success(t("entriesPage.entradaCreada"));
      }
      formularioAbierto = false;
      editando = null;
      await cargar();
    } catch (err) {
      toast.error(t("entriesPage.noSePudoGuardar"), { description: (err as Error)?.message });
    } finally {
      guardando = false;
    }
  }

  async function borrar(e: Entrada) {
    if (!confirm(t("entriesPage.confirmarBorrado", { title: e.title ?? e.id }))) return;
    try {
      await api.delete(`/datasets/${datasetId}/entries/${e.id}`);
      toast.success(t("entriesPage.entradaBorrada"));
      await cargar();
    } catch (err) {
      toast.error(t("entriesPage.noSePudoBorrar"), { description: (err as Error)?.message });
    }
  }

  function mostrar(valor: unknown): string {
    if (valor === null || valor === undefined || valor === "") return "—";
    if (typeof valor === "boolean") return valor ? t("common.yes") : t("common.no");
    if (typeof valor === "number") return valor.toLocaleString(localeFormato());
    if (typeof valor === "object") return JSON.stringify(valor).slice(0, 60);
    return String(valor).slice(0, 80);
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <a href="/g/kon-datasets" class="btn-ghost p-2" aria-label={t("entriesPage.volver")}>
        <ArrowLeft class="w-5 h-5" />
      </a>
      <div>
        <h2 class="text-xl font-bold text-kitsuden-text">{nombre || t("entriesPage.entradas")}</h2>
        <p class="text-sm text-kitsuden-text-dim mt-0.5">
          {t("entriesPage.registros", { n: entradas.length })}
        </p>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <button class="btn-ghost inline-flex items-center gap-2" onclick={cargar}>
        <RefreshCw class="w-4 h-4" />
        {t("dataExplorer.actualizar")}
      </button>
      <button
        class="btn-primary inline-flex items-center gap-2"
        onclick={abrirAlta}
        disabled={cargando || campos.length === 0}
        data-testid="alta-entrada"
      >
        <Plus class="w-4 h-4" />
        {t("entriesPage.nuevaEntrada")}
      </button>
    </div>
  </div>

  {#if cargando}
    <div class="flex justify-center py-20">
      <div
        class="w-6 h-6 border-2 border-kitsuden-accent/30 border-t-kitsuden-accent rounded-full animate-spin"
      ></div>
    </div>
  {:else if error}
    <div class="card p-6 text-sm text-kitsuden-accent-2">{error}</div>
  {:else if campos.length === 0}
    <div class="card p-16 text-center">
      <p class="text-kitsuden-text-dim">{t("entriesPage.sinCampos")}</p>
      <a href="/datasets/{datasetId}/edit" class="text-sm text-kitsuden-accent hover:underline mt-2 inline-block">
        {t("entriesPage.editarEsquema")}
      </a>
    </div>
  {:else if entradas.length === 0}
    <div class="card p-16 text-center">
      <p class="text-kitsuden-text-dim">{t("dataExplorer.noSeEncontraronRegistros")}</p>
    </div>
  {:else}
    <div class="card overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs uppercase tracking-wider text-kitsuden-subtle">
            {#each visibles as c (c.id)}
              <th class="px-4 py-3 font-medium">{c.label}</th>
            {/each}
            <th class="px-4 py-3 font-medium text-right">{t("common.acciones")}</th>
          </tr>
        </thead>
        <tbody>
          {#each entradas as e (e.id)}
            <tr class="border-t border-kitsuden-border hover:bg-kitsuden-surface/50">
              {#each visibles as c (c.id)}
                <td class="px-4 py-3 text-kitsuden-text">{mostrar(e.data?.[c.key])}</td>
              {/each}
              <td class="px-4 py-3">
                <div class="flex items-center justify-end gap-1">
                  <button
                    class="p-1.5 rounded-lg text-kitsuden-text-dim hover:text-kitsuden-accent hover:bg-kitsuden-accent/10"
                    onclick={() => abrirEdicion(e)}
                    title={t("common.edit")}
                    aria-label={t("common.edit")}
                  >
                    <Pencil class="w-4 h-4" />
                  </button>
                  <button
                    class="p-1.5 rounded-lg text-kitsuden-text-dim hover:text-kitsuden-accent-2 hover:bg-kitsuden-accent-2/10"
                    onclick={() => borrar(e)}
                    title={t("common.delete")}
                    aria-label={t("common.delete")}
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<Modal
  open={formularioAbierto}
  title={editando ? t("entriesPage.editarEntrada") : t("entriesPage.nuevaEntrada")}
  size="lg"
  onClose={() => {
    formularioAbierto = false;
    editando = null;
  }}
>
  {#if formularioAbierto}
    {#key editando?.id ?? "nueva"}
      <DynamicForm
        fields={campos}
        initialData={editando?.data ?? {}}
        submitLabel={guardando ? t("common.saving") : undefined}
        onSubmit={guardar}
        onCancel={() => {
          formularioAbierto = false;
          editando = null;
        }}
      />
    {/key}
  {/if}
</Modal>
