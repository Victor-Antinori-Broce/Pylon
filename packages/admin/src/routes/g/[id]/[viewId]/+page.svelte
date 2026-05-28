<script lang="ts">
  import { page } from "$app/stores";
  import GrimoirePage from "$lib/components/admin/GrimoirePage.svelte";

  let grimoireId = $derived($page.params.id);
  let viewId = $derived($page.params.viewId);
</script>

<GrimoirePage {grimoireId} initialViewId={viewId} />
