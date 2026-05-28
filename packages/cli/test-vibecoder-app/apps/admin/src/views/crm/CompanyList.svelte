<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";
  import { toast } from "svelte-sonner";
  import Button from "$lib/components/ui/Button.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import { Plus, Search, Eye, Trash2 } from "lucide-svelte";
  import type { CrmCompany } from "./types";

  interface Props {
    onView: (id: string) => void;
    onCreate: () => void;
  }
  let { onView, onCreate }: Props = $props();

  let companies = $state<CrmCompany[]>([]);
  let loading = $state(true);
  let searchQuery = $state("");
  let industryFilter = $state("");
  let totalCount = $state(0);

  const industries = [
    "technology",
    "healthcare",
    "finance",
    "retail",
    "manufacturing",
    "education",
    "consulting",
    "marketing",
    "other",
  ];

  async function load() {
    loading = true;
    try {
      const res = await api.getCrmCompanies({
        industry: industryFilter || undefined,
        search: searchQuery || undefined,
        limit: 50,
      });
      companies = res.data || [];
      totalCount = res.pagination?.total ?? companies.length;
    } catch (e: any) {
      toast.error("Error loading companies: " + e.message);
    } finally {
      loading = false;
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this company?")) return;
    try {
      await api.deleteCrmCompany(id);
      toast.success("Company deleted");
      load();
    } catch (e: any) {
      toast.error("Failed to delete: " + e.message);
    }
  }

  function formatRevenue(value?: number): string {
    if (!value) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
      notation: "compact",
    }).format(value);
  }

  onMount(load);
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between gap-4">
    <div class="flex items-center gap-3 flex-1">
      <div class="relative flex-1 max-w-sm">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input bind:value={searchQuery} class="pl-9" placeholder="Search companies..." onkeydown={(e) => e.key === 'Enter' && load()} />
      </div>
      <Button variant="outline" size="sm" onclick={load}>Search</Button>
      <select bind:value={industryFilter} onchange={load} class="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100">
        <option value="">All Industries</option>
        {#each industries as ind}
          <option value={ind}>{ind.charAt(0).toUpperCase() + ind.slice(1)}</option>
        {/each}
      </select>
    </div>
    <Button onclick={onCreate}><Plus class="w-4 h-4 mr-2" /> Add Company</Button>
  </div>

  {#if loading}
    <div class="flex items-center justify-center h-48"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div></div>
  {:else}
    <div class="border border-zinc-800 rounded-lg overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-zinc-900/80 text-zinc-400 text-left">
          <tr>
            <th class="px-4 py-3 font-medium">Name</th>
            <th class="px-4 py-3 font-medium">Industry</th>
            <th class="px-4 py-3 font-medium">City / Country</th>
            <th class="px-4 py-3 font-medium">Revenue</th>
            <th class="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-800">
          {#each companies as c}
            <tr class="hover:bg-zinc-800/50 transition-colors even:bg-zinc-900/20">
              <td class="px-4 py-3 text-zinc-100 font-medium">{c.name}</td>
              <td class="px-4 py-3">
                {#if c.industry}
                  <Badge variant="secondary">{c.industry}</Badge>
                {:else}
                  <span class="text-zinc-600">—</span>
                {/if}
              </td>
              <td class="px-4 py-3 text-zinc-400">
                {#if c.city || c.country}
                  {c.city}{c.city && c.country ? ", " : ""}{c.country}
                {:else}
                  <span class="text-zinc-600">—</span>
                {/if}
              </td>
              <td class="px-4 py-3 text-zinc-300">{formatRevenue(c.annualRevenue)}</td>
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" onclick={() => onView(c.id)}><Eye class="w-4 h-4" /></Button>
                  <Button variant="ghost" size="sm" onclick={() => remove(c.id)}><Trash2 class="w-4 h-4 text-red-400" /></Button>
                </div>
              </td>
            </tr>
          {:else}
            <tr><td colspan="5" class="px-4 py-12 text-center text-zinc-500">No companies found.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
