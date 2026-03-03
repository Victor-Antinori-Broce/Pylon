<script lang="ts">
  import { goto } from "$app/navigation";
  import SchemaBuilder from "$lib/components/datasets/SchemaBuilder.svelte";
  import { datasetStore } from "$lib/states/datasets.svelte";
  import { ArrowLeft } from "lucide-svelte";
  import type { DatasetDefinition } from "@gremius/shared";

  let saving = $state(false);
  let error = $state<string | null>(null);

  const initialDatasetData: DatasetDefinition = {
    id: "",
    name: "",
    slug: "",
    icon: "📦",
    description: "",
    fields: [],
    customEndpoints: []
  };

  async function handleSave(datasetSchema: DatasetDefinition) {
    saving = true;
    error = null;
    try {
      await datasetStore.createDataset(datasetSchema);
      // Navigate back to list on success
      goto("/datasets");
    } catch (err: any) {
      error = err.message || "Failed to create dataset";
      console.error(err);
    } finally {
      saving = false;
    }
  }

  function handleCancel() {
    goto("/datasets");
  }
</script>

<div class="space-y-6 animate-fade-in pb-20">
  <div class="flex items-center gap-4">
    <button class="btn-icon p-2 hover:bg-gremius-surface rounded-lg transition-colors text-gremius-subtle" onclick={handleCancel}>
      <ArrowLeft class="w-5 h-5" />
    </button>
    <div>
      <h1 class="text-2xl font-bold text-gremius-text">Create Dataset</h1>
      <p class="text-sm text-gremius-text-dim mt-1">
        Define the schema and fields for your new data collection API.
      </p>
    </div>
  </div>

  {#if error}
    <div class="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
      {error}
    </div>
  {/if}

  <div class="card p-6 border-gremius-cyan/20">
    <SchemaBuilder 
      definition={initialDatasetData}
      onSave={handleSave} 
      onCancel={handleCancel} 
    />
  </div>
</div>
