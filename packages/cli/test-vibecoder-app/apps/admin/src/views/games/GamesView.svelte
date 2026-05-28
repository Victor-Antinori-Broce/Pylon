<script lang="ts">
  import { onMount } from "svelte";
  import { Plus, ChevronRight, Gamepad2 } from "lucide-svelte";
  import { api } from "$lib/api";

  interface GameCollection {
    id: string;
    title: string;
    slug: string;
    displayOrder: number;
    games?: { id: string; title: string; coverArt?: { url: string } }[];
  }

  let collections = $state<GameCollection[]>([]);
  let loading = $state(true);

  onMount(async () => {
    try {
      const data = await api.get<{ docs: GameCollection[] }>("/collections");
      collections = data.docs || [];
    } catch {
      // empty
    } finally {
      loading = false;
    }
  });
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-xl font-bold text-gremius-text">Game Collections</h2>
      <p class="text-sm text-gremius-text-dim mt-0.5">Curated sections for the homepage</p>
    </div>
    <a href="/games/collections/new" class="btn-primary inline-flex items-center gap-2">
      <Plus class="w-4 h-4" /> New Collection
    </a>
  </div>

  {#if loading}
    <div class="flex justify-center py-20">
      <div class="w-6 h-6 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div>
    </div>
  {:else if collections.length === 0}
    <div class="card p-16 text-center">
      <div class="text-4xl mb-3">📦</div>
      <p class="text-gremius-text-dim">No collections yet.</p>
      <p class="text-xs text-gremius-subtle mt-1">Create your first curated section to feature on the homepage.</p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each collections as col}
        <a
          href={`/games/collections/${col.id}`}
          class="card p-4 flex items-center justify-between group hover:border-gremius-cyan/30 transition-colors"
        >
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-lg bg-gremius-surface flex items-center justify-center text-gremius-cyan font-bold text-sm">
              {col.displayOrder + 1}
            </div>
            <div>
              <h3 class="font-semibold text-gremius-text group-hover:text-gremius-cyan transition-colors">
                {col.title}
              </h3>
              <p class="text-xs text-gremius-subtle mt-0.5">
                {col.games?.length || 0} games · /{col.slug}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            {#if col.games?.length}
              <div class="flex -space-x-2">
                {#each col.games.slice(0, 4) as game, i}
                  <div
                    class="w-8 h-8 rounded-md border-2 border-gremius-card bg-gremius-surface overflow-hidden"
                    style="z-index: {10 - i}"
                  >
                    {#if game.coverArt?.url}
                      <img
                        src={game.coverArt.url}
                        alt={game.title}
                        class="w-full h-full object-cover"
                      />
                    {:else}
                      <div class="w-full h-full flex items-center justify-center text-[10px]">🎮</div>
                    {/if}
                  </div>
                {/each}
                {#if col.games.length > 4}
                  <div class="w-8 h-8 rounded-md border-2 border-gremius-card bg-gremius-surface flex items-center justify-center text-[10px] text-gremius-subtle font-medium">
                    +{col.games.length - 4}
                  </div>
                {/if}
              </div>
            {/if}
            <ChevronRight class="w-4 h-4 text-gremius-subtle group-hover:text-gremius-cyan transition-colors" />
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
