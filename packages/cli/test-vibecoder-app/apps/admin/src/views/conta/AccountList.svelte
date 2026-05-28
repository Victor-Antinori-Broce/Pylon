<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";
  import { toast } from "svelte-sonner";
  import Button from "$lib/components/ui/Button.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import { Plus, Eye, Landmark } from "lucide-svelte";

  interface Props {
    onView: (id: string) => void;
  }
  let { onView }: Props = $props();

  let accounts = $state<any[]>([]);
  let loading = $state(true);
  let typeFilter = $state("");

  async function load() {
    loading = true;
    try {
      const res = await api.getContaAccounts({ type: typeFilter || undefined, limit: 500 });
      accounts = res.data || [];
    } catch (e: any) {
      toast.error("Error loading accounts: " + e.message);
    } finally {
      loading = false;
    }
  }

  function typeColor(type: string) {
    switch (type) {
      case "asset": return "text-emerald-400";
      case "liability": return "text-red-400";
      case "equity": return "text-blue-400";
      case "revenue": return "text-purple-400";
      case "expense": return "text-amber-400";
      default: return "text-zinc-400";
    }
  }

  onMount(load);
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <select bind:value={typeFilter} onchange={load} class="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm">
      <option value="">All types</option>
      <option value="asset">Asset</option>
      <option value="liability">Liability</option>
      <option value="equity">Equity</option>
      <option value="revenue">Revenue</option>
      <option value="expense">Expense</option>
    </select>
  </div>

  {#if loading}
    <div class="flex items-center justify-center h-48"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div></div>
  {:else}
    <div class="border border-zinc-800 rounded-lg overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-zinc-900/80 text-zinc-400 text-left">
          <tr>
            <th class="px-4 py-3 font-medium">Code</th>
            <th class="px-4 py-3 font-medium">Name</th>
            <th class="px-4 py-3 font-medium">Type</th>
            <th class="px-4 py-3 font-medium">Balance</th>
            <th class="px-4 py-3 font-medium">Trust</th>
            <th class="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-800">
          {#each accounts as a}
            <tr class="hover:bg-zinc-800/30 transition-colors">
              <td class="px-4 py-3 font-mono text-zinc-300">{a.code}</td>
              <td class="px-4 py-3">{a.name}</td>
              <td class="px-4 py-3"><span class="capitalize {typeColor(a.type)}">{a.type}</span></td>
              <td class="px-4 py-3 font-mono">{Number(a.currentBalance).toFixed(2)}</td>
              <td class="px-4 py-3">
                {#if a.isTrustAccount}
                  <Badge variant="info">Trust</Badge>
                {:else}
                  <span class="text-zinc-600">—</span>
                {/if}
              </td>
              <td class="px-4 py-3 text-right">
                <Button variant="ghost" size="sm" onclick={() => onView(a.id)}><Eye class="w-4 h-4" /></Button>
              </td>
            </tr>
          {:else}
            <tr><td colspan="6" class="px-4 py-12 text-center text-zinc-500">No accounts found.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
