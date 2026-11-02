<script lang="ts">
  /**
   * Editor de una página del Page Builder (crear y editar).
   *
   * Antes «Guardar» era un `setTimeout` que escribía en consola: no se podía
   * crear ni editar ninguna página desde el panel, y cada página del listado
   * abría este editor vacío. Ahora:
   *
   *   · sin `?id=`  → página nueva: POST /page-builder/pages con sus bloques.
   *   · con `?id=`  → carga la página y, al guardar, PATCH de la página y de
   *     cada bloque por su id. Los bloques conservan su uuid (Inti engancha su
   *     capa editorial a él), así que NO se borran y recrean: se crean los
   *     nuevos, se actualizan los que ya existían y se borran los quitados.
   */
  import { t } from "$lib/i18n";
  import { Save, ArrowLeft, Eye, Trash2 } from "lucide-svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  import { api } from "$lib/api";
  import PageBuilder from "$lib/components/builder/PageBuilder.svelte";
  import type { PageBlock } from "$types/blocks";

  import { goto, replaceState } from "$app/navigation";
  import { page } from "$app/stores";

  const SITIO = import.meta.env.VITE_SITE_URL ?? "";
  const LISTADO = "/g/kon-blocks";

  let paginaId = $state<string | null>($page.url.searchParams.get("id"));
  let pageTitle = $state(t("builderView.newPage"));
  let pageSlug = $state("");
  let blocks = $state<PageBlock[]>([]);
  let saving = $state(false);
  let cargando = $state(false);
  let borrando = $state(false);
  /** Ids de bloque que existen en el servidor (para saber qué crear, actualizar o borrar). */
  let idsGuardados = new Set<string>();

  interface BloqueApi {
    id: string;
    type: PageBlock["type"];
    content?: Record<string, unknown> | null;
    sortOrder?: number;
  }

  function desdeApi(b: BloqueApi, i: number): PageBlock {
    return { id: b.id, type: b.type, data: (b.content ?? {}) as Record<string, unknown>, order: b.sortOrder ?? i };
  }

  onMount(async () => {
    if (!paginaId) return;
    cargando = true;
    try {
      const p = await api.getPage(paginaId);
      pageTitle = p.title ?? "";
      pageSlug = p.slug ?? "";
      const lista: BloqueApi[] = Array.isArray(p.blocks) ? p.blocks : [];
      blocks = lista.map(desdeApi);
      idsGuardados = new Set(lista.map((b) => b.id));
    } catch (err) {
      toast.error(t("builderView.noSePudoCargar"), { description: (err as Error)?.message });
    } finally {
      cargando = false;
    }
  });

  async function handleSave() {
    if (!pageTitle.trim()) {
      toast.error(t("builderView.faltaElTitulo"));
      return;
    }
    saving = true;
    try {
      const slug = pageSlug.trim() || undefined;
      if (!paginaId) {
        const creada = await api.createPage({
          title: pageTitle.trim(),
          slug,
          status: "draft",
          blocks: blocks.map((b, i) => ({ type: b.type, content: b.data, sortOrder: i })),
        });
        paginaId = creada.id;
        pageSlug = creada.slug ?? pageSlug;
        // Recargar los ids reales de los bloques recién creados
        const p = await api.getPage(creada.id);
        const lista: BloqueApi[] = Array.isArray(p.blocks) ? p.blocks : [];
        blocks = lista.map(desdeApi);
        idsGuardados = new Set(lista.map((b) => b.id));
        replaceState(`?id=${creada.id}`, {});
      } else {
        const id = paginaId;
        await api.updatePage(id, { title: pageTitle.trim(), ...(slug ? { slug } : {}) });
        const actuales = new Set(blocks.map((b) => b.id));
        for (const viejo of idsGuardados) {
          if (!actuales.has(viejo)) await api.deleteBlock(id, viejo);
        }
        const nuevosIds = new Set<string>();
        for (const [i, b] of blocks.entries()) {
          if (idsGuardados.has(b.id)) {
            await api.updateBlock(id, b.id, { content: b.data, sortOrder: i });
            nuevosIds.add(b.id);
          } else {
            const creado = await api.createBlock(id, { type: b.type, content: b.data, sortOrder: i });
            if (creado?.id) {
              b.id = creado.id;
              nuevosIds.add(creado.id);
            }
          }
        }
        idsGuardados = nuevosIds;
        blocks = [...blocks];
      }
      toast.success(t("builderView.paginaGuardada"));
    } catch (err) {
      toast.error(t("builderView.noSePudoGuardar"), { description: (err as Error)?.message });
    } finally {
      saving = false;
    }
  }

  async function handleDelete() {
    if (!paginaId || !confirm(t("builderView.confirmarBorrado", { title: pageTitle }))) return;
    borrando = true;
    try {
      await api.deletePage(paginaId);
      toast.success(t("builderView.paginaBorrada"));
      goto(LISTADO);
    } catch (err) {
      toast.error(t("builderView.noSePudoBorrar"), { description: (err as Error)?.message });
    } finally {
      borrando = false;
    }
  }

  function handlePreview() {
    // La página se ve en la web pública; sin VITE_SITE_URL el panel no sabe dónde está.
    window.open(`${SITIO.replace(/\/$/, "")}/${pageSlug}`, "_blank");
  }
