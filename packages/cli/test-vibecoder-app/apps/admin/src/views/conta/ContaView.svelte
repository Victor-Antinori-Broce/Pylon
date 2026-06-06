<script lang="ts">
  import {
    FileText,
    BookOpen,
    BarChart3,
    Receipt,
    FileStack
  } from "lucide-svelte";

  import AccountForm from "./AccountForm.svelte";
  import AccountList from "./AccountList.svelte";
  import DisbursementForm from "./DisbursementForm.svelte";
  import DisbursementList from "./DisbursementList.svelte";
  import JournalForm from "./JournalForm.svelte";
  import JournalList from "./JournalList.svelte";
  import ReportsView from "./ReportsView.svelte";
  import TemplateForm from "./TemplateForm.svelte";
  import TemplateList from "./TemplateList.svelte";

  import { goto } from "$app/navigation";
  import { page } from "$app/stores";

  const tabs = [
    { id: "journals", label: "Journals", icon: FileText },
    { id: "accounts", label: "Accounts", icon: BookOpen },
    { id: "reports", label: "Reports", icon: BarChart3 },
    { id: "disbursements", label: "Disbursements", icon: Receipt },
    { id: "templates", label: "Templates", icon: FileStack },
  ];

  const activeTab = $derived($page.url.searchParams.get("tab") || "journals");
  let subView = $state<"list" | "form" | "detail">("list");
  let selectedId = $state<string | null>(null);

  function setTab(tabId: string) {
    const url = new URL($page.url);
    url.searchParams.set("tab", tabId);
    goto(url.toString(), { replaceState: true });
    subView = "list";
    selectedId = null;
  }

  function viewJournal(id: string) {
    selectedId = id;
    subView = "form";
  }

  function viewAccount(id: string) {
    selectedId = id;
    subView = "detail";
  }

  function viewTemplate(id: string) {
    selectedId = id;
    subView = "form";
  }

  function createJournal() {
    selectedId = null;
    subView = "form";
  }

  function createDisbursement() {
    selectedId = null;
    subView = "form";
  }

  function createTemplate() {
    selectedId = null;
    subView = "form";
  }

  function backToList() {
    subView = "list";
    selectedId = null;
  }
</script>

<div class="h-full flex flex-col">
  <div class="border-b border-zinc-800 bg-zinc-900/50 px-6 py-4">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight text-zinc-100">Contabilidad</h1>
        <p class="text-sm text-zinc-400 mt-1">General Ledger Engine — Journals, Accounts & Reports</p>
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
    {#if activeTab === "journals"}
      {#if subView === "list"}
        <JournalList onView={viewJournal} onCreate={createJournal} />
      {:else}
        <JournalForm journalId={selectedId} onBack={backToList} onSave={backToList} />
      {/if}
    {:else if activeTab === "accounts"}
      {#if subView === "list"}
        <AccountList onView={viewAccount} />
      {:else}
        <AccountForm accountId={selectedId!} onBack={backToList} />
      {/if}
    {:else if activeTab === "reports"}
      <ReportsView />
    {:else if activeTab === "disbursements"}
      {#if subView === "list"}
        <DisbursementList onView={(id) => { selectedId = id; subView = "detail"; }} onCreate={createDisbursement} />
      {:else}
        <DisbursementForm disbursementId={selectedId} onBack={backToList} onSave={backToList} />
      {/if}
    {:else if activeTab === "templates"}
      {#if subView === "list"}
        <TemplateList onView={viewTemplate} onCreate={createTemplate} />
      {:else}
        <TemplateForm templateId={selectedId} onBack={backToList} onSave={backToList} />
      {/if}
    {/if}
  </div>
</div>
