<script lang="ts">
  import { api } from "$lib/api";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import { Plus, Search, Eye, Trash2 } from "lucide-svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  import type { CrmDeal, CrmPipeline, CrmPipelineStage } from "./types";

  interface Props {
    onView: (id: string) => void;
    onCreate: () => void;
  }
  const { onView, onCreate }: Props = $props();

  let deals = $state<CrmDeal[]>([]);
  let pipelines = $state<CrmPipeline[]>([]);
  let stages = $state<CrmPipelineStage[]>([]);
  let loading = $state(true);
  let searchQuery = $state("");
  let pipelineFilter = $state("");
  let stageFilter = $state("");
  let statusFilter = $state("");
  let totalCount = $state(0);

  async function loadPipelines() {
    try {
      const res = await api.getCrmPipelines();
      pipelines = res.data || [];
    } catch (e: any) {
      toast.error("Error loading pipelines: " + e.message);
    }
  }

  async function loadStages() {
    stages = [];
    if (!pipelineFilter) return;
    try {
      const res = await api.getCrmPipeline(pipelineFilter);
      stages = res.data?.stages || [];
    } catch (e: any) {
      console.error("Failed to load stages", e);
    }
  }

  async function load() {
    loading = true;
    try {
      const res = await api.getCrmDeals({
        pipelineId: pipelineFilter || undefined,
        stageId: stageFilter || undefined,
        status: statusFilter || undefined,
        search: searchQuery || undefined,
        limit: 50,
      });
      deals = res.data || [];
      totalCount = res.pagination?.total ?? deals.length;
    } catch (e: any) {
      toast.error("Error loading deals: " + e.message);
    } finally {
      loading = false;
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this deal?")) return;
    try {
      await api.deleteCrmDeal(id);
      toast.success("Deal deleted");
      load();
    } catch (e: any) {
      toast.error("Failed to delete: " + e.message);
    }
  }

  async function moveDeal(id: string, targetStageId: string) {
    if (!targetStageId) return;
    try {
      await api.moveCrmDeal(id, targetStageId);
      toast.success("Deal moved");
      load();
    } catch (e: any) {
      toast.error("Failed to move: " + e.message);
    }
  }

  function formatCurrency(cents: number): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(cents / 100);
  }

  function statusVariant(status: string): "default" | "success" | "warning" | "error" | "info" {
    switch (status) {
      case "won": return "success";
      case "lost": return "error";
      case "paused": return "warning";
      default: return "info";
    }
  }

  function formatDate(date?: string): string {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  onMount(async () => {
    await loadPipelines();
    load();
  });
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between gap-4 flex-wrap">
    <div class="flex items-center gap-3 flex-1">
      <div class="relative flex-1 max-w-sm">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input bind:value={searchQuery} class="pl-9" placeholder="Search deals..." onkeydown={(e) => e.key === 'Enter' && load()} />
      </div>
      <select bind:value={pipelineFilter} onchange={() => { stageFilter = ""; loadStages(); load(); }} class="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100">
        <option value="">All Pipelines</option>
        {#each pipelines as p}
          <option value={p.id}>{p.name}</option>
        {/each}
      </select>
      <select bind:value={stageFilter} onchange={load} class="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100" disabled={!pipelineFilter}>
        <option value="">All Stages</option>
        {#each stages as s}
          <option value={s.id}>{s.name}</option>
        {/each}
      </select>
      <select bind:value={statusFilter} onchange={load} class="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100">
        <option value="">All Status</option>
        <option value="open">Open</option>
        <option value="won">Won</option>
        <option value="lost">Lost</option>
        <option value="paused">Paused</option>
      </select>
    </div>
    <Button variant="outline" size="sm" onclick={load}>Search</Button>
    <Button onclick={onCreate}><Plus class="w-4 h-4 mr-2" /> Add Deal</Button>
  </div>

  {#if loading}
    <div class="flex items-center justify-center h-48"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div></div>
  {:else}
    <div class="border border-zinc-800 rounded-lg overflow-hidden">
      <div class="flex items-center justify-between px-4 py-2 bg-zinc-900/40 border-b border-zinc-800 text-xs text-zinc-500">
        <span>{deals.length} of {totalCount} deals</span>
      </div>
      <table class="w-full text-sm">
        <thead class="bg-zinc-900/80 text-zinc-400 text-left sticky top-0">
          <tr>
            <th class="px-4 py-3 font-medium">Title</th>
            <th class="px-4 py-3 font-medium">Value</th>
            <th class="px-4 py-3 font-medium">Stage</th>
            <th class="px-4 py-3 font-medium">Status</th>
            <th class="px-4 py-3 font-medium">Contact</th>
            <th class="px-4 py-3 font-medium">Company</th>
            <th class="px-4 py-3 font-medium">Expected Close</th>
            <th class="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-800">
          {#each deals as d}
            <tr class="hover:bg-zinc-800/50 transition-colors even:bg-zinc-900/20">
              <td class="px-4 py-3 text-zinc-100 font-medium">{d.title}</td>
              <td class="px-4 py-3 text-zinc-300">{formatCurrency(d.value)}</td>
              <td class="px-4 py-3 text-zinc-400">{d.stage?.name || "—"}</td>
              <td class="px-4 py-3">
                <Badge variant={statusVariant(d.status)}>{d.status}</Badge>
              </td>
              <td class="px-4 py-3 text-zinc-400">{d.contact ? `${d.contact.firstName} ${d.contact.lastName}` : "—"}</td>
              <td class="px-4 py-3 text-zinc-400">{d.company?.name || "—"}</td>
              <td class="px-4 py-3 text-zinc-400">{formatDate(d.expectedCloseDate)}</td>
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-2">
                  {#if stages.length > 0 && d.status === "open"}
                    <select
                      class="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100"
                      onchange={(e) => moveDeal(d.id, (e.target as HTMLSelectElement).value)}
                    >
                      <option value="">Move...</option>
                      {#each stages.filter((s) => s.id !== d.stageId) as s}
                        <option value={s.id}>To: {s.name}</option>
                      {/each}
                    </select>
                  {/if}
                  <Button variant="ghost" size="sm" onclick={() => onView(d.id)}><Eye class="w-4 h-4" /></Button>
                  <Button variant="ghost" size="sm" onclick={() => remove(d.id)}><Trash2 class="w-4 h-4 text-red-400" /></Button>
                </div>
              </td>
            </tr>
          {:else}
            <tr><td colspan="8" class="px-4 py-12 text-center text-zinc-500">No deals found.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
