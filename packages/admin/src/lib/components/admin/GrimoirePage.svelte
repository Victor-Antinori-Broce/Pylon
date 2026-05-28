<script lang="ts">
  /**
   * GrimoirePage.svelte — Hybrid Rendering Edition
   * 
   * Supports two modes:
   * 1. LEGACY: Full custom Svelte view (monolith) — loaded via GRIMOIRE_VIEW_REGISTRY
   * 2. HYBRID: Multiple views per grimoire — DataExplorer for grid/kanban/calendar,
   *    Custom Svelte components only for type: "custom" views
   * 
   * Flow:
   * 1. Fetch grimoire config from /api/admin/registry
   * 2. If legacy custom view exists → load monolith (backward compat)
   * 3. If admin.views declared → render tabs (DataExplorer + custom views)
   * 4. Fallback to auto-generated DataExplorer config
   */
  import { onMount } from "svelte";
  import DataExplorer from "$lib/components/admin/DataExplorer.svelte";
  import { 
    getGrimoireConfig, 
    loadCustomView, 
    generateExplorerConfig,
    generateDefaultConfig,
    hasCustomView,
    type GrimoireAdminConfig,
    type AdminViewConfig
  } from "$lib/grimoire-loader";
  import type { Component } from "svelte";
  import type { AdminConfig } from "$lib/types/admin";

  let { grimoireId, initialViewId }: { grimoireId: string; initialViewId?: string } = $props();

  // Legacy mode state
  let LegacyView: Component | null = $state(null);
  
  // Hybrid mode state
  let grimoireConfig = $state<GrimoireAdminConfig | null>(null);
  let activeViewId = $state<string>(initialViewId || "");
  let customViews = $state<Record<string, Component>>({});
  
  // Shared state
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Core engines with custom views that are not in the registry
  const CORE_ENGINES_WITH_VIEWS = ["media-library", "media"];

  onMount(async () => {
    try {
      // Step 1: Fetch auto-discovered config from registry
      const config = await getGrimoireConfig(grimoireId);
      grimoireConfig = config;

      if (config) {
        // Set default active view (respect URL if provided)
        if (!activeViewId) {
          activeViewId = config.defaultView || config.views[0]?.id || "";
        }

        // Step 2: Check for LEGACY monolith view (full grimoire custom view)
        // This takes precedence for backward compatibility during migration
        const hasLegacyCustom = hasCustomView(grimoireId) || CORE_ENGINES_WITH_VIEWS.includes(grimoireId);
        
        if (hasLegacyCustom && !hasHybridViews(config)) {
          // Legacy mode: load the full monolith view
          const view = await loadCustomView(grimoireId);
          if (view) {
            LegacyView = view;
            loading = false;
            return;
          }
        }

        // Step 3: Hybrid mode — load custom views for type: "custom" entries
        for (const view of config.views) {
          if (view.type === "custom") {
            const custom = await loadCustomView(grimoireId, view.id);
            if (custom) {
              customViews = { ...customViews, [view.id]: custom };
            }
          }
        }
      } else {
        // No registry config — try per-view custom component first (e.g. system-tools/editor)
        if (initialViewId) {
          const view = await loadCustomView(grimoireId, initialViewId);
          if (view) {
            LegacyView = view;
            loading = false;
            return;
          }
        }

        // Fallback to legacy monolith view
        if (hasCustomView(grimoireId) || CORE_ENGINES_WITH_VIEWS.includes(grimoireId)) {
          const view = await loadCustomView(grimoireId);
          if (view) {
            LegacyView = view;
            loading = false;
            return;
          }
        }
        
        console.warn(`[GrimoirePage] No registry config for ${grimoireId}, using defaults`);
      }
    } catch (err) {
      console.error(`[GrimoirePage] Failed to load grimoire "${grimoireId}":`, err);
      error = err instanceof Error ? err.message : "Failed to load grimoire";
    } finally {
      loading = false;
    }
  });

  /**
   * Check if grimoire config uses hybrid rendering (mix of custom + DataExplorer views)
   */
  function hasHybridViews(config: GrimoireAdminConfig): boolean {
    const customCount = config.views.filter(v => v.type === "custom").length;
    const explorerCount = config.views.filter(v => v.type !== "custom").length;
    // Hybrid = has BOTH custom and explorer views, OR only explorer views (no legacy monolith)
    return customCount > 0 || explorerCount > 0;
  }

  /**
   * Get DataExplorer config for the currently active view
   */
  function getActiveExplorerConfig(): AdminConfig | undefined {
    if (!grimoireConfig) return undefined;
    return generateExplorerConfig(grimoireConfig, activeViewId);
  }

  /**
   * Check if the active view is a custom Svelte component
   */
  function isActiveViewCustom(): boolean {
    if (!grimoireConfig) return false;
    const view = grimoireConfig.views.find(v => v.id === activeViewId);
    return view?.type === "custom" && activeViewId in customViews;
  }

  /**
   * Get the active custom view component
   */
  function getActiveCustomView(): Component | undefined {
    return customViews[activeViewId];
  }

  /**
   * Get label for a view tab
   */
  function getViewLabel(view: AdminViewConfig): string {
    return view.title || view.id;
  }
