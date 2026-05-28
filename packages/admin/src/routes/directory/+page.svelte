<script lang="ts">
  /**
   * LEGACY REDIRECT: This route is now served dynamically by the grimoire system.
   * The grimoire-directory module exposes its admin config via grimoire.json,
   * and the generic GrimoirePage renderer (g/[id]) handles it via DataExplorer.
   */
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";

  onMount(() => {
    goto("/g/grimoire-directory");
  });
</script>

<div class="flex items-center justify-center h-96">
  <div class="flex flex-col items-center gap-4">
    <div class="w-8 h-8 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div>
    <p class="text-gremius-subtle text-sm">Redirecting to grimoire-directory...</p>
  </div>
</div>
