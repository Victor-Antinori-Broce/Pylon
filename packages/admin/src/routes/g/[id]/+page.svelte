<script lang="ts">
  import { page } from "$app/stores";
  import GrimoirePage from "$lib/components/admin/GrimoirePage.svelte";

  // Access the dynamic [id] from the route URL
  let grimoireId = $derived($page.params.id);
</script>

<GrimoirePage {grimoireId} />
