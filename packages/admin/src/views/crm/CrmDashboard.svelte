<script lang="ts">
  import {
    Users,
    Building2,
    Briefcase,
    TrendingUp,
    Search,
    ChevronLeft,
    ChevronRight,
    Plus,
    Trash2,
    Edit2,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    ChevronDown,
    ChevronUp,
    Inbox,
    Kanban,
    CheckSquare,
    Square,
  } from "lucide-svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  import { api } from "$lib/api";

  import type {
    CRMStats,
    CrmDeal,
    CrmContact,
    CrmCompany,
    CrmPipeline,
    CrmPipelineStage,
  } from "./types";

  import { goto } from "$app/navigation";

  type Tab = "overview" | "deals" | "contacts" | "companies" | "pipelines";
  let activeTab = $state<Tab>("overview");

  let stats = $state<CRMStats | null>(null);
  let statsLoading = $state(true);
  let pipelines = $state<CrmPipeline[]>([]);
  let pipelinesLoading = $state(false);

  let deals = $state<CrmDeal[]>([]),
    dealsPag = $state({ total: 0, limit: 10, offset: 0 }),
    dealsLoading = $state(false),
    dealsSearch = $state(""),
    dealsStatus = $state(""),
    dealsPipelineId = $state(""),
    dealsSortField = $state<"value" | "expectedCloseDate" | "">(""),
    dealsSortDir = $state<"asc" | "desc">("desc"),
    selDeals = $state<Set<string>>(new Set());
  let contacts = $state<CrmContact[]>([]),
    contactsPag = $state({ total: 0, limit: 10, offset: 0 }),
    contactsLoading = $state(false),
    contactsSearch = $state(""),
    contactsStatus = $state(""),
    selContacts = $state<Set<string>>(new Set());
  let companies = $state<CrmCompany[]>([]),
    companiesPag = $state({ total: 0, limit: 10, offset: 0 }),
    companiesLoading = $state(false),
    companiesSearch = $state(""),
    companiesIndustry = $state(""),
    selCompanies = $state<Set<string>>(new Set());

  let recentDeals = $state<CrmDeal[]>([]),
    recentContacts = $state<CrmContact[]>([]),
    overviewLoading = $state(false);
  let expandedPipelineId = $state<string | null>(null),
    pipelineStages = $state<Record<string, CrmPipelineStage[]>>({});

  function fmtCur(cents = 0, cur = "USD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  }
  function fmtDate(d?: string) {
    return d
      ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "—";
  }
  function ago(d?: string) {
    if (!d) return "—";
    const diff = Date.now() - new Date(d).getTime(),
      m = Math.floor(diff / 60000),
      h = Math.floor(diff / 3600000),
      D = Math.floor(diff / 86400000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${D}d ago`;
  }

  const dCols: Record<string, string> = {
    open: "bg-gremius-cyan/10 text-gremius-cyan border-gremius-cyan/20",
    won: "bg-gremius-green/10 text-gremius-green border-gremius-green/20",
    lost: "bg-gremius-pink/10 text-gremius-pink border-gremius-pink/20",
    paused: "bg-gremius-amber/10 text-gremius-amber border-gremius-amber/20",
  };
  const cCols: Record<string, string> = {
    lead: "bg-gremius-cyan/10 text-gremius-cyan border-gremius-cyan/20",
    prospect: "bg-gremius-amber/10 text-gremius-amber border-gremius-amber/20",
    customer: "bg-gremius-green/10 text-gremius-green border-gremius-green/20",
    churned: "bg-gremius-pink/10 text-gremius-pink border-gremius-pink/20",
    archived: "bg-gremius-subtle/10 text-gremius-subtle border-gremius-subtle/20",
  };

  async function loadStats() {
    statsLoading = true;
    try {
      stats = (await api.getCrmStats()).data as CRMStats;
    } catch (e: any) {
      toast.error("Stats error: " + e.message);
    } finally {
      statsLoading = false;
    }
  }
  async function loadPipelines() {
    pipelinesLoading = true;
    try {
      pipelines = (await api.getCrmPipelines()).data as CrmPipeline[];
    } catch (e: any) {
      toast.error("Pipelines error: " + e.message);
    } finally {
      pipelinesLoading = false;
    }
  }
  async function loadDeals() {
    dealsLoading = true;
    try {
      const res = await api.getCrmDeals({
        limit: dealsPag.limit,
        offset: dealsPag.offset,
        search: dealsSearch || undefined,
        status: dealsStatus || undefined,
        pipelineId: dealsPipelineId || undefined,
      });
      let data = (res.data as CrmDeal[]) ?? [];
      if (dealsSortField)
        data = [...data].sort((a, b) => {
          let av: any, bv: any;
          if (dealsSortField === "value") {
            av = a.value ?? 0;
            bv = b.value ?? 0;
          } else {
            av = a.expectedCloseDate || "";
            bv = b.expectedCloseDate || "";
          }
          return dealsSortDir === "asc" ? (av < bv ? -1 : 1) : av > bv ? -1 : 1;
        });
      deals = data;
      dealsPag = { ...(res.pagination ?? dealsPag), total: res.pagination?.total ?? data.length };
    } catch (e: any) {
      toast.error("Deals error: " + e.message);
    } finally {
      dealsLoading = false;
    }
  }
  async function loadContacts() {
    contactsLoading = true;
    try {
      const res = await api.getCrmContacts({
        limit: contactsPag.limit,
        offset: contactsPag.offset,
        search: contactsSearch || undefined,
        status: contactsStatus || undefined,
      });
      contacts = (res.data as CrmContact[]) ?? [];
      contactsPag = {
        ...(res.pagination ?? contactsPag),
        total: res.pagination?.total ?? contacts.length,
      };
    } catch (e: any) {
      toast.error("Contacts error: " + e.message);
    } finally {
      contactsLoading = false;
    }
  }
  async function loadCompanies() {
    companiesLoading = true;
    try {
      const res = await api.getCrmCompanies({
        limit: companiesPag.limit,
        offset: companiesPag.offset,
        search: companiesSearch || undefined,
        industry: companiesIndustry || undefined,
      });
      companies = (res.data as CrmCompany[]) ?? [];
      companiesPag = {
        ...(res.pagination ?? companiesPag),
        total: res.pagination?.total ?? companies.length,
      };
    } catch (e: any) {
      toast.error("Companies error: " + e.message);
    } finally {
      companiesLoading = false;
    }
  }
  async function loadOverview() {
    overviewLoading = true;
    try {
      const [d, c] = await Promise.all([
        api.getCrmDeals({ limit: 5, offset: 0 }),
        api.getCrmContacts({ limit: 5, offset: 0 }),
      ]);
      recentDeals = (d.data as CrmDeal[]) ?? [];
      recentContacts = (c.data as CrmContact[]) ?? [];
    } catch (e: any) {
      toast.error("Overview error: " + e.message);
    } finally {
      overviewLoading = false;
    }
  }
  async function togglePipeline(id: string) {
    if (expandedPipelineId === id) {
      expandedPipelineId = null;
      return;
    }
    expandedPipelineId = id;
    if (!pipelineStages[id]) {
      try {
        const d = (await api.getCrmPipeline(id)).data as CrmPipeline & {
          stages: CrmPipelineStage[];
        };
        pipelineStages = { ...pipelineStages, [id]: d.stages ?? [] };
      } catch (e: any) {
        toast.error("Stages error: " + e.message);
      }
    }
  }

  async function delDeal(id: string) {
    if (!confirm("Delete this deal?")) return;
    try {
      await api.deleteCrmDeal(id);
      toast.success("Deal deleted");
      await loadDeals();
      await loadStats();
    } catch (e: any) {
      toast.error(e.message);
    }
  }
  async function bulkDelDeals() {
    if (!selDeals.size || !confirm(`Delete ${selDeals.size} deals?`)) return;
    await Promise.all([...selDeals].map((id) => api.deleteCrmDeal(id)));
    toast.success(`${selDeals.size} deals deleted`);
    selDeals = new Set();
    await loadDeals();
    await loadStats();
  }
  async function delContact(id: string) {
    if (!confirm("Delete this contact?")) return;
    try {
      await api.deleteCrmContact(id);
      toast.success("Contact deleted");
      await loadContacts();
      await loadStats();
    } catch (e: any) {
      toast.error(e.message);
    }
  }
  async function bulkDelContacts() {
    if (!selContacts.size || !confirm(`Delete ${selContacts.size} contacts?`)) return;
    await Promise.all([...selContacts].map((id) => api.deleteCrmContact(id)));
    toast.success(`${selContacts.size} contacts deleted`);
    selContacts = new Set();
    await loadContacts();
    await loadStats();
  }
  async function delCompany(id: string) {
    if (!confirm("Delete this company?")) return;
    try {
      await api.deleteCrmCompany(id);
      toast.success("Company deleted");
      await loadCompanies();
      await loadStats();
    } catch (e: any) {
      toast.error(e.message);
    }
  }
  async function bulkDelCompanies() {
    if (!selCompanies.size || !confirm(`Delete ${selCompanies.size} companies?`)) return;
    await Promise.all([...selCompanies].map((id) => api.deleteCrmCompany(id)));
    toast.success(`${selCompanies.size} companies deleted`);
    selCompanies = new Set();
    await loadCompanies();
    await loadStats();
  }

  function setDealSort(f: "value" | "expectedCloseDate") {
    if (dealsSortField === f) dealsSortDir = dealsSortDir === "asc" ? "desc" : "asc";
    else {
      dealsSortField = f;
      dealsSortDir = "desc";
    }
    loadDeals();
  }
  function pg(t: "deals" | "contacts" | "companies", dir: -1 | 1) {
    if (t === "deals") {
      const n = dealsPag.offset + dir * dealsPag.limit;
      if (n < 0 || n >= dealsPag.total) return;
      dealsPag = { ...dealsPag, offset: n };
      loadDeals();
    } else if (t === "contacts") {
      const n = contactsPag.offset + dir * contactsPag.limit;
      if (n < 0 || n >= contactsPag.total) return;
      contactsPag = { ...contactsPag, offset: n };
      loadContacts();
    } else {
      const n = companiesPag.offset + dir * companiesPag.limit;
      if (n < 0 || n >= companiesPag.total) return;
      companiesPag = { ...companiesPag, offset: n };
      loadCompanies();
    }
  }
  function pageLabel(p: { offset: number; limit: number; total: number }) {
    return `Page ${Math.floor(p.offset / p.limit) + 1} of ${Math.max(1, Math.ceil(p.total / p.limit))}`;
  }

  function toggleAll(rows: any[], sel: Set<string>) {
    const all = rows.length && rows.every((r) => sel.has(r.id));
    const next = new Set(sel);
    rows.forEach((r) => (all ? next.delete(r.id) : next.add(r.id)));
    return next;
  }
  function toggleOne(sel: Set<string>, id: string) {
    const next = new Set(sel);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  }

  $effect(() => {
    const tab = activeTab;
    if (tab === "overview") loadOverview();
    else if (tab === "deals") loadDeals();
    else if (tab === "contacts") loadContacts();
    else if (tab === "companies") loadCompanies();
    else if (tab === "pipelines") loadPipelines();
  });
  onMount(() => {
    loadStats();
    loadOverview();
    loadPipelines();
  });
</script>

<div class="space-y-6 animate-fade-in">
  <!-- Header -->
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold text-gremius-text flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-xl bg-gradient-to-br from-gremius-cyan/20 to-gremius-purple/20 border border-gremius-cyan/20 flex items-center justify-center"
        >
          <Briefcase class="w-5 h-5 text-gremius-cyan" />
        </div>
        CRM Dashboard
      </h1>
      <p class="text-sm text-gremius-subtle mt-1">
        Manage deals, contacts, companies and pipelines
      </p>
    </div>
    <button
      onclick={() => goto("/crm/deals/new")}
      class="btn-primary inline-flex items-center gap-2 text-sm"
      ><Plus class="w-4 h-4" /> Add Deal</button
    >
  </div>

  <!-- Stats -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    {#if statsLoading}
      {#each [1, 2, 3, 4] as _}
        <div class="card p-5 animate-pulse">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-gremius-bg"></div>
            <div class="space-y-2">
              <div class="h-3 w-20 bg-gremius-bg rounded"></div>
              <div class="h-6 w-24 bg-gremius-bg rounded"></div>
            </div>
          </div>
        </div>
      {/each}
    {:else if stats}
      {@const cards = [
        {
          label: "Contacts",
          value: stats.contacts.toLocaleString(),
          icon: Users,
          cls: "bg-indigo-500/10 text-indigo-400",
        },
        {
          label: "Companies",
          value: stats.companies.toLocaleString(),
          icon: Building2,
          cls: "bg-emerald-500/10 text-emerald-400",
        },
        {
          label: "Open Deals",
          value: fmtCur(stats.deals.values.open),
          icon: Briefcase,
          cls: "bg-amber-500/10 text-amber-400",
        },
        {
          label: "Pipeline Value",
          value: fmtCur(stats.deals.values.total),
          icon: TrendingUp,
          cls: "bg-cyan-500/10 text-cyan-400",
        },
      ]}
      {#each cards as c}
        <div class="card p-5">
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-lg {c.cls.split(' ')[0]} flex items-center justify-center"
            >
              <c.icon class="w-5 h-5 {c.cls.split(' ')[1]}" />
            </div>
            <div>
              <p class="text-xs text-gremius-subtle uppercase tracking-wider">{c.label}</p>
              <p class="text-xl font-bold text-gremius-text">{c.value}</p>
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Tabs -->
  <div class="border-b border-gremius-border">
    <nav class="flex gap-1 -mb-px">
      {#each [{ id: "overview", l: "Overview" }, { id: "deals", l: "Deals" }, { id: "contacts", l: "Contacts" }, { id: "companies", l: "Companies" }, { id: "pipelines", l: "Pipelines" }] as { id, l }}
        <button
          onclick={() => {
            activeTab = id as Tab;
          }}
          class="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer {activeTab ===
          id
            ? 'border-gremius-cyan text-gremius-cyan'
            : 'border-transparent text-gremius-subtle hover:text-gremius-text'}">{l}</button
        >
      {/each}
    </nav>
  </div>

  <!-- OVERVIEW -->
  {#if activeTab === "overview"}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
      <section class="card">
        <div class="p-4 border-b border-gremius-border flex items-center justify-between">
          <h3 class="font-semibold text-gremius-text text-sm">Recent Deals</h3>
          <button
            onclick={() => (activeTab = "deals")}
            class="text-xs text-gremius-cyan hover:underline">View all</button
          >
        </div>
        <div class="divide-y divide-gremius-border">
          {#if overviewLoading}
            {#each [1, 2, 3] as _}
              <div class="p-3 animate-pulse flex justify-between">
                <div class="h-4 w-32 bg-gremius-bg rounded"></div>
                <div class="h-4 w-16 bg-gremius-bg rounded"></div>
              </div>
            {/each}
          {:else if !recentDeals.length}
            <div class="p-8 text-center text-gremius-subtle text-sm">No deals yet</div>
          {:else}
            {#each recentDeals as d}
              <div class="p-3 flex justify-between hover:bg-gremius-bg/40 transition-colors">
                <div class="min-w-0">
                  <p class="text-sm text-gremius-text truncate font-medium">{d.title}</p>
                  <p class="text-xs text-gremius-subtle">{d.source || "No source"}</p>
                </div>
                <div class="text-right flex-shrink-0 ml-3">
                  <p class="text-sm font-semibold text-gremius-text">
                    {fmtCur(d.value, d.currency)}
                  </p>
                  <span
                    class="inline-block mt-1 px-2 py-0.5 text-[10px] font-medium rounded-full border {dCols[
                      d.status
                    ] || dCols.open}">{d.status}</span
                  >
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </section>

      <section class="card">
        <div class="p-4 border-b border-gremius-border flex items-center justify-between">
          <h3 class="font-semibold text-gremius-text text-sm">Recent Contacts</h3>
          <button
            onclick={() => (activeTab = "contacts")}
            class="text-xs text-gremius-cyan hover:underline">View all</button
          >
        </div>
        <div class="divide-y divide-gremius-border">
          {#if overviewLoading}
            {#each [1, 2, 3] as _}
              <div class="p-3 animate-pulse flex justify-between">
                <div class="h-4 w-32 bg-gremius-bg rounded"></div>
                <div class="h-4 w-16 bg-gremius-bg rounded"></div>
              </div>
            {/each}
          {:else if !recentContacts.length}
            <div class="p-8 text-center text-gremius-subtle text-sm">No contacts yet</div>
          {:else}
            {#each recentContacts as c}
              <div class="p-3 flex justify-between hover:bg-gremius-bg/40 transition-colors">
                <div class="min-w-0">
                  <p class="text-sm text-gremius-text truncate font-medium">
                    {c.firstName}
                    {c.lastName}
                  </p>
                  <p class="text-xs text-gremius-subtle">{c.email}</p>
                </div>
                <div class="text-right flex-shrink-0 ml-3">
                  <span
                    class="inline-block px-2 py-0.5 text-[10px] font-medium rounded-full border {cCols[
                      c.status
                    ] || cCols.lead}">{c.status}</span
                  >
                  {#if c.score}<p class="text-xs text-gremius-subtle mt-0.5">
                      Score {c.score}
                    </p>{/if}
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </section>

      <section class="card p-4 lg:col-span-2">
        <h3 class="font-semibold text-gremius-text text-sm mb-3">Quick Actions</h3>
        <div class="flex flex-wrap gap-2">
          <button
            onclick={() => goto("/crm/deals/new")}
            class="btn-primary inline-flex items-center gap-2 text-sm"
            ><Plus class="w-4 h-4" /> Add Deal</button
          >
          <button
            onclick={() => goto("/crm/contacts/new")}
            class="btn-secondary inline-flex items-center gap-2 text-sm"
            ><Plus class="w-4 h-4" /> Add Contact</button
          >
          <button
            onclick={() => goto("/crm/companies/new")}
            class="btn-secondary inline-flex items-center gap-2 text-sm"
            ><Plus class="w-4 h-4" /> Add Company</button
          >
        </div>
      </section>
    </div>
  {/if}

  <!-- DEALS -->
  {#if activeTab === "deals"}
    <div class="space-y-4 animate-fade-in">
      <div class="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div class="flex flex-col sm:flex-row gap-2 flex-1">
          <div class="relative flex-1 max-w-sm">
            <Search
              class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gremius-subtle"
            /><input
              bind:value={dealsSearch}
              oninput={() => {
                dealsPag.offset = 0;
                loadDeals();
              }}
              placeholder="Search deals..."
              class="w-full pl-9 pr-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-sm text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan"
            />
          </div>
          <select
            bind:value={dealsStatus}
            onchange={() => {
              dealsPag.offset = 0;
              loadDeals();
            }}
            class="px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-sm text-gremius-text focus:outline-none focus:border-gremius-cyan"
            ><option value="">All statuses</option><option value="open">Open</option><option
              value="won">Won</option
            ><option value="lost">Lost</option><option value="paused">Paused</option></select
          >
          <select
            bind:value={dealsPipelineId}
            onchange={() => {
              dealsPag.offset = 0;
              loadDeals();
            }}
            class="px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-sm text-gremius-text focus:outline-none focus:border-gremius-cyan"
            ><option value="">All pipelines</option>{#each pipelines as p}<option value={p.id}
                >{p.name}</option
              >{/each}</select
          >
        </div>
        {#if selDeals.size}<button
            onclick={bulkDelDeals}
            class="btn-danger inline-flex items-center gap-2 text-sm"
            ><Trash2 class="w-4 h-4" /> Delete ({selDeals.size})</button
          >{/if}
      </div>

      <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead
              ><tr class="border-b border-gremius-border bg-gremius-bg/50">
                <th class="px-4 py-3 text-left w-10"
                  ><button
                    onclick={() => (selDeals = toggleAll(deals, selDeals))}
                    class="text-gremius-subtle hover:text-gremius-text"
                    >{#if deals.length && deals.every((r) => selDeals.has(r.id))}<CheckSquare
                        class="w-4 h-4"
                      />{:else}<Square class="w-4 h-4" />{/if}</button
                  ></th
                >
                <th class="px-4 py-3 text-left font-medium text-gremius-subtle">Title</th>
                <th
                  class="px-4 py-3 text-left font-medium text-gremius-subtle cursor-pointer select-none"
                  onclick={() => setDealSort("value")}
                  ><span class="flex items-center gap-1"
                    >Value {#if dealsSortField === "value"}{#if dealsSortDir === "asc"}<ArrowUp
                          class="w-3 h-3"
                        />{:else}<ArrowDown class="w-3 h-3" />{/if}{:else}<ArrowUpDown
                        class="w-3 h-3"
                      />{/if}</span
                  ></th
                >
                <th class="px-4 py-3 text-left font-medium text-gremius-subtle">Status</th>
                <th class="px-4 py-3 text-left font-medium text-gremius-subtle">Probability</th>
                <th
                  class="px-4 py-3 text-left font-medium text-gremius-subtle cursor-pointer select-none"
                  onclick={() => setDealSort("expectedCloseDate")}
                  ><span class="flex items-center gap-1"
                    >Expected Close {#if dealsSortField === "expectedCloseDate"}{#if dealsSortDir === "asc"}<ArrowUp
                          class="w-3 h-3"
                        />{:else}<ArrowDown class="w-3 h-3" />{/if}{:else}<ArrowUpDown
                        class="w-3 h-3"
                      />{/if}</span
                  ></th
                >
                <th class="px-4 py-3 text-left font-medium text-gremius-subtle">Source</th>
                <th class="px-4 py-3 text-left font-medium text-gremius-subtle">Tags</th>
                <th class="px-4 py-3 text-right font-medium text-gremius-subtle">Actions</th>
              </tr></thead
            >
            <tbody class="divide-y divide-gremius-border">
              {#if dealsLoading}{#each [1, 2, 3, 4] as _}<tr class="animate-pulse"
                    ><td colspan={9} class="px-4 py-3"
                      ><div class="h-4 bg-gremius-bg rounded w-full"></div></td
                    ></tr
                  >{/each}
              {:else if !deals.length}<tr
                  ><td colspan={9} class="px-4 py-12 text-center text-gremius-subtle"
                    ><Inbox class="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p class="text-sm">No deals found</p></td
                  ></tr
                >
              {:else}{#each deals as d}<tr class="hover:bg-gremius-bg/30 transition-colors">
                    <td class="px-4 py-3"
                      ><button
                        onclick={() => (selDeals = toggleOne(selDeals, d.id))}
                        class="text-gremius-subtle hover:text-gremius-text"
                        >{#if selDeals.has(d.id)}<CheckSquare class="w-4 h-4" />{:else}<Square
                            class="w-4 h-4"
                          />{/if}</button
                      ></td
                    >
                    <td class="px-4 py-3 text-gremius-text font-medium">{d.title}</td>
                    <td class="px-4 py-3 text-gremius-text">{fmtCur(d.value, d.currency)}</td>
                    <td class="px-4 py-3"
                      ><span
                        class="inline-block px-2 py-0.5 text-[10px] font-medium rounded-full border {dCols[
                          d.status
                        ] || dCols.open}">{d.status}</span
                      ></td
                    >
                    <td class="px-4 py-3 text-gremius-text">{d.probability ?? 0}%</td>
                    <td class="px-4 py-3 text-gremius-subtle">{fmtDate(d.expectedCloseDate)}</td>
                    <td class="px-4 py-3 text-gremius-subtle">{d.source || "—"}</td>
                    <td class="px-4 py-3"
                      ><div class="flex flex-wrap gap-1">
                        {#each (d.tags ?? []).slice(0, 3) as t}<span
                            class="px-1.5 py-0.5 text-[10px] rounded bg-gremius-bg border border-gremius-border text-gremius-subtle"
                            >{t}</span
                          >{/each}{#if (d.tags ?? []).length > 3}<span
                            class="px-1.5 py-0.5 text-[10px] rounded bg-gremius-bg border border-gremius-border text-gremius-subtle"
                            >+{(d.tags ?? []).length - 3}</span
                          >{/if}
                      </div></td
                    >
                    <td class="px-4 py-3 text-right"
                      ><div class="flex justify-end gap-1">
                        <button
                          onclick={() => goto(`/crm/deals/${d.id}`)}
                          class="p-1.5 rounded-lg hover:bg-gremius-bg text-gremius-subtle hover:text-gremius-cyan transition-colors"
                          title="Edit"><Edit2 class="w-3.5 h-3.5" /></button
                        ><button
                          onclick={() => delDeal(d.id)}
                          class="p-1.5 rounded-lg hover:bg-gremius-bg text-gremius-subtle hover:text-gremius-pink transition-colors"
                          title="Delete"><Trash2 class="w-3.5 h-3.5" /></button
                        >
                      </div></td
                    >
                  </tr>{/each}{/if}
            </tbody>
          </table>
        </div>
        <div class="px-4 py-3 border-t border-gremius-border flex items-center justify-between">
          <p class="text-xs text-gremius-subtle">{dealsPag.total} deals total</p>
          <div class="flex items-center gap-2">
            <button
              onclick={() => pg("deals", -1)}
              disabled={dealsPag.offset === 0}
              class="p-1.5 rounded-lg border border-gremius-border text-gremius-subtle hover:text-gremius-text disabled:opacity-30 disabled:cursor-not-allowed"
              ><ChevronLeft class="w-4 h-4" /></button
            >
            <span class="text-xs text-gremius-subtle">{pageLabel(dealsPag)}</span>
            <button
              onclick={() => pg("deals", 1)}
              disabled={dealsPag.offset + dealsPag.limit >= dealsPag.total}
              class="p-1.5 rounded-lg border border-gremius-border text-gremius-subtle hover:text-gremius-text disabled:opacity-30 disabled:cursor-not-allowed"
              ><ChevronRight class="w-4 h-4" /></button
            >
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- CONTACTS -->
  {#if activeTab === "contacts"}
    <div class="space-y-4 animate-fade-in">
      <div class="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div class="flex flex-col sm:flex-row gap-2 flex-1">
          <div class="relative flex-1 max-w-sm">
            <Search
              class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gremius-subtle"
            /><input
              bind:value={contactsSearch}
              oninput={() => {
                contactsPag.offset = 0;
                loadContacts();
              }}
              placeholder="Search contacts..."
              class="w-full pl-9 pr-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-sm text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan"
            />
          </div>
          <select
            bind:value={contactsStatus}
            onchange={() => {
              contactsPag.offset = 0;
              loadContacts();
            }}
            class="px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-sm text-gremius-text focus:outline-none focus:border-gremius-cyan"
            ><option value="">All statuses</option><option value="lead">Lead</option><option
              value="prospect">Prospect</option
            ><option value="customer">Customer</option><option value="churned">Churned</option
            ><option value="archived">Archived</option></select
          >
        </div>
        {#if selContacts.size}<button
            onclick={bulkDelContacts}
            class="btn-danger inline-flex items-center gap-2 text-sm"
            ><Trash2 class="w-4 h-4" /> Delete ({selContacts.size})</button
          >{/if}
      </div>
      <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead
              ><tr class="border-b border-gremius-border bg-gremius-bg/50">
                <th class="px-4 py-3 text-left w-10"
                  ><button
                    onclick={() => (selContacts = toggleAll(contacts, selContacts))}
                    class="text-gremius-subtle hover:text-gremius-text"
                    >{#if contacts.length && contacts.every( (r) => selContacts.has(r.id) )}<CheckSquare
                        class="w-4 h-4"
                      />{:else}<Square class="w-4 h-4" />{/if}</button
                  ></th
                >
                <th class="px-4 py-3 text-left font-medium text-gremius-subtle">Name</th>
                <th class="px-4 py-3 text-left font-medium text-gremius-subtle">Email</th>
                <th class="px-4 py-3 text-left font-medium text-gremius-subtle">Status</th>
                <th class="px-4 py-3 text-left font-medium text-gremius-subtle">Company</th>
                <th class="px-4 py-3 text-left font-medium text-gremius-subtle">Job Title</th>
                <th class="px-4 py-3 text-left font-medium text-gremius-subtle">Score</th>
                <th class="px-4 py-3 text-left font-medium text-gremius-subtle">Last Contacted</th>
                <th class="px-4 py-3 text-right font-medium text-gremius-subtle">Actions</th>
              </tr></thead
            >
            <tbody class="divide-y divide-gremius-border">
              {#if contactsLoading}{#each [1, 2, 3, 4] as _}<tr class="animate-pulse"
                    ><td colspan={9} class="px-4 py-3"
                      ><div class="h-4 bg-gremius-bg rounded w-full"></div></td
                    ></tr
                  >{/each}
              {:else if !contacts.length}<tr
                  ><td colspan={9} class="px-4 py-12 text-center text-gremius-subtle"
                    ><Inbox class="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p class="text-sm">No contacts found</p></td
                  ></tr
                >
              {:else}{#each contacts as c}<tr class="hover:bg-gremius-bg/30 transition-colors">
                    <td class="px-4 py-3"
                      ><button
                        onclick={() => (selContacts = toggleOne(selContacts, c.id))}
                        class="text-gremius-subtle hover:text-gremius-text"
                        >{#if selContacts.has(c.id)}<CheckSquare class="w-4 h-4" />{:else}<Square
                            class="w-4 h-4"
                          />{/if}</button
                      ></td
                    >
                    <td class="px-4 py-3 text-gremius-text font-medium"
                      >{c.firstName} {c.lastName}</td
                    >
                    <td class="px-4 py-3 text-gremius-subtle">{c.email}</td>
                    <td class="px-4 py-3"
                      ><span
                        class="inline-block px-2 py-0.5 text-[10px] font-medium rounded-full border {cCols[
                          c.status
                        ] || cCols.lead}">{c.status}</span
                      ></td
                    >
                    <td class="px-4 py-3 text-gremius-subtle">{c.company?.name || "—"}</td>
                    <td class="px-4 py-3 text-gremius-subtle">{c.jobTitle || "—"}</td>
                    <td class="px-4 py-3 text-gremius-text">{c.score ?? "—"}</td>
                    <td class="px-4 py-3 text-gremius-subtle">{ago(c.lastContactedAt)}</td>
                    <td class="px-4 py-3 text-right"
                      ><div class="flex justify-end gap-1">
                        <button
                          onclick={() => goto(`/crm/contacts/${c.id}`)}
                          class="p-1.5 rounded-lg hover:bg-gremius-bg text-gremius-subtle hover:text-gremius-cyan transition-colors"
                          title="Edit"><Edit2 class="w-3.5 h-3.5" /></button
                        ><button
                          onclick={() => delContact(c.id)}
                          class="p-1.5 rounded-lg hover:bg-gremius-bg text-gremius-subtle hover:text-gremius-pink transition-colors"
                          title="Delete"><Trash2 class="w-3.5 h-3.5" /></button
                        >
                      </div></td
                    >
                  </tr>{/each}{/if}
            </tbody>
          </table>
        </div>
        <div class="px-4 py-3 border-t border-gremius-border flex items-center justify-between">
          <p class="text-xs text-gremius-subtle">{contactsPag.total} contacts total</p>
          <div class="flex items-center gap-2">
            <button
              onclick={() => pg("contacts", -1)}
              disabled={contactsPag.offset === 0}
              class="p-1.5 rounded-lg border border-gremius-border text-gremius-subtle hover:text-gremius-text disabled:opacity-30 disabled:cursor-not-allowed"
              ><ChevronLeft class="w-4 h-4" /></button
            >
            <span class="text-xs text-gremius-subtle">{pageLabel(contactsPag)}</span>
            <button
              onclick={() => pg("contacts", 1)}
              disabled={contactsPag.offset + contactsPag.limit >= contactsPag.total}
              class="p-1.5 rounded-lg border border-gremius-border text-gremius-subtle hover:text-gremius-text disabled:opacity-30 disabled:cursor-not-allowed"
              ><ChevronRight class="w-4 h-4" /></button
            >
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- COMPANIES -->
  {#if activeTab === "companies"}
    <div class="space-y-4 animate-fade-in">
      <div class="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div class="flex flex-col sm:flex-row gap-2 flex-1">
          <div class="relative flex-1 max-w-sm">
            <Search
              class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gremius-subtle"
            /><input
              bind:value={companiesSearch}
              oninput={() => {
                companiesPag.offset = 0;
                loadCompanies();
              }}
              placeholder="Search companies..."
              class="w-full pl-9 pr-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-sm text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan"
            />
          </div>
          <select
            bind:value={companiesIndustry}
            onchange={() => {
              companiesPag.offset = 0;
              loadCompanies();
            }}
            class="px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-sm text-gremius-text focus:outline-none focus:border-gremius-cyan"
            ><option value="">All industries</option>{#each [...new Set(companies
                  .map((c) => c.industry)
                  .filter(Boolean))] as i}<option value={i}>{i}</option>{/each}</select
          >
        </div>
        {#if selCompanies.size}<button
            onclick={bulkDelCompanies}
            class="btn-danger inline-flex items-center gap-2 text-sm"
            ><Trash2 class="w-4 h-4" /> Delete ({selCompanies.size})</button
          >{/if}
      </div>
      <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead
              ><tr class="border-b border-gremius-border bg-gremius-bg/50">
                <th class="px-4 py-3 text-left w-10"
                  ><button
                    onclick={() => (selCompanies = toggleAll(companies, selCompanies))}
                    class="text-gremius-subtle hover:text-gremius-text"
                    >{#if companies.length && companies.every( (r) => selCompanies.has(r.id) )}<CheckSquare
                        class="w-4 h-4"
                      />{:else}<Square class="w-4 h-4" />{/if}</button
                  ></th
                >
                <th class="px-4 py-3 text-left font-medium text-gremius-subtle">Name</th>
                <th class="px-4 py-3 text-left font-medium text-gremius-subtle">Industry</th>
                <th class="px-4 py-3 text-left font-medium text-gremius-subtle">Domain</th>
                <th class="px-4 py-3 text-left font-medium text-gremius-subtle">Size</th>
                <th class="px-4 py-3 text-left font-medium text-gremius-subtle">City</th>
                <th class="px-4 py-3 text-left font-medium text-gremius-subtle">Country</th>
                <th class="px-4 py-3 text-left font-medium text-gremius-subtle">Deals</th>
                <th class="px-4 py-3 text-right font-medium text-gremius-subtle">Actions</th>
              </tr></thead
            >
            <tbody class="divide-y divide-gremius-border">
              {#if companiesLoading}{#each [1, 2, 3, 4] as _}<tr class="animate-pulse"
                    ><td colspan={9} class="px-4 py-3"
                      ><div class="h-4 bg-gremius-bg rounded w-full"></div></td
                    ></tr
                  >{/each}
              {:else if !companies.length}<tr
                  ><td colspan={9} class="px-4 py-12 text-center text-gremius-subtle"
                    ><Inbox class="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p class="text-sm">No companies found</p></td
                  ></tr
                >
              {:else}{#each companies as c}<tr class="hover:bg-gremius-bg/30 transition-colors">
                    <td class="px-4 py-3"
                      ><button
                        onclick={() => (selCompanies = toggleOne(selCompanies, c.id))}
                        class="text-gremius-subtle hover:text-gremius-text"
                        >{#if selCompanies.has(c.id)}<CheckSquare class="w-4 h-4" />{:else}<Square
                            class="w-4 h-4"
                          />{/if}</button
                      ></td
                    >
                    <td class="px-4 py-3 text-gremius-text font-medium">{c.name}</td>
                    <td class="px-4 py-3 text-gremius-subtle">{c.industry || "—"}</td>
                    <td class="px-4 py-3 text-gremius-subtle">{c.domain || "—"}</td>
                    <td class="px-4 py-3 text-gremius-subtle">{c.size || "—"}</td>
                    <td class="px-4 py-3 text-gremius-subtle">{c.city || "—"}</td>
                    <td class="px-4 py-3 text-gremius-subtle">{c.country || "—"}</td>
                    <td class="px-4 py-3 text-gremius-text">—</td>
                    <td class="px-4 py-3 text-right"
                      ><div class="flex justify-end gap-1">
                        <button
                          onclick={() => goto(`/crm/companies/${c.id}`)}
                          class="p-1.5 rounded-lg hover:bg-gremius-bg text-gremius-subtle hover:text-gremius-cyan transition-colors"
                          title="Edit"><Edit2 class="w-3.5 h-3.5" /></button
                        ><button
                          onclick={() => delCompany(c.id)}
                          class="p-1.5 rounded-lg hover:bg-gremius-bg text-gremius-subtle hover:text-gremius-pink transition-colors"
                          title="Delete"><Trash2 class="w-3.5 h-3.5" /></button
                        >
                      </div></td
                    >
                  </tr>{/each}{/if}
            </tbody>
          </table>
        </div>
        <div class="px-4 py-3 border-t border-gremius-border flex items-center justify-between">
          <p class="text-xs text-gremius-subtle">{companiesPag.total} companies total</p>
          <div class="flex items-center gap-2">
            <button
              onclick={() => pg("companies", -1)}
              disabled={companiesPag.offset === 0}
              class="p-1.5 rounded-lg border border-gremius-border text-gremius-subtle hover:text-gremius-text disabled:opacity-30 disabled:cursor-not-allowed"
              ><ChevronLeft class="w-4 h-4" /></button
            >
            <span class="text-xs text-gremius-subtle">{pageLabel(companiesPag)}</span>
            <button
              onclick={() => pg("companies", 1)}
              disabled={companiesPag.offset + companiesPag.limit >= companiesPag.total}
              class="p-1.5 rounded-lg border border-gremius-border text-gremius-subtle hover:text-gremius-text disabled:opacity-30 disabled:cursor-not-allowed"
              ><ChevronRight class="w-4 h-4" /></button
            >
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- PIPELINES -->
  {#if activeTab === "pipelines"}
    <div class="space-y-4 animate-fade-in">
      {#if pipelinesLoading}
        <div class="space-y-3">
          {#each [1, 2, 3] as _}<div class="card p-4 animate-pulse">
              <div class="h-4 w-48 bg-gremius-bg rounded"></div>
            </div>{/each}
        </div>
      {:else if !pipelines.length}
        <div class="card p-12 text-center text-gremius-subtle">
          <Inbox class="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p class="text-sm">No pipelines found</p>
        </div>
      {:else}
        <div class="space-y-3">
          {#each pipelines as pl}
            {@const stages = pipelineStages[pl.id] ?? []}
            <div class="card overflow-hidden">
              <button
                onclick={() => togglePipeline(pl.id)}
                class="w-full px-5 py-4 flex items-center justify-between hover:bg-gremius-bg/30 transition-colors text-left"
              >
                <div class="flex items-center gap-3">
                  <div
                    class="w-9 h-9 rounded-lg bg-gremius-cyan/10 flex items-center justify-center"
                  >
                    <Kanban class="w-4 h-4 text-gremius-cyan" />
                  </div>
                  <div>
                    <p class="text-sm font-semibold text-gremius-text">{pl.name}</p>
                    <p class="text-xs text-gremius-subtle">
                      {stages.length || "?"} stages • {pl.currency}
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  {#if pl.isDefault}<span
                      class="px-2 py-0.5 text-[10px] font-medium rounded-full bg-gremius-green/10 text-gremius-green border border-gremius-green/20"
                      >Default</span
                    >{/if}
                  {#if expandedPipelineId === pl.id}<ChevronUp
                      class="w-4 h-4 text-gremius-subtle"
                    />{:else}<ChevronDown class="w-4 h-4 text-gremius-subtle" />{/if}
                </div>
              </button>
              {#if expandedPipelineId === pl.id}
                <div class="border-t border-gremius-border px-5 py-4">
                  {#if !stages.length}<p class="text-sm text-gremius-subtle">No stages loaded</p>
                  {:else}
                    <div
                      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
                    >
                      {#each stages as s}
                        <div class="p-3 rounded-lg border border-gremius-border bg-gremius-bg/30">
                          <div class="flex items-center gap-2 mb-2">
                            <span class="w-3 h-3 rounded-full" style="background-color: {s.color}"
                            ></span><span class="text-sm font-medium text-gremius-text"
                              >{s.name}</span
                            >
                          </div>
                          <div
                            class="flex items-center justify-between text-xs text-gremius-subtle"
                          >
                            <span>Probability</span><span class="text-gremius-text font-medium"
                              >{s.probability}%</span
                            >
                          </div>
                          {#if s.wipLimit}<div
                              class="flex items-center justify-between text-xs text-gremius-subtle mt-1"
                            >
                              <span>WIP Limit</span><span class="text-gremius-text font-medium"
                                >{s.wipLimit}</span
                              >
                            </div>{/if}
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .btn-danger {
    @apply inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium bg-gremius-pink/10 text-gremius-pink border border-gremius-pink/20 hover:bg-gremius-pink/20 transition-colors;
  }
</style>
