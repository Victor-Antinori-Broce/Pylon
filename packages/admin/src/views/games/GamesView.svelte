<script lang="ts">
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
  import { onMount } from "svelte";
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
  interface Collection {
    id: string;
    name: string;
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

  let activeTab = $state<"games" | "collections" | "platforms" | "tags">("games");

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
      toast.error("Failed to load games: " + (e.message || "Unknown error"));
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
      toast.error("Failed to load collections: " + (e.message || "Unknown error"));
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
      toast.error("Failed to load platforms: " + (e.message || "Unknown error"));
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
      toast.error("Failed to load tags: " + (e.message || "Unknown error"));
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
      toast.error("Failed to load stats: " + (e.message || "Unknown error"));
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
    if (!confirm("Delete this game?")) return;
    try {
      await api.deleteGame(id);
      toast.success("Game deleted");
      await loadGames();
      await loadStats();
    } catch (e: any) {
      toast.error("Delete failed: " + (e.message || "Unknown error"));
    }
  }
  async function bulkDeleteGames() {
    const ids = Array.from(selectedGameIds);
    if (!ids.length || !confirm(`Delete ${ids.length} games?`)) return;
    try {
      await Promise.all(ids.map((id) => api.deleteGame(id)));
      toast.success(`${ids.length} games deleted`);
      await loadGames();
      await loadStats();
    } catch (e: any) {
      toast.error("Bulk delete failed: " + (e.message || "Unknown error"));
    }
  }
  async function toggleFeatured(game: Game) {
    try {
      await api.updateGame(game.id, { isFeaturedOnHome: !game.isFeaturedOnHome } as any);
      game.isFeaturedOnHome = !game.isFeaturedOnHome;
      toast.success(game.isFeaturedOnHome ? "Featured" : "Unfeatured");
    } catch (e: any) {
      toast.error("Update failed: " + (e.message || "Unknown error"));
    }
  }
  async function bulkToggleFeatured() {
    const ids = Array.from(selectedGameIds);
    if (!ids.length) return;
    try {
      await Promise.all(ids.map((id) => api.updateGame(id, { isFeaturedOnHome: true } as any)));
      toast.success(`${ids.length} games featured`);
      await loadGames();
    } catch (e: any) {
      toast.error("Bulk update failed: " + (e.message || "Unknown error"));
    }
  }

  async function createCollection() {
    if (!newCollectionName.trim() || !newCollectionSlug.trim()) {
      toast.error("Name and slug required");
      return;
    }
    try {
      await api.createGameCollection({
        name: newCollectionName.trim(),
        slug: newCollectionSlug.trim(),
      } as any);
      toast.success("Collection created");
      newCollectionName = "";
      newCollectionSlug = "";
      await loadCollections();
      await loadStats();
    } catch (e: any) {
      toast.error("Create failed: " + (e.message || "Unknown error"));
    }
  }
  async function updateCollection(c: Collection) {
    try {
      await api.updateGameCollection(c.id, {
        name: editCollectionName,
        slug: editCollectionSlug,
        displayOrder: editCollectionOrder,
      } as any);
      toast.success("Collection updated");
      editingCollectionId = null;
      await loadCollections();
    } catch (e: any) {
      toast.error("Update failed: " + (e.message || "Unknown error"));
    }
  }
  async function deleteCollection(id: string) {
    if (!confirm("Delete this collection?")) return;
    try {
      await api.deleteGameCollection(id);
      toast.success("Collection deleted");
      await loadCollections();
      await loadStats();
    } catch (e: any) {
      toast.error("Delete failed: " + (e.message || "Unknown error"));
    }
  }

  async function createPlatform() {
    if (!newPlatformName.trim() || !newPlatformSlug.trim()) {
      toast.error("Name and slug required");
      return;
    }
    try {
      await api.createPlatform({
        name: newPlatformName.trim(),
        slug: newPlatformSlug.trim(),
        manufacturer: newPlatformManufacturer || undefined,
        shortName: newPlatformShort || undefined,
      } as any);
      toast.success("Platform created");
      newPlatformName = "";
      newPlatformSlug = "";
      newPlatformManufacturer = "";
      newPlatformShort = "";
      await loadPlatforms();
    } catch (e: any) {
      toast.error("Create failed: " + (e.message || "Unknown error"));
    }
  }
  async function createTag() {
    if (!newTagName.trim() || !newTagSlug.trim()) {
      toast.error("Name and slug required");
      return;
    }
    try {
      await api.createTag({
        name: newTagName.trim(),
        slug: newTagSlug.trim(),
        color: newTagColor || undefined,
        category: newTagCategory || undefined,
      } as any);
      toast.success("Tag created");
      newTagName = "";
      newTagSlug = "";
      newTagColor = "";
      newTagCategory = "";
      await loadTags();
    } catch (e: any) {
      toast.error("Create failed: " + (e.message || "Unknown error"));
    }
  }

  function statusClasses(status: string) {
    return status === "published"
      ? "bg-gremius-green/10 text-gremius-green border-gremius-green/20"
      : status === "draft"
        ? "bg-gremius-amber/10 text-gremius-amber border-gremius-amber/20"
        : status === "archived"
          ? "bg-gremius-pink/10 text-gremius-pink border-gremius-pink/20"
          : "bg-gremius-muted/20 text-gremius-text-dim border-gremius-border";
  }
  function metacriticClass(s?: number) {
    return s == null
      ? "bg-gremius-muted/20 text-gremius-text-dim"
      : s >= 75
        ? "bg-gremius-green/10 text-gremius-green"
        : s >= 50
          ? "bg-gremius-amber/10 text-gremius-amber"
          : "bg-gremius-pink/10 text-gremius-pink";
  }
  function formatDate(d?: string) {
    return d ? new Date(d).toLocaleDateString() : "-";
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
    editCollectionName = c.name;
    editCollectionSlug = c.slug;
    editCollectionOrder = c.displayOrder ?? 0;
  }
