<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";
  import { toast } from "svelte-sonner";
  import Button from "$lib/components/ui/Button.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import { Plus, Eye, CheckCircle } from "lucide-svelte";

  interface Props {
    onView: (id: string) => void;
    onCreate: () => void;
  }
  let { onView, onCreate }: Props = $props();

  let journals = $state<any[]>([]);
  let loading = $state(true);
  let page = $state(1);
  let limit = $state(20);
  let totalPages = $state(1);
  let statusFilter = $state("");
  let typeFilter = $state("");

  async function load() {
    loading = true;
    try {
      const res = await api.getContaJournals({ status: statusFilter || undefined, type: typeFilter || undefined, limit, page });
      journals = res.data || [];
      totalPages = res.pagination?.totalPages || 1;
    } catch (e: any) {
      toast.error("Error loading journals: " + e.message);
    } finally {
      loading = false;
    }
  }

  async function postJournal(id: string) {
    try {
      await api.postContaJournal(id);
      toast.success("Journal posted");
      load();
    } catch (e: any) {
      toast.error("Failed to post: " + e.message);
    }
  }

  function statusBadge(status: string) {
    switch (status) {
      case "posted": return { variant: "success" as const, label: "Posted" };
      case "reversed": return { variant: "error" as const, label: "Reversed" };
      default: return { variant: "warning" as const, label: "Draft" };
    }
  }

  onMount(load);
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <select bind:value={statusFilter} onchange={load} class="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm">
        <option value="">All statuses</option>
        <option value="draft">Draft</option>
        <option value="posted">Posted</option>
        <option value="reversed">Reversed</option>
      </select>
      <select bind:value={typeFilter} onchange={load} class="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm">
        <option value="">All types</option>
        <option value="standard">Standard</option>
        <option value="trust_deposit">Trust Deposit</option>
        <option value="trust_withdrawal">Trust Withdrawal</option>
        <option value="disbursement">Disbursement</option>
        <option value="disbursement_billed">Disbursement Billed</option>
      </select>
    </div>
    <Button onclick={onCreate}><Plus class="w-4 h-4 mr-2" /> New Journal</Button>
  </div>

  {#if loading}
    <div class="flex items-center justify-center h-48"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div></div>
  {:else}
    <div class="border border-zinc-800 rounded-lg overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-zinc-900/80 text-zinc-400 text-left">
          <tr>
            <th class="px-4 py-3 font-medium">Date</th>
            <th class="px-4 py-3 font-medium">Description</th>
            <th class="px-4 py-3 font-medium">Reference</th>
            <th class="px-4 py-3 font-medium">Type</th>
            <th class="px-4 py-3 font-medium">Amount</th>
            <th class="px-4 py-3 font-medium">Status</th>
            <th class="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-800">
          {#each journals as j}
            {@const sb = statusBadge(j.status)}
            <tr class="hover:bg-zinc-800/30 transition-colors">
              <td class="px-4 py-3">{j.date}</td>
              <td class="px-4 py-3 max-w-xs truncate">{j.description}</td>
              <td class="px-4 py-3 text-zinc-400">{j.reference || "—"}</td>
              <td class="px-4 py-3"><span class="text-xs bg-zinc-800 px-2 py-0.5 rounded">{j.journalType}</span></td>
              <td class="px-4 py-3 font-mono">{Number(j.totalAmount).toFixed(2)}</td>
              <td class="px-4 py-3">
                <Badge variant={sb.variant}>{sb.label}</Badge>
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" onclick={() => onView(j.id)}><Eye class="w-4 h-4" /></Button>
                  {#if j.status === "draft"}
                    <Button variant="ghost" size="sm" onclick={() => postJournal(j.id)}><CheckCircle class="w-4 h-4 text-emerald-400" /></Button>
                  {/if}
                </div>
              </td>
            </tr>
          {:else}
            <tr><td colspan="7" class="px-4 py-12 text-center text-zinc-500">No journals found.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="flex items-center justify-between">
      <Button variant="outline" size="sm" disabled={page <= 1} onclick={() => { page--; load(); }}>Previous</Button>
      <span class="text-sm text-zinc-400">Page {page} of {totalPages}</span>
      <Button variant="outline" size="sm" disabled={page >= totalPages} onclick={() => { page++; load(); }}>Next</Button>
    </div>
  {/if}
</div>
