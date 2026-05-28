<script lang="ts">
  import { onMount } from "svelte";
  import { Plus, Tv } from "lucide-svelte";
  import { api } from "$lib/api";

  interface Streamer {
    id: string;
    name: string;
    twitchUsername?: string;
    isLive: boolean;
    followers?: number;
  }

  let streamers = $state<Streamer[]>([]);
  let loading = $state(true);

  onMount(async () => {
    try {
      const data = await api.get<{ docs: Streamer[] }>("/streamers");
      streamers = data.docs || [];
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
      <h2 class="text-xl font-bold text-gremius-text">Streamers</h2>
      <p class="text-sm text-gremius-text-dim mt-0.5">Manage partnered streamers</p>
    </div>
    <a href="/streamers/new" class="btn-primary inline-flex items-center gap-2">
      <Plus class="w-4 h-4" /> Add Streamer
    </a>
  </div>

  {#if loading}
    <div class="flex justify-center py-20">
      <div class="w-6 h-6 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div>
    </div>
  {:else if streamers.length === 0}
    <div class="card p-16 text-center">
      <div class="text-4xl mb-3">📺</div>
      <p class="text-gremius-text-dim">No streamers yet.</p>
      <p class="text-xs text-gremius-subtle mt-1">Add your first partnered streamer.</p>
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each streamers as streamer}
        <a
          href={`/streamers/${streamer.id}`}
          class="card p-4 group hover:border-gremius-cyan/30 transition-colors"
        >
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-full bg-gremius-surface flex items-center justify-center text-xl">
                📺
              </div>
              <div>
                <h3 class="font-semibold text-gremius-text group-hover:text-gremius-cyan transition-colors">
                  {streamer.name}
                </h3>
                {#if streamer.twitchUsername}
                  <p class="text-xs text-gremius-subtle">twitch.tv/{streamer.twitchUsername}</p>
                {/if}
              </div>
            </div>
            {#if streamer.isLive}
              <span class="px-2 py-0.5 text-[10px] font-medium bg-gremius-pink/10 text-gremius-pink rounded-full animate-pulse">
                LIVE
              </span>
            {/if}
          </div>
          {#if streamer.followers}
            <div class="mt-3 pt-3 border-t border-gremius-border">
              <p class="text-xs text-gremius-subtle">
                {streamer.followers.toLocaleString()} followers
              </p>
            </div>
          {/if}
        </a>
      {/each}
    </div>
  {/if}
</div>
