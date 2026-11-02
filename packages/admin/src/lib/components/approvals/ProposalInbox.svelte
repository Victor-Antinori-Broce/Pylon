<!--
  Bandeja de aprobación (fase F): las propuestas de los agentes, el detalle con
  el diff y la decisión (aprobar y ejecutar / rechazar, con comentario que el
  agente verá). Solo el equipo humano llega aquí (la API lo exige).
-->
<script lang="ts">
  import { t, localeFormato } from "$lib/i18n";
  import { Check, X, RefreshCw, Inbox } from "lucide-svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  import Button from "$lib/components/ui/Button.svelte";
  import {
    approveProposal,
    getProposal,
    listProposals,
    proposalFileUrl,
    rejectProposal,
  } from "$lib/services/approvals";
  import { aprobaciones } from "$lib/states/aprobaciones.svelte";
  import type { Proposal, ProposalDetail, ProposalStatus } from "$lib/types/approvals";

  interface Props {
    /** Para abrir una propuesta concreta (`?id=`). */
    initialId?: string | null;
  }
  const { initialId = null }: Props = $props();

  const ESTADOS: ProposalStatus[] = ["pending", "executing", "executed", "failed", "rejected", "expired"];

  let filtro = $state<ProposalStatus | "">("pending");
  let lista = $state<Proposal[]>([]);
  let total = $state(0);
  let cargando = $state(true);
  let error = $state<string | null>(null);
  let seleccion = $state<ProposalDetail | null>(null);
  let cargandoDetalle = $state(false);
  let comentario = $state("");
  let decidiendo = $state<"approve" | "reject" | null>(null);
  // Miniaturas de las imágenes retenidas: id del fichero → URL blob (o "error").
  let miniaturas = $state<Record<string, string>>({});

  $effect(() => {
    const p = seleccion;
    const ficheros = p?.files ?? [];
    const urls: string[] = [];
    let vigente = true;
    miniaturas = {};
    for (const f of ficheros) {
      proposalFileUrl(p!.id, f.id)
        .then((url) => {
          urls.push(url);
          if (vigente) miniaturas = { ...miniaturas, [f.id]: url };
          else URL.revokeObjectURL(url);
        })
        .catch(() => {
          if (vigente) miniaturas = { ...miniaturas, [f.id]: "error" };
        });
    }
    return () => {
      vigente = false;
      for (const u of urls) URL.revokeObjectURL(u);
    };
  });

  function tamano(bytes: number): string {
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  onMount(async () => {
    await cargar();
    if (initialId) await abrir(initialId);
  });

  async function cargar() {
    try {
      cargando = true;
      error = null;
      const r = await listProposals({ status: filtro, limit: 100 });
      lista = r.proposals;
      total = r.total;
    } catch (e) {
      error = e instanceof Error ? e.message : t("approvals.errorLoading");
    } finally {
      cargando = false;
    }
  }

  async function abrir(id: string) {
    try {
      cargandoDetalle = true;
      comentario = "";
      seleccion = await getProposal(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("approvals.errorLoading"));
    } finally {
      cargandoDetalle = false;
    }
  }

  async function decidir(accion: "approve" | "reject") {
    if (!seleccion) return;
    try {
      decidiendo = accion;
      const r =
        accion === "approve"
          ? await approveProposal(seleccion.id, comentario.trim() || undefined)
          : await rejectProposal(seleccion.id, comentario.trim() || undefined);
      seleccion = r.proposal;
      if (accion === "approve") {
        const estado = r.proposal.status === "executed" ? t("approvals.status_executed") : t("approvals.status_failed");
        (r.proposal.status === "executed" ? toast.success : toast.error)(t("approvals.approved", { status: estado }));
      } else {
        toast.success(t("approvals.rejected"));
      }
      await Promise.all([cargar(), aprobaciones.refrescar()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("approvals.errorDeciding"));
      await abrir(seleccion.id);
    } finally {
      decidiendo = null;
    }
  }

  const fecha = (v: string | null) => (v ? new Date(v).toLocaleString(localeFormato()) : "—");
  const json = (v: unknown) => (v === undefined ? "" : JSON.stringify(v, null, 2));

  const CLASE: Record<ProposalStatus, string> = {
    pending: "bg-amber-500/15 text-amber-300",
    executing: "bg-sky-500/15 text-sky-300",
    executed: "bg-emerald-500/15 text-emerald-300",
    failed: "bg-red-500/15 text-red-300",
    rejected: "bg-zinc-700/40 text-zinc-300",
    expired: "bg-zinc-700/40 text-zinc-500",
  };
</script>

<div class="flex flex-col lg:flex-row gap-4 min-h-0" data-testid="approvals-inbox">
  <!-- Lista -->
  <section class="lg:w-[46%] min-w-0 space-y-3">
    <div class="flex flex-wrap items-center gap-2">
      <label for="filtro-estado" class="text-xs text-zinc-500">{t("approvals.filterStatus")}</label>
      <select
        id="filtro-estado"
        bind:value={filtro}
        onchange={cargar}
        class="px-2 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100"
        data-testid="filtro-estado"
      >
        <option value="">{t("approvals.all")}</option>
        {#each ESTADOS as e}
          <option value={e}>{t(`approvals.status_${e}`)}</option>
        {/each}
      </select>
      <div class="flex-1"></div>
      <span class="text-xs text-zinc-500">{t("approvals.totalCount", { n: total })}</span>
      <Button variant="ghost" size="sm" onclick={cargar}>
        <RefreshCw size={14} class="mr-1" />{t("approvals.refresh")}
      </Button>
    </div>

    {#if cargando}
      <div class="flex items-center justify-center h-24">
        <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div>
      </div>
    {:else if error}
      <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">{error}</div>
    {:else if lista.length === 0}
      <div class="p-8 text-center text-zinc-500 border border-dashed border-zinc-800 rounded-lg">
        <Inbox size={20} class="mx-auto mb-2 text-zinc-600" />
        {t("approvals.empty")}
      </div>
    {:else}
      <ul class="border border-zinc-800 rounded-lg divide-y divide-zinc-800/70">
        {#each lista as p (p.id)}
          <li>
            <button
              class="w-full text-left px-3 py-2.5 hover:bg-zinc-800/40 transition-colors {seleccion?.id === p.id ? 'bg-zinc-800/60' : ''}"
              onclick={() => abrir(p.id)}
              data-testid="proposal-row"
              data-proposal-id={p.id}
            >
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-[11px] px-1.5 py-0.5 rounded shrink-0 {CLASE[p.status]}">{t(`approvals.status_${p.status}`)}</span>
                <code class="text-xs text-zinc-300 truncate min-w-0">{p.method} {p.tool ?? p.path}</code>
              </div>
              <div class="mt-1 flex flex-wrap gap-x-3 text-[11px] text-zinc-500">
                <span>{p.agentName ?? t("approvals.agentDeleted")}</span>
                <span>{p.channel === "mcp" ? t("approvals.channelMcp") : t("approvals.channelRest")}</span>
                <span>{t(`approvals.reason_${p.reason}`)}</span>
                <span>{fecha(p.createdAt)}</span>
              </div>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <!-- Detalle -->
  <section class="flex-1 min-w-0" data-testid="proposal-detail">
    {#if cargandoDetalle}
      <div class="flex items-center justify-center h-24">
        <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div>
      </div>
    {:else if !seleccion}
      <p class="text-sm text-zinc-500 p-4">{t("approvals.selectHint")}</p>
    {:else}
      {@const s = seleccion}
      <div class="border border-zinc-800 rounded-lg p-4 space-y-4">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-[11px] px-1.5 py-0.5 rounded {CLASE[s.status]}" data-testid="detail-status">{t(`approvals.status_${s.status}`)}</span>
          <code class="text-sm text-zinc-100 break-all">{s.method} {s.tool ?? s.path}</code>
        </div>

        <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div><dt class="text-zinc-500">{t("approvals.colAgent")}</dt><dd class="text-zinc-200">{s.agentName ?? t("approvals.agentDeleted")}</dd></div>
          <div data-testid="detail-sponsor"><dt class="text-zinc-500">{t("approvals.sponsor")}</dt><dd class="text-zinc-200">{s.sponsorName ?? s.sponsorUserId ?? t("approvals.noSponsor")}</dd></div>
          <div><dt class="text-zinc-500">{t("approvals.reason")}</dt><dd class="text-zinc-200">{t(`approvals.reason_${s.reason}`)}</dd></div>
          <div><dt class="text-zinc-500">{t("approvals.channel")}</dt><dd class="text-zinc-200">{s.channel === "mcp" ? t("approvals.channelMcp") : t("approvals.channelRest")}</dd></div>
          <div><dt class="text-zinc-500">{t("approvals.operation")}</dt><dd class="text-zinc-200 break-all">{s.operation ?? s.tool ?? t("approvals.legacyRoute")}</dd></div>
          <div><dt class="text-zinc-500">{t("approvals.colCreated")}</dt><dd class="text-zinc-200">{fecha(s.createdAt)}</dd></div>
          <div><dt class="text-zinc-500">{t("approvals.colExpires")}</dt><dd class="text-zinc-200">{fecha(s.expiresAt)}</dd></div>
          {#if s.idempotencyKey}
            <div class="sm:col-span-2"><dt class="text-zinc-500">{t("approvals.idempotencyKey")}</dt><dd class="text-zinc-200 break-all"><code>{s.idempotencyKey}</code></dd></div>
          {/if}
          <div class="sm:col-span-2">
            <dt class="text-zinc-500">{t("approvals.scopes")}</dt>
            <dd class="flex flex-wrap gap-1 mt-1">
              {#each s.scopes as sc}
                <code class="text-[11px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">{sc}</code>
              {:else}
                <span class="text-zinc-500">—</span>
              {/each}
            </dd>
          </div>
        </dl>

        <!-- Diff -->
        {#if (s.files?.length ?? 0) > 0}
          <div data-testid="proposal-files">
            <h4 class="text-xs font-semibold text-zinc-400 mb-1.5">{t("approvals.files")}</h4>
            <ul class="flex flex-wrap gap-2">
              {#each s.files ?? [] as f (f.id)}
                <li class="w-32 text-[11px] text-zinc-400">
                  <div class="w-32 h-32 rounded border border-zinc-800 bg-zinc-950 flex items-center justify-center overflow-hidden">
                    {#if miniaturas[f.id] && miniaturas[f.id] !== "error"}
                      <img src={miniaturas[f.id]} alt={t("approvals.thumbnailAlt", { name: f.filename })} class="max-w-full max-h-full object-contain" data-testid="proposal-thumbnail" />
                    {:else if miniaturas[f.id] === "error"}
                      <span class="px-2 text-center text-red-300/80">{t("approvals.fileLoadError")}</span>
                    {/if}
                  </div>
                  <p class="mt-1 truncate" title={f.filename}>{f.filename}</p>
                  <p class="text-zinc-500">{f.mimeType} · {tamano(f.size)}</p>
                </li>
              {/each}
            </ul>
          </div>
        {:else if s.contentType?.startsWith("multipart/")}
          <p class="text-xs text-zinc-500" data-testid="proposal-files-removed">{t("approvals.filesRemoved")}</p>
        {/if}

        {#if s.injectionCheck && /inject|unsafe|malicious|jailbreak/i.test(s.injectionCheck.label) && s.injectionCheck.score >= 0.5}
          <p class="text-xs px-3 py-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300" data-testid="proposal-injection">
            {t("approvals.injectionWarning", { label: s.injectionCheck.label, score: s.injectionCheck.score.toFixed(2) })}
          </p>
        {/if}

        <div data-testid="proposal-diff">
          <h4 class="text-xs font-semibold text-zinc-400 mb-1.5">{t("approvals.diff")}</h4>
          {#if !s.diff}
            <p class="text-xs text-zinc-500">{t("approvals.noDiff")}</p>
          {:else}
            {#if s.diff.currentUnavailable !== undefined}
              <p class="text-xs text-amber-300/80 mb-1.5">{t("approvals.diffUnavailable", { v: String(s.diff.currentUnavailable) })}</p>
            {/if}
            {#if s.diff.changes}
              {#if s.diff.changes.length === 0}
                <p class="text-xs text-zinc-500">{t("approvals.noChanges")}</p>
              {:else}
                <div class="overflow-x-auto border border-zinc-800 rounded">
                  <table class="w-full text-xs">
                    <thead class="text-zinc-500">
                      <tr>
                        <th class="text-left px-2 py-1">{t("approvals.field")}</th>
                        <th class="text-left px-2 py-1">{t("approvals.before")}</th>
                        <th class="text-left px-2 py-1">{t("approvals.after")}</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-zinc-800/70">
                      {#each s.diff.changes as cambio}
                        <tr>
                          <td class="px-2 py-1 text-zinc-300 align-top"><code>{cambio.field}</code></td>
                          <td class="px-2 py-1 align-top"><pre class="whitespace-pre-wrap break-all text-red-300/90">{json(cambio.before)}</pre></td>
                          <td class="px-2 py-1 align-top"><pre class="whitespace-pre-wrap break-all text-emerald-300/90">{json(cambio.after)}</pre></td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}
            {:else if s.diff.kind === "delete" && s.diff.current != null}
              <p class="text-xs text-zinc-400 mb-1">{t("approvals.current")}</p>
              <pre class="text-xs bg-zinc-950 border border-zinc-800 rounded p-2 max-h-56 overflow-auto whitespace-pre-wrap break-all text-red-300/90">{json(s.diff.current)}</pre>
            {:else if s.diff.kind === "promotion"}
              <div class="text-xs text-zinc-300 space-y-1" data-testid="proposal-promotion">
                <p>{t("approvals.promotionSummary", {
                  action: s.diff.target?.slug ?? "—",
                  version: String(s.diff.versionNumber ?? "?"),
                  passed: String(s.diff.tests?.passed ?? 0),
                  total: String(s.diff.tests?.total ?? 0),
                  scan: s.diff.scan?.passed ? t("promotion.scanOk") : t("promotion.scanFail"),
                })}</p>
                <ul class="list-disc ml-4 text-zinc-400">
                  {#each s.diff.decision?.motivos ?? [] as m}<li>{t(`promotion.reason_${m}`)}</li>{/each}
                </ul>
                <a href="/approvals?tab=promotion&version={s.diff.versionId}" class="text-indigo-300 hover:underline">{t("approvals.openPromotion")}</a>
              </div>
            {:else if s.diff.kind === "tool"}
              <p class="text-xs text-zinc-400 mb-1">{t("approvals.arguments")}</p>
              <pre class="text-xs bg-zinc-950 border border-zinc-800 rounded p-2 max-h-56 overflow-auto whitespace-pre-wrap break-all">{json(s.diff.arguments)}</pre>
            {:else}
              <p class="text-xs text-zinc-400 mb-1">{t("approvals.proposed")}</p>
              <pre class="text-xs bg-zinc-950 border border-zinc-800 rounded p-2 max-h-56 overflow-auto whitespace-pre-wrap break-all text-emerald-300/90">{json(s.diff.proposed)}</pre>
            {/if}
          {/if}
        </div>

        <details>
          <summary class="text-xs text-zinc-400 cursor-pointer">{t("approvals.body")}</summary>
          <pre class="mt-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded p-2 max-h-56 overflow-auto whitespace-pre-wrap break-all">{json(s.body) || "—"}</pre>
        </details>

        <!-- Decisión -->
        {#if s.status === "pending"}
          {#if s.canDecide}
            <div class="space-y-2 border-t border-zinc-800 pt-3">
              <label for="comentario" class="block text-xs text-zinc-400">{t("approvals.comment")}</label>
              <textarea
                id="comentario"
                bind:value={comentario}
                rows={2}
                placeholder={t("approvals.commentPlaceholder")}
                class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 resize-none"
              ></textarea>
              <div class="flex justify-end gap-2">
                <Button variant="secondary" loading={decidiendo === "reject"} disabled={!!decidiendo} onclick={() => decidir("reject")}>
                  <X size={14} class="mr-1" />{t("approvals.reject")}
                </Button>
                <Button variant="primary" loading={decidiendo === "approve"} disabled={!!decidiendo} onclick={() => decidir("approve")}>
                  <Check size={14} class="mr-1" />{t("approvals.approve")}
                </Button>
              </div>
            </div>
          {:else}
            <!-- No puede aprobarla (no podría hacerlo él mismo), pero rechazar no ejecuta nada. -->
            <div class="space-y-2 border-t border-zinc-800 pt-3">
              <p class="text-xs text-amber-300/80" data-testid="cannot-decide">
                {t("approvals.cannotDecide", { reason: s.cannotDecideReason ? t(`approvals.why_${s.cannotDecideReason}`) : "" })}
              </p>
              <label for="comentario" class="block text-xs text-zinc-400">{t("approvals.comment")}</label>
              <textarea
                id="comentario"
                bind:value={comentario}
                rows={2}
                placeholder={t("approvals.commentPlaceholder")}
                class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 resize-none"
              ></textarea>
              <div class="flex justify-end">
                <Button variant="secondary" loading={decidiendo === "reject"} disabled={!!decidiendo} onclick={() => decidir("reject")}>
                  <X size={14} class="mr-1" />{t("approvals.reject")}
                </Button>
              </div>
            </div>
          {/if}
        {:else}
          <div class="border-t border-zinc-800 pt-3 space-y-2 text-xs" data-testid="proposal-decision">
            {#if s.decidedBy}
              <p class="text-zinc-400">{t("approvals.decidedBy", { name: s.decidedByName ?? s.decidedBy, date: fecha(s.decidedAt) })}</p>
            {/if}
            {#if s.comment}
              <p class="text-zinc-300">{t("approvals.commentShown", { comment: s.comment })}</p>
            {/if}
            {#if s.result}
              <div>
                <p class="text-zinc-400 mb-1">
                  {t("approvals.result")}
                  {#if s.result.status !== null}
                    <code class="ml-1 text-zinc-200" data-testid="result-status">{s.result.status}</code>
                  {/if}
                </p>
                {#if s.result.error}
                  <p class="text-red-300 mb-1">{t("approvals.resultError", { error: s.result.error })}</p>
                {/if}
                <pre class="bg-zinc-950 border border-zinc-800 rounded p-2 max-h-56 overflow-auto whitespace-pre-wrap break-all">{json(s.result.body) || "—"}</pre>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </section>
</div>
