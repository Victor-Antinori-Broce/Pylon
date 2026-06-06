<script lang="ts">
  import { TrendingUp, Users, Building2, Briefcase, Activity, Settings } from "lucide-svelte";

  import ActivityForm from "./ActivityForm.svelte";
  import ActivityList from "./ActivityList.svelte";
  import CompanyForm from "./CompanyForm.svelte";
  import CompanyList from "./CompanyList.svelte";
  import ContactForm from "./ContactForm.svelte";
  import ContactList from "./ContactList.svelte";
  import CrmDashboard from "./CrmDashboard.svelte";
  import DealForm from "./DealForm.svelte";
  import DealList from "./DealList.svelte";
  import PipelineList from "./PipelineList.svelte";

  import { goto } from "$app/navigation";
  import { page } from "$app/stores";

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: TrendingUp },
    { id: "contacts", label: "Contacts", icon: Users },
    { id: "companies", label: "Companies", icon: Building2 },
    { id: "deals", label: "Deals", icon: Briefcase },
    { id: "activities", label: "Activities", icon: Activity },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  const activeTab = $derived($page.url.searchParams.get("tab") || "dashboard");
  let subView = $state<"list" | "form">("list");
  let selectedId = $state<string | null>(null);

  function setTab(tabId: string) {
    const url = new URL($page.url);
    url.searchParams.set("tab", tabId);
    goto(url.toString(), { replaceState: true });
    subView = "list";
    selectedId = null;
  }

  function viewCompany(id: string) { selectedId = id; subView = "form"; }
  function viewContact(id: string) { selectedId = id; subView = "form"; }
  function viewDeal(id: string) { selectedId = id; subView = "form"; }
  function viewActivity(id: string) { selectedId = id; subView = "form"; }

  function createCompany() { selectedId = null; subView = "form"; }
  function createContact() { selectedId = null; subView = "form"; }
  function createDeal() { selectedId = null; subView = "form"; }
  function createActivity() { selectedId = null; subView = "form"; }

  function backToList() { subView = "list"; selectedId = null; }
</script>

<div class="h-full flex flex-col">
  <div class="border-b border-zinc-800 bg-zinc-900/50 px-6 py-4">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight text-zinc-100">CRM</h1>
        <p class="text-sm text-zinc-400 mt-1">Contacts, Companies, Deals & Activities</p>
      </div>
    </div>

    <div class="flex items-center gap-1 mt-4">
      {#each tabs as tab}
        <button
          class="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors
            {activeTab === tab.id
              ? 'bg-indigo-600 text-white'
              : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}"
          onclick={() => setTab(tab.id)}
        >
          <tab.icon class="w-4 h-4" />
          {tab.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="flex-1 overflow-auto p-6">
    {#if activeTab === "dashboard"}
      <CrmDashboard />
    {:else if activeTab === "companies"}
      {#if subView === "list"}
        <CompanyList onView={viewCompany} onCreate={createCompany} />
      {:else}
        <CompanyForm companyId={selectedId} onBack={backToList} onSave={backToList} />
      {/if}
    {:else if activeTab === "contacts"}
      {#if subView === "list"}
        <ContactList onView={viewContact} onCreate={createContact} />
      {:else}
        <ContactForm contactId={selectedId} onBack={backToList} onSave={backToList} />
      {/if}
    {:else if activeTab === "deals"}
      {#if subView === "list"}
        <DealList onView={viewDeal} onCreate={createDeal} />
      {:else}
        <DealForm dealId={selectedId} onBack={backToList} onSave={backToList} />
      {/if}
    {:else if activeTab === "activities"}
      {#if subView === "list"}
        <ActivityList onView={viewActivity} onCreate={createActivity} />
      {:else}
        <ActivityForm activityId={selectedId} onBack={backToList} onSave={backToList} />
      {/if}
    {:else if activeTab === "settings"}
      <PipelineList />
    {/if}
  </div>
</div>
