<!--
  Sistema: la «caja de cristal» de las peticiones (kitsuden2.md C7) y la cola
  de Postgres (B1). Las trazas de los AGENTES siguen en /agents/traces.
  `?tab=requests|queue` abre la pestaña pedida.
-->
<script lang="ts">
  import { t } from "$lib/i18n";
  import { Activity, ListChecks, Workflow } from "lucide-svelte";

  import QueueStatus from "$lib/components/sistema/QueueStatus.svelte";
  import RequestTraces from "$lib/components/sistema/RequestTraces.svelte";

  import { page } from "$app/stores";

  type Pestana = "requests" | "queue";
  const PESTANAS: Pestana[] = ["requests", "queue"];
  const inicial = $page.url.searchParams.get("tab") as Pestana | null;
  let activa = $state<Pestana>(inicial && PESTANAS.includes(inicial) ? inicial : "requests");
  const ICONOS = { requests: Activity, queue: ListChecks };
  const ETIQUETAS: Record<Pestana, () => string> = {
    requests: () => t("systemTraces.tabRequests"),
    queue: () => t("systemTraces.tabQueue"),
  };
</script>

<div class="h-full flex flex-col">
  <div class="flex flex-wrap items-center gap-4 px-6 py-4 border-b border-zinc-800">
    <div class="flex items-center gap-3 min-w-0">
      <div class="p-2 bg-indigo-500/10 rounded-lg">
        <Workflow size={20} class="text-indigo-400" />
      </div>
      <div class="min-w-0">
        <h1 class="text-xl font-semibold text-zinc-100">{t("systemTraces.title")}</h1>
        <p class="text-xs text-zinc-500">
          {t("systemTraces.subtitle")}
          <a href="/agents/traces" class="ml-1 text-indigo-300 hover:underline">{t("systemTraces.agentTracesLink")}</a>
        </p>
      </div>
    </div>
    <div class="flex-1"></div>
    <div class="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg" role="tablist">
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
        </button>
      {/each}
    </div>
  </div>

  <div class="flex-1 overflow-y-auto p-6">
    {#if activa === "requests"}
      <RequestTraces />
    {:else}
      <QueueStatus />
    {/if}
  </div>
</div>
