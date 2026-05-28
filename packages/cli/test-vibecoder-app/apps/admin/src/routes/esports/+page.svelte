<script lang="ts">
  import { onMount } from "svelte";
  import DataExplorer from "$lib/components/admin/DataExplorer.svelte";
  import { fetchGrimoireConfig, generateDefaultConfig } from "$lib/grimoire-loader";
  import type { AdminConfig } from "$lib/types/admin";
  
  const grimoireId = "esports";
  
  let config = $state<AdminConfig | undefined>(undefined);
  let loading = $state(true);
  
  onMount(async () => {
    const customConfig = await fetchGrimoireConfig(grimoireId);
    config = customConfig || await generateDefaultConfig(grimoireId);
    loading = false;
  });
</script>

{#if loading}
  <div class="flex items-center justify-center h-96">
    <div class="flex flex-col items-center gap-4">
      <div class="w-8 h-8 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div>
      <p class="text-gremius-subtle text-sm">Loading esports...</p>
    </div>
  </div>
{:else}
  <DataExplorer {grimoireId} {config} viewId={config?.views?.[0]?.id || "default"} />
{/if}
