<script lang="ts">
  const {
    children,
    class: className = "",
  }: { children?: import("svelte").Snippet; class?: string } = $props();
</script>

<thead class="[&_tr]:border-b {className}">
  {@render children?.()}
</thead>
