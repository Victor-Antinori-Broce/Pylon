<script>
  import { onMount } from "svelte";

  import { goto } from "$app/navigation";
  
  onMount(() => {
    // Redirect from old /blog/posts/new to /posts/new
    goto("/posts/new", { replaceState: true });
  });
</script>

<div class="flex items-center justify-center h-96">
  <div class="flex flex-col items-center gap-4">
    <div class="w-8 h-8 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div>
    <p class="text-gremius-subtle text-sm">Redirigiendo...</p>
  </div>
</div>
