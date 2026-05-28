<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";
  import { toast } from "svelte-sonner";
  import { Users, Building2, Briefcase, TrendingUp } from "lucide-svelte";
  import type { CRMStats } from "./types";

  let stats = $state<CRMStats | null>(null);
  let loading = $state(true);

  function formatCurrency(cents: number): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(cents / 100);
  }

  async function load() {
    loading = true;
    try {
      const res = await api.getCrmStats();
      stats = res.data;
    } catch (e: any) {
      toast.error("Error loading CRM stats: " + e.message);
    } finally {
      loading = false;
    }
  }

  onMount(load);
</script>

<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  {#if loading}
    {#each [1, 2, 3, 4] as _}
      <div class="border border-zinc-800 rounded-lg bg-zinc-900/50 p-6">
        <div class="animate-pulse space-y-3">
          <div class="h-4 w-20 bg-zinc-800 rounded"></div>
          <div class="h-8 w-32 bg-zinc-800 rounded"></div>
        </div>
      </div>
    {/each}
  {:else if stats}
    <div class="border border-zinc-800 rounded-lg bg-zinc-900/50 p-6">
      <div class="flex items-center gap-3">
        <div class="p-2 bg-indigo-500/10 rounded-lg">
          <Users class="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <p class="text-sm text-zinc-400">Contacts</p>
          <p class="text-2xl font-semibold text-zinc-100">{stats.contacts.toLocaleString()}</p>
        </div>
      </div>
    </div>

    <div class="border border-zinc-800 rounded-lg bg-zinc-900/50 p-6">
      <div class="flex items-center gap-3">
        <div class="p-2 bg-emerald-500/10 rounded-lg">
          <Building2 class="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <p class="text-sm text-zinc-400">Companies</p>
          <p class="text-2xl font-semibold text-zinc-100">{stats.companies.toLocaleString()}</p>
        </div>
      </div>
    </div>

    <div class="border border-zinc-800 rounded-lg bg-zinc-900/50 p-6">
      <div class="flex items-center gap-3">
        <div class="p-2 bg-amber-500/10 rounded-lg">
          <Briefcase class="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <p class="text-sm text-zinc-400">Open Deals</p>
          <p class="text-2xl font-semibold text-zinc-100">{formatCurrency(stats.deals.values.open)}</p>
        </div>
      </div>
    </div>

    <div class="border border-zinc-800 rounded-lg bg-zinc-900/50 p-6">
      <div class="flex items-center gap-3">
        <div class="p-2 bg-purple-500/10 rounded-lg">
          <TrendingUp class="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <p class="text-sm text-zinc-400">Won Deals</p>
          <p class="text-2xl font-semibold text-zinc-100">{formatCurrency(stats.deals.values.won)}</p>
        </div>
      </div>
    </div>
  {/if}
</div>
