<!--
  Aprobación humana (fase F): bandeja, configuración y auditoría; y la
  promoción de código de agentes (fase I).
  `?tab=inbox|settings|audit|promotion`, `?id=<propuesta>` y `?version=<versión>`
  abren lo pedido.
-->
<script lang="ts">
  import { t } from "$lib/i18n";
  import { Inbox, Settings2, ScrollText, ShieldCheck, GitBranch } from "lucide-svelte";

  import ApprovalAudit from "$lib/components/approvals/ApprovalAudit.svelte";
  import ApprovalSettings from "$lib/components/approvals/ApprovalSettings.svelte";
  import CodePromotion from "$lib/components/approvals/CodePromotion.svelte";
  import ProposalInbox from "$lib/components/approvals/ProposalInbox.svelte";
  import { aprobaciones } from "$lib/states/aprobaciones.svelte";

  import { page } from "$app/stores";

  type Pestana = "inbox" | "settings" | "audit" | "promotion";
  const PESTANAS: Pestana[] = ["inbox", "promotion", "settings", "audit"];
  const inicial = $page.url.searchParams.get("tab") as Pestana | null;
  let activa = $state<Pestana>(inicial && PESTANAS.includes(inicial) ? inicial : "inbox");
  const idInicial = $page.url.searchParams.get("id");
  const versionInicial = $page.url.searchParams.get("version");

  const ICONOS = { inbox: Inbox, settings: Settings2, audit: ScrollText, promotion: GitBranch };
  const ETIQUETAS: Record<Pestana, () => string> = {
    inbox: () => t("approvals.tabInbox"),
    settings: () => t("approvals.tabSettings"),
    audit: () => t("approvals.tabAudit"),
    promotion: () => t("approvals.tabPromotion"),
  };
</script>

<div class="h-full flex flex-col">
  <div class="flex flex-wrap items-center gap-4 px-6 py-4 border-b border-zinc-800">
    <div class="flex items-center gap-3 min-w-0">
      <div class="p-2 bg-indigo-500/10 rounded-lg">
        <ShieldCheck size={20} class="text-indigo-400" />
      </div>
      <div class="min-w-0">
        <h1 class="text-xl font-semibold text-zinc-100">{t("approvals.title")}</h1>
        <p class="text-xs text-zinc-500">{t("approvals.subtitle")}</p>
      </div>
    </div>
    <div class="flex-1"></div>
    <div class="flex flex-wrap items-center gap-1 bg-zinc-900 p-1 rounded-lg" role="tablist">
      {#each PESTANAS as p}
        {@const Icono = ICONOS[p]}
        <button
          role="tab"
          aria-selected={activa === p}
          class="px-3 py-1.5 text-sm rounded-md transition-colors {activa === p ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}"
          onclick={() => (activa = p)}
          data-testid="tab-{p}"
        >
          <Icono size={14} class="inline mr-1.5" />
          {ETIQUETAS[p]()}
          {#if p === "inbox" && aprobaciones.pendientes > 0}
            <span class="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300">{aprobaciones.pendientes}</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <div class="flex-1 overflow-y-auto p-6">
    {#if activa === "inbox"}
      <ProposalInbox initialId={idInicial} />
    {:else if activa === "promotion"}
      <CodePromotion initialVersion={versionInicial} />
    {:else if activa === "settings"}
      <div class="max-w-5xl"><ApprovalSettings /></div>
    {:else}
      <ApprovalAudit />
    {/if}
  </div>
</div>
