<script lang="ts">
  import { onMount } from "svelte";
  import { Table2, Search, Filter, Megaphone } from "lucide-svelte";
  import { api } from "$lib/api";

  interface Game {
    id: string;
    title: string;
    genre?: string;
    platform?: string[];
    rating?: number;
    releaseDate?: string;
  }

  let games = $state<Game[]>([]);
  let loading = $state(true);
  let search = $state("");
  let promoteEnabled = $state(false);

  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

  onMount(async () => {
    try {
      // Fetch enabled modules
      const modulesRes = await fetch(`${API_URL}/api/modules`, { credentials: "include" });
      if (modulesRes.ok) {
        const data = await modulesRes.json();
        const docs: { key: string; enabled: boolean }[] = data.docs || [];
        promoteEnabled = docs.some(m => m.key === "promote" && m.enabled);
      }
    } catch {
      // If API fails, keep promote disabled
    }

    try {
      const data = await api.get<{ docs: Game[] }>("/games");
      games = data.docs || [];
    } catch {
      // empty
    } finally {
      loading = false;
    }
  });

  let filteredGames = $derived(
    games.filter(g => 
      g.title.toLowerCase().includes(search.toLowerCase()) ||
      g.genre?.toLowerCase().includes(search.toLowerCase())
    )
  );

  function handlePromote() {
    window.location.href = "/promote";
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-xl font-bold text-gremius-text">Data Explorer</h2>
      <p class="text-sm text-gremius-text-dim mt-0.5">Browse and query game data</p>
    </div>
  </div>

  <!-- Search and Actions -->
  <div class="flex items-center gap-3">
    <div class="relative flex-1 max-w-md">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gremius-subtle" />
      <input
        type="text"
        placeholder="Search games..."
        bind:value={search}
        class="w-full pl-10 pr-4 py-2 bg-gremius-card border border-gremius-border rounded-lg text-sm focus:outline-none focus:border-gremius-cyan"
      />
    </div>
    <button class="btn-secondary">
      <Filter class="w-4 h-4" /> Filter
    </button>
    {#if promoteEnabled}
      <button class="btn-primary" onclick={handlePromote}>
        <Megaphone class="w-4 h-4" /> Promote to Content
      </button>
    {/if}
  </div>

  {#if loading}
    <div class="flex justify-center py-20">
      <div class="w-6 h-6 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div>
    </div>
  {:else}
    <div class="card overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gremius-surface border-b border-gremius-border">
          <tr>
            <th class="text-left px-4 py-3 font-medium text-gremius-text-dim">Title</th>
            <th class="text-left px-4 py-3 font-medium text-gremius-text-dim">Genre</th>
            <th class="text-left px-4 py-3 font-medium text-gremius-text-dim">Platform</th>
            <th class="text-left px-4 py-3 font-medium text-gremius-text-dim">Rating</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredGames as game}
            <tr class="border-b border-gremius-border/50 hover:bg-gremius-surface/50">
              <td class="px-4 py-3 font-medium">{game.title}</td>
              <td class="px-4 py-3 text-gremius-text-dim">{game.genre || "—"}</td>
              <td class="px-4 py-3">
                {#if game.platform}
                  <div class="flex gap-1">
                    {#each game.platform as p}
                      <span class="px-1.5 py-0.5 text-[10px] bg-gremius-surface rounded">{p}</span>
                    {/each}
                  </div>
                {:else}
                  <span class="text-gremius-subtle">—</span>
                {/if}
              </td>
              <td class="px-4 py-3">
                {#if game.rating}
                  <span class="text-gremius-cyan">{game.rating}/10</span>
                {:else}
                  <span class="text-gremius-subtle">—</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
