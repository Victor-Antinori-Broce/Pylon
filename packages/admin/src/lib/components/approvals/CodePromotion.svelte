<!--
  Promoción de código (fase I): cada borrador de código de un agente pasa por
  pruebas en el sandbox, escaneo local, diff de capacidades y decisión
  (suggestion → propuesta; turbo → activación sola si nada amplía permisos), y
  después por una ventana vigilada con vuelta atrás automática. Aquí se ve el
  camino de cada versión, se aprueba o rechaza, se vuelve atrás y se ajustan el
  tope de turbo y la vigilancia. Solo admin (la API lo exige).
  `?version=<id>` abre una versión.
-->
<script lang="ts">
  import { t, localeFormato } from "$lib/i18n";
  import { Check, X, RefreshCw, RotateCcw, Play, Save, GitBranch } from "lucide-svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  import { isAdmin } from "$lib/auth.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import {
    activateCodeVersion,
    approveCodeVersion,
    getCodeVersion,
    getPromotionSettings,
    listCodeVersions,
    rejectCodeVersion,
    rollbackCodeVersion,
    savePromotionSettings,
    setAgentPromotionMode,
  } from "$lib/services/promotion";
  import type {
    CodeVersion,
    CodeVersionDetail,
    PromotionConfig,
    PromotionMode,
    PromotionSettings,
    VersionStatus,
  } from "$lib/types/promotion";

  interface Props {
    initialVersion?: string | null;
  }
  const { initialVersion = null }: Props = $props();

  const ESTADOS: VersionStatus[] = [
    "awaiting_approval",
    "approved",
    "active",
    "superseded",
    "rolled_back",
    "rejected",
    "expired",
    "failed",
  ];
  const MODOS: PromotionMode[] = ["suggestion", "turbo"];
  const ERRORES_CONOCIDOS = ["code_actions_disabled", "stale_base"];

  let ajustes = $state<PromotionSettings | null>(null);
  let borradorConfig = $state<PromotionConfig | null>(null);
  let guardandoConfig = $state(false);
  let filtro = $state<VersionStatus | "">("");
  let versiones = $state<CodeVersion[]>([]);
  let cargando = $state(true);
  let error = $state<string | null>(null);
  let detalle = $state<CodeVersionDetail | null>(null);
  let cargandoDetalle = $state(false);
  let comentario = $state("");
  let motivoVuelta = $state("");
  let ocupado = $state<string | null>(null);

  onMount(async () => {
    await Promise.all([cargarAjustes(), cargar()]);
    if (initialVersion) await abrir(initialVersion);
  });

  async function cargarAjustes() {
    try {
      ajustes = await getPromotionSettings();
      borradorConfig = { ...ajustes.config };
    } catch (e) {
      error = e instanceof Error ? e.message : t("promotion.errorLoading");
    }
  }

  async function cargar() {
    try {
      cargando = true;
      error = null;
      versiones = (await listCodeVersions({ status: filtro, limit: 200 })).versions;
    } catch (e) {
      error = e instanceof Error ? e.message : t("promotion.errorLoading");
    } finally {
      cargando = false;
    }
  }

  async function abrir(id: string) {
    try {
      cargandoDetalle = true;
      comentario = "";
      motivoVuelta = "";
      detalle = await getCodeVersion(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("promotion.errorLoading"));
    } finally {
      cargandoDetalle = false;
    }
  }

  async function hacer(que: "approve" | "reject" | "rollback" | "activate") {
    if (!detalle) return;
    const id = detalle.version.id;
    try {
      ocupado = que;
      detalle =
        que === "approve"
          ? await approveCodeVersion(id, comentario.trim() || undefined)
          : que === "reject"
            ? await rejectCodeVersion(id, comentario.trim() || undefined)
            : que === "rollback"
              ? await rollbackCodeVersion(id, motivoVuelta.trim())
              : await activateCodeVersion(id);
      const estado = t(`promotion.status_${detalle.version.status}`);
      (detalle.version.status === "failed" ? toast.error : toast.success)(t("promotion.done", { status: estado }));
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("promotion.errorDeciding"));
      await abrir(id);
    } finally {
      ocupado = null;
    }
  }

  async function guardarConfig() {
    if (!borradorConfig) return;
    try {
      guardandoConfig = true;
      ajustes = await savePromotionSettings({
        turboAllowed: borradorConfig.turboAllowed,
        watchMinutes: Number(borradorConfig.watchMinutes),
        minExecutions: Number(borradorConfig.minExecutions),
        maxErrorRate: Number(borradorConfig.maxErrorRate),
      });
      borradorConfig = { ...ajustes.config };
      toast.success(t("promotion.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("promotion.errorSaving"));
    } finally {
      guardandoConfig = false;
    }
  }

  async function cambiarModo(agentId: string, mode: PromotionMode) {
    try {
      await setAgentPromotionMode(agentId, mode);
      toast.success(t("promotion.modeSaved"));
      await cargarAjustes();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("promotion.errorSaving"));
    }
  }

  const fecha = (v: string | null) => (v ? new Date(v).toLocaleString(localeFormato()) : "—");
  const corto = (h: string | null) => (h ? h.slice(0, 12) : "—");
  const json = (v: unknown) => JSON.stringify(v, null, 2);

  const COLOR: Record<VersionStatus, string> = {
    awaiting_approval: "bg-amber-500/15 text-amber-300",
    approved: "bg-sky-500/15 text-sky-300",
    active: "bg-emerald-500/15 text-emerald-300",
    superseded: "bg-zinc-700/40 text-zinc-400",
    rolled_back: "bg-red-500/15 text-red-300",
    rejected: "bg-zinc-700/40 text-zinc-300",
    expired: "bg-zinc-700/40 text-zinc-500",
    failed: "bg-red-500/15 text-red-300",
  };

  function pasoClase(ok: boolean | null): string {
    return ok === null ? "border-zinc-800" : ok ? "border-emerald-500/30" : "border-red-500/30";
  }
</script>

<div class="space-y-6" data-testid="code-promotion">
  <p class="text-xs text-zinc-500">{t("promotion.help")}</p>

  {#if ajustes && borradorConfig}
    <section class="border border-zinc-800 rounded-lg p-4 space-y-3" data-testid="promotion-settings">
      <h3 class="text-sm font-semibold text-zinc-300">{t("promotion.settingsTitle")}</h3>
      {#if !ajustes.codeActionsEnabled}
        <p class="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2" data-testid="code-actions-off">
          {t("promotion.codeActionsOff")}
        </p>
      {/if}
      <p class="text-xs text-zinc-500">
        {t("promotion.approvalsMaster", { state: ajustes.approvalsEnabled ? t("approvals.globalOn") : t("approvals.globalOff") })}
      </p>
      <fieldset class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" disabled={!isAdmin()}>
        <label class="flex items-start gap-2 text-sm text-zinc-200">
          <input type="checkbox" bind:checked={borradorConfig.turboAllowed} class="mt-1" data-testid="turbo-allowed" />
          <span>
            <span class="block">{t("promotion.turboAllowed")}</span>
            <span class="block text-xs text-zinc-500">{t("promotion.turboAllowedHelp")}</span>
          </span>
        </label>
        <label class="text-xs text-zinc-400">
          {t("promotion.watchMinutes")}
          <input type="number" min="1" max="1440" bind:value={borradorConfig.watchMinutes} class="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200" />
        </label>
        <label class="text-xs text-zinc-400">
          {t("promotion.minExecutions")}
          <input type="number" min="1" max="1000" bind:value={borradorConfig.minExecutions} class="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200" />
        </label>
        <label class="text-xs text-zinc-400">
          {t("promotion.maxErrorRate")}
          <input type="number" min="0.01" max="1" step="0.05" bind:value={borradorConfig.maxErrorRate} class="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200" />
        </label>
      </fieldset>
      {#if isAdmin()}
        <Button variant="primary" size="sm" loading={guardandoConfig} onclick={guardarConfig}>
          <Save size={14} class="mr-1" />{t("promotion.save")}
        </Button>
      {/if}

      <div class="overflow-x-auto border border-zinc-800 rounded" data-testid="promotion-agents">
        <table class="w-full text-xs">
          <thead class="text-zinc-500">
            <tr>
              <th class="text-left px-3 py-2">{t("promotion.colAgent")}</th>
              <th class="text-left px-3 py-2">{t("promotion.colCanPropose")}</th>
              <th class="text-left px-3 py-2">{t("promotion.colMode")}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-800/70">
            {#each ajustes.agents as a (a.id)}
              <tr>
                <td class="px-3 py-1.5 text-zinc-300">{a.name}{a.isActive ? "" : ` (${t("promotion.inactive")})`}</td>
                <td class="px-3 py-1.5 text-zinc-400">{a.canPropose ? t("promotion.yes") : t("promotion.no")}</td>
                <td class="px-3 py-1.5">
                  <select
                    class="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-200"
                    value={a.mode}
                    disabled={!isAdmin()}
                    onchange={(e) => cambiarModo(a.id, (e.currentTarget as HTMLSelectElement).value as PromotionMode)}
                    data-testid="promotion-mode-{a.id}"
                  >
                    {#each MODOS as m}
                      <option value={m}>{t(`promotion.mode_${m}`)}</option>
                    {/each}
                  </select>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}

  <div class="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
    <section class="space-y-3 min-w-0">
      <div class="flex items-center gap-2">
        <select class="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200" bind:value={filtro} onchange={cargar} data-testid="promotion-filter">
          <option value="">{t("promotion.allStatuses")}</option>
          {#each ESTADOS as e}
            <option value={e}>{t(`promotion.status_${e}`)}</option>
          {/each}
        </select>
        <div class="flex-1"></div>
        <Button variant="ghost" size="sm" onclick={cargar}><RefreshCw size={14} class="mr-1" />{t("promotion.refresh")}</Button>
      </div>
      {#if cargando}
        <div class="flex items-center justify-center h-24"><div class="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div></div>
      {:else if error}
        <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">{error}</div>
      {:else if versiones.length === 0}
        <p class="text-sm text-zinc-500">{t("promotion.empty")}</p>
      {:else}
        <ul class="space-y-1" data-testid="promotion-list">
          {#each versiones as v (v.id)}
            <li>
              <button
                class="w-full text-left px-3 py-2 rounded border min-w-0 {detalle?.version.id === v.id ? 'border-indigo-500/60 bg-indigo-500/5' : 'border-zinc-800 hover:border-zinc-700'}"
                onclick={() => abrir(v.id)}
                data-testid="promotion-row"
                data-status={v.status}
              >
                <div class="flex items-center gap-2 min-w-0">
                  <GitBranch size={14} class="text-zinc-500 shrink-0" />
                  <span class="text-sm text-zinc-200 truncate min-w-0">{v.target.slug} · v{v.versionNumber}</span>
                  {#if v.origin !== "agent"}<span class="text-[10px] text-zinc-500 shrink-0">{t(`promotion.origin_${v.origin}`)}</span>{/if}
                  <span class="ml-auto text-[10px] px-1.5 py-0.5 rounded-full shrink-0 {COLOR[v.status]}">{t(`promotion.status_${v.status}`)}</span>
                </div>
                <div class="text-[11px] text-zinc-500 mt-0.5 truncate">
                  {v.agentName ?? v.agentId ?? "—"} · {t(`promotion.mode_${v.mode}`)} ·
                  {t("promotion.testsShort", { passed: String(v.testReport?.passed ?? 0), total: String(v.testReport?.total ?? 0) })} ·
                  {v.scanReport?.passed ? t("promotion.scanOk") : t("promotion.scanFail")} · {fecha(v.createdAt)}
                </div>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="min-w-0" data-testid="promotion-detail">
      {#if cargandoDetalle}
        <div class="flex items-center justify-center h-24"><div class="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div></div>
      {:else if !detalle}
        <p class="text-sm text-zinc-500">{t("promotion.pick")}</p>
      {:else}
        {@const v = detalle.version}
        <div class="space-y-3">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-base font-semibold text-zinc-100 min-w-0 truncate">{v.target.name} · v{v.versionNumber}</h3>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full {COLOR[v.status]}" data-testid="detail-status">{t(`promotion.status_${v.status}`)}</span>
          </div>
          <p class="text-xs text-zinc-500">
            {t("promotion.byAgent", { agent: v.agentName ?? v.agentId ?? "—", signer: v.sponsorName ?? v.sponsorUserId ?? "—" })} ·
            {t("promotion.hashes", { content: corto(v.contentHash), base: corto(v.baseHash) })}
          </p>
          {#if v.description}<p class="text-sm text-zinc-300">{v.description}</p>{/if}

          <!-- 1. Pruebas -->
          <div class="border rounded p-3 {pasoClase(v.testReport ? v.testReport.failed + v.testReport.errored === 0 && v.testReport.total > 0 : null)}" data-testid="step-tests">
            <h4 class="text-xs font-semibold text-zinc-300">
              {t("promotion.stepTests")} — {t("promotion.testsSummary", {
                passed: String(v.testReport?.passed ?? 0),
                failed: String(v.testReport?.failed ?? 0),
                errored: String(v.testReport?.errored ?? 0),
                total: String(v.testReport?.total ?? 0),
              })}
            </h4>
            {#if v.testReport?.cases?.length}
              <ul class="mt-1 space-y-1">
                {#each v.testReport.cases as c}
                  <li class="text-xs">
                    <span class={c.status === "passed" ? "text-emerald-300" : "text-red-300"}>{t(`promotion.test_${c.status}`)}</span>
                    <span class="text-zinc-300 ml-1">{c.name}</span>
                    <span class="text-zinc-600 ml-1">{t("promotion.ms", { ms: String(c.durationMs) })}</span>
                    {#each c.mismatches as m}<div class="text-zinc-400 ml-4 break-all">{m}</div>{/each}
                    {#if c.error && c.status !== "passed"}<div class="text-zinc-500 ml-4 break-all">{c.error}</div>{/if}
                    {#if c.unmockedCalls.length}<div class="text-amber-300/80 ml-4 break-all">{t("promotion.unmocked", { calls: c.unmockedCalls.join(", ") })}</div>{/if}
                  </li>
                {/each}
              </ul>
            {/if}
          </div>

          <!-- 2. Escaneo -->
          <div class="border rounded p-3 {pasoClase(v.scanReport ? v.scanReport.passed : null)}" data-testid="step-scan">
            <h4 class="text-xs font-semibold text-zinc-300">{t("promotion.stepScan")} — {v.scanReport?.passed ? t("promotion.scanOk") : t("promotion.scanFail")}</h4>
            {#each v.scanReport?.findings ?? [] as h}
              <div class="text-xs mt-1">
                <span class={h.severity === "high" ? "text-red-300" : h.severity === "medium" ? "text-amber-300" : "text-zinc-400"}>{h.severity}</span>
                <code class="text-zinc-300 ml-1">{h.rule}</code>
                <span class="text-zinc-500 ml-1">L{h.line}: {h.message}</span>
              </div>
            {/each}
            {#if v.scanReport?.apiCalls?.length}
              <div class="text-xs text-zinc-500 mt-1 break-all">
                {t("promotion.apiCalls")}: {v.scanReport.apiCalls.map((c) => `${c.method} ${c.path ?? "?"}`).join(", ")}
              </div>
            {/if}
          </div>

          <!-- 3. Capacidades -->
          <div class="border rounded p-3 border-zinc-800" data-testid="step-capabilities">
            <h4 class="text-xs font-semibold text-zinc-300">{t("promotion.stepCapabilities")}</h4>
            <div class="text-xs text-zinc-400 mt-1 space-y-0.5 break-all">
              <div>{t("promotion.declaredScopes")}: <code>{v.capabilities.scopes.join(", ") || "—"}</code></div>
              <div>{t("promotion.declaredHosts")}: <code>{v.capabilities.fetchAllow.join(", ") || "—"}</code></div>
              {#if v.capabilityDiff}
                {#if v.capabilityDiff.newTarget}<div class="text-amber-300">{t("promotion.newTarget")}</div>{/if}
                {#if v.capabilityDiff.scopesAdded.length}<div class="text-red-300">+ {v.capabilityDiff.scopesAdded.join(", ")}</div>{/if}
                {#if v.capabilityDiff.denialsRemoved.length}<div class="text-red-300">− {v.capabilityDiff.denialsRemoved.join(", ")}</div>{/if}
                {#if v.capabilityDiff.hostsAdded.length}<div class="text-red-300">+ {v.capabilityDiff.hostsAdded.join(", ")}</div>{/if}
                {#each v.capabilityDiff.limitsIncreased as l}<div class="text-amber-300">{l.field}: {l.before} → {l.after}</div>{/each}
              {/if}
            </div>
          </div>

          <!-- 4. Decisión -->
          <div class="border rounded p-3 border-zinc-800" data-testid="step-decision">
            <h4 class="text-xs font-semibold text-zinc-300">
              {t("promotion.stepDecision")} — {v.decision?.ruta === "turbo" ? t("promotion.routeTurbo") : t("promotion.routeProposal")}
            </h4>
            <ul class="mt-1 text-xs text-zinc-400 list-disc ml-4">
              {#each v.decision?.motivos ?? [] as m}<li data-testid="reason" data-reason={m}>{t(`promotion.reason_${m}`)}</li>{/each}
            </ul>
            {#if detalle.proposal}
              <p class="text-xs text-zinc-500 mt-1">
                {t("promotion.proposal", { status: t(`approvals.status_${detalle.proposal.status}`) })}
                <a href="/approvals?id={detalle.proposal.id}" class="ml-1 text-indigo-300 hover:underline">{t("approvals.open")}</a>
                {#if detalle.proposal.comment}· {t("approvals.commentShown", { comment: detalle.proposal.comment })}{/if}
              </p>
            {/if}
            {#if v.activationError}
              <p class="text-xs text-red-300 mt-1" data-testid="activation-error">
                {ERRORES_CONOCIDOS.includes(v.activationError)
                  ? t(`promotion.activationError_${v.activationError}`)
                  : t("promotion.activationErrorOther", { error: v.activationError })}
              </p>
            {/if}
          </div>

          <!-- 5. Activación y vigilancia -->
          {#if v.activatedAt || v.rolledBackAt}
            <div class="border rounded p-3 border-zinc-800" data-testid="step-watch">
              <h4 class="text-xs font-semibold text-zinc-300">{t("promotion.stepWatch")}</h4>
              <div class="text-xs text-zinc-400 mt-1 space-y-0.5">
                {#if v.activatedAt}<div>{t("promotion.activated", { when: fecha(v.activatedAt), by: v.activatedByName ?? v.activatedBy ?? "—" })}</div>{/if}
                {#if v.watch}
                  <div>{t("promotion.watchState", {
                    state: t(`promotion.watch_${v.watch.state ?? "watching"}`),
                    executions: String(v.watch.executions ?? 0),
                    errors: String(v.watch.errors ?? 0),
                    until: fecha(v.watchUntil),
                  })}</div>
                {/if}
                {#if v.rolledBackAt}
                  <div class="text-red-300">{t("promotion.rolledBack", { when: fecha(v.rolledBackAt), by: v.rolledBackByName ?? v.rolledBackBy ?? "—" })}</div>
                  <div class="text-zinc-500 break-all">{v.rollbackReason}</div>
                {/if}
              </div>
            </div>
          {/if}

          <!-- Acciones -->
          {#if isAdmin()}
            {#if v.status === "awaiting_approval"}
              <div class="space-y-2" data-testid="promotion-decide">
                <textarea bind:value={comentario} rows="2" placeholder={t("promotion.commentPlaceholder")} class="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200"></textarea>
                <div class="flex gap-2">
                  <Button variant="primary" size="sm" loading={ocupado === "approve"} onclick={() => hacer("approve")}><Check size={14} class="mr-1" />{t("promotion.approve")}</Button>
                  <Button variant="secondary" size="sm" loading={ocupado === "reject"} onclick={() => hacer("reject")}><X size={14} class="mr-1" />{t("promotion.reject")}</Button>
                </div>
              </div>
            {:else if v.status === "active" && v.origin !== "baseline"}
              <div class="space-y-2" data-testid="promotion-rollback">
                <input bind:value={motivoVuelta} placeholder={t("promotion.rollbackReason")} class="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200" />
                <Button variant="secondary" size="sm" disabled={!motivoVuelta.trim()} loading={ocupado === "rollback"} onclick={() => hacer("rollback")}>
                  <RotateCcw size={14} class="mr-1" />{t("promotion.rollback")}
                </Button>
              </div>
            {:else if v.status === "approved"}
              <Button variant="primary" size="sm" loading={ocupado === "activate"} onclick={() => hacer("activate")}><Play size={14} class="mr-1" />{t("promotion.activate")}</Button>
            {/if}
          {/if}

          <details open>
            <summary class="text-xs text-zinc-400 cursor-pointer">{t("promotion.code")}</summary>
            <pre class="text-xs bg-zinc-950 border border-zinc-800 rounded p-2 max-h-80 overflow-auto whitespace-pre-wrap break-all text-zinc-200" data-testid="promotion-code">{v.code}</pre>
          </details>
          {#if detalle.previous}
            <details>
              <summary class="text-xs text-zinc-400 cursor-pointer">{t("promotion.previousCode", { n: String(detalle.previous.versionNumber) })}</summary>
              <pre class="text-xs bg-zinc-950 border border-zinc-800 rounded p-2 max-h-80 overflow-auto whitespace-pre-wrap break-all text-zinc-400">{detalle.previous.code}</pre>
            </details>
          {/if}
          <details>
            <summary class="text-xs text-zinc-400 cursor-pointer">{t("promotion.testCases")}</summary>
            <pre class="text-xs bg-zinc-950 border border-zinc-800 rounded p-2 max-h-60 overflow-auto whitespace-pre-wrap break-all">{json(v.tests)}</pre>
          </details>
          <details>
            <summary class="text-xs text-zinc-400 cursor-pointer">{t("promotion.timeline")}</summary>
            <ul class="mt-1 space-y-0.5" data-testid="promotion-events">
              {#each detalle.events as e (e.id)}
                <li class="text-xs text-zinc-400">
                  <span class="text-zinc-500">{fecha(e.at)}</span>
                  <span class="ml-1 text-zinc-300">{t(`approvals.action_${e.action}`)}</span>
                  {#if e.byName}<span class="ml-1">· {e.byName}</span>{/if}
                </li>
              {/each}
            </ul>
          </details>
        </div>
      {/if}
    </section>
  </div>
</div>