</script>

<div class="h-[calc(100vh-4rem)] flex flex-col">
  <div
    class="flex items-center justify-between px-6 py-4 border-b border-kitsuden-border bg-kitsuden-card"
  >
    <div class="flex items-center gap-4">
      <button onclick={() => goto(LISTADO)} class="btn-ghost p-2" aria-label={t("builderView.volver")}>
        <ArrowLeft class="w-5 h-5" />
      </button>
      <div>
        <input
          bind:value={pageTitle}
          type="text"
          placeholder={t("common.pageTitle")}
          class="bg-transparent text-xl font-bold text-kitsuden-text outline-none border-b border-transparent focus:border-kitsuden-accent/50 transition-colors placeholder:text-kitsuden-subtle"
        />
        <div class="flex items-center gap-2 mt-1">
          <span class="text-xs text-kitsuden-subtle">/</span>
          <input
            bind:value={pageSlug}
            type="text"
            placeholder="page-slug"
            class="bg-transparent text-xs text-kitsuden-text-dim outline-none border-b border-transparent focus:border-kitsuden-accent/50 transition-colors placeholder:text-kitsuden-subtle/50 font-mono"
          />
        </div>
      </div>
    </div>

    <div class="flex items-center gap-3">
      {#if paginaId}
        <button
          onclick={handleDelete}
          disabled={borrando}
          class="btn-ghost btn-sm gap-1.5 text-kitsuden-accent-2"
          data-testid="borrar-pagina"
        >
          <Trash2 class="w-4 h-4" /> {t("common.delete")}
        </button>
      {/if}
      <button
        onclick={handlePreview}
        disabled={!SITIO || !paginaId || !pageSlug}
        title={!SITIO ? t("builderView.vistaPreviaSinSitio") : undefined}
        class="btn-ghost btn-sm gap-1.5"
      >
        <Eye class="w-4 h-4" /> {t("common.preview")}
      </button>
      <button onclick={handleSave} disabled={saving || cargando} class="btn-primary btn-sm gap-1.5">
        {#if saving}
          <span
            class="w-4 h-4 border-2 border-kitsuden-bg border-t-transparent rounded-full animate-spin"
          ></span>
          {t("common.saving")}
        {:else}
          <Save class="w-4 h-4" /> {t("builderView.savePage")}
        {/if}
      </button>
    </div>
  </div>

  <div class="flex-1 p-6 overflow-hidden">
    <PageBuilder {blocks} onChange={(b) => (blocks = b)} />
  </div>
</div>
