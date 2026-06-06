<script lang="ts">
  import DataExplorer from "$lib/components/admin/DataExplorer.svelte";

  import { page } from "$app/stores";

  // The dataset ID from the URL becomes the grimoireId for DataExplorer.
  // DataExplorer will auto-detect schema + load entries from /api/explorer/{table}.
  // For datasets, the explorer endpoint handles dataset entries via the dataset slug/id.
  const datasetId = $derived($page.params.id);
</script>

<DataExplorer 
  grimoireId={datasetId}
  config={{
    name: `Dataset: ${datasetId}`,
    singularName: "Entry",
    apiEndpoint: `/api/data-sets/${datasetId}/entries`,
  }}
/>
