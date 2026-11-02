<!--
  La cola de Postgres (kitsuden2.md B1): recuento por cola y estado, y la
  «dead letter» con su último error, para reintentar o descartar.
-->
<script lang="ts">
  import { t, localeFormato } from "$lib/i18n";
  import { RefreshCw } from "lucide-svelte";
  import { onMount } from "svelte";

  import Button from "$lib/components/ui/Button.svelte";
  import { discardJob, queueStatus, retryJob, type EstadoDeCola } from "$lib/services/sistema";

  let estado = $state<EstadoDeCola | null>(null);
  let cargando = $state(true);
  let error = $state<string | null>(null);
  let ocupado = $state<string | null>(null);

  onMount(cargar);

  async function cargar() {
    try {
      cargando = true;
      error = null;
      estado = await queueStatus();
    } catch (e) {
      error = e instanceof Error ? e.message : t("systemQueue.errorLoading");
    } finally {
      cargando = false;
    }
  }

  async function accion(id: string, fn: (id: string) => Promise<unknown>) {
    try {
      ocupado = id;
      await fn(id);
      await cargar();
    } catch (e) {
      error = e instanceof Error ? e.message : t("systemQueue.errorLoading");
    } finally {
      ocupado = null;
    }
  }

  const fecha = (v: string | null) => (v ? new Date(v).toLocaleString(localeFormato()) : "—");
  const ESTADOS = ["pending", "running", "done", "dead"] as const;
  const etiquetaEstado: Record<(typeof ESTADOS)[number], () => string> = {
    pending: () => t("systemQueue.pending"),
    running: () => t("systemQueue.running"),
    done: () => t("systemQueue.done"),
    dead: () => t("systemQueue.dead"),
  };
  const etiquetaWorker = (w: EstadoDeCola["worker"]) =>
    w === "running" ? t("systemQueue.workerRunning") : w === "stopped" ? t("systemQueue.workerStopped") : t("systemQueue.workerDisabled");
</script>

<div class="space-y-4" data-testid="queue-status">
  <div class="flex items-center gap-3">
    <p class="text-xs text-zinc-500 flex-1">{t("systemQueue.help")}</p>
    <Button variant="ghost" size="sm" onclick={cargar}>
      <RefreshCw size={14} class="mr-1" />{t("systemTraces.refresh")}
    </Button>
  </div>

  {#if cargando && !estado}
    <div class="flex items-center justify-center h-24">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div>
    </div>
  {:else if error}
    <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">{error}</div>
  {:else if estado}
    <div class="flex flex-wrap gap-3 text-xs">
      <span class="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">{t("systemQueue.worker")}: {etiquetaWorker(estado.worker)}</span>
      <span class="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">{t("systemQueue.listen")}: {estado.escucha ? t("systemQueue.yes") : t("systemQueue.no")}</span>
      {#each ESTADOS as e}
        <span class="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 {e === 'dead' && (estado.totales.dead ?? 0) > 0 ? 'text-red-300' : 'text-zinc-300'}">{etiquetaEstado[e]()}: {estado.totales[e] ?? 0}</span>
      {/each}
    </div>

    {#if Object.keys(estado.porCola).length > 0}
      <div class="overflow-x-auto border border-zinc-800 rounded-lg">
        <table class="w-full text-xs">
          <thead class="text-zinc-500">
            <tr>
              <th class="text-left px-3 py-2">{t("systemQueue.colQueue")}</th>
              {#each ESTADOS as e}<th class="text-right px-3 py-2">{etiquetaEstado[e]()}</th>{/each}
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-800/70">
            {#each Object.entries(estado.porCola) as [cola, cuenta] (cola)}
              <tr>
                <td class="px-3 py-1.5 font-mono text-zinc-200">{cola}</td>
                {#each ESTADOS as e}<td class="px-3 py-1.5 text-right text-zinc-400">{cuenta[e] ?? 0}</td>{/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

    <h3 class="text-sm font-medium text-zinc-200">{t("systemQueue.deadTitle")}</h3>
    {#if estado.dead.length === 0}
      <p class="text-sm text-zinc-500">{t("systemQueue.noDead")}</p>
    {:else}
      <div class="overflow-x-auto border border-zinc-800 rounded-lg">
        <table class="w-full text-xs">
          <thead class="text-zinc-500">
            <tr>
              <th class="text-left px-3 py-2">{t("systemQueue.colQueue")}</th>
              <th class="text-left px-3 py-2">{t("systemQueue.colJob")}</th>
              <th class="text-right px-3 py-2">{t("systemQueue.colAttempts")}</th>
              <th class="text-left px-3 py-2">{t("systemQueue.colError")}</th>
              <th class="text-left px-3 py-2">{t("systemQueue.colFinished")}</th>
              <th class="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-800/70">
            {#each estado.dead as j (j.id)}
              <tr data-testid="dead-job">
                <td class="px-3 py-1.5 font-mono text-zinc-300">{j.queue}</td>
                <td class="px-3 py-1.5 font-mono text-zinc-300">{j.name}</td>
                <td class="px-3 py-1.5 text-right text-zinc-400">{j.attempts}/{j.max_attempts}</td>
                <td class="px-3 py-1.5 text-red-300 max-w-md truncate" title={j.last_error ?? ""}>{j.last_error ?? "—"}</td>
                <td class="px-3 py-1.5 whitespace-nowrap text-zinc-400">{fecha(j.finished_at)}</td>
                <td class="px-3 py-1.5 whitespace-nowrap text-right">
                  <Button variant="ghost" size="sm" disabled={ocupado === j.id} onclick={() => accion(j.id, retryJob)}>{t("systemQueue.retry")}</Button>
                  <Button variant="ghost" size="sm" disabled={ocupado === j.id} onclick={() => accion(j.id, discardJob)}>{t("systemQueue.discard")}</Button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</div>
