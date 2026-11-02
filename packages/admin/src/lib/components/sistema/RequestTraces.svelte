<!--
  La «caja de cristal» (kitsuden2.md C7): cada petición registrada con su
  actor, kon, operación, tiempo en la base y si una escritura chocó con el
  filtro de dueño o con la RLS. Y el resumen por operación.
-->
<script lang="ts">
  import { t, localeFormato } from "$lib/i18n";
  import { RefreshCw } from "lucide-svelte";
  import { onMount } from "svelte";

  import Button from "$lib/components/ui/Button.svelte";
  import {
    listRequestTraces,
    requestTraceSummary,
    type ResumenDeOperacion,
    type TrazaDePeticion,
  } from "$lib/services/sistema";

  let vista = $state<"lista" | "resumen">("lista");
  let horas = $state(24);
  let soloBloqueos = $state(false);
  let soloErrores = $state(false);
  let actor = $state("");
  let trazas = $state<TrazaDePeticion[]>([]);
  let resumen = $state<ResumenDeOperacion[]>([]);
  let encendidas = $state(true);
  let cargando = $state(true);
  let error = $state<string | null>(null);

  onMount(cargar);

  async function cargar() {
    try {
      cargando = true;
      error = null;
      if (vista === "lista") {
        const r = await listRequestTraces({
          hours: horas,
          blocked: soloBloqueos,
          errors: soloErrores,
          actor: actor.trim() || undefined,
        });
        encendidas = r.enabled;
        trazas = r.requests;
      } else {
        const r = await requestTraceSummary(horas);
        encendidas = r.enabled;
        resumen = r.operations;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : t("systemTraces.errorLoading");
    } finally {
      cargando = false;
    }
  }

  const fecha = (v: string) => new Date(v).toLocaleString(localeFormato());
  const ms = (v: number | null) => (v === null || v === undefined ? "—" : `${Math.round(Number(v))} ms`);
  const motivo = (m: string) => (m === "no_es_tuyo" ? t("systemTraces.blockedNotYours") : t("systemTraces.blockedMissing"));
  const actorDe = (tr: TrazaDePeticion) =>
    tr.actor_tipo === "agente"
      ? t("systemTraces.actorAgent")
      : tr.actor_tipo === "humano"
        ? t("systemTraces.actorHuman")
        : t("systemTraces.actorAnonymous");
</script>

<div class="space-y-3" data-testid="request-traces">
  <p class="text-xs text-zinc-500">{t("systemTraces.help")}</p>

  <div class="flex flex-wrap items-center gap-2">
    <div class="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg" role="tablist">
      <button
        role="tab"
        aria-selected={vista === "lista"}
        class="px-3 py-1 text-xs rounded-md {vista === 'lista' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500'}"
        onclick={() => {
          vista = "lista";
          cargar();
        }}>{t("systemTraces.viewList")}</button
      >
      <button
        role="tab"
        aria-selected={vista === "resumen"}
        class="px-3 py-1 text-xs rounded-md {vista === 'resumen' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500'}"
        onclick={() => {
          vista = "resumen";
          cargar();
        }}>{t("systemTraces.viewSummary")}</button
      >
    </div>
    <label class="text-xs text-zinc-400 flex items-center gap-1">
      {t("systemTraces.window")}
      <select bind:value={horas} onchange={cargar} class="bg-zinc-900 border border-zinc-800 rounded px-1 py-0.5">
        <option value={1}>1 h</option>
        <option value={24}>24 h</option>
        <option value={168}>7 d</option>
      </select>
    </label>
    {#if vista === "lista"}
      <label class="text-xs text-zinc-400 flex items-center gap-1">
        <input type="checkbox" bind:checked={soloBloqueos} onchange={cargar} data-testid="only-blocked" />
        {t("systemTraces.onlyBlocked")}
      </label>
      <label class="text-xs text-zinc-400 flex items-center gap-1">
        <input type="checkbox" bind:checked={soloErrores} onchange={cargar} />
        {t("systemTraces.onlyErrors")}
      </label>
      <input
        class="text-xs bg-zinc-900 border border-zinc-800 rounded px-2 py-1 w-56"
        placeholder={t("systemTraces.actorPlaceholder")}
        bind:value={actor}
        onkeydown={(e) => e.key === "Enter" && cargar()}
      />
    {/if}
    <div class="flex-1"></div>
    <Button variant="ghost" size="sm" onclick={cargar}>
      <RefreshCw size={14} class="mr-1" />{t("systemTraces.refresh")}
    </Button>
  </div>

  {#if cargando}
    <div class="flex items-center justify-center h-24">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div>
    </div>
  {:else if error}
    <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">{error}</div>
  {:else if !encendidas}
    <p class="text-sm text-zinc-500">{t("systemTraces.disabled")}</p>
  {:else if vista === "lista"}
    {#if trazas.length === 0}
      <p class="text-sm text-zinc-500">{t("systemTraces.empty")}</p>
    {:else}
      <div class="overflow-x-auto border border-zinc-800 rounded-lg">
        <table class="w-full text-xs">
          <thead class="text-zinc-500">
            <tr>
              <th class="text-left px-3 py-2">{t("systemTraces.colWhen")}</th>
              <th class="text-left px-3 py-2">{t("systemTraces.colRequest")}</th>
              <th class="text-left px-3 py-2">{t("systemTraces.colStatus")}</th>
              <th class="text-left px-3 py-2">{t("systemTraces.colActor")}</th>
              <th class="text-left px-3 py-2">{t("systemTraces.colOperation")}</th>
              <th class="text-right px-3 py-2">{t("systemTraces.colDuration")}</th>
              <th class="text-right px-3 py-2">{t("systemTraces.colDb")}</th>
              <th class="text-right px-3 py-2">{t("systemTraces.colRows")}</th>
              <th class="text-left px-3 py-2">{t("systemTraces.colBlocked")}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-800/70">
            {#each trazas as tr, i (`${tr.request_id ?? ""}-${i}`)}
              <tr data-testid="trace-row">
                <td class="px-3 py-1.5 whitespace-nowrap text-zinc-400">{fecha(tr.creado)}</td>
                <td class="px-3 py-1.5 font-mono text-zinc-200">{tr.metodo} {tr.ruta}</td>
                <td class="px-3 py-1.5 {tr.estado >= 500 ? 'text-red-300' : tr.estado >= 400 ? 'text-amber-300' : 'text-emerald-300'}">{tr.estado}</td>
                <td class="px-3 py-1.5 text-zinc-300">{actorDe(tr)}<span class="block text-zinc-500 font-mono">{tr.actor_id ?? ""}</span></td>
                <td class="px-3 py-1.5 text-zinc-400">{tr.kon ?? "—"}{tr.operacion ? ` · ${tr.operacion}` : ""}</td>
                <td class="px-3 py-1.5 text-right text-zinc-300">{ms(tr.duracion_ms)}</td>
                <td class="px-3 py-1.5 text-right text-zinc-400">{ms(tr.tiempo_db_ms)}{tr.consultas ? ` · ${tr.consultas}q` : ""}</td>
                <td class="px-3 py-1.5 text-right text-zinc-400">{tr.filas_afectadas ?? "—"}</td>
                <td class="px-3 py-1.5">
                  {#each tr.detalle_bloqueos ?? [] as b}
                    <span class="inline-block mr-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">{b.operacion} {b.tabla}: {motivo(b.motivo)}</span>
                  {/each}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {:else if resumen.length === 0}
    <p class="text-sm text-zinc-500">{t("systemTraces.empty")}</p>
  {:else}
    <div class="overflow-x-auto border border-zinc-800 rounded-lg">
      <table class="w-full text-xs">
        <thead class="text-zinc-500">
          <tr>
            <th class="text-left px-3 py-2">{t("systemTraces.colRequest")}</th>
            <th class="text-left px-3 py-2">{t("systemTraces.colOperation")}</th>
            <th class="text-right px-3 py-2">{t("systemTraces.colCount")}</th>
            <th class="text-right px-3 py-2">{t("systemTraces.colErrors")}</th>
            <th class="text-right px-3 py-2">{t("systemTraces.colBlocked")}</th>
            <th class="text-right px-3 py-2">{t("systemTraces.colP95")}</th>
            <th class="text-right px-3 py-2">{t("systemTraces.colDb")}</th>
            <th class="text-right px-3 py-2">{t("systemTraces.colRows")}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-800/70">
          {#each resumen as r, i (`${r.metodo}-${r.ruta}-${i}`)}
            <tr>
              <td class="px-3 py-1.5 font-mono text-zinc-200">{r.metodo} {r.ruta}</td>
              <td class="px-3 py-1.5 text-zinc-400">{r.kon ?? "—"}{r.operacion ? ` · ${r.operacion}` : ""}</td>
              <td class="px-3 py-1.5 text-right text-zinc-300">{r.peticiones}</td>
              <td class="px-3 py-1.5 text-right {Number(r.errores) > 0 ? 'text-red-300' : 'text-zinc-500'}">{r.errores}</td>
              <td class="px-3 py-1.5 text-right {Number(r.bloqueos) > 0 ? 'text-amber-300' : 'text-zinc-500'}">{r.bloqueos}</td>
              <td class="px-3 py-1.5 text-right text-zinc-300">{ms(r.p95_ms)}</td>
              <td class="px-3 py-1.5 text-right text-zinc-400">{ms(r.media_db_ms)}</td>
              <td class="px-3 py-1.5 text-right text-zinc-400">{r.filas}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
