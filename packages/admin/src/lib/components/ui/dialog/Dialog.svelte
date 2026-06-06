<script lang="ts">
  import { Modal } from "$lib/components/ui";
  let {
    open = $bindable(false),
    children,
    onOpenChange,
  }: {
    open?: boolean;
    children?: import("svelte").Snippet;
    onOpenChange?: (v: boolean) => void;
  } = $props();
</script>

<Modal bind:open {onOpenChange}>
  {@render children?.()}
</Modal>
