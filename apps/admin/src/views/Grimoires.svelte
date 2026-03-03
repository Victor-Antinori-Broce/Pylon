<script lang="ts">
  import { onMount } from "svelte";
  import { Puzzle, CheckCircle, XCircle, Loader2 } from "lucide-svelte";

  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

  interface Module {
    key: string;
    name: string;
    description: string;
    category: string;
    enabled: boolean;
    icon?: string;
    canToggle?: boolean;
    isThemeActive?: boolean;
  }

  let modules = $state<Module[]>([]);
  let loading = $state(true);
  let toggling = $state<string | null>(null);

  // Core infrastructure modules that are NOT grimoires (should not appear in list)
  const INFRASTRUCTURE_MODULES = ["media-library"];

  onMount(async () => {
    try {
      const res = await fetch(`${API_URL}/api/modules`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        // Filter out infrastructure modules (e.g., media-library is core infrastructure, not a grimoire)
        modules = (data.docs || []).filter((m: Module) => !INFRASTRUCTURE_MODULES.includes(m.key));
      }
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  });

  async function toggleModule(mod: Module) {
    if (!mod.canToggle) return;
    toggling = mod.key;
    try {
      const res = await fetch(`${API_URL}/api/modules/${mod.key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled: !mod.enabled }),
      });
      if (res.ok) {
        modules = modules.map(m =>
          m.key === mod.key ? { ...m, enabled: !m.enabled } : m
        );
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || err.message || "Failed to toggle grimoire");
      }
    } catch (e) {
      console.error(e);
      alert("Network error toggling grimoire");
    } finally {
      toggling = null;
    }
  }
</script>

<div class="space-y-6 animate-fade-in">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-gremius-text flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-gremius-amber/20 to-gremius-pink/20 border border-gremius-amber/20 flex items-center justify-center">
          <Puzzle class="w-5 h-5 text-gremius-amber" />
        </div>
        Grimoires
      </h1>
      <p class="text-sm text-gremius-subtle mt-1">
        Manage system grimoires (modules) and their dependencies.
      </p>
    </div>
  </div>

  {#if loading}
    <div class="card p-12 text-center">
      <div class="w-8 h-8 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin mx-auto mb-4"></div>
      <p class="text-gremius-subtle">Summoning grimoires...</p>
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each modules as mod}
        <div class="card p-5 relative" class:border-gremius-cyan={mod.enabled}>
          <div class="flex items-start justify-between mb-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-gremius-surface flex items-center justify-center text-xl">
                {mod.icon || "📦"}
              </div>
              <div>
                <h3 class="font-semibold text-gremius-text">{mod.name}</h3>
                <p class="text-[10px] font-medium uppercase tracking-wider text-gremius-subtle">{mod.category}</p>
              </div>
            </div>
            {#if mod.enabled}
              <CheckCircle class="w-5 h-5 text-gremius-cyan" />
            {:else}
              <XCircle class="w-5 h-5 text-gremius-subtle" />
            {/if}
          </div>
          <p class="text-sm text-gremius-text-dim mb-4">{mod.description}</p>

          <!-- Toggle Button -->
          <div class="pt-3 border-t border-gremius-border">
            {#if mod.canToggle !== false}
              <button
                class="w-full text-sm font-medium px-3 py-2 rounded-lg transition-colors {mod.enabled
                  ? 'bg-gremius-pink/10 text-gremius-pink hover:bg-gremius-pink/20 border border-gremius-pink/20'
                  : 'bg-gremius-cyan/10 text-gremius-cyan hover:bg-gremius-cyan/20 border border-gremius-cyan/20'}"
                disabled={toggling === mod.key}
                onclick={() => toggleModule(mod)}
              >
                {#if toggling === mod.key}
                  <Loader2 class="w-4 h-4 animate-spin inline mr-1" /> Toggling...
                {:else}
                  {mod.enabled ? "Disable" : "Enable"}
                {/if}
              </button>
            {:else}
              <p class="text-xs text-gremius-subtle text-center py-2">
                {mod.isThemeActive ? "Controlled by active realm" : "Cannot be toggled"}
              </p>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