</script>

{#if loading}
  <div class="flex items-center justify-center h-96">
    <div class="flex flex-col items-center gap-4">
      <div class="w-8 h-8 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div>
      <p class="text-gremius-subtle text-sm">Loading {grimoireId}...</p>
    </div>
  </div>
{:else if error && !grimoireConfig && !LegacyView}
  <div class="flex items-center justify-center h-96">
    <div class="text-center">
      <div class="text-4xl mb-4">⚠️</div>
      <h3 class="text-lg font-semibold text-gremius-text mb-2">Failed to Load</h3>
      <p class="text-sm text-gremius-subtle">{error}</p>
    </div>
  </div>
{:else if LegacyView}
  <!-- LEGACY MODE: Full custom monolith view -->
  <LegacyView />
{:else if grimoireConfig && grimoireConfig.views.length > 0}
  <!-- HYBRID MODE: Tabs with DataExplorer + Custom views -->
  <div class="space-y-4">
    <!-- View Tabs -->
    {#if grimoireConfig.views.length > 1}
      <div class="border-b border-gremius-border">
        <div class="flex gap-1">
          {#each grimoireConfig.views as view}
            {@const isActive = activeViewId === view.id}
            {@const isCustomReady = view.type === "custom" ? (view.id in customViews) : true}
            <button
              onclick={() => activeViewId = view.id}
              class="group px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-200 inline-flex items-center gap-2"
              class:border-gremius-cyan={isActive}
              class:text-gremius-cyan={isActive}
              class:border-transparent={!isActive}
              class:text-gremius-text-dim={!isActive}
              class:hover:text-gremius-text={!isActive}
              disabled={view.type === "custom" && !isCustomReady}
              title={view.type === "custom" && !isCustomReady ? "Custom view not yet implemented" : undefined}
            >
              {#if view.type === "custom"}
                <span class="w-2 h-2 rounded-full bg-gremius-pink"></span>
              {:else if view.type === "kanban"}
                <span class="w-2 h-2 rounded-full bg-gremius-purple"></span>
              {:else if view.type === "calendar"}
                <span class="w-2 h-2 rounded-full bg-gremius-amber"></span>
              {:else}
                <span class="w-2 h-2 rounded-full bg-gremius-cyan"></span>
              {/if}
              {getViewLabel(view)}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- View Content -->
    <div class="animate-fade-in">
      {#if isActiveViewCustom()}
        {@const CustomComponent = getActiveCustomView()}
        {#if CustomComponent}
          <CustomComponent />
        {:else}
          <div class="card p-12 text-center">
            <p class="text-gremius-subtle">Custom view "{activeViewId}" is not yet implemented.</p>
          </div>
        {/if}
      {:else}
        {@const explorerConfig = getActiveExplorerConfig()}
        {#if explorerConfig}
          <DataExplorer 
            {grimoireId} 
            config={explorerConfig} 
            viewId={activeViewId || "default"} 
            allTables={grimoireConfig.tables.map(t => ({ name: t.name, label: t.label }))}
          />
        {:else}
          <div class="card p-12 text-center">
            <p class="text-gremius-subtle">No explorer configuration for view "{activeViewId}".</p>
          </div>
        {/if}
      {/if}
    </div>
  </div>
{:else}
  <!-- FALLBACK: Auto-generated DataExplorer -->
  {#await generateDefaultConfig(grimoireId) then fallbackConfig}
    <DataExplorer 
      {grimoireId} 
      config={fallbackConfig} 
      viewId="default" 
      allTables={grimoireConfig?.tables.map(t => ({ name: t.name, label: t.label }))}
    />
  {:catch}
    <div class="flex items-center justify-center h-96">
      <div class="text-center">
        <div class="text-4xl mb-4">📭</div>
        <h3 class="text-lg font-semibold text-gremius-text mb-2">No Configuration</h3>
        <p class="text-sm text-gremius-subtle">This grimoire has no admin configuration.</p>
      </div>
    </div>
  {/await}
{/if}

<style>
  .animate-fade-in {
    animation: fadeIn 0.2s ease-out;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
