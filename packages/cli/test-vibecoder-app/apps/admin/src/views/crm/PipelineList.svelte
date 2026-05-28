<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";
  import { toast } from "svelte-sonner";
  import Button from "$lib/components/ui/Button.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import { Plus, Trash2, Settings, ChevronDown, ChevronUp } from "lucide-svelte";
  import type { CrmPipeline } from "./types";

  let pipelines = $state<CrmPipeline[]>([]);
  let pipelineStages = $state<Record<string, any[]>>({});
  let loading = $state(true);
  let expanded = $state<Record<string, boolean>>({});
  let showCreate = $state(false);
  let newName = $state("");
  let newCurrency = $state("USD");

  async function load() {
    loading = true;
    try {
      const res = await api.getCrmPipelines();
      pipelines = res.data || [];
      for (const p of pipelines) {
        expanded[p.id] = false;
      }
    } catch (e: any) {
      toast.error("Error loading pipelines: " + e.message);
    } finally {
      loading = false;
    }
  }

  async function loadStages(pipelineId: string) {
    if (pipelineStages[pipelineId]) return;
    try {
      const res = await api.getCrmPipeline(pipelineId);
      pipelineStages[pipelineId] = res.data?.stages || [];
    } catch (e: any) {
      console.error("Failed to load stages", e);
      pipelineStages[pipelineId] = [];
    }
  }

  function toggleExpand(id: string) {
    expanded[id] = !expanded[id];
    if (expanded[id]) loadStages(id);
  }

  async function create() {
    if (!newName.trim()) return;
    try {
      await api.createCrmPipeline({
        name: newName.trim(),
        currency: newCurrency,
        isDefault: pipelines.length === 0,
      });
      toast.success("Pipeline created");
      newName = "";
      newCurrency = "USD";
      showCreate = false;
      load();
    } catch (e: any) {
      toast.error("Failed to create: " + e.message);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this pipeline?")) return;
    try {
      await api.deleteCrmPipeline(id);
      toast.success("Pipeline deleted");
      load();
    } catch (e: any) {
      toast.error("Failed to delete: " + e.message);
    }
  }

  onMount(load);
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h2 class="text-lg font-semibold text-zinc-100 flex items-center gap-2">
      <Settings class="w-5 h-5" />
      Pipelines
    </h2>
    <Button onclick={() => { showCreate = !showCreate; }}><Plus class="w-4 h-4 mr-2" /> New Pipeline</Button>
  </div>

  {#if showCreate}
    <div class="border border-zinc-800 rounded-lg bg-zinc-900/50 p-4 space-y-3">
      <div class="flex items-center gap-3">
        <div class="flex-1">
          <label class="text-xs text-zinc-400 block mb-1">Name</label>
          <Input bind:value={newName} placeholder="Pipeline name" />
        </div>
        <div class="w-32">
          <label class="text-xs text-zinc-400 block mb-1">Currency</label>
          <select bind:value={newCurrency} class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100">
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="MXN">MXN</option>
          </select>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="secondary" size="sm" onclick={() => { showCreate = false; newName = ""; }}>Cancel</Button>
        <Button size="sm" onclick={create}>Create Pipeline</Button>
      </div>
    </div>
  {/if}

  {#if loading}
    <div class="flex items-center justify-center h-48"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div></div>
  {:else}
    <div class="border border-zinc-800 rounded-lg overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-zinc-900/80 text-zinc-400 text-left">
          <tr>
            <th class="px-4 py-3 font-medium w-8"></th>
            <th class="px-4 py-3 font-medium">Name</th>
            <th class="px-4 py-3 font-medium">Currency</th>
            <th class="px-4 py-3 font-medium">Default</th>
            <th class="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-800">
          {#each pipelines as p}
            <tr class="hover:bg-zinc-800/30 transition-colors">
              <td class="px-4 py-3">
                <Button variant="ghost" size="icon" onclick={() => toggleExpand(p.id)}>
                  {#if expanded[p.id]}
                    <ChevronUp class="w-4 h-4 text-zinc-400" />
                  {:else}
                    <ChevronDown class="w-4 h-4 text-zinc-400" />
                  {/if}
                </Button>
              </td>
              <td class="px-4 py-3 text-zinc-100 font-medium">{p.name}</td>
              <td class="px-4 py-3 text-zinc-400">{p.currency}</td>
              <td class="px-4 py-3">
                {#if p.isDefault}
                  <Badge variant="info">Default</Badge>
                {:else}
                  <span class="text-zinc-600">—</span>
                {/if}
              </td>
              <td class="px-4 py-3 text-right">
                <Button variant="ghost" size="sm" onclick={() => remove(p.id)}><Trash2 class="w-4 h-4 text-red-400" /></Button>
              </td>
            </tr>
            {#if expanded[p.id]}
              <tr>
                <td colspan="5" class="px-4 py-3 bg-zinc-900/30">
                  {#if pipelineStages[p.id]}
                    <div class="ml-8">
                      <p class="text-xs text-zinc-500 mb-2 uppercase tracking-wider font-medium">Stages</p>
                      {#if pipelineStages[p.id].length > 0}
                        <div class="border border-zinc-800 rounded-lg overflow-hidden">
                          <table class="w-full text-sm">
                            <thead class="bg-zinc-900/60 text-zinc-400 text-left">
                              <tr>
                                <th class="px-3 py-2 font-medium">Order</th>
                                <th class="px-3 py-2 font-medium">Name</th>
                                <th class="px-3 py-2 font-medium">Probability</th>
                                <th class="px-3 py-2 font-medium">WIP Limit</th>
                              </tr>
                            </thead>
                            <tbody class="divide-y divide-zinc-800">
                              {#each pipelineStages[p.id] as s}
                                <tr class="hover:bg-zinc-800/20 transition-colors">
                                  <td class="px-3 py-2 text-zinc-400">{s.order}</td>
                                  <td class="px-3 py-2 text-zinc-100 flex items-center gap-2">
                                    <span class="w-3 h-3 rounded-full inline-block" style="background-color: {s.color}"></span>
                                    {s.name}
                                  </td>
                                  <td class="px-3 py-2 text-zinc-400">{s.probability}%</td>
                                  <td class="px-3 py-2 text-zinc-400">{s.wipLimit || "—"}</td>
                                </tr>
                              {/each}
                            </tbody>
                          </table>
                        </div>
                      {:else}
                        <p class="text-sm text-zinc-500">No stages defined.</p>
                      {/if}
                    </div>
                  {:else}
                    <div class="flex items-center justify-center h-16">
                      <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-500"></div>
                    </div>
                  {/if}
                </td>
              </tr>
            {/if}
          {:else}
            <tr><td colspan="5" class="px-4 py-12 text-center text-zinc-500">No pipelines found.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
