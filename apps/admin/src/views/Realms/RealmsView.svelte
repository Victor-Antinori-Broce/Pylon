<script lang="ts">
  import { onMount } from "svelte";
  import { Castle, Check, Plus, BookOpen } from "lucide-svelte";

  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

  interface Realm {
    id: string;
    name: string;
    description?: string;
    version?: string;
    grimoires: string[];
    isActive?: boolean;
  }

  let realms = $state<Realm[]>([]);
  let loading = $state(true);
  let activeRealm = $state<string | null>(null);

  async function fetchRealms() {
    try {
      loading = true;
      // Fetch all available realms
      const realmsRes = await fetch(`${API_URL}/api/system/realms`);
      if (realmsRes.ok) {
        realms = await realmsRes.json();
      }
      // Fetch active realm
      const settingsRes = await fetch(`${API_URL}/api/settings`);
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        activeRealm = settings.activeRealm || settings.activeTheme || null;
      }
    } catch (err) {
      console.error("Failed to fetch realms:", err);
      // Fallback to default realms if API fails
      realms = [
        {
          id: "realm-default",
          name: "Default",
          description: "Basic CMS functionality without specialized features",
          grimoires: ["webhooks", "formulas"],
        },
        {
          id: "realm-esports",
          name: "Gremius Esports",
          description: "Complete esports management with games, streamers, and collections",
          grimoires: ["games", "streamers", "platforms", "tags", "collections", "webhooks", "formulas"],
        },
        {
          id: "realm-corporate",
          name: "Corporate",
          description: "Enterprise features with academy, booking, and directory",
          grimoires: ["academy", "booking", "directory", "dms", "webhooks", "formulas"],
        },
      ];
    } finally {
      loading = false;
    }
  }

  async function activateRealm(realmId: string) {
    try {
      const res = await fetch(`${API_URL}/api/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ activeRealm: realmId }),
      });
      if (res.ok) {
        activeRealm = realmId;
      }
    } catch (err) {
      console.error("Failed to activate realm:", err);
      alert("Failed to activate realm. Please try again.");
    }
  }

  async function deactivateRealm() {
    try {
      const res = await fetch(`${API_URL}/api/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ activeRealm: null }),
      });
      if (res.ok) {
        activeRealm = null;
      }
    } catch (err) {
      console.error("Failed to deactivate realm:", err);
      alert("Failed to deactivate realm. Please try again.");
    }
  }

  onMount(() => {
    fetchRealms();
  });

  function getGrimoireIcon(grimoire: string): string {
    const icons: Record<string, string> = {
      games: "🎮",
      streamers: "📡",
      platforms: "🖥️",
      tags: "🏷️",
      collections: "📚",
      webhooks: "🪝",
      formulas: "📐",
      academy: "🎓",
      booking: "📅",
      directory: "👥",
      dms: "📄",
      blog: "📝",
      "gremius-crm": "💼",
    };
    return icons[grimoire] || "📦";
  }
</script>

<div class="space-y-6 animate-fade-in">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-gremius-text flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-gremius-purple/20 to-gremius-cyan/20 border border-gremius-purple/20 flex items-center justify-center">
          <Castle class="w-5 h-5 text-gremius-purple" />
        </div>
        Realms
      </h1>
      <p class="text-sm text-gremius-subtle mt-1">
        Manage business ecosystems that group related grimoires together.
      </p>
    </div>
  </div>

  <!-- Loading State -->
  {#if loading}
    <div class="card p-12 text-center">
      <div class="w-8 h-8 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin mx-auto mb-4"></div>
      <p class="text-gremius-subtle">Loading realms...</p>
    </div>
  {:else}
    <!-- Realms Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
      {#each realms as realm}
        <div class="card p-5 relative group" class:border-gremius-cyan={activeRealm === realm.id}>
          {#if activeRealm === realm.id}
            <div class="absolute top-3 right-3">
              <span class="px-2 py-1 text-[10px] font-medium bg-gremius-cyan/10 text-gremius-cyan rounded-full flex items-center gap-1">
                <Check class="w-3 h-3" /> Active
              </span>
            </div>
          {/if}
          
          <div class="flex items-start gap-4 mb-4">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-gremius-purple/20 to-gremius-cyan/20 flex items-center justify-center text-2xl shrink-0">
              <Castle class="w-6 h-6 text-gremius-purple" />
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold text-gremius-text text-lg">{realm.name}</h3>
              <p class="text-xs text-gremius-subtle mt-0.5">{realm.grimoires.length} grimoires included</p>
            </div>
          </div>

          <p class="text-sm text-gremius-text-dim mb-4 line-clamp-2">
            {realm.description || "No description available"}
          </p>

          <!-- Included Grimoires -->
          <div class="mb-4">
            <p class="text-[10px] font-semibold uppercase tracking-wider text-gremius-subtle mb-2">Included Grimoires</p>
            <div class="flex flex-wrap gap-1.5">
              {#each realm.grimoires.slice(0, 6) as grimoire}
                <span class="px-2 py-1 text-[10px] bg-gremius-surface rounded-md text-gremius-text-dim flex items-center gap-1">
                  <span>{getGrimoireIcon(grimoire)}</span>
                  {grimoire}
                </span>
              {/each}
              {#if realm.grimoires.length > 6}
                <span class="px-2 py-1 text-[10px] bg-gremius-surface rounded-md text-gremius-subtle">
                  +{realm.grimoires.length - 6} more
                </span>
              {/if}
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-2 pt-3 border-t border-gremius-border">
            {#if activeRealm === realm.id}
              <button class="btn-secondary flex-1 text-gremius-pink border-gremius-pink/20 hover:bg-gremius-pink/10" onclick={() => deactivateRealm()}>
                Deactivate
              </button>
            {:else}
              <button class="btn-primary flex-1" onclick={() => activateRealm(realm.id)}>
                Activate
              </button>
            {/if}
            <button class="btn-ghost p-2" title="View Details">
              <BookOpen class="w-4 h-4" />
            </button>
          </div>
        </div>
      {/each}

      <!-- Create Custom Realm Card -->
      <button class="card p-5 border-dashed border-2 border-gremius-border hover:border-gremius-cyan/50 transition-colors flex flex-col items-center justify-center min-h-[280px] gap-3">
        <div class="w-12 h-12 rounded-xl bg-gremius-surface flex items-center justify-center">
          <Plus class="w-6 h-6 text-gremius-cyan" />
        </div>
        <div class="text-center">
          <h3 class="font-semibold text-gremius-text">Create Custom Realm</h3>
          <p class="text-xs text-gremius-subtle mt-0.5 max-w-[200px]">Build your own ecosystem by selecting specific grimoires</p>
        </div>
      </button>
    </div>
  {/if}
</div>
