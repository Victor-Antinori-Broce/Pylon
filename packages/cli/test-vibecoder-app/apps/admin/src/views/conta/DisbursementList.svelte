<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";
  import { toast } from "svelte-sonner";
  import Button from "$lib/components/ui/Button.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import { FileText, DollarSign, Trash2, Plus } from "lucide-svelte";

  interface Props {
    onView: (id: string) => void;
    onCreate: () => void;
  }
  let { onView, onCreate }: Props = $props();

  let disbursements = $state<any[]>([]);
  let loading = $state(true);
  let statusFilter = $state("");
  let matters = $state<any[]>([]);

  async function load() {
    loading = true;
    try {
      const [dRes, mRes] = await Promise.all([
        api.getContaDisbursements({ status: statusFilter || undefined, limit: 100 }),
        api.getContaMatters(),
      ]);
      disbursements = dRes.data || [];
      matters = mRes.data || [];
    } catch (e: any) {
      toast.error("Error loading disbursements: " + e.message);
    } finally { loading = false; }
  }

  async function bill(id: string) {
    try {
      await api.billContaDisbursement(id);
      toast.success("Disbursement billed");
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function pay(id: string) {
    try {
      await api.payContaDisbursement(id);
      toast.success("Disbursement paid");
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this disbursement?")) return;
    try {
      await api.deleteContaDisbursement(id);
      toast.success("Deleted");
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  function statusBadge(status: string) {
    switch (status) {
      case "paid": return { variant: "success" as const, label: "Paid" };
      case "billed": return { variant: "info" as const, label: "Billed" };
      default: return { variant: "warning" as const, label: "Pending" };
    }
  }

  function matterName(id: string) {
    return matters.find(m => m.id === id)?.name || id;
  }

  onMount(load);
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <select bind:value={statusFilter} onchange={load} class="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm">
      <option value="">All statuses</option>
      <option value="pending">Pending</option>
      <option value="billed">Billed</option>
      <option value="paid">Paid</option>
    </select>
    <Button onclick={onCreate}><Plus class="w-4 h-4 mr-2" /> New Disbursement</Button>
  </div>

  {#if loading}
    <div class="flex items-center justify-center h-48"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div></div>
  {:else}
    <div class="border border-zinc-800 rounded-lg overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-zinc-900/80 text-zinc-400 text-left">
          <tr>
            <th class="px-4 py-3 font-medium">Matter</th>
            <th class="px-4 py-3 font-medium">Description</th>
            <th class="px-4 py-3 font-medium">Amount</th>
            <th class="px-4 py-3 font-medium">Status</th>
            <th class="px-4 py-3 font-medium">Created</th>
            <th class="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-800">
          {#each disbursements as d}
            {@const sb = statusBadge(d.status)}
            <tr class="hover:bg-zinc-800/30 transition-colors">
              <td class="px-4 py-3">{matterName(d.matterId)}</td>
              <td class="px-4 py-3 max-w-xs truncate">{d.description}</td>
              <td class="px-4 py-3 font-mono">{Number(d.amount).toFixed(2)}</td>
              <td class="px-4 py-3"><Badge variant={sb.variant}>{sb.label}</Badge></td>
              <td class="px-4 py-3 text-zinc-400">{new Date(d.createdAt).toLocaleDateString()}</td>
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-2">
                  {#if d.status === "pending"}
                    <Button variant="ghost" size="sm" onclick={() => bill(d.id)} title="Bill"><FileText class="w-4 h-4 text-blue-400" /></Button>
                  {/if}
                  {#if d.status === "billed"}
                    <Button variant="ghost" size="sm" onclick={() => pay(d.id)} title="Pay"><DollarSign class="w-4 h-4 text-emerald-400" /></Button>
                  {/if}
                  <Button variant="ghost" size="sm" onclick={() => remove(d.id)} title="Delete"><Trash2 class="w-4 h-4 text-red-400" /></Button>
                </div>
              </td>
            </tr>
          {:else}
            <tr><td colspan="6" class="px-4 py-12 text-center text-zinc-500">No disbursements found.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
