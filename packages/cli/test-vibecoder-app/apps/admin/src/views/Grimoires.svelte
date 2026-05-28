<script lang="ts">
  import { onMount } from "svelte";
  import { Puzzle, CheckCircle, XCircle, Loader2, Archive, Trash2, RotateCcw, AlertTriangle, Database, Package } from "lucide-svelte";
  import { moduleStore, type ModuleInfo, type UninstalledGrimoire } from "$lib/states/modules.svelte";
  import UninstalledGrimoireCard from "$lib/components/modules/UninstalledGrimoireCard.svelte";

  let toggling = $state<string | null>(null);
  let uninstalling = $state<string | null>(null);
  let recovering = $state<string | null>(null);
  let deleting = $state<string | null>(null);
  
  // Modal states
  let showUninstallModal = $state(false);
  let showDeleteModal = $state(false);
  let selectedModule = $state<ModuleInfo | UninstalledGrimoire | null>(null);
  let deleteConfirmText = $state("");
  let uninstallPreserveData = $state(true);

  // Core infrastructure modules that are NOT grimoires (should not appear in list)
  const INFRASTRUCTURE_MODULES = ["media-library"];

  // Category labels for display
  const CATEGORY_LABELS: Record<string, string> = {
    "core": "Core Grimoires",
    "optional": "Optional Features",
  };

  // Filter: hide infra modules, show everything else
  let visibleModules = $derived(
    moduleStore.modules.filter((m: ModuleInfo) => !INFRASTRUCTURE_MODULES.includes(m.key))
  );

  // Get realm names from modules that have realmId
  let realmNames = $derived.by(() => {
    const names: Record<string, string> = {};
    for (const mod of visibleModules) {
      if (mod.realmId && !names[mod.realmId]) {
        const name = mod.realmId
          .replace(/^realm-/, "")
          .split("-")
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
        names[mod.realmId] = name;
      }
    }
    return names;
  });

  // Group by category for display
  let groupedModules = $derived.by(() => {
    const groups: Record<string, ModuleInfo[]> = {};
    for (const mod of visibleModules) {
      let cat: string;
      
      if (mod.category === "realm" && mod.realmId) {
        cat = `realm:${mod.realmId}`;
      } else {
        cat = mod.category || "optional";
      }
      
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(mod);
    }
    return groups;
  });

  function getCategoryLabel(category: string): string {
    if (category.startsWith("realm:")) {
      const realmId = category.replace("realm:", "");
      const names = realmNames();
      return names[realmId] || realmId.replace(/^realm-/, "").replace(/-/g, " ");
    }
    return CATEGORY_LABELS[category] || category;
  }

  onMount(async () => {
    if (moduleStore.modules.length === 0) {
      await moduleStore.fetchModules();
    }
  });

  async function toggleModule(mod: ModuleInfo) {
    if (!mod.canToggle) return;
    toggling = mod.key;
    await moduleStore.toggleModule(mod.key);
    toggling = null;
  }

  function openUninstallModal(mod: ModuleInfo) {
    selectedModule = mod;
    uninstallPreserveData = true;
    showUninstallModal = true;
  }

  async function confirmUninstall() {
    if (!selectedModule) return;
    showUninstallModal = false;
    uninstalling = selectedModule.key;
    await moduleStore.uninstallModule(selectedModule.key);
    uninstalling = null;
    selectedModule = null;
  }

  async function handleRecover(grimoire: UninstalledGrimoire) {
    recovering = grimoire.key;
    await moduleStore.recoverModule(grimoire.key);
    recovering = null;
  }

  function openDeleteModal(grimoire: UninstalledGrimoire) {
    selectedModule = grimoire;
    deleteConfirmText = "";
    showDeleteModal = true;
  }

  async function confirmDelete() {
    if (!selectedModule || deleteConfirmText !== selectedModule.key.replace(/^grimoire-/, "")) return;
    showDeleteModal = false;
    deleting = selectedModule.key;
    await moduleStore.deleteModule(selectedModule.key, true); // purge = true
    deleting = null;
    selectedModule = null;
    deleteConfirmText = "";
  }

  function formatNumber(num: number): string {
    if (num >= 1000) return (num / 1000).toFixed(1) + "k";
    return num.toString();
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
        Manage system grimoires. Uninstall to preserve data, or delete permanently.
      </p>
    </div>
  </div>

  {#if moduleStore.loading}
    <div class="card p-12 text-center">
      <div class="w-8 h-8 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin mx-auto mb-4"></div>
      <p class="text-gremius-subtle">Summoning grimoires...</p>
    </div>
  {:else}
    <!-- Installed Grimoires -->
    {@const groups = groupedModules()}
    {#each Object.entries(groups) as [category, mods]}
      <div>
        <div class="flex items-center gap-2 mb-3">
          <h2 class="text-sm font-semibold uppercase tracking-wider text-gremius-subtle">
            {getCategoryLabel(category)}
          </h2>
          <span class="text-[10px] px-2 py-0.5 rounded-full bg-gremius-surface text-gremius-text-dim">
            {mods.length}
          </span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {#each mods as mod}
            <div class="card p-5 relative" class:border-gremius-cyan={mod.enabled} class:border={mod.enabled}>
              <div class="flex items-start justify-between mb-4">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-lg bg-gremius-surface flex items-center justify-center text-xl">
                    {mod.icon || "📦"}
                  </div>
                  <div>
                    <h3 class="font-semibold text-gremius-text">{mod.name}</h3>
                    <p class="text-[10px] font-medium uppercase tracking-wider text-gremius-subtle">{getCategoryLabel(mod.category)}</p>
                    {#if mod.enabledByRealm}
                      <span class="text-[9px] px-1.5 py-0.5 rounded-full bg-gremius-cyan/10 text-gremius-cyan border border-gremius-cyan/20 mt-1 inline-block">
                        Active by Realm
                      </span>
                    {/if}
                  </div>
                </div>
                {#if mod.enabled}
                  <CheckCircle class="w-5 h-5 text-gremius-cyan" />
                {:else}
                  <XCircle class="w-5 h-5 text-gremius-subtle" />
                {/if}
              </div>
              <p class="text-sm text-gremius-text-dim mb-4">{mod.description}</p>

              <!-- Actions -->
              <div class="pt-3 border-t border-gremius-border space-y-2">
                <!-- Enable/Disable Toggle -->
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
                    {mod.isRealmActive ? "Controlled by active realm" : "Cannot be toggled"}
                  </p>
                {/if}
                
                <!-- Uninstall Button -->
                <button
                  class="w-full text-xs font-medium px-3 py-2 rounded-lg transition-colors bg-gremius-subtle/10 text-gremius-subtle hover:bg-gremius-subtle/20 border border-gremius-border/50 flex items-center justify-center gap-1.5"
                  disabled={uninstalling === mod.key}
                  onclick={() => openUninstallModal(mod)}
                >
                  {#if uninstalling === mod.key}
                    <Loader2 class="w-3.5 h-3.5 animate-spin" />
                    Uninstalling...
                  {:else}
                    <Archive class="w-3.5 h-3.5" />
                    Uninstall (Preserve Data)
                  {/if}
                </button>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/each}

    <!-- Uninstalled Grimoires Section -->
    {#if moduleStore.uninstalled.length > 0}
      <div class="pt-6 border-t border-gremius-border">
        <div class="flex items-center gap-2 mb-3">
          <Archive class="w-4 h-4 text-gremius-subtle" />
          <h2 class="text-sm font-semibold uppercase tracking-wider text-gremius-subtle">
            Uninstalled (Data Preserved)
          </h2>
          <span class="text-[10px] px-2 py-0.5 rounded-full bg-gremius-surface text-gremius-text-dim">
            {moduleStore.uninstalled.length}
          </span>
        </div>
        <p class="text-xs text-gremius-subtle mb-4">
          These grimoires have been uninstalled but their data is preserved. You can recover them or permanently delete their data.
        </p>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {#each moduleStore.uninstalled as grimoire}
            <UninstalledGrimoireCard
              {grimoire}
              recovering={recovering === grimoire.key}
              deleting={deleting === grimoire.key}
              onRecover={() => handleRecover(grimoire)}
              onDelete={() => openDeleteModal(grimoire)}
            />
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

<!-- Uninstall Confirmation Modal -->
{#if showUninstallModal && selectedModule}
  <div class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div class="card p-6 max-w-md w-full animate-fade-in">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-xl bg-gremius-amber/10 flex items-center justify-center">
          <Archive class="w-5 h-5 text-gremius-amber" />
        </div>
        <div>
          <h3 class="font-semibold text-gremius-text">Uninstall "{selectedModule.name}"?</h3>
          <p class="text-xs text-gremius-subtle">This action can be reversed</p>
        </div>
      </div>
      
      <div class="bg-gremius-surface/50 rounded-lg p-4 mb-4">
        <p class="text-sm text-gremius-text-dim mb-2">
          This will remove the grimoire from the system but <strong class="text-gremius-cyan">preserve all your data</strong> for future recovery.
        </p>
        
        {#if 'tables' in selectedModule && selectedModule.tables}
          <div class="mt-3 pt-3 border-t border-gremius-border/50">
            <p class="text-xs text-gremius-subtle mb-1">Tables that will be preserved:</p>
            <div class="flex flex-wrap gap-1">
              {#each selectedModule.tables.slice(0, 5) as table}
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-gremius-bg border border-gremius-border text-gremius-text-dim font-mono">{table}</span>
              {/each}
              {#if selectedModule.tables.length > 5}
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-gremius-bg border border-gremius-border text-gremius-subtle">+{selectedModule.tables.length - 5} more</span>
              {/if}
            </div>
          </div>
        {/if}
      </div>
      
      <div class="flex gap-2">
        <button
          class="flex-1 text-sm font-medium px-4 py-2 rounded-lg transition-colors bg-gremius-surface text-gremius-text hover:bg-gremius-border"
          onclick={() => { showUninstallModal = false; selectedModule = null; }}
        >
          Cancel
        </button>
        <button
          class="flex-1 text-sm font-medium px-4 py-2 rounded-lg transition-colors bg-gremius-amber/10 text-gremius-amber hover:bg-gremius-amber/20 border border-gremius-amber/20"
          onclick={confirmUninstall}
        >
          Uninstall & Preserve Data
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Confirmation Modal -->
{#if showDeleteModal && selectedModule}
  <div class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div class="card p-6 max-w-md w-full animate-fade-in border-gremius-pink/30">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-xl bg-gremius-pink/10 flex items-center justify-center">
          <AlertTriangle class="w-5 h-5 text-gremius-pink" />
        </div>
        <div>
          <h3 class="font-semibold text-gremius-text">Delete Data Permanently?</h3>
          <p class="text-xs text-gremius-pink">This action cannot be undone</p>
        </div>
      </div>
      
      <div class="bg-gremius-pink/5 rounded-lg p-4 mb-4 border border-gremius-pink/20">
        <p class="text-sm text-gremius-text-dim mb-2">
          You are about to <strong class="text-gremius-pink">permanently delete</strong> all data for:
        </p>
        <p class="font-semibold text-gremius-text">{selectedModule.name}</p>
        
        {#if 'dataSummary' in selectedModule && selectedModule.dataSummary}
          <div class="mt-3 pt-3 border-t border-gremius-pink/20">
            <p class="text-xs text-gremius-pink mb-1 flex items-center gap-1">
              <Trash2 class="w-3 h-3" />
              This will delete:
            </p>
            <ul class="text-xs text-gremius-text-dim space-y-1">
              {#each selectedModule.dataSummary.tables.slice(0, 4) as table}
                <li>• Table '{table.name}': {formatNumber(table.rows)} rows</li>
              {/each}
              {#if selectedModule.dataSummary.tables.length > 4}
                <li>• +{selectedModule.dataSummary.tables.length - 4} more tables</li>
              {/if}
            </ul>
          </div>
        {/if}
      </div>
      
      <div class="mb-4">
        <label class="text-xs text-gremius-subtle mb-1 block">
          Type "<strong>{selectedModule.key.replace(/^grimoire-/, "")}</strong>" to confirm:
        </label>
        <input
          type="text"
          bind:value={deleteConfirmText}
          class="w-full px-3 py-2 rounded-lg bg-gremius-bg border border-gremius-border text-gremius-text text-sm focus:outline-none focus:border-gremius-pink"
          placeholder={selectedModule.key.replace(/^grimoire-/, "")}
        />
      </div>
      
      <div class="flex gap-2">
        <button
          class="flex-1 text-sm font-medium px-4 py-2 rounded-lg transition-colors bg-gremius-surface text-gremius-text hover:bg-gremius-border"
          onclick={() => { showDeleteModal = false; selectedModule = null; deleteConfirmText = ""; }}
        >
          Cancel
        </button>
        <button
          class="flex-1 text-sm font-medium px-4 py-2 rounded-lg transition-colors bg-gremius-pink/10 text-gremius-pink hover:bg-gremius-pink/20 border border-gremius-pink/20 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={deleteConfirmText !== selectedModule.key.replace(/^grimoire-/, "")}
          onclick={confirmDelete}
        >
          Delete Forever
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .card {
    @apply rounded-xl border border-gremius-border bg-gremius-card;
  }
  
  .animate-fade-in {
    animation: fadeIn 0.2s ease-out;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
