<script lang="ts">
  import { api } from "$lib/api";
  import Button from "$lib/components/ui/Button.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Label from "$lib/components/ui/Label.svelte";
  import Textarea from "$lib/components/ui/Textarea.svelte";
  import { ArrowLeft } from "lucide-svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  interface Props {
    accountId: string;
    onBack: () => void;
  }
  const { accountId, onBack }: Props = $props();

  let account = $state<any>(null);
  let movements = $state<any[]>([]);
  let loading = $state(true);
  let dateFrom = $state("");
  let dateTo = $state("");

  async function load() {
    loading = true;
    try {
      const [aRes, tRes] = await Promise.all([
        api.getContaAccount(accountId),
        api.getContaTAccount(accountId, { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }),
      ]);
      account = aRes.data;
      movements = tRes.data?.movements || [];
    } catch (e: any) {
      toast.error(e.message);
    } finally { loading = false; }
  }

  onMount(load);
</script>

<div class="space-y-6">
  <Button variant="ghost" onclick={onBack}><ArrowLeft class="w-4 h-4 mr-2" /> Back</Button>

  {#if loading}
    <div class="flex items-center justify-center h-48"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div></div>
  {:else if account}
    <div class="grid gap-4 md:grid-cols-2">
      <div><Label>Code</Label><Input value={account.code} disabled /></div>
      <div><Label>Name</Label><Input value={account.name} disabled /></div>
      <div><Label>Type</Label><Input value={account.type} class="capitalize" disabled /></div>
      <div><Label>Current Balance</Label><Input value={Number(account.currentBalance).toFixed(2)} class="font-mono" disabled /></div>
      <div class="md:col-span-2"><Label>Description</Label><Textarea value={account.description || ""} disabled rows={2} /></div>
      <div><Label>Trust Account</Label><Input value={account.isTrustAccount ? "Yes" : "No"} disabled /></div>
      <div><Label>Active</Label><Input value={account.isActive ? "Yes" : "No"} disabled /></div>
    </div>

    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-zinc-200">Ledger Movements</h3>
        <div class="flex items-center gap-2">
          <Input type="date" bind:value={dateFrom} class="w-36 text-sm py-1" />
          <Input type="date" bind:value={dateTo} class="w-36 text-sm py-1" />
          <Button variant="outline" size="sm" onclick={load}>Filter</Button>
        </div>
      </div>

      <div class="border border-zinc-800 rounded-lg overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-zinc-900/80 text-zinc-400 text-left">
            <tr>
              <th class="px-4 py-3 font-medium">Date</th>
              <th class="px-4 py-3 font-medium">Description</th>
              <th class="px-4 py-3 font-medium text-right">Debit</th>
              <th class="px-4 py-3 font-medium text-right">Credit</th>
              <th class="px-4 py-3 font-medium text-right">Balance</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-800">
            {#each movements as m}
              <tr class="hover:bg-zinc-800/20">
                <td class="px-4 py-2">{m.date}</td>
                <td class="px-4 py-2">{m.description}</td>
                <td class="px-4 py-2 text-right font-mono">{Number(m.debit).toFixed(2)}</td>
                <td class="px-4 py-2 text-right font-mono">{Number(m.credit).toFixed(2)}</td>
                <td class="px-4 py-2 text-right font-mono">{Number(m.balance).toFixed(2)}</td>
              </tr>
            {:else}
              <tr><td colspan="5" class="px-4 py-12 text-center text-zinc-500">No movements found.</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
