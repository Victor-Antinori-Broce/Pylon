<script lang="ts">
  import { t as tr, localeFormato } from "$lib/i18n";
  import {
    Gamepad2,
    CheckCircle,
    FileEdit,
    Layers,
    Search,
    Plus,
    ChevronLeft,
    ChevronRight,
    Pencil,
    Trash2,
    Loader2,
    Star,
    PackageOpen,
    Monitor,
    Tag,
    Save,
    X,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
  } from "lucide-svelte";
  import { onMount, untrack } from "svelte";
  import { toast } from "svelte-sonner";

  import { api } from "$lib/api";

  interface Game {
    id: string;
    title: string;
    slug: string;
    status: "draft" | "published" | "archived";
    developer?: string;
    publisher?: string;
    releaseDate?: string;
    metacriticScore?: number;
    userRating?: number;
    isFeaturedOnHome?: boolean;
    coverArtId?: string;
  }
  /**
   * ── EL CAMPO SE LLAMA `title`, NO `name` ─────────────────────────────────
   *
   * La columna de la base es `title` y el endpoint lee `body.title`. Aquí se
   * mandaba `name`, así que al crear una colección llegaba `title: undefined`
   * contra una columna `NOT NULL` y la petición reventaba: «Create failed».
   *
   * Y en la otra dirección igual: `GET /collections` devuelve `title` y esta
   * interfaz leía `name`, así que las colecciones existentes salían con el
   * nombre en blanco.
   *
   * Es el mismo fallo que `tags` frente a `tagIds` en el blog. El nombre del
   * campo ES el contrato, y equivocarlo no da un error de tipos: da un 500 en
   * un lado y un hueco vacío en el otro.
   */
  interface Collection {
    id: string;
    title: string;
    slug: string;
    displayOrder?: number;
    games?: any[];
  }
  interface Platform {
    id: string;
    name: string;
    slug: string;
    manufacturer?: string;
    shortName?: string;
  }
  interface TagItem {
    id: string;
    name: string;
    slug: string;
    color?: string;
    category?: string;
  }

  type Pestana = "games" | "collections" | "platforms" | "tags";

  /**
   * Qué vista del kon se ha pulsado en la barra de arriba.
   *
   * Este componente está registrado para DOS vistas —«All Games» y
   * «Collections»— y tiene sus propias pestañas dentro. Sin esto abría siempre
   * en «games», así que pulsar «Collections» enseñaba la lista de juegos: la
   * pestaña se marcaba, el contenido era otro y no fallaba nada.
   *
   * Es opcional porque el componente también se usa desde rutas que no pasan
   * nada; en ese caso se comporta como siempre.
   */
  const { viewId }: { viewId?: string } = $props();

  /** `kon-games-collections`, `collections`, `grimoire-games-collections`… */
  function pestanaDe(id: string | undefined): Pestana {
    if (!id) return "games";
    for (const p of ["collections", "platforms", "tags"] as const) {
      if (id.endsWith(p)) return p;
    }
    return "games";
  }

  // `untrack` en la inicializacion: capturar aqui el valor inicial es
  // DELIBERADO —el $effect de abajo se encarga de los cambios— y decirlo
  // explicitamente evita que parezca el descuido que Svelte avisa.
  let activeTab = $state<Pestana>(untrack(() => pestanaDe(viewId)));

  /**
   * Y si se cambia de vista sin remontar el componente, la pestaña sigue.
   *
   * El router del panel REUTILIZA el componente al navegar entre vistas del
   * mismo kon, así que un valor calculado solo al inicializar se queda con el
   * primero — el mismo fallo que dejó las pestañas del explorador sin recargar.
   *
   * `untrack` sobre la escritura: `activeTab` también lo cambia quien pulsa las
   * pestañas de dentro, y leerlo aquí crearía un bucle que le desharía el clic.
   */
  let ultimaVistaAplicada = $state<string | undefined>(undefined);
  $effect(() => {
    const id = viewId;
    if (id === ultimaVistaAplicada) return;
    ultimaVistaAplicada = id;
    untrack(() => {
      activeTab = pestanaDe(id);
    });
  });

  // Games
  let games = $state<Game[]>([]),
    gamesLoading = $state(true),
    gamesPage = $state(1),
    gamesLimit = $state(15);
  let gamesTotal = $state(0),
    gamesTotalPages = $state(1),
    gamesSearch = $state(""),
    gamesStatus = $state("");
  let gamesSort = $state<{ field: keyof Game; dir: "asc" | "desc" }>({
    field: "title",
    dir: "asc",
  });
  let selectedGameIds = $state<Set<string>>(new Set());

  // Collections
  let collections = $state<Collection[]>([]),
    collectionsLoading = $state(true);
  let newCollectionName = $state(""),
    newCollectionSlug = $state("");
  let editingCollectionId = $state<string | null>(null);
  let editCollectionName = $state(""),
    editCollectionSlug = $state(""),
    editCollectionOrder = $state(0);

  // Platforms
  let platforms = $state<Platform[]>([]),
    platformsLoading = $state(true);
  let newPlatformName = $state(""),
    newPlatformSlug = $state(""),
    newPlatformManufacturer = $state(""),
    newPlatformShort = $state("");

  // Tags
  let tags = $state<TagItem[]>([]),
    tagsLoading = $state(true);
  let newTagName = $state(""),
    newTagSlug = $state(""),
    newTagColor = $state(""),
    newTagCategory = $state("");

  // Stats
  let statsLoading = $state(true),
    totalGames = $state(0),
    publishedGames = $state(0),
    draftGames = $state(0),
    totalCollections = $state(0);

  const sortedGames = $derived(() => {
    const s = [...games];
    const { field, dir } = gamesSort;
    s.sort((a, b) => {
      const av = a[field] ?? "",
        bv = b[field] ?? "";
      return av < bv ? (dir === "asc" ? -1 : 1) : av > bv ? (dir === "asc" ? 1 : -1) : 0;
    });
    return s;
  });

  async function loadGames() {
    gamesLoading = true;
    try {
      const res = await api.getGames({
        limit: gamesLimit,
        page: gamesPage,
        search: gamesSearch || undefined,
        status: gamesStatus || undefined,
      });
      games = res.docs as Game[];
      gamesTotal = res.totalDocs;
      gamesTotalPages = res.totalPages;
      selectedGameIds = new Set();
    } catch (e: any) {
      toast.error(tr("gamesView.failedToLoadGames") + (e.message || tr("gamesView.unknownError")));
    } finally {
      gamesLoading = false;
    }
  }
  async function loadCollections() {
    collectionsLoading = true;
    try {
      const res = await api.getGameCollections();
      collections = (res.docs as Collection[]) || [];
      totalCollections = res.totalDocs ?? collections.length;
    } catch (e: any) {
      toast.error(tr("gamesView.failedToLoadCollections") + (e.message || tr("gamesView.unknownError")));
    } finally {
      collectionsLoading = false;
    }
  }
  async function loadPlatforms() {
    platformsLoading = true;
    try {
      const res = await api.getPlatforms();
      platforms = (res.docs as Platform[]) || [];
    } catch (e: any) {
      toast.error(tr("gamesView.failedToLoadPlatforms") + (e.message || tr("gamesView.unknownError")));
    } finally {
      platformsLoading = false;
    }
  }
  async function loadTags() {
    tagsLoading = true;
    try {
      const res = await api.getTags();
      tags = (res.docs as TagItem[]) || [];
    } catch (e: any) {
      toast.error(tr("gamesView.failedToLoadTags") + (e.message || tr("gamesView.unknownError")));
    } finally {
      tagsLoading = false;
    }
  }
  async function loadStats() {
    statsLoading = true;
    try {
      const [all, pub, draft, colls] = await Promise.all([
        api.getGames({ limit: 1 }),
        api.getGames({ limit: 1, status: "published" }),
        api.getGames({ limit: 1, status: "draft" }),
        api.getGameCollections(),
      ]);
      totalGames = all.totalDocs;
      publishedGames = pub.totalDocs;
      draftGames = draft.totalDocs;
      totalCollections = colls.totalDocs ?? 0;
    } catch (e: any) {
      toast.error(tr("gamesView.failedToLoadStats") + (e.message || tr("gamesView.unknownError")));
    } finally {
      statsLoading = false;
    }
  }

  onMount(() => {
    loadStats();
    loadGames();
    loadCollections();
    loadPlatforms();
    loadTags();
  });

  async function deleteGame(id: string) {
    if (!confirm(tr("gamesView.deleteThisGame"))) return;
    try {
      await api.deleteGame(id);
      toast.success(tr("gamesView.gameDeleted"));
      await loadGames();
      await loadStats();
    } catch (e: any) {
      toast.error(tr("gamesView.deleteFailed") + (e.message || tr("gamesView.unknownError")));
    }
  }
  async function bulkDeleteGames() {
    const ids = Array.from(selectedGameIds);
    if (!ids.length || !confirm(tr("gamesView.deleteGames", { idsCount: ids.length }))) return;
    try {
      await Promise.all(ids.map((id) => api.deleteGame(id)));
      toast.success(tr("gamesView.gamesDeleted", { idsCount: ids.length }));
      await loadGames();
      await loadStats();
    } catch (e: any) {
      toast.error(tr("gamesView.bulkDeleteFailed") + (e.message || tr("gamesView.unknownError")));
    }
  }
  async function toggleFeatured(game: Game) {
    try {
      await api.updateGame(game.id, { isFeaturedOnHome: !game.isFeaturedOnHome } as any);
      game.isFeaturedOnHome = !game.isFeaturedOnHome;
      toast.success(game.isFeaturedOnHome ? tr("gamesView.featured") : tr("gamesView.unfeatured"));
    } catch (e: any) {
      toast.error(tr("gamesView.updateFailed") + (e.message || tr("gamesView.unknownError")));
    }
  }
  async function bulkToggleFeatured() {
    const ids = Array.from(selectedGameIds);
    if (!ids.length) return;
    try {
      await Promise.all(ids.map((id) => api.updateGame(id, { isFeaturedOnHome: true } as any)));
      toast.success(tr("gamesView.gamesFeatured", { idsCount: ids.length }));
      await loadGames();
    } catch (e: any) {
      toast.error(tr("gamesView.bulkUpdateFailed") + (e.message || tr("gamesView.unknownError")));
    }
  }

  async function createCollection() {
    if (!newCollectionName.trim() || !newCollectionSlug.trim()) {
      toast.error(tr("gamesView.nameAndSlugRequired"));
      return;
    }
    try {
      await api.createGameCollection({
        title: newCollectionName.trim(),
        slug: newCollectionSlug.trim(),
      } as any);
      toast.success(tr("gamesView.collectionCreated"));
      newCollectionName = "";
      newCollectionSlug = "";
      await loadCollections();
      await loadStats();
    } catch (e: any) {
      toast.error(tr("gamesView.createFailed") + (e.message || tr("gamesView.unknownError")));
    }
  }
  async function updateCollection(c: Collection) {
    try {
      await api.updateGameCollection(c.id, {
        title: editCollectionName,
        slug: editCollectionSlug,
        displayOrder: editCollectionOrder,
      } as any);
      toast.success(tr("gamesView.collectionUpdated"));
      editingCollectionId = null;
      await loadCollections();
    } catch (e: any) {
      toast.error(tr("gamesView.updateFailed") + (e.message || tr("gamesView.unknownError")));
    }
  }
  async function deleteCollection(id: string) {
    if (!confirm(tr("gamesView.deleteThisCollection"))) return;
    try {
      await api.deleteGameCollection(id);
      toast.success(tr("gamesView.collectionDeleted"));
      await loadCollections();
      await loadStats();
    } catch (e: any) {
      toast.error(tr("gamesView.deleteFailed") + (e.message || tr("gamesView.unknownError")));
    }
  }

  async function createPlatform() {
    if (!newPlatformName.trim() || !newPlatformSlug.trim()) {
      toast.error(tr("gamesView.nameAndSlugRequired"));
      return;
    }
    try {
      await api.createPlatform({
        name: newPlatformName.trim(),
        slug: newPlatformSlug.trim(),
        manufacturer: newPlatformManufacturer || undefined,
        shortName: newPlatformShort || undefined,
      } as any);
      toast.success(tr("gamesView.platformCreated"));
      newPlatformName = "";
      newPlatformSlug = "";
      newPlatformManufacturer = "";
      newPlatformShort = "";
      await loadPlatforms();
    } catch (e: any) {
      toast.error(tr("gamesView.createFailed") + (e.message || tr("gamesView.unknownError")));
    }
  }
  async function createTag() {
    if (!newTagName.trim() || !newTagSlug.trim()) {
      toast.error(tr("gamesView.nameAndSlugRequired"));
      return;
    }
    try {
      await api.createTag({
        name: newTagName.trim(),
        slug: newTagSlug.trim(),
        color: newTagColor || undefined,
        category: newTagCategory || undefined,
      } as any);
      toast.success(tr("gamesView.tagCreated"));
      newTagName = "";
      newTagSlug = "";
      newTagColor = "";
      newTagCategory = "";
      await loadTags();
    } catch (e: any) {
      toast.error(tr("gamesView.createFailed") + (e.message || tr("gamesView.unknownError")));
    }
  }

  function statusClasses(status: string) {
    return status === "published"
      ? "bg-kitsuden-green/10 text-kitsuden-green border-kitsuden-green/20"
      : status === "draft"
        ? "bg-kitsuden-amber/10 text-kitsuden-amber border-kitsuden-amber/20"
        : status === "archived"
          ? "bg-kitsuden-accent-2/10 text-kitsuden-accent-2 border-kitsuden-accent-2/20"
          : "bg-kitsuden-muted/20 text-kitsuden-text-dim border-kitsuden-border";
  }
  function metacriticClass(s?: number) {
    return s == null
      ? "bg-kitsuden-muted/20 text-kitsuden-text-dim"
      : s >= 75
        ? "bg-kitsuden-green/10 text-kitsuden-green"
        : s >= 50
          ? "bg-kitsuden-amber/10 text-kitsuden-amber"
          : "bg-kitsuden-accent-2/10 text-kitsuden-accent-2";
  }
  function formatDate(d?: string) {
    return d ? new Date(d).toLocaleDateString(localeFormato()) : "-";
  }
  function toggleSort(f: keyof Game) {
    gamesSort =
      gamesSort.field === f
        ? { field: f, dir: gamesSort.dir === "asc" ? "desc" : "asc" }
        : { field: f, dir: "asc" };
  }
  function toggleSelection(id: string) {
    const n = new Set(selectedGameIds);
    n.has(id) ? n.delete(id) : n.add(id);
    selectedGameIds = n;
  }
  function toggleAll() {
    selectedGameIds =
      selectedGameIds.size === games.length && games.length > 0
        ? new Set()
        : new Set(games.map((g) => g.id));
  }
  function slugify(v: string) {
    return v
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }
  function onCollName(v: string) {
    newCollectionName = v;
    if (!newCollectionSlug) newCollectionSlug = slugify(v);
  }
  function onPlatName(v: string) {
    newPlatformName = v;
    if (!newPlatformSlug) newPlatformSlug = slugify(v);
  }
  function onTagName(v: string) {
    newTagName = v;
    if (!newTagSlug) newTagSlug = slugify(v);
  }
  function startEditColl(c: Collection) {
    editingCollectionId = c.id;
    editCollectionName = c.title;
    editCollectionSlug = c.slug;
    editCollectionOrder = c.displayOrder ?? 0;
  }
