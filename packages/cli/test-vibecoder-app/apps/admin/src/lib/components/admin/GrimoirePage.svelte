<script lang="ts">
  /**
   * GrimoirePage.svelte — Zero Config Edition
   * 
   * Smart loader that:
   * 1. Fetches grimoire config from /api/admin/registry (auto-discovered)
   * 2. Checks for custom Svelte view (legacy registry or auto-detected)
   * 3. Falls back to DataExplorer with auto-generated config
   * 
   * Also supports Core Engines (like media-library) that have custom views
   * but are not listed in the grimoire registry.
   */
  import { onMount } from "svelte";
  import DataExplorer from "$lib/components/admin/DataExplorer.svelte";
  import { 
    getGrimoireConfig, 
    loadCustomView, 
    generateExplorerConfig,
    generateDefaultConfig,
    hasCustomView 
  } from "$lib/grimoire-loader";
  import type { Component } from "svelte";
  import type { AdminConfig } from "$lib/types/admin";

  let { grimoireId }: { grimoireId: string } = $props();

  let CustomView: Component | null = $state(null);
  let config = $state<AdminConfig | undefined>(undefined);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Core engines with custom views that are not in the registry
  const CORE_ENGINES_WITH_VIEWS = ["media-library", "media"];

  onMount(async () => {
    try {
      // Step 1: Check for custom view first (for core engines like media-library)
      if (hasCustomView(grimoireId) || CORE_ENGINES_WITH_VIEWS.includes(grimoireId)) {
        const view = await loadCustomView(grimoireId);
        if (view) {
          CustomView = view;
          loading = false;
          return;
        }
      }

      // Step 2: Fetch auto-discovered config from registry
      const grimoireConfig = await getGrimoireConfig(grimoireId);
      
      if (grimoireConfig) {
        // Step 3: Check for custom view from registry
        if (grimoireConfig.hasCustomView || hasCustomView(grimoireId)) {
          const view = await loadCustomView(grimoireId);
          if (view) {
            CustomView = view;
          }
        }
        
        // Step 4: Generate DataExplorer config from registry
        if (!CustomView) {
          config = generateExplorerConfig(grimoireConfig);
        }
      } else {
        // Fallback: Try to generate default config
        console.warn(`[GrimoirePage] No registry config for ${grimoireId}, using defaults`);
        config = await generateDefaultConfig(grimoireId);
      }
    } catch (err) {
      console.error(`[GrimoirePage] Failed to load grimoire "${grimoireId}":`, err);
      error = err instanceof Error ? err.message : "Failed to load grimoire";
      
      // Ultimate fallback
      config = await generateDefaultConfig(grimoireId);
    } finally {
      loading = false;
    }
  });
</script>

{#if loading}
  <div class="flex items-center justify-center h-96">
    <div class="flex flex-col items-center gap-4">
      <div class="w-8 h-8 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div>
      <p class="text-gremius-subtle text-sm">Loading {grimoireId}...</p>
    </div>
  </div>
{:else if error && !config && !CustomView}
  <div class="flex items-center justify-center h-96">
    <div class="text-center">
      <div class="text-4xl mb-4">⚠️</div>
      <h3 class="text-lg font-semibold text-gremius-text mb-2">Failed to Load</h3>
      <p class="text-sm text-gremius-subtle">{error}</p>
    </div>
  </div>
{:else if CustomView}
  <CustomView />
{:else if config}
  <DataExplorer 
    {grimoireId} 
    {config} 
    viewId={config?.views?.[0]?.id || "default"} 
  />
{:else}
  <div class="flex items-center justify-center h-96">
    <div class="text-center">
      <div class="text-4xl mb-4">📭</div>
      <h3 class="text-lg font-semibold text-gremius-text mb-2">No Configuration</h3>
      <p class="text-sm text-gremius-subtle">This grimoire has no admin configuration.</p>
    </div>
  </div>
{/if}
