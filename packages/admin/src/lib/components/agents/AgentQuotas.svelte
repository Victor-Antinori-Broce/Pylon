<!--
  Cuotas de un agente (fase E): peticiones por minuto, escrituras y presupuesto
  en unidades por día (UTC), y lo gastado hoy. Al pasarse, la API responde 429
  (KITSUDEN_E_RATE_LIMITED / KITSUDEN_E_QUOTA_EXCEEDED) con `retry_after`.
-->
<script lang="ts">
  import { t } from "$lib/i18n";
  import { Save } from "lucide-svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  import Button from "$lib/components/ui/Button.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import { getAgentQuotas, setAgentQuotas } from "$lib/services/agents";
  import type { AgentQuotas } from "$lib/types/agents";

  interface Props {
    agentId: string;
  }
  const { agentId }: Props = $props();

  let cuotas = $state<AgentQuotas | null>(null);
  let cargando = $state(true);
  let guardando = $state(false);
  let error = $state<string | null>(null);
  // type="number": Svelte da número, o null si el campo queda vacío.
  let rpm = $state<number | null>(null);
  let escrituras = $state<number | null>(null);
  let unidades = $state<number | null>(null);

  onMount(cargar);

  function rellenar(c: AgentQuotas) {
    cuotas = c;
    rpm = c.limits.requestsPerMinute;
    escrituras = c.limits.writesPerDay;
    unidades = c.limits.budgetUnitsPerDay;
  }

  async function cargar() {
    try {
      cargando = true;
      error = null;
      rellenar(await getAgentQuotas(agentId));
    } catch (e) {
      error = e instanceof Error ? e.message : t("agentQuotas.errorLoading");
    } finally {
      cargando = false;
    }
  }

  /** Vacío (o 0) = sin límite. */
  const numero = (v: number | null | undefined): number | null => (v ? Number(v) : null);

  async function guardar() {
    try {
      guardando = true;
      rellenar(
        await setAgentQuotas(agentId, {
          ...(rpm ? { requestsPerMinute: Number(rpm) } : {}),
          writesPerDay: numero(escrituras),
          budgetUnitsPerDay: numero(unidades),
        })
      );
      toast.success(t("agentQuotas.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("agentQuotas.errorSaving"));
    } finally {
      guardando = false;
    }
  }

  const entero = (n: number) => Math.round(n).toLocaleString();

  const porcentaje = (usado: number, limite: number | null) =>
    limite ? Math.min(100, Math.round((usado / limite) * 100)) : 0;

  const ALMACEN: Record<string, () => string> = {
    valkey: () => t("agentQuotas.storeValkey"),
    postgres: () => t("agentQuotas.storePostgres"),
    memoria: () => t("agentQuotas.storeMemory"),
  };
</script>

<div class="space-y-4" data-testid="agent-quotas">
  <div>
    <h3 class="text-sm font-semibold text-zinc-300">{t("agentQuotas.title")}</h3>
    <p class="text-xs text-zinc-500">{t("agentQuotas.help")}</p>
  </div>

  {#if cargando}
    <div class="flex items-center justify-center h-24">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div>
    </div>
  {:else if error}
    <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">{error}</div>
  {:else if cuotas}
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
      {#each [
        { id: "rpm", etiqueta: t("agentQuotas.requestsPerMinute"), usado: cuotas.usage.peticionesEsteMinuto, limite: cuotas.limits.requestsPerMinute, ayuda: t("agentQuotas.requestsPerMinuteHelp") },
        { id: "writes", etiqueta: t("agentQuotas.writesPerDay"), usado: cuotas.usage.escriturasHoy, limite: cuotas.limits.writesPerDay, ayuda: t("agentQuotas.writesPerDayHelp") },
        { id: "units", etiqueta: t("agentQuotas.unitsPerDay"), usado: cuotas.usage.unidadesHoy, limite: cuotas.limits.budgetUnitsPerDay, ayuda: t("agentQuotas.unitsPerDayHelp") },
      ] as q (q.id)}
        <Card class="p-4 space-y-2 min-w-0">
          <div class="text-xs text-zinc-500">{q.etiqueta}</div>
          <div class="text-lg text-zinc-100">
            {q.limite
              ? t("agentQuotas.usedOf", { used: q.usado, limit: q.limite })
              : t("agentQuotas.usedUnlimited", { used: q.usado })}
          </div>
          <div class="h-1.5 rounded bg-zinc-800 overflow-hidden">
            <div
              class="h-full {porcentaje(q.usado, q.limite) >= 90 ? 'bg-red-500' : 'bg-indigo-500'}"
              style="width: {porcentaje(q.usado, q.limite)}%"
            ></div>
          </div>
          <p class="text-[11px] text-zinc-500">{q.ayuda}</p>
        </Card>
      {/each}
    </div>
    <p class="text-xs text-zinc-500">
      {t("agentQuotas.usageNote", { day: cuotas.usage.dia, store: ALMACEN[cuotas.usage.almacen]?.() ?? cuotas.usage.almacen })}
    </p>

    <!-- Ahorro del formato auto frente a JSON compacto (lib/ahorro-de-formato.ts) -->
    <div class="space-y-2" data-testid="agent-format-savings">
      <div>
        <h3 class="text-sm font-semibold text-zinc-300">{t("agentQuotas.savingsTitle")}</h3>
        <p class="text-xs text-zinc-500">{t("agentQuotas.savingsHelp")}</p>
      </div>
      {#if cuotas.formatSavings === null}
        <p class="text-xs text-zinc-500">{t("agentQuotas.savingsUnavailable")}</p>
      {:else if !cuotas.formatSavings || cuotas.formatSavings.period.responses === 0}
        <p class="text-xs text-zinc-500">{t("agentQuotas.savingsNone")}</p>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          {#each [
            { id: "today", etiqueta: t("agentQuotas.savingsToday"), r: cuotas.formatSavings.today },
            { id: "period", etiqueta: t("agentQuotas.savingsPeriod", { days: cuotas.formatSavings.period.days }), r: cuotas.formatSavings.period },
          ] as s (s.id)}
            <Card class="p-4 space-y-1 min-w-0">
              <div class="text-xs text-zinc-500">{s.etiqueta}</div>
              <div class="text-lg text-zinc-100">
                {t("agentQuotas.savingsTokens", { saved: entero(s.r.savedTokensEst), percent: s.r.savedPercent })}
              </div>
              <p class="text-[11px] text-zinc-500">
                {t("agentQuotas.savingsBytes", { saved: entero(s.r.savedBytes), total: entero(s.r.jsonBytes) })}
              </p>
              <p class="text-[11px] text-zinc-500">
                {t("agentQuotas.savingsResponses", { count: entero(s.r.responses), compacted: entero(s.r.compacted) })}
              </p>
            </Card>
          {/each}
        </div>
      {/if}
    </div>

    <form
      class="grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
      onsubmit={(e) => {
        e.preventDefault();
        guardar();
      }}
    >
      <div>
        <label for="q-rpm" class="block text-sm text-zinc-300 mb-1.5">{t("agentQuotas.requestsPerMinute")}</label>
        <input id="q-rpm" type="number" min="1" bind:value={rpm} class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100" />
      </div>
      <div>
        <label for="q-writes" class="block text-sm text-zinc-300 mb-1.5">{t("agentQuotas.writesPerDay")}</label>
        <input
          id="q-writes"
          type="number"
          min="1"
          bind:value={escrituras}
          placeholder={t("agentQuotas.unlimited")}
          class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100"
        />
      </div>
      <div>
        <label for="q-units" class="block text-sm text-zinc-300 mb-1.5">{t("agentQuotas.unitsPerDay")}</label>
        <input
          id="q-units"
          type="number"
          min="1"
          bind:value={unidades}
          placeholder={t("agentQuotas.unlimited")}
          class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100"
        />
      </div>
      <div class="md:col-span-3 flex justify-end">
        <Button type="submit" variant="primary" size="sm" loading={guardando}>
          <Save size={14} class="mr-1" />{t("agentQuotas.save")}
        </Button>
      </div>
    </form>
  {/if}
</div>
