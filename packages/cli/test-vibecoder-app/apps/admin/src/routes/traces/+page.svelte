<script lang="ts">
  import { onMount } from "svelte";

  import { goto } from "$app/navigation";
  
  // Redirect to agents/traces
  onMount(() => {
    goto("/agents/traces");
  });
</script>

<div class="flex items-center justify-center h-64">
  <div class="animate-pulse text-zinc-500">Redirigiendo a traces...</div>
</div>
