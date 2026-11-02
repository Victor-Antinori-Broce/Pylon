<script lang="ts">
  import { t, localeFormato } from "$lib/i18n";
  /**
   * Run Inspector — observabilidad de ejecuciones
   *
   * Los datos ya se capturaban en `action_executions` (estado, payload, logs,
   * duración, memoria) pero solo eran consultables por acción. Esta vista es
   * el feed global: "qué está pasando en mi backend ahora mismo".
   *
   * Consume /api/runs (admin-only). Auto-refresca cada 5s mientras esté
   * activado, y el detalle se carga bajo demanda para no traer logs de todo.
   */
  import { onDestroy } from "svelte";

  const API = import.meta.env.VITE_API_URL ?? "";

  interface Run {
    id: string;
    actionId: string;
    actionName: string | null;
    actionType: string | null;
    status: string;
    triggerType: string | null;
    triggerEvent: string | null;
    durationMs: number | null;
    memoryUsedBytes: number | null;
    errorMessage: string | null;
    startedAt: string | null;
    createdAt: string;
  }

  interface Stats {
    total: number;
    byStatus: Record<string, number>;
    successRate: number;
    duration: { avgMs: number; p50: number; p95: number; maxMs: number };
    topFailing: { actionId: string; actionName: string | null; failures: number }[];
  }

  let runs = $state<Run[]>([]);
  let stats = $state<Stats | null>(null);
  let selected = $state<any | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let statusFilter = $state("");
  let windowFilter = $state("24h");
  let autoRefresh = $state(true);

  const STATUS_STYLE: Record<string, string> = {
    success: "bg-kitsuden-green/15 text-kitsuden-green",
    failed: "bg-kitsuden-danger/15 text-kitsuden-danger",
    running: "bg-kitsuden-accent/15 text-kitsuden-accent",
    pending: "bg-kitsuden-subtle/15 text-kitsuden-text-dim",
  };

  async function load() {
    error = null;
    try {
      const qs = new URLSearchParams({ window: windowFilter, limit: "50" });
      if (statusFilter) qs.set("status", statusFilter);

      const [runsRes, statsRes] = await Promise.all([
        fetch(`${API}/api/runs?${qs}`, { credentials: "include" }),
        fetch(`${API}/api/runs/stats?window=${windowFilter}`, { credentials: "include" }),
      ]);

      if (!runsRes.ok) throw new Error(t("runsView.runs", { status: runsRes.status }));
      runs = (await runsRes.json()).docs ?? [];
      if (statsRes.ok) stats = await statsRes.json();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  async function openDetail(id: string) {
    selected = null;
    const res = await fetch(`${API}/api/runs/${id}`, { credentials: "include" });
    if (res.ok) selected = await res.json();
  }

  // Auto-refresh: se reinicia cuando cambian los filtros o el toggle.
  let timer: ReturnType<typeof setInterval> | null = null;
  $effect(() => {
    void statusFilter;
    void windowFilter;
    load();

    if (timer) clearInterval(timer);
    if (autoRefresh) timer = setInterval(load, 5000);
    return () => {
      if (timer) clearInterval(timer);
    };
  });
  onDestroy(() => timer && clearInterval(timer));

  const ms = (v: number | null) =>
    v === null ? "—" : v < 1000 ? `${v} ms` : `${(v / 1000).toFixed(2)} s`;
  const mb = (v: number | null) => (v === null ? "—" : `${(v / 1048576).toFixed(1)} MB`);
  const ago = (iso: string) => {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return `hace ${s}s`;
    if (s < 3600) return `hace ${Math.floor(s / 60)}m`;
    if (s < 86400) return `hace ${Math.floor(s / 3600)}h`;
    return new Date(iso).toLocaleDateString(localeFormato());
  };
</script>

<div class="p-6 space-y-6">
  <header class="flex items-baseline justify-between flex-wrap gap-3">
    <div>
      <h1 class="text-xl font-semibold">{t("runsView.runInspector")}</h1>
      <p class="text-sm text-kitsuden-text-dim">{t("runsView.ejecucionesDeAccionesWorkersY")}</p>
    </div>

    <div class="flex items-center gap-2">
      <label class="flex items-center gap-2 text-sm text-kitsuden-text-dim">
        <input type="checkbox" bind:checked={autoRefresh} />
        {t("runsView.auto5s")}
      </label>
      <select bind:value={windowFilter} class="input text-sm" aria-label={t("runsView.ventanaTemporal")}>
        <option value="1h">{t("runsView.ultimaHora")}</option>
        <option value="24h">{t("runsView.n24Horas")}</option>
        <option value="7d">{t("runsView.n7Dias")}</option>
        <option value="30d">{t("runsView.n30Dias")}</option>
      </select>
      <select bind:value={statusFilter} class="input text-sm" aria-label={t("runsView.filtrarPorEstado")}>
        <option value="">{t("runsView.todos")}</option>
        <option value="success">{t("runsView.exito")}</option>
        <option value="failed">{t("runsView.fallidos")}</option>
        <option value="running">{t("runsView.enCurso")}</option>
        <option value="pending">{t("runsView.pendientes")}</option>
      </select>
    </div>
  </header>

  {#if error}
    <div class="card p-4 border-kitsuden-danger/40 text-kitsuden-danger text-sm">{error}</div>
  {/if}

  {#if stats}
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div class="card p-4">
        <div class="text-xs uppercase tracking-wide text-kitsuden-text-dim">{t("runsView.ejecuciones")}</div>
        <div class="text-2xl font-semibold mt-1">{stats.total}</div>
      </div>
      <div class="card p-4">
        <div class="text-xs uppercase tracking-wide text-kitsuden-text-dim">{t("runsView.tasaDeExito")}</div>
        <div
          class="text-2xl font-semibold mt-1"
          class:text-kitsuden-danger={stats.successRate < 95}
          class:text-kitsuden-green={stats.successRate >= 99}
        >
          {stats.successRate}%
        </div>
      </div>
      <div class="card p-4">
        <div class="text-xs uppercase tracking-wide text-kitsuden-text-dim">{t("runsView.latenciaP95")}</div>
        <div class="text-2xl font-semibold mt-1">{ms(stats.duration.p95)}</div>
        <div class="text-xs text-kitsuden-text-dim mt-0.5">p50 {ms(stats.duration.p50)}</div>
      </div>
      <div class="card p-4">
        <div class="text-xs uppercase tracking-wide text-kitsuden-text-dim">{t("runsView.fallidos")}</div>
        <div class="text-2xl font-semibold mt-1">{stats.byStatus.failed ?? 0}</div>
      </div>
    </div>

    {#if stats.topFailing.length > 0}
      <div class="card p-4">
        <h2 class="text-xs uppercase tracking-wide text-kitsuden-text-dim mb-2">
          {t("runsView.accionesConMasFallos")}
        </h2>
        <div class="space-y-1">
          {#each stats.topFailing as f (f.actionId)}
            <div class="flex justify-between text-sm">
              <span>{f.actionName ?? f.actionId}</span>
              <span class="text-kitsuden-danger font-medium">{f.failures}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}

  <div class="card overflow-hidden">
    {#if loading}
      <div class="p-8 text-center text-kitsuden-text-dim">{t("common.cargando")}</div>
    {:else if runs.length === 0}
      <div class="p-8 text-center text-kitsuden-text-dim">{t("runsView.sinEjecucionesEnEstaVentana")}</div>
    {:else}
      <table class="w-full text-sm">
        <thead class="text-left text-xs uppercase tracking-wide text-kitsuden-text-dim">
          <tr class="border-b border-kitsuden-border">
            <th class="px-4 py-2.5">{t("common.estado")}</th>
            <th class="px-4 py-2.5">{t("runsView.accion")}</th>
            <th class="px-4 py-2.5">{t("runsView.trigger")}</th>
            <th class="px-4 py-2.5 text-right">{t("runsView.duracion")}</th>
            <th class="px-4 py-2.5 text-right">{t("runsView.memoria")}</th>
            <th class="px-4 py-2.5 text-right">{t("runsView.cuando")}</th>
          </tr>
        </thead>
        <tbody>
          {#each runs as run (run.id)}
            <tr
              class="border-b border-kitsuden-border/50 hover:bg-kitsuden-surface/60 cursor-pointer"
              onclick={() => openDetail(run.id)}
            >
              <td class="px-4 py-2.5">
                <span
                  class="px-2 py-0.5 rounded text-xs font-medium {STATUS_STYLE[run.status] ??
                    'bg-kitsuden-surface'}"
                >
                  {run.status}
                </span>
              </td>
              <td class="px-4 py-2.5 font-medium">{run.actionName ?? "—"}</td>
              <td class="px-4 py-2.5 text-kitsuden-text-dim">
                {run.triggerEvent ?? run.triggerType ?? "—"}
              </td>
              <td class="px-4 py-2.5 text-right tabular-nums">{ms(run.durationMs)}</td>
              <td class="px-4 py-2.5 text-right tabular-nums text-kitsuden-text-dim">
                {mb(run.memoryUsedBytes)}
              </td>
              <td class="px-4 py-2.5 text-right text-kitsuden-text-dim">{ago(run.createdAt)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

{#if selected}
  <!-- Detalle: payload, resultado y logs completos -->
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-50"
    role="presentation"
    onclick={() => (selected = null)}
    onkeydown={(e) => e.key === "Escape" && (selected = null)}
  >
    <!-- tabindex + stopPropagation en keydown: el diálogo debe poder recibir
         foco y no debe cerrarse al teclear dentro de él. -->
    <div
      class="card max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("runsView.detalleDeEjecucion")}
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <header class="flex items-start justify-between gap-4">
        <div>
          <h2 class="text-lg font-semibold">{selected.action?.name ?? t("runsView.ejecucion")}</h2>
          <p class="text-xs text-kitsuden-text-dim font-mono">{selected.id}</p>
        </div>
        <button class="btn-ghost text-sm" onclick={() => (selected = null)}>{t("runsView.cerrar")}</button>
      </header>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <div class="text-xs text-kitsuden-text-dim">{t("common.estado")}</div>
          <div class="font-medium">{selected.status}</div>
        </div>
        <div>
          <div class="text-xs text-kitsuden-text-dim">{t("runsView.duracion")}</div>
          <div class="font-medium">{ms(selected.durationMs)}</div>
        </div>
        <div>
          <div class="text-xs text-kitsuden-text-dim">{t("runsView.memoria")}</div>
          <div class="font-medium">{mb(selected.memoryUsedBytes)}</div>
        </div>
        <div>
          <div class="text-xs text-kitsuden-text-dim">{t("runsView.trigger")}</div>
          <div class="font-medium">{selected.triggerEvent ?? selected.triggerType ?? "—"}</div>
        </div>
      </div>

      {#if selected.errorMessage}
        <section>
          <h3 class="text-xs uppercase tracking-wide text-kitsuden-text-dim mb-1">{t("common.error")}</h3>
          <pre
            class="bg-kitsuden-danger/10 text-kitsuden-danger p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap">{selected.errorMessage}</pre>
        </section>
      {/if}

      {#if selected.triggerPayload}
        <section>
          <h3 class="text-xs uppercase tracking-wide text-kitsuden-text-dim mb-1">{t("runsView.payload")}</h3>
          <pre class="bg-kitsuden-bg p-3 rounded text-xs overflow-x-auto">{JSON.stringify(
              selected.triggerPayload,
              null,
              2
            )}</pre>
        </section>
      {/if}

      {#if selected.result}
        <section>
          <h3 class="text-xs uppercase tracking-wide text-kitsuden-text-dim mb-1">{t("runsView.resultado")}</h3>
          <pre class="bg-kitsuden-bg p-3 rounded text-xs overflow-x-auto">{JSON.stringify(
              selected.result,
              null,
              2
            )}</pre>
        </section>
      {/if}

      {#if selected.logLines?.length}
        <section>
          <h3 class="text-xs uppercase tracking-wide text-kitsuden-text-dim mb-1">
            {t("runsView.logs", { logLinesCount: selected.logLines.length })}
          </h3>
          <pre
            class="bg-kitsuden-bg p-3 rounded text-xs overflow-x-auto max-h-64 overflow-y-auto">{selected.logLines.join(
              "\n"
            )}</pre>
        </section>
      {/if}
    </div>
  </div>
{/if}
