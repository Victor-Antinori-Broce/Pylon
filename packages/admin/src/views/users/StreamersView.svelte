<script lang="ts">
  import { toast } from "svelte-sonner";
  import { api } from "$lib/api";
  import {
    Tv,
    Users,
    Radio,
    Eye,
    TrendingUp,
    Plus,
    Search,
    ChevronLeft,
    ChevronRight,
    Pencil,
    Trash2,
    X,
    Loader2,
  } from "lucide-svelte";

  interface Streamer {
    id: string;
    displayName: string;
    slug: string;
    platform: "twitch" | "youtube" | "kick" | "other";
    channelId: string;
    channelUrl?: string;
    bio?: string;
    avatarId?: string;
    isLive?: boolean;
    viewerCount?: number;
    followerCount?: number;
    currentStreamTitle?: string;
    lastSyncedAt?: string;
    createdAt: string;
    updatedAt: string;
  }

  let streamers = $state<Streamer[]>([]);
  let loading = $state(false);
  let totalDocs = $state(0);
  let totalPages = $state(1);
  let page = $state(1);
  const limit = 20;

  let search = $state("");
  let platformFilter = $state<"" | "twitch" | "youtube" | "kick" | "other">("");
  let liveOnly = $state(false);
  let sortBy = $state<"followersDesc" | "viewersDesc" | "nameAsc" | "lastSynced">("followersDesc");

  let selectedIds = $state<Set<string>>(new Set());
  let showModal = $state(false);
  let editingStreamer = $state<Streamer | null>(null);
  let saving = $state(false);
  let deletingId = $state<string | null>(null);

  let form = $state({
    displayName: "",
    slug: "",
    platform: "twitch" as Streamer["platform"],
    channelId: "",
    channelUrl: "",
    bio: "",
  });

  let filteredStreamers = $derived(
    search.trim()
      ? streamers.filter(
          (s) =>
            s.displayName.toLowerCase().includes(search.toLowerCase()) ||
            s.channelId.toLowerCase().includes(search.toLowerCase()),
        )
      : streamers,
  );

  let selectedCount = $derived(selectedIds.size);

  let allVisibleSelected = $derived(
    filteredStreamers.length > 0 && filteredStreamers.every((s) => selectedIds.has(s.id)),
  );

  let stats = $derived({
    total: totalDocs,
    live: streamers.filter((s) => s.isLive).length,
    viewers: streamers.reduce((sum, s) => sum + (s.viewerCount || 0), 0),
    avgFollowers: streamers.length
      ? Math.round(streamers.reduce((sum, s) => sum + (s.followerCount || 0), 0) / streamers.length)
      : 0,
  });

  $effect(() => {
    page;
    platformFilter;
    liveOnly;
    sortBy;
    fetchStreamers();
  });

  $effect(() => {
    if (!editingStreamer && form.displayName) {
      form.slug = slugify(form.displayName);
    }
  });

  async function fetchStreamers() {
    loading = true;
    selectedIds = new Set();
    try {
      const sortMap: Record<string, string> = {
        followersDesc: "-followerCount",
        viewersDesc: "-viewerCount",
        nameAsc: "displayName",
        lastSynced: "-lastSyncedAt",
      };
      const res = await api.getStreamers({
        limit,
        page,
        platform: platformFilter || undefined,
        live: liveOnly || undefined,
        sort: sortMap[sortBy],
      });
      streamers = (res.docs || []) as unknown as Streamer[];
      totalDocs = res.totalDocs || 0;
      totalPages = res.totalPages || 1;
    } catch (err: any) {
      toast.error(err.message || "Failed to load streamers");
    } finally {
      loading = false;
    }
  }

  function slugify(text: string) {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function formatNumber(n?: number) {
    if (n == null) return "—";
    return new Intl.NumberFormat("en", { notation: "compact" }).format(n);
  }

  function timeAgo(date?: string) {
    if (!date) return "—";
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  }

  function avatarUrl(id: string) {
    const base = import.meta.env.VITE_API_URL ?? "";
    return `${base}/api/media/preset/${id}/thumbnail`;
  }

  function platformClasses(p: string) {
    switch (p) {
      case "twitch":
        return "bg-purple-500/10 text-purple-400 border-purple-500/20";
      case "youtube":
        return "bg-red-500/10 text-red-400 border-red-500/20";
      case "kick":
        return "bg-green-500/10 text-green-400 border-green-500/20";
      default:
        return "bg-gray-500/10 text-gray-400 border-gray-500/20";
    }
  }

  function openAdd() {
    editingStreamer = null;
    form = { displayName: "", slug: "", platform: "twitch", channelId: "", channelUrl: "", bio: "" };
    showModal = true;
  }

  function openEdit(s: Streamer) {
    editingStreamer = s;
    form = {
      displayName: s.displayName,
      slug: s.slug,
      platform: s.platform,
      channelId: s.channelId,
      channelUrl: s.channelUrl || "",
      bio: s.bio || "",
    };
    showModal = true;
  }

  function closeModal() {
    showModal = false;
    editingStreamer = null;
  }

  async function saveStreamer() {
    if (!form.displayName.trim() || !form.slug.trim() || !form.channelId.trim()) {
      toast.error("Please fill in required fields");
      return;
    }
    saving = true;
    try {
      const payload = { ...form };
      if (editingStreamer) {
        await api.updateStreamer(editingStreamer.id, payload as any);
        toast.success("Streamer updated");
      } else {
        await api.createStreamer(payload as any);
        toast.success("Streamer created");
      }
      closeModal();
      fetchStreamers();
    } catch (err: any) {
      toast.error(err.message || "Failed to save streamer");
    } finally {
      saving = false;
    }
  }

  async function deleteStreamer(id: string) {
    if (!confirm("Delete this streamer?")) return;
    deletingId = id;
    try {
      await api.deleteStreamer(id);
      toast.success("Streamer deleted");
      const next = new Set(selectedIds);
      next.delete(id);
      selectedIds = next;
      fetchStreamers();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete streamer");
    } finally {
      deletingId = null;
    }
  }

  async function deleteSelected() {
    if (!confirm(`Delete ${selectedCount} selected streamers?`)) return;
    try {
      await Promise.all([...selectedIds].map((id) => api.deleteStreamer(id)));
      toast.success(`${selectedCount} streamers deleted`);
      selectedIds = new Set();
      fetchStreamers();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete streamers");
    }
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
  }

  function toggleSelectAll() {
    const next = new Set(selectedIds);
    if (allVisibleSelected) {
      filteredStreamers.forEach((s) => next.delete(s.id));
    } else {
      filteredStreamers.forEach((s) => next.add(s.id));
    }
    selectedIds = next;
  }
</script>

<div class="space-y-6 animate-fade-in">
  <!-- Header -->
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold text-gremius-text flex items-center gap-2">
        <Tv class="w-6 h-6 text-gremius-cyan" />
        Streamers
      </h1>
      <p class="text-sm text-gremius-subtle mt-0.5">Manage partnered content creators</p>
    </div>
    <button class="btn-primary inline-flex items-center gap-2" onclick={openAdd}>
      <Plus class="w-4 h-4" />
      Add Streamer
    </button>
  </div>

  <!-- Stats -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <div class="card p-4 flex items-center gap-4">
      <div class="w-10 h-10 rounded-lg bg-gremius-cyan/10 flex items-center justify-center">
        <Users class="w-5 h-5 text-gremius-cyan" />
      </div>
      <div>
        <p class="text-2xl font-bold text-gremius-text">{stats.total}</p>
        <p class="text-xs text-gremius-subtle">Total Streamers</p>
      </div>
    </div>
    <div class="card p-4 flex items-center gap-4">
      <div class="w-10 h-10 rounded-lg bg-gremius-pink/10 flex items-center justify-center animate-pulse">
        <Radio class="w-5 h-5 text-gremius-pink" />
      </div>
      <div>
        <p class="text-2xl font-bold text-gremius-text">{stats.live}</p>
        <p class="text-xs text-gremius-subtle">Live Now</p>
      </div>
    </div>
    <div class="card p-4 flex items-center gap-4">
      <div class="w-10 h-10 rounded-lg bg-gremius-green/10 flex items-center justify-center">
        <Eye class="w-5 h-5 text-gremius-green" />
      </div>
      <div>
        <p class="text-2xl font-bold text-gremius-text">{formatNumber(stats.viewers)}</p>
        <p class="text-xs text-gremius-subtle">Total Viewers</p>
      </div>
    </div>
    <div class="card p-4 flex items-center gap-4">
      <div class="w-10 h-10 rounded-lg bg-gremius-amber/10 flex items-center justify-center">
        <TrendingUp class="w-5 h-5 text-gremius-amber" />
      </div>
      <div>
        <p class="text-2xl font-bold text-gremius-text">{formatNumber(stats.avgFollowers)}</p>
        <p class="text-xs text-gremius-subtle">Avg Followers</p>
      </div>
    </div>
  </div>

  <!-- Controls -->
  <div class="card overflow-hidden">
    <div class="flex flex-col lg:flex-row gap-3 p-4 border-b border-gremius-border">
      <div class="relative flex-1">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gremius-subtle" />
        <input
          bind:value={search}
          placeholder="Search by name or channel ID…"
          class="w-full pl-9 pr-3 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-sm text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan"
        />
      </div>
      <div class="flex flex-wrap gap-3">
        <select
          bind:value={platformFilter}
          class="px-3 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-sm text-gremius-text focus:outline-none focus:border-gremius-cyan"
        >
          <option value="">All Platforms</option>
          <option value="twitch">Twitch</option>
          <option value="youtube">YouTube</option>
          <option value="kick">Kick</option>
          <option value="other">Other</option>
        </select>
        <label class="flex items-center gap-2 px-3 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-sm text-gremius-text cursor-pointer select-none">
          <input type="checkbox" bind:checked={liveOnly} class="accent-gremius-pink" />
          Live only
        </label>
        <select
          bind:value={sortBy}
          class="px-3 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-sm text-gremius-text focus:outline-none focus:border-gremius-cyan"
        >
          <option value="followersDesc">Followers ↓</option>
          <option value="viewersDesc">Viewers ↓</option>
          <option value="nameAsc">Name A-Z</option>
          <option value="lastSynced">Last Synced</option>
        </select>
      </div>
    </div>

    <!-- Bulk bar -->
    {#if selectedCount > 0}
      <div class="flex items-center justify-between px-4 py-2 bg-gremius-surface border-b border-gremius-border animate-fade-in">
        <span class="text-sm text-gremius-text font-medium">{selectedCount} selected</span>
        <button class="btn-ghost text-gremius-pink inline-flex items-center gap-1.5 text-sm" onclick={deleteSelected}>
          <Trash2 class="w-4 h-4" />
          Delete Selected
        </button>
      </div>
    {/if}

    <!-- Table -->
    {#if loading}
      <div class="flex justify-center py-20">
        <Loader2 class="w-6 h-6 animate-spin text-gremius-cyan" />
      </div>
    {:else if filteredStreamers.length === 0}
      <div class="flex flex-col items-center justify-center py-20 text-center">
        <Tv class="w-12 h-12 text-gremius-subtle mb-3" />
        <p class="text-gremius-text-dim font-medium">No streamers found</p>
        <p class="text-xs text-gremius-subtle mt-1">Try adjusting your filters or add a new streamer.</p>
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full text-sm text-left">
          <thead class="text-xs text-gremius-subtle uppercase bg-gremius-surface border-b border-gremius-border">
            <tr>
              <th class="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onchange={toggleSelectAll}
                  class="accent-gremius-cyan"
                />
              </th>
              <th class="px-4 py-3 w-12">Avatar</th>
              <th class="px-4 py-3">Display Name</th>
              <th class="px-4 py-3">Platform</th>
              <th class="px-4 py-3">Channel ID</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3 text-right">Viewers</th>
              <th class="px-4 py-3 text-right">Followers</th>
              <th class="px-4 py-3">Last Synced</th>
              <th class="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredStreamers as s (s.id)}
              <tr class="border-b border-gremius-border hover:bg-gremius-surface/40 transition-colors">
                <td class="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(s.id)}
                    onchange={() => toggleSelect(s.id)}
                    class="accent-gremius-cyan"
                  />
                </td>
                <td class="px-4 py-3">
                  {#if s.avatarId}
                    <img
                      src={avatarUrl(s.avatarId)}
                      alt={s.displayName}
                      class="w-8 h-8 rounded-full object-cover bg-gremius-surface"
                      loading="lazy"
                    />
                  {:else}
                    <div class="w-8 h-8 rounded-full bg-gremius-surface flex items-center justify-center text-[10px] text-gremius-subtle font-bold">
                      {s.displayName.charAt(0).toUpperCase()}
                    </div>
                  {/if}
                </td>
                <td class="px-4 py-3">
                  {#if s.channelUrl}
                    <a
                      href={s.channelUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="font-medium text-gremius-text hover:text-gremius-cyan transition-colors"
                    >
                      {s.displayName}
                    </a>
                  {:else}
                    <span class="font-medium text-gremius-text">{s.displayName}</span>
                  {/if}
                  {#if s.currentStreamTitle}
                    <p class="text-[11px] text-gremius-subtle truncate max-w-[200px]">{s.currentStreamTitle}</p>
                  {/if}
                </td>
                <td class="px-4 py-3">
                  <span class="inline-block px-2 py-0.5 text-[10px] font-medium rounded-full border {platformClasses(s.platform)}">
                    {s.platform}
                  </span>
                </td>
                <td class="px-4 py-3 text-gremius-subtle font-mono text-xs">{s.channelId}</td>
                <td class="px-4 py-3">
                  {#if s.isLive}
                    <span class="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium bg-gremius-pink/10 text-gremius-pink rounded-full border border-gremius-pink/20">
                      <span class="w-1.5 h-1.5 rounded-full bg-gremius-pink animate-pulse"></span>
                      LIVE
                    </span>
                  {:else}
                    <span class="px-2 py-0.5 text-[10px] font-medium bg-gremius-surface text-gremius-subtle rounded-full border border-gremius-border">
                      Offline
                    </span>
                  {/if}
                </td>
                <td class="px-4 py-3 text-right text-gremius-text">{formatNumber(s.viewerCount)}</td>
                <td class="px-4 py-3 text-right text-gremius-text">{formatNumber(s.followerCount)}</td>
                <td class="px-4 py-3 text-gremius-subtle text-xs">{timeAgo(s.lastSyncedAt)}</td>
                <td class="px-4 py-3 text-right">
                  <div class="flex items-center justify-end gap-1">
                    <button class="btn-ghost p-1.5" onclick={() => openEdit(s)} title="Edit">
                      <Pencil class="w-4 h-4" />
                    </button>
                    <button
                      class="btn-ghost p-1.5 text-gremius-pink"
                      onclick={() => deleteStreamer(s.id)}
                      disabled={deletingId === s.id}
                      title="Delete"
                    >
                      {#if deletingId === s.id}
                        <Loader2 class="w-4 h-4 animate-spin" />
                      {:else}
                        <Trash2 class="w-4 h-4" />
                      {/if}
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div class="flex items-center justify-between px-4 py-3 border-t border-gremius-border">
        <button
          class="btn-secondary inline-flex items-center gap-1 text-sm"
          disabled={page <= 1}
          onclick={() => page--}
        >
          <ChevronLeft class="w-4 h-4" />
          Prev
        </button>
        <span class="text-sm text-gremius-subtle">Page {page} of {totalPages}</span>
        <button
          class="btn-secondary inline-flex items-center gap-1 text-sm"
          disabled={page >= totalPages}
          onclick={() => page++}
        >
          Next
          <ChevronRight class="w-4 h-4" />
        </button>
      </div>
    {/if}
  </div>
</div>

<!-- Modal -->
{#if showModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
    <div class="card w-full max-w-lg max-h-[90vh] overflow-y-auto animate-fade-in">
      <div class="flex items-center justify-between p-4 border-b border-gremius-border">
        <h3 class="text-lg font-semibold text-gremius-text">
          {editingStreamer ? "Edit Streamer" : "Add Streamer"}
        </h3>
        <button class="btn-ghost p-1" onclick={closeModal}>
          <X class="w-4 h-4" />
        </button>
      </div>
      <div class="p-4 space-y-4">
        <div>
          <label class="block text-xs font-medium text-gremius-subtle mb-1">Display Name *</label>
          <input
            bind:value={form.displayName}
            class="w-full px-3 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-sm text-gremius-text focus:outline-none focus:border-gremius-cyan"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-gremius-subtle mb-1">Slug *</label>
          <input
            bind:value={form.slug}
            class="w-full px-3 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-sm text-gremius-text focus:outline-none focus:border-gremius-cyan"
          />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-medium text-gremius-subtle mb-1">Platform *</label>
            <select
              bind:value={form.platform}
              class="w-full px-3 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-sm text-gremius-text focus:outline-none focus:border-gremius-cyan"
            >
              <option value="twitch">Twitch</option>
              <option value="youtube">YouTube</option>
              <option value="kick">Kick</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-gremius-subtle mb-1">Channel ID *</label>
            <input
              bind:value={form.channelId}
              class="w-full px-3 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-sm text-gremius-text focus:outline-none focus:border-gremius-cyan"
            />
          </div>
        </div>
        <div>
          <label class="block text-xs font-medium text-gremius-subtle mb-1">Channel URL</label>
          <input
            bind:value={form.channelUrl}
            placeholder="https://twitch.tv/..."
            class="w-full px-3 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-sm text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-gremius-subtle mb-1">Bio</label>
          <textarea
            bind:value={form.bio}
            rows={3}
            class="w-full px-3 py-2 bg-gremius-surface border border-gremius-border rounded-lg text-sm text-gremius-text focus:outline-none focus:border-gremius-cyan resize-none"
          ></textarea>
        </div>
      </div>
      <div class="flex justify-end gap-2 p-4 border-t border-gremius-border">
        <button class="btn-secondary" onclick={closeModal}>Cancel</button>
        <button class="btn-primary inline-flex items-center gap-2" onclick={saveStreamer} disabled={saving}>
          {#if saving}
            <Loader2 class="w-4 h-4 animate-spin" />
          {/if}
          Save
        </button>
      </div>
    </div>
  </div>
{/if}