</script>

<div class="space-y-6 animate-fade-in">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-kitsuden-text flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-xl bg-gradient-to-br from-kitsuden-accent/20 to-kitsuden-purple/20 border border-kitsuden-accent/20 flex items-center justify-center"
        >
          <Gamepad2 class="w-5 h-5 text-kitsuden-accent" />
        </div>
        {tr("gamesView.gameLibrary")}
      </h1>
      <p class="text-sm text-kitsuden-subtle mt-1">
        {tr("gamesView.manageGamesCollectionsPlatformsTags")}
      </p>
    </div>
    <!--
      Antes esto llevaba a `/g/kon-games` a secas: navegabas a la pantalla del
      kon y ahí se acababa. Ningún formulario, ningún aviso — desde fuera, un
      botón que no hace nada.

      `?crear=1` lo abre de verdad: el explorador lee ese parámetro al montar,
      abre el alta y lo limpia de la URL para que recargar no lo repita.
    -->
    <a href="/g/kon-games?crear=1" class="btn-primary inline-flex items-center gap-2"
      ><Plus class="w-4 h-4" /> {tr("gamesView.newGame")}</a
    >
  </div>

  <!-- Stats Row -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    {#if statsLoading}
      {#each [1, 2, 3, 4] as _}
        <div class="card p-4 animate-pulse">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-kitsuden-muted/20"></div>
            <div class="space-y-2">
              <div class="h-3 w-16 bg-kitsuden-muted/20 rounded"></div>
              <div class="h-5 w-10 bg-kitsuden-muted/20 rounded"></div>
            </div>
          </div>
        </div>
      {/each}
    {:else}
      <div class="card p-4 flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-kitsuden-accent/10 flex items-center justify-center">
          <Gamepad2 class="w-4 h-4 text-kitsuden-accent" />
        </div>
        <div>
          <p class="text-xs text-kitsuden-subtle">{tr("gamesView.totalGames")}</p>
          <p class="text-xl font-semibold text-kitsuden-text">{totalGames.toLocaleString(localeFormato())}</p>
        </div>
      </div>
      <div class="card p-4 flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-kitsuden-green/10 flex items-center justify-center">
          <CheckCircle class="w-4 h-4 text-kitsuden-green" />
        </div>
        <div>
          <p class="text-xs text-kitsuden-subtle">{tr("common.published")}</p>
          <p class="text-xl font-semibold text-kitsuden-text">{publishedGames.toLocaleString(localeFormato())}</p>
        </div>
      </div>
      <div class="card p-4 flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-kitsuden-amber/10 flex items-center justify-center">
          <FileEdit class="w-4 h-4 text-kitsuden-amber" />
        </div>
        <div>
          <p class="text-xs text-kitsuden-subtle">{tr("gamesView.drafts")}</p>
          <p class="text-xl font-semibold text-kitsuden-text">{draftGames.toLocaleString(localeFormato())}</p>
        </div>
      </div>
      <div class="card p-4 flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
          <Layers class="w-4 h-4 text-purple-400" />
        </div>
        <div>
          <p class="text-xs text-kitsuden-subtle">{tr("gamesView.collections")}</p>
          <p class="text-xl font-semibold text-kitsuden-text">
            {totalCollections.toLocaleString(localeFormato())}
          </p>
        </div>
      </div>
    {/if}
  </div>

  <!-- Tabs -->
  <div class="flex items-center gap-1 border-b border-kitsuden-border pb-0">
    {#each [{ id: "games" as const, label: tr("gamesView.games") }, { id: "collections" as const, label: tr("gamesView.collections2") }, { id: "platforms" as const, label: tr("gamesView.platforms") }, { id: "tags" as const, label: tr("gamesView.tags") }] as t}
      <button
        class="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 {activeTab ===
        t.id
          ? 'text-kitsuden-accent border-kitsuden-accent bg-kitsuden-accent/5'
          : 'text-kitsuden-text-dim border-transparent hover:text-kitsuden-text hover:bg-kitsuden-card'}"
        onclick={() => (activeTab = t.id)}>{t.label}</button
      >
    {/each}
  </div>

  {#if activeTab === "games"}
    <div class="space-y-3 animate-fade-in">
      <div class="flex flex-wrap items-center gap-3">
        <div class="relative flex-1 min-w-[12rem]">
          <Search class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-kitsuden-subtle" />
          <input
            type="text"
            placeholder={tr("gamesView.searchByTitleOrDeveloper")}
            class="w-full bg-kitsuden-card border border-kitsuden-border rounded-lg pl-9 pr-3 py-2 text-sm text-kitsuden-text placeholder:text-kitsuden-subtle focus:outline-none focus:ring-1 focus:ring-kitsuden-accent/50"
            bind:value={gamesSearch}
            onkeydown={(e) => {
              if (e.key === "Enter") {
                gamesPage = 1;
                loadGames();
              }
            }}
          />
        </div>
        <select
          class="bg-kitsuden-card border border-kitsuden-border rounded-lg px-3 py-2 text-sm text-kitsuden-text focus:outline-none focus:ring-1 focus:ring-kitsuden-accent/50"
          bind:value={gamesStatus}
          onchange={() => {
            gamesPage = 1;
            loadGames();
          }}
        >
          <option value="">{tr("gamesView.allStatuses")}</option><option value="published">{tr("common.published")}</option><option
            value="draft">{tr("gamesView.draft")}</option
          ><option value="archived">{tr("common.archived")}</option>
        </select>
        <button
          class="btn-secondary text-sm"
          onclick={() => {
            gamesPage = 1;
            loadGames();
          }}>{tr("common.filter")}</button
        >
        {#if selectedGameIds.size > 0}
          <div class="flex items-center gap-2 ml-auto">
            <span class="text-xs text-kitsuden-subtle">{selectedGameIds.size} {tr("common.selected")}</span>
            <button class="btn-ghost text-sm text-kitsuden-amber" onclick={bulkToggleFeatured}
              ><Star class="w-3.5 h-3.5" /> {tr("gamesView.feature")}</button
            >
            <button class="btn-ghost text-sm text-kitsuden-accent-2" onclick={bulkDeleteGames}
              ><Trash2 class="w-3.5 h-3.5" /> {tr("common.delete")}</button
            >
          </div>
        {/if}
      </div>

      <div class="card overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr
              class="border-b border-kitsuden-border text-left text-xs text-kitsuden-subtle uppercase tracking-wider"
            >
              <th class="px-4 py-3 w-10"
                ><input
                  type="checkbox"
                  class="rounded border-kitsuden-border bg-kitsuden-bg text-kitsuden-accent focus:ring-kitsuden-accent/30"
                  checked={selectedGameIds.size === games.length && games.length > 0}
                  onchange={toggleAll}
                /></th
              >
              <th class="px-4 py-3 w-12">{tr("gamesView.cover")}</th>
              <th class="px-4 py-3 cursor-pointer select-none" onclick={() => toggleSort("title")}>
                <span class="flex items-center gap-1"
                  >{tr("common.title")} {#if gamesSort.field === "title"}{#if gamesSort.dir === "asc"}<ArrowUp
                        class="w-3 h-3"
                      />{:else}<ArrowDown class="w-3 h-3" />{/if}{:else}<ArrowUpDown
                      class="w-3 h-3 opacity-50"
                    />{/if}</span
                >
              </th>
              <th class="px-4 py-3">{tr("common.status")}</th>
              <th class="px-4 py-3">{tr("gamesView.developer")}</th>
              <th
                class="px-4 py-3 cursor-pointer select-none"
                onclick={() => toggleSort("releaseDate")}
              >
                <span class="flex items-center gap-1"
                  >{tr("gamesView.released")} {#if gamesSort.field === "releaseDate"}{#if gamesSort.dir === "asc"}<ArrowUp
                        class="w-3 h-3"
                      />{:else}<ArrowDown class="w-3 h-3" />{/if}{:else}<ArrowUpDown
                      class="w-3 h-3 opacity-50"
                    />{/if}</span
                >
              </th>
              <th
                class="px-4 py-3 cursor-pointer select-none"
                onclick={() => toggleSort("metacriticScore")}
              >
                <span class="flex items-center gap-1"
                  >{tr("gamesView.metacritic")} {#if gamesSort.field === "metacriticScore"}{#if gamesSort.dir === "asc"}<ArrowUp
                        class="w-3 h-3"
                      />{:else}<ArrowDown class="w-3 h-3" />{/if}{:else}<ArrowUpDown
                      class="w-3 h-3 opacity-50"
                    />{/if}</span
                >
              </th>
              <th class="px-4 py-3 text-center">{tr("gamesView.featured")}</th>
              <th class="px-4 py-3 text-right">{tr("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {#if gamesLoading}
              <tr
                ><td colspan="9" class="px-4 py-12 text-center text-kitsuden-subtle"
                  ><Loader2 class="w-6 h-6 animate-spin mx-auto" /></td
                ></tr
              >
            {:else if sortedGames().length === 0}
              <tr
                ><td colspan="9" class="px-4 py-12 text-center text-kitsuden-subtle"
                  ><PackageOpen class="w-8 h-8 mx-auto mb-2 opacity-50" />{tr("gamesView.noGamesFound")}</td
                ></tr
              >
            {:else}
              {#each sortedGames() as game (game.id)}
                <tr
                  class="border-b border-kitsuden-border/50 hover:bg-kitsuden-muted/10 transition-colors"
                >
                  <td class="px-4 py-2.5"
                    ><input
                      type="checkbox"
                      class="rounded border-kitsuden-border bg-kitsuden-bg text-kitsuden-accent focus:ring-kitsuden-accent/30"
                      checked={selectedGameIds.has(game.id)}
                      onchange={() => toggleSelection(game.id)}
                    /></td
                  >
                  <td class="px-4 py-2.5">
                    <div
                      class="w-8 h-10 rounded bg-kitsuden-muted/20 overflow-hidden border border-kitsuden-border"
                    >
                      {#if game.coverArtId}<img
                          src={`/api/media/preset/${game.coverArtId}/thumbnail`}
                          alt={game.title}
                          class="w-full h-full object-cover"
                          loading="lazy"
                        />{:else}<div
                          class="w-full h-full flex items-center justify-center text-[10px]"
                        >
                          🎮
                        </div>{/if}
                    </div>
                  </td>
                  <!--
                    ── ESTOS DOS ENLACES APUNTABAN A `/games/<id>`, QUE NO EXISTE ──

                    No hay ninguna ruta `/games` en el panel. Y no daba un 404
                    visible porque nginx sirve el panel para CUALQUIER ruta
                    —comprobado: `:3001/games/algo` responde 200—, así que se
                    abría el admin en una ruta que su router no conoce.

                    Es el mismo enlace muerto que dejaba `/games/new` en 404 al
                    principio de todo esto: se arregló aquel y quedaron estos,
                    uno por fila.

                    No hay editor de juegos en el panel — los juegos se editan
                    desde la rejilla del kon con el modal genérico—, así que se
                    apunta a la pantalla del kon, que sí existe. Cuando haya un
                    editor propio, estos son los enlaces que hay que cambiar.
                  -->
                  <td class="px-4 py-2.5 font-medium text-kitsuden-text"
                    ><a href={"/g/kon-games"} class="hover:text-kitsuden-accent transition-colors"
                      >{game.title}</a
                    >
                    <div class="text-[10px] text-kitsuden-subtle">/{game.slug}</div></td
                  >
                  <td class="px-4 py-2.5"
                    ><span
                      class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border {statusClasses(
                        game.status
                      )}">{game.status}</span
                    ></td
                  >
                  <td class="px-4 py-2.5 text-kitsuden-text-dim">{game.developer || "-"}</td>
                  <td class="px-4 py-2.5 text-kitsuden-text-dim">{formatDate(game.releaseDate)}</td>
                  <td class="px-4 py-2.5"
                    ><span
                      class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold {metacriticClass(
                        game.metacriticScore
                      )}">{game.metacriticScore ?? "-"}</span
                    ></td
                  >
                  <td class="px-4 py-2.5 text-center"
                    ><input
                      type="checkbox"
                      class="rounded border-kitsuden-border bg-kitsuden-bg text-kitsuden-accent focus:ring-kitsuden-accent/30"
                      checked={!!game.isFeaturedOnHome}
                      onchange={() => toggleFeatured(game)}
                    /></td
                  >
                  <td class="px-4 py-2.5 text-right"
                    ><div class="flex items-center justify-end gap-1">
                      <a href={"/g/kon-games"} class="btn-ghost p-1.5" title={tr("common.edit")}
                        ><Pencil class="w-3.5 h-3.5" /></a
                      ><button
                        class="btn-ghost p-1.5 text-kitsuden-accent-2 hover:text-kitsuden-accent-2"
                        title={tr("common.delete")}
                        onclick={() => deleteGame(game.id)}><Trash2 class="w-3.5 h-3.5" /></button
                      >
                    </div></td
                  >
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>

      <div class="flex items-center justify-between">
        <p class="text-xs text-kitsuden-subtle">
          {tr("gamesView.pageOfTotal", { gamesPage, gamesTotalPages, gamesTotal })}
        </p>
        <div class="flex items-center gap-2">
          <button
            class="btn-secondary text-sm"
            disabled={gamesPage <= 1}
            onclick={() => {
              gamesPage -= 1;
              loadGames();
            }}><ChevronLeft class="w-4 h-4" /></button
          >
          <button
            class="btn-secondary text-sm"
            disabled={gamesPage >= gamesTotalPages}
            onclick={() => {
              gamesPage += 1;
              loadGames();
            }}><ChevronRight class="w-4 h-4" /></button
          >
        </div>
      </div>
    </div>
  {:else if activeTab === "collections"}
    <div class="space-y-4 animate-fade-in">
      <div class="card p-4">
        <h3 class="text-sm font-semibold text-kitsuden-text mb-3 flex items-center gap-2">
          <Layers class="w-4 h-4 text-kitsuden-accent" /> {tr("gamesView.newCollection")}
        </h3>
        <div class="flex flex-wrap items-end gap-3">
          <div class="flex-1 min-w-[12rem]">
            <label for="coll-name" class="block text-xs text-kitsuden-subtle mb-1">{tr("common.name")}</label
            ><input
              id="coll-name"
              type="text"
              class="w-full bg-kitsuden-bg border border-kitsuden-border rounded-lg px-3 py-2 text-sm text-kitsuden-text placeholder:text-kitsuden-subtle focus:outline-none focus:ring-1 focus:ring-kitsuden-accent/50"
              placeholder={tr("gamesView.eGIndieGems")}
              value={newCollectionName}
              oninput={(e) => onCollName(e.currentTarget.value)}
            />
          </div>
          <div class="flex-1 min-w-[12rem]">
            <label for="coll-slug" class="block text-xs text-kitsuden-subtle mb-1">{tr("common.slug")}</label
            ><input
              id="coll-slug"
              type="text"
              class="w-full bg-kitsuden-bg border border-kitsuden-border rounded-lg px-3 py-2 text-sm text-kitsuden-text placeholder:text-kitsuden-subtle focus:outline-none focus:ring-1 focus:ring-kitsuden-accent/50"
              placeholder={tr("gamesView.ejemploSlugEtiqueta")}
              bind:value={newCollectionSlug}
            />
          </div>
          <button class="btn-primary text-sm" onclick={createCollection}
            ><Plus class="w-4 h-4" /> {tr("common.create")}</button
          >
        </div>
      </div>

      <div class="card overflow-x-auto">
        <table class="w-full text-sm">
          <thead
            ><tr
              class="border-b border-kitsuden-border text-left text-xs text-kitsuden-subtle uppercase tracking-wider"
              ><th class="px-4 py-3">{tr("common.name")}</th><th class="px-4 py-3">{tr("common.slug")}</th><th class="px-4 py-3"
                >{tr("gamesView.order")}</th
              ><th class="px-4 py-3">{tr("common.games")}</th><th class="px-4 py-3 text-right">{tr("common.actions")}</th></tr
            ></thead
          >
          <tbody>
            {#if collectionsLoading}<tr
                ><td colspan="5" class="px-4 py-12 text-center text-kitsuden-subtle"
                  ><Loader2 class="w-6 h-6 animate-spin mx-auto" /></td
                ></tr
              >
            {:else if collections.length === 0}<tr
                ><td colspan="5" class="px-4 py-12 text-center text-kitsuden-subtle"
                  ><PackageOpen class="w-8 h-8 mx-auto mb-2 opacity-50" />{tr("gamesView.noCollectionsYet")}</td
                ></tr
              >
            {:else}
              {#each collections as c (c.id)}
                <tr
                  class="border-b border-kitsuden-border/50 hover:bg-kitsuden-muted/10 transition-colors"
                >
                  {#if editingCollectionId === c.id}
                    <td class="px-4 py-2.5"
                      ><input
                        class="w-full bg-kitsuden-bg border border-kitsuden-border rounded px-2 py-1 text-sm"
                        bind:value={editCollectionName}
                      /></td
                    >
                    <td class="px-4 py-2.5"
                      ><input
                        class="w-full bg-kitsuden-bg border border-kitsuden-border rounded px-2 py-1 text-sm"
                        bind:value={editCollectionSlug}
                      /></td
                    >
                    <td class="px-4 py-2.5"
                      ><input
                        type="number"
                        class="w-20 bg-kitsuden-bg border border-kitsuden-border rounded px-2 py-1 text-sm"
                        bind:value={editCollectionOrder}
                      /></td
                    >
                    <td class="px-4 py-2.5 text-kitsuden-text-dim">{c.games?.length ?? 0}</td>
                    <td class="px-4 py-2.5 text-right"
                      ><div class="flex items-center justify-end gap-1">
                        <button
                          class="btn-ghost p-1.5 text-kitsuden-green"
                          onclick={() => updateCollection(c)}><Save class="w-3.5 h-3.5" /></button
                        ><button
                          class="btn-ghost p-1.5"
                          onclick={() => (editingCollectionId = null)}
                          ><X class="w-3.5 h-3.5" /></button
                        >
                      </div></td
                    >
                  {:else}
                    <td class="px-4 py-2.5 font-medium text-kitsuden-text">{c.title}</td>
                    <td class="px-4 py-2.5 text-kitsuden-text-dim">/{c.slug}</td>
                    <td class="px-4 py-2.5 text-kitsuden-text-dim">{c.displayOrder ?? 0}</td>
                    <td class="px-4 py-2.5 text-kitsuden-text-dim">{c.games?.length ?? 0}</td>
                    <td class="px-4 py-2.5 text-right"
                      ><div class="flex items-center justify-end gap-1">
                        <button class="btn-ghost p-1.5" onclick={() => startEditColl(c)}
                          ><Pencil class="w-3.5 h-3.5" /></button
                        ><button
                          class="btn-ghost p-1.5 text-kitsuden-accent-2 hover:text-kitsuden-accent-2"
                          onclick={() => deleteCollection(c.id)}
                          ><Trash2 class="w-3.5 h-3.5" /></button
                        >
                      </div></td
                    >
                  {/if}
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>
  {:else if activeTab === "platforms"}
    <div class="space-y-4 animate-fade-in">
      <div class="card p-4">
        <h3 class="text-sm font-semibold text-kitsuden-text mb-3 flex items-center gap-2">
          <Monitor class="w-4 h-4 text-kitsuden-accent" /> {tr("gamesView.newPlatform")}
        </h3>
        <div class="flex flex-wrap items-end gap-3">
          <div class="flex-1 min-w-[10rem]">
            <label for="plat-name" class="block text-xs text-kitsuden-subtle mb-1">{tr("common.name")}</label
            ><input
              id="plat-name"
              type="text"
              class="w-full bg-kitsuden-bg border border-kitsuden-border rounded-lg px-3 py-2 text-sm text-kitsuden-text placeholder:text-kitsuden-subtle focus:outline-none focus:ring-1 focus:ring-kitsuden-accent/50"
              placeholder={tr("gamesView.eGPlaystation5")}
              value={newPlatformName}
              oninput={(e) => onPlatName(e.currentTarget.value)}
            />
          </div>
          <div class="flex-1 min-w-[10rem]">
            <label for="plat-slug" class="block text-xs text-kitsuden-subtle mb-1">{tr("common.slug")}</label
            ><input
              id="plat-slug"
              type="text"
              class="w-full bg-kitsuden-bg border border-kitsuden-border rounded-lg px-3 py-2 text-sm text-kitsuden-text placeholder:text-kitsuden-subtle focus:outline-none focus:ring-1 focus:ring-kitsuden-accent/50"
              placeholder={tr("gamesView.eGPs5")}
              bind:value={newPlatformSlug}
            />
          </div>
          <div class="flex-1 min-w-[10rem]">
            <label for="plat-mfr" class="block text-xs text-kitsuden-subtle mb-1"
              >{tr("gamesView.manufacturer")}</label
            ><input
              id="plat-mfr"
              type="text"
              class="w-full bg-kitsuden-bg border border-kitsuden-border rounded-lg px-3 py-2 text-sm text-kitsuden-text placeholder:text-kitsuden-subtle focus:outline-none focus:ring-1 focus:ring-kitsuden-accent/50"
              placeholder={tr("gamesView.eGSony")}
              bind:value={newPlatformManufacturer}
            />
          </div>
          <div class="w-24">
            <label for="plat-short" class="block text-xs text-kitsuden-subtle mb-1">{tr("gamesView.short")}</label
            ><input
              id="plat-short"
              type="text"
              class="w-full bg-kitsuden-bg border border-kitsuden-border rounded-lg px-3 py-2 text-sm text-kitsuden-text placeholder:text-kitsuden-subtle focus:outline-none focus:ring-1 focus:ring-kitsuden-accent/50"
              placeholder="PS5"
              bind:value={newPlatformShort}
            />
          </div>
          <button class="btn-primary text-sm" onclick={createPlatform}
            ><Plus class="w-4 h-4" /> {tr("gamesView.add")}</button
          >
        </div>
      </div>

      <div class="card overflow-x-auto">
        <table class="w-full text-sm">
          <thead
            ><tr
              class="border-b border-kitsuden-border text-left text-xs text-kitsuden-subtle uppercase tracking-wider"
              ><th class="px-4 py-3">{tr("common.name")}</th><th class="px-4 py-3">{tr("common.slug")}</th><th class="px-4 py-3"
                >{tr("gamesView.manufacturer")}</th
              ><th class="px-4 py-3">{tr("gamesView.short")}</th></tr
            ></thead
          >
          <tbody>
            {#if platformsLoading}<tr
                ><td colspan="4" class="px-4 py-12 text-center text-kitsuden-subtle"
                  ><Loader2 class="w-6 h-6 animate-spin mx-auto" /></td
                ></tr
              >
            {:else if platforms.length === 0}<tr
                ><td colspan="4" class="px-4 py-12 text-center text-kitsuden-subtle"
                  ><PackageOpen class="w-8 h-8 mx-auto mb-2 opacity-50" />{tr("gamesView.noPlatformsYet")}</td
                ></tr
              >
            {:else}
              {#each platforms as p (p.id)}
                <tr
                  class="border-b border-kitsuden-border/50 hover:bg-kitsuden-muted/10 transition-colors"
                  ><td class="px-4 py-2.5 font-medium text-kitsuden-text">{p.name}</td><td
                    class="px-4 py-2.5 text-kitsuden-text-dim">/{p.slug}</td
                  ><td class="px-4 py-2.5 text-kitsuden-text-dim">{p.manufacturer || "-"}</td><td
                    class="px-4 py-2.5 text-kitsuden-text-dim">{p.shortName || "-"}</td
                  ></tr
                >
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>
  {:else if activeTab === "tags"}
    <div class="space-y-4 animate-fade-in">
      <div class="card p-4">
        <h3 class="text-sm font-semibold text-kitsuden-text mb-3 flex items-center gap-2">
          <Tag class="w-4 h-4 text-kitsuden-accent" /> {tr("gamesView.newTag")}
        </h3>
        <div class="flex flex-wrap items-end gap-3">
          <div class="flex-1 min-w-[10rem]">
            <label for="tag-name" class="block text-xs text-kitsuden-subtle mb-1">{tr("common.name")}</label><input
              id="tag-name"
              type="text"
              class="w-full bg-kitsuden-bg border border-kitsuden-border rounded-lg px-3 py-2 text-sm text-kitsuden-text placeholder:text-kitsuden-subtle focus:outline-none focus:ring-1 focus:ring-kitsuden-accent/50"
              placeholder={tr("gamesView.eGRpg")}
              value={newTagName}
              oninput={(e) => onTagName(e.currentTarget.value)}
            />
          </div>
          <div class="flex-1 min-w-[10rem]">
            <label for="tag-slug" class="block text-xs text-kitsuden-subtle mb-1">{tr("common.slug")}</label><input
              id="tag-slug"
              type="text"
              class="w-full bg-kitsuden-bg border border-kitsuden-border rounded-lg px-3 py-2 text-sm text-kitsuden-text placeholder:text-kitsuden-subtle focus:outline-none focus:ring-1 focus:ring-kitsuden-accent/50"
              placeholder={tr("gamesView.eGRpg2")}
              bind:value={newTagSlug}
            />
          </div>
          <div class="w-28">
            <label for="tag-color" class="block text-xs text-kitsuden-subtle mb-1">{tr("gamesView.color")}</label
            ><input
              id="tag-color"
              type="text"
              class="w-full bg-kitsuden-bg border border-kitsuden-border rounded-lg px-3 py-2 text-sm text-kitsuden-text placeholder:text-kitsuden-subtle focus:outline-none focus:ring-1 focus:ring-kitsuden-accent/50"
              placeholder="#ff00ff"
              bind:value={newTagColor}
            />
          </div>
          <div class="flex-1 min-w-[10rem]">
            <label for="tag-cat" class="block text-xs text-kitsuden-subtle mb-1">{tr("common.category")}</label
            ><input
              id="tag-cat"
              type="text"
              class="w-full bg-kitsuden-bg border border-kitsuden-border rounded-lg px-3 py-2 text-sm text-kitsuden-text placeholder:text-kitsuden-subtle focus:outline-none focus:ring-1 focus:ring-kitsuden-accent/50"
              placeholder={tr("gamesView.eGGenre")}
              bind:value={newTagCategory}
            />
          </div>
          <button class="btn-primary text-sm" onclick={createTag}
            ><Plus class="w-4 h-4" /> {tr("gamesView.add")}</button
          >
        </div>
      </div>

      <div class="card overflow-x-auto">
        <table class="w-full text-sm">
          <thead
            ><tr
              class="border-b border-kitsuden-border text-left text-xs text-kitsuden-subtle uppercase tracking-wider"
              ><th class="px-4 py-3">{tr("common.name")}</th><th class="px-4 py-3">{tr("common.slug")}</th><th class="px-4 py-3"
                >{tr("gamesView.color")}</th
              ><th class="px-4 py-3">{tr("common.category")}</th></tr
            ></thead
          >
          <tbody>
            {#if tagsLoading}<tr
                ><td colspan="4" class="px-4 py-12 text-center text-kitsuden-subtle"
                  ><Loader2 class="w-6 h-6 animate-spin mx-auto" /></td
                ></tr
              >
            {:else if tags.length === 0}<tr
                ><td colspan="4" class="px-4 py-12 text-center text-kitsuden-subtle"
                  ><PackageOpen class="w-8 h-8 mx-auto mb-2 opacity-50" />{tr("gamesView.noTagsYet")}</td
                ></tr
              >
            {:else}
              {#each tags as t (t.id)}
                <tr
                  class="border-b border-kitsuden-border/50 hover:bg-kitsuden-muted/10 transition-colors"
                >
                  <td class="px-4 py-2.5 font-medium text-kitsuden-text">{t.name}</td>
                  <td class="px-4 py-2.5 text-kitsuden-text-dim">/{t.slug}</td>
                  <td class="px-4 py-2.5"
                    >{#if t.color}<span class="inline-flex items-center gap-1.5"
                        ><span
                          class="w-3 h-3 rounded-full border border-kitsuden-border"
                          style={`background-color:${t.color}`}
                        ></span><span class="text-kitsuden-text-dim">{t.color}</span></span
                      >{:else}<span class="text-kitsuden-text-dim">-</span>{/if}</td
                  >
                  <td class="px-4 py-2.5 text-kitsuden-text-dim">{t.category || "-"}</td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
