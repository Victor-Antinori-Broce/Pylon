<script lang="ts">
  import DataSetEntries from "$views/DataSetEntries.svelte";
  import { page } from "$app/stores";
</script>

<DataSetEntries datasetId={$page.params.id} />