</script>

<div class="space-y-6 animate-fade-in">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-gremius-text flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-xl bg-gradient-to-br from-gremius-cyan/20 to-gremius-purple/20 border border-gremius-cyan/20 flex items-center justify-center"
        >
          <Gamepad2 class="w-5 h-5 text-gremius-cyan" />
        </div>
        Game Library
      </h1>
      <p class="text-sm text-gremius-subtle mt-1">
        Manage games, collections, platforms &amp; tags
      </p>
    </div>
    <a href="/games/new" class="btn-primary inline-flex items-center gap-2"
      ><Plus class="w-4 h-4" /> New Game</a
    >
  </div>

  <!-- Stats Row -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    {#if statsLoading}
      {#each [1, 2, 3, 4] as _}
        <div class="card p-4 animate-pulse">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-gremius-muted/20"></div>
            <div class="space-y-2">
              <div class="h-3 w-16 bg-gremius-muted/20 rounded"></div>
              <div class="h-5 w-10 bg-gremius-muted/20 rounded"></div>
            </div>
          </div>
        </div>
      {/each}
    {:else}
      <div class="card p-4 flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-gremius-cyan/10 flex items-center justify-center">
          <Gamepad2 class="w-4 h-4 text-gremius-cyan" />
        </div>
        <div>
          <p class="text-xs text-gremius-subtle">Total Games</p>
          <p class="text-xl font-semibold text-gremius-text">{totalGames.toLocaleString()}</p>
        </div>
      </div>
      <div class="card p-4 flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-gremius-green/10 flex items-center justify-center">
          <CheckCircle class="w-4 h-4 text-gremius-green" />
        </div>
        <div>
          <p class="text-xs text-gremius-subtle">Published</p>
          <p class="text-xl font-semibold text-gremius-text">{publishedGames.toLocaleString()}</p>
        </div>
      </div>
      <div class="card p-4 flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-gremius-amber/10 flex items-center justify-center">
          <FileEdit class="w-4 h-4 text-gremius-amber" />
        </div>
        <div>
          <p class="text-xs text-gremius-subtle">Drafts</p>
          <p class="text-xl font-semibold text-gremius-text">{draftGames.toLocaleString()}</p>
        </div>
      </div>
      <div class="card p-4 flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
          <Layers class="w-4 h-4 text-purple-400" />
        </div>
        <div>
          <p class="text-xs text-gremius-subtle">Collections</p>
          <p class="text-xl font-semibold text-gremius-text">{totalCollections.toLocaleString()}</p>
        </div>
      </div>
    {/if}
  </div>

  <!-- Tabs -->
  <div class="flex items-center gap-1 border-b border-gremius-border pb-0">
    {#each [{ id: "games" as const, label: "Games" }, { id: "collections" as const, label: "Collections" }, { id: "platforms" as const, label: "Platforms" }, { id: "tags" as const, label: "Tags" }] as t}
      <button
        class="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 {activeTab ===
        t.id
          ? 'text-gremius-cyan border-gremius-cyan bg-gremius-cyan/5'
          : 'text-gremius-text-dim border-transparent hover:text-gremius-text hover:bg-gremius-card'}"
        onclick={() => (activeTab = t.id)}>{t.label}</button
      >
    {/each}
  </div>

  {#if activeTab === "games"}
    <div class="space-y-3 animate-fade-in">
      <div class="flex flex-wrap items-center gap-3">
        <div class="relative flex-1 min-w-[12rem]">
          <Search class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gremius-subtle" />
          <input
            type="text"
            placeholder="Search by title or developer..."
            class="w-full bg-gremius-card border border-gremius-border rounded-lg pl-9 pr-3 py-2 text-sm text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:ring-1 focus:ring-gremius-cyan/50"
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
          class="bg-gremius-card border border-gremius-border rounded-lg px-3 py-2 text-sm text-gremius-text focus:outline-none focus:ring-1 focus:ring-gremius-cyan/50"
          bind:value={gamesStatus}
          onchange={() => {
            gamesPage = 1;
            loadGames();
          }}
        >
          <option value="">All statuses</option><option value="published">Published</option><option
            value="draft">Draft</option
          ><option value="archived">Archived</option>
        </select>
        <button
          class="btn-secondary text-sm"
          onclick={() => {
            gamesPage = 1;
            loadGames();
          }}>Filter</button
        >
        {#if selectedGameIds.size > 0}
          <div class="flex items-center gap-2 ml-auto">
            <span class="text-xs text-gremius-subtle">{selectedGameIds.size} selected</span>
            <button class="btn-ghost text-sm text-gremius-amber" onclick={bulkToggleFeatured}
              ><Star class="w-3.5 h-3.5" /> Feature</button
            >
            <button class="btn-ghost text-sm text-gremius-pink" onclick={bulkDeleteGames}
              ><Trash2 class="w-3.5 h-3.5" /> Delete</button
            >
          </div>
        {/if}
      </div>

      <div class="card overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr
              class="border-b border-gremius-border text-left text-xs text-gremius-subtle uppercase tracking-wider"
            >
              <th class="px-4 py-3 w-10"
                ><input
                  type="checkbox"
                  class="rounded border-gremius-border bg-gremius-bg text-gremius-cyan focus:ring-gremius-cyan/30"
                  checked={selectedGameIds.size === games.length && games.length > 0}
                  onchange={toggleAll}
                /></th
              >
              <th class="px-4 py-3 w-12">Cover</th>
              <th class="px-4 py-3 cursor-pointer select-none" onclick={() => toggleSort("title")}>
                <span class="flex items-center gap-1"
                  >Title {#if gamesSort.field === "title"}{#if gamesSort.dir === "asc"}<ArrowUp
                        class="w-3 h-3"
                      />{:else}<ArrowDown class="w-3 h-3" />{/if}{:else}<ArrowUpDown
                      class="w-3 h-3 opacity-50"
                    />{/if}</span
                >
              </th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3">Developer</th>
              <th
                class="px-4 py-3 cursor-pointer select-none"
                onclick={() => toggleSort("releaseDate")}
              >
                <span class="flex items-center gap-1"
                  >Released {#if gamesSort.field === "releaseDate"}{#if gamesSort.dir === "asc"}<ArrowUp
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
                  >Metacritic {#if gamesSort.field === "metacriticScore"}{#if gamesSort.dir === "asc"}<ArrowUp
                        class="w-3 h-3"
                      />{:else}<ArrowDown class="w-3 h-3" />{/if}{:else}<ArrowUpDown
                      class="w-3 h-3 opacity-50"
                    />{/if}</span
                >
              </th>
              <th class="px-4 py-3 text-center">Featured</th>
              <th class="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#if gamesLoading}
              <tr
                ><td colspan="9" class="px-4 py-12 text-center text-gremius-subtle"
                  ><Loader2 class="w-6 h-6 animate-spin mx-auto" /></td
                ></tr
              >
            {:else if sortedGames().length === 0}
              <tr
                ><td colspan="9" class="px-4 py-12 text-center text-gremius-subtle"
                  ><PackageOpen class="w-8 h-8 mx-auto mb-2 opacity-50" />No games found.</td
                ></tr
              >
            {:else}
              {#each sortedGames() as game (game.id)}
                <tr
                  class="border-b border-gremius-border/50 hover:bg-gremius-muted/10 transition-colors"
                >
                  <td class="px-4 py-2.5"
                    ><input
                      type="checkbox"
                      class="rounded border-gremius-border bg-gremius-bg text-gremius-cyan focus:ring-gremius-cyan/30"
                      checked={selectedGameIds.has(game.id)}
                      onchange={() => toggleSelection(game.id)}
                    /></td
                  >
                  <td class="px-4 py-2.5">
                    <div
                      class="w-8 h-10 rounded bg-gremius-muted/20 overflow-hidden border border-gremius-border"
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
                  <td class="px-4 py-2.5 font-medium text-gremius-text"
                    ><a href={`/games/${game.id}`} class="hover:text-gremius-cyan transition-colors"
                      >{game.title}</a
                    >
                    <div class="text-[10px] text-gremius-subtle">/{game.slug}</div></td
                  >
                  <td class="px-4 py-2.5"
                    ><span
                      class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border {statusClasses(
                        game.status
                      )}">{game.status}</span
                    ></td
                  >
                  <td class="px-4 py-2.5 text-gremius-text-dim">{game.developer || "-"}</td>
                  <td class="px-4 py-2.5 text-gremius-text-dim">{formatDate(game.releaseDate)}</td>
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
                      class="rounded border-gremius-border bg-gremius-bg text-gremius-cyan focus:ring-gremius-cyan/30"
                      checked={!!game.isFeaturedOnHome}
                      onchange={() => toggleFeatured(game)}
                    /></td
                  >
                  <td class="px-4 py-2.5 text-right"
                    ><div class="flex items-center justify-end gap-1">
                      <a href={`/games/${game.id}`} class="btn-ghost p-1.5" title="Edit"
                        ><Pencil class="w-3.5 h-3.5" /></a
                      ><button
                        class="btn-ghost p-1.5 text-gremius-pink hover:text-gremius-pink"
                        title="Delete"
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
        <p class="text-xs text-gremius-subtle">
          Page {gamesPage} of {gamesTotalPages} · {gamesTotal} total
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
        <h3 class="text-sm font-semibold text-gremius-text mb-3 flex items-center gap-2">
          <Layers class="w-4 h-4 text-gremius-cyan" /> New Collection
        </h3>
        <div class="flex flex-wrap items-end gap-3">
          <div class="flex-1 min-w-[12rem]">
            <label for="coll-name" class="block text-xs text-gremius-subtle mb-1">Name</label><input
              id="coll-name"
              type="text"
              class="w-full bg-gremius-bg border border-gremius-border rounded-lg px-3 py-2 text-sm text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:ring-1 focus:ring-gremius-cyan/50"
              placeholder="e.g. Indie Gems"
              value={newCollectionName}
              oninput={(e) => onCollName(e.currentTarget.value)}
            />
          </div>
          <div class="flex-1 min-w-[12rem]">
            <label for="coll-slug" class="block text-xs text-gremius-subtle mb-1">Slug</label><input
              id="coll-slug"
              type="text"
              class="w-full bg-gremius-bg border border-gremius-border rounded-lg px-3 py-2 text-sm text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:ring-1 focus:ring-gremius-cyan/50"
              placeholder="e.g. indie-gems"
              bind:value={newCollectionSlug}
            />
          </div>
          <button class="btn-primary text-sm" onclick={createCollection}
            ><Plus class="w-4 h-4" /> Create</button
          >
        </div>
      </div>

      <div class="card overflow-x-auto">
        <table class="w-full text-sm">
          <thead
            ><tr
              class="border-b border-gremius-border text-left text-xs text-gremius-subtle uppercase tracking-wider"
              ><th class="px-4 py-3">Name</th><th class="px-4 py-3">Slug</th><th class="px-4 py-3"
                >Order</th
              ><th class="px-4 py-3">Games</th><th class="px-4 py-3 text-right">Actions</th></tr
            ></thead
          >
          <tbody>
            {#if collectionsLoading}<tr
                ><td colspan="5" class="px-4 py-12 text-center text-gremius-subtle"
                  ><Loader2 class="w-6 h-6 animate-spin mx-auto" /></td
                ></tr
              >
            {:else if collections.length === 0}<tr
                ><td colspan="5" class="px-4 py-12 text-center text-gremius-subtle"
                  ><PackageOpen class="w-8 h-8 mx-auto mb-2 opacity-50" />No collections yet.</td
                ></tr
              >
            {:else}
              {#each collections as c (c.id)}
                <tr
                  class="border-b border-gremius-border/50 hover:bg-gremius-muted/10 transition-colors"
                >
                  {#if editingCollectionId === c.id}
                    <td class="px-4 py-2.5"
                      ><input
                        class="w-full bg-gremius-bg border border-gremius-border rounded px-2 py-1 text-sm"
                        bind:value={editCollectionName}
                      /></td
                    >
                    <td class="px-4 py-2.5"
                      ><input
                        class="w-full bg-gremius-bg border border-gremius-border rounded px-2 py-1 text-sm"
                        bind:value={editCollectionSlug}
                      /></td
                    >
                    <td class="px-4 py-2.5"
                      ><input
                        type="number"
                        class="w-20 bg-gremius-bg border border-gremius-border rounded px-2 py-1 text-sm"
                        bind:value={editCollectionOrder}
                      /></td
                    >
                    <td class="px-4 py-2.5 text-gremius-text-dim">{c.games?.length ?? 0}</td>
                    <td class="px-4 py-2.5 text-right"
                      ><div class="flex items-center justify-end gap-1">
                        <button
                          class="btn-ghost p-1.5 text-gremius-green"
                          onclick={() => updateCollection(c)}><Save class="w-3.5 h-3.5" /></button
                        ><button
                          class="btn-ghost p-1.5"
                          onclick={() => (editingCollectionId = null)}
                          ><X class="w-3.5 h-3.5" /></button
                        >
                      </div></td
                    >
                  {:else}
                    <td class="px-4 py-2.5 font-medium text-gremius-text">{c.name}</td>
                    <td class="px-4 py-2.5 text-gremius-text-dim">/{c.slug}</td>
                    <td class="px-4 py-2.5 text-gremius-text-dim">{c.displayOrder ?? 0}</td>
                    <td class="px-4 py-2.5 text-gremius-text-dim">{c.games?.length ?? 0}</td>
                    <td class="px-4 py-2.5 text-right"
                      ><div class="flex items-center justify-end gap-1">
                        <button class="btn-ghost p-1.5" onclick={() => startEditColl(c)}
                          ><Pencil class="w-3.5 h-3.5" /></button
                        ><button
                          class="btn-ghost p-1.5 text-gremius-pink hover:text-gremius-pink"
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
        <h3 class="text-sm font-semibold text-gremius-text mb-3 flex items-center gap-2">
          <Monitor class="w-4 h-4 text-gremius-cyan" /> New Platform
        </h3>
        <div class="flex flex-wrap items-end gap-3">
          <div class="flex-1 min-w-[10rem]">
            <label for="plat-name" class="block text-xs text-gremius-subtle mb-1">Name</label><input
              id="plat-name"
              type="text"
              class="w-full bg-gremius-bg border border-gremius-border rounded-lg px-3 py-2 text-sm text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:ring-1 focus:ring-gremius-cyan/50"
              placeholder="e.g. PlayStation 5"
              value={newPlatformName}
              oninput={(e) => onPlatName(e.currentTarget.value)}
            />
          </div>
          <div class="flex-1 min-w-[10rem]">
            <label for="plat-slug" class="block text-xs text-gremius-subtle mb-1">Slug</label><input
              id="plat-slug"
              type="text"
              class="w-full bg-gremius-bg border border-gremius-border rounded-lg px-3 py-2 text-sm text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:ring-1 focus:ring-gremius-cyan/50"
              placeholder="e.g. ps5"
              bind:value={newPlatformSlug}
            />
          </div>
          <div class="flex-1 min-w-[10rem]">
            <label for="plat-mfr" class="block text-xs text-gremius-subtle mb-1">Manufacturer</label
            ><input
              id="plat-mfr"
              type="text"
              class="w-full bg-gremius-bg border border-gremius-border rounded-lg px-3 py-2 text-sm text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:ring-1 focus:ring-gremius-cyan/50"
              placeholder="e.g. Sony"
              bind:value={newPlatformManufacturer}
            />
          </div>
          <div class="w-24">
            <label for="plat-short" class="block text-xs text-gremius-subtle mb-1">Short</label
            ><input
              id="plat-short"
              type="text"
              class="w-full bg-gremius-bg border border-gremius-border rounded-lg px-3 py-2 text-sm text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:ring-1 focus:ring-gremius-cyan/50"
              placeholder="PS5"
              bind:value={newPlatformShort}
            />
          </div>
          <button class="btn-primary text-sm" onclick={createPlatform}
            ><Plus class="w-4 h-4" /> Add</button
          >
        </div>
      </div>

      <div class="card overflow-x-auto">
        <table class="w-full text-sm">
          <thead
            ><tr
              class="border-b border-gremius-border text-left text-xs text-gremius-subtle uppercase tracking-wider"
              ><th class="px-4 py-3">Name</th><th class="px-4 py-3">Slug</th><th class="px-4 py-3"
                >Manufacturer</th
              ><th class="px-4 py-3">Short</th></tr
            ></thead
          >
          <tbody>
            {#if platformsLoading}<tr
                ><td colspan="4" class="px-4 py-12 text-center text-gremius-subtle"
                  ><Loader2 class="w-6 h-6 animate-spin mx-auto" /></td
                ></tr
              >
            {:else if platforms.length === 0}<tr
                ><td colspan="4" class="px-4 py-12 text-center text-gremius-subtle"
                  ><PackageOpen class="w-8 h-8 mx-auto mb-2 opacity-50" />No platforms yet.</td
                ></tr
              >
            {:else}
              {#each platforms as p (p.id)}
                <tr
                  class="border-b border-gremius-border/50 hover:bg-gremius-muted/10 transition-colors"
                  ><td class="px-4 py-2.5 font-medium text-gremius-text">{p.name}</td><td
                    class="px-4 py-2.5 text-gremius-text-dim">/{p.slug}</td
                  ><td class="px-4 py-2.5 text-gremius-text-dim">{p.manufacturer || "-"}</td><td
                    class="px-4 py-2.5 text-gremius-text-dim">{p.shortName || "-"}</td
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
        <h3 class="text-sm font-semibold text-gremius-text mb-3 flex items-center gap-2">
          <Tag class="w-4 h-4 text-gremius-cyan" /> New Tag
        </h3>
        <div class="flex flex-wrap items-end gap-3">
          <div class="flex-1 min-w-[10rem]">
            <label for="tag-name" class="block text-xs text-gremius-subtle mb-1">Name</label><input
              id="tag-name"
              type="text"
              class="w-full bg-gremius-bg border border-gremius-border rounded-lg px-3 py-2 text-sm text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:ring-1 focus:ring-gremius-cyan/50"
              placeholder="e.g. RPG"
              value={newTagName}
              oninput={(e) => onTagName(e.currentTarget.value)}
            />
          </div>
          <div class="flex-1 min-w-[10rem]">
            <label for="tag-slug" class="block text-xs text-gremius-subtle mb-1">Slug</label><input
              id="tag-slug"
              type="text"
              class="w-full bg-gremius-bg border border-gremius-border rounded-lg px-3 py-2 text-sm text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:ring-1 focus:ring-gremius-cyan/50"
              placeholder="e.g. rpg"
              bind:value={newTagSlug}
            />
          </div>
          <div class="w-28">
            <label for="tag-color" class="block text-xs text-gremius-subtle mb-1">Color</label
            ><input
              id="tag-color"
              type="text"
              class="w-full bg-gremius-bg border border-gremius-border rounded-lg px-3 py-2 text-sm text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:ring-1 focus:ring-gremius-cyan/50"
              placeholder="#ff00ff"
              bind:value={newTagColor}
            />
          </div>
          <div class="flex-1 min-w-[10rem]">
            <label for="tag-cat" class="block text-xs text-gremius-subtle mb-1">Category</label
            ><input
              id="tag-cat"
              type="text"
              class="w-full bg-gremius-bg border border-gremius-border rounded-lg px-3 py-2 text-sm text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:ring-1 focus:ring-gremius-cyan/50"
              placeholder="e.g. genre"
              bind:value={newTagCategory}
            />
          </div>
          <button class="btn-primary text-sm" onclick={createTag}
            ><Plus class="w-4 h-4" /> Add</button
          >
        </div>
      </div>

      <div class="card overflow-x-auto">
        <table class="w-full text-sm">
          <thead
            ><tr
              class="border-b border-gremius-border text-left text-xs text-gremius-subtle uppercase tracking-wider"
              ><th class="px-4 py-3">Name</th><th class="px-4 py-3">Slug</th><th class="px-4 py-3"
                >Color</th
              ><th class="px-4 py-3">Category</th></tr
            ></thead
          >
          <tbody>
            {#if tagsLoading}<tr
                ><td colspan="4" class="px-4 py-12 text-center text-gremius-subtle"
                  ><Loader2 class="w-6 h-6 animate-spin mx-auto" /></td
                ></tr
              >
            {:else if tags.length === 0}<tr
                ><td colspan="4" class="px-4 py-12 text-center text-gremius-subtle"
                  ><PackageOpen class="w-8 h-8 mx-auto mb-2 opacity-50" />No tags yet.</td
                ></tr
              >
            {:else}
              {#each tags as t (t.id)}
                <tr
                  class="border-b border-gremius-border/50 hover:bg-gremius-muted/10 transition-colors"
                >
                  <td class="px-4 py-2.5 font-medium text-gremius-text">{t.name}</td>
                  <td class="px-4 py-2.5 text-gremius-text-dim">/{t.slug}</td>
                  <td class="px-4 py-2.5"
                    >{#if t.color}<span class="inline-flex items-center gap-1.5"
                        ><span
                          class="w-3 h-3 rounded-full border border-gremius-border"
                          style={`background-color:${t.color}`}
                        ></span><span class="text-gremius-text-dim">{t.color}</span></span
                      >{:else}<span class="text-gremius-text-dim">-</span>{/if}</td
                  >
                  <td class="px-4 py-2.5 text-gremius-text-dim">{t.category || "-"}</td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
