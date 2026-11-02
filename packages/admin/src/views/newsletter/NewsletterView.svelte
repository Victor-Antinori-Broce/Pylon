<script lang="ts">
  import { t, localeFormato } from "$lib/i18n";
  /**
   * Newsletter — panel de administración del kon
   *
   * Cuatro pestañas: Campañas (crear, editar, previsualizar, programar,
   * enviar, estadísticas), Miembros, Supresiones y Segmentos (preview de
   * alcance sin enviar).
   *
   * DECISIONES
   *
   * · El editor es asunto + preheader + HTML con vista previa en vivo
   *   (iframe con srcdoc, sandboxeado). No reinventa un editor visual: el
   *   HTML puede venir del page builder, del blog o de fuera. La vista previa
   *   REAL —con List-Unsubscribe y pie— la sirve el backend en
   *   /campaigns/:id/preview, que es la que se muestra tras guardar.
   *
   * · "Enviar" pide confirmación con el número REAL de destinatarios
   *   (resuelto por /prepare) antes de tocar nada. Un botón que manda 50.000
   *   correos sin decir cuántos es una trampa.
   *
   * · Las estadísticas salen del desglose por entrega (nl_deliveries), no del
   *   contador agregado: si discrepan, la verdad está en las filas.
   */
  import { onDestroy } from "svelte";

  const API = import.meta.env.VITE_API_URL ?? "";
  const BASE = `${API}/api/newsletter`;

  type Tab = "campaigns" | "members" | "suppressions" | "segments";
  let tab = $state<Tab>("campaigns");

  interface Campaign {
    id: string;
    newsletterId: string;
    subject: string;
    previewText: string | null;
    html: string;
    status: string;
    scheduledAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    stats: Record<string, number>;
    postId: string | null;
    createdAt: string;
  }

  interface Member {
    id: string;
    email: string;
    name: string | null;
    status: string;
    locale: string;
    consentAt: string | null;
    createdAt: string;
  }

  interface Suppression {
    id: string;
    email: string;
    reason: string;
    source: string;
    detail: string | null;
    createdAt: string;
  }

  let newsletters = $state<{ id: string; name: string; slug: string }[]>([]);
  let campaigns = $state<Campaign[]>([]);
  let members = $state<Member[]>([]);
  let suppressions = $state<Suppression[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);

  // ── Editor de campaña ────────────────────────────────────────────────────
  let editing = $state<Campaign | null>(null);
  let draftSubject = $state("");
  let draftPreview = $state("");
  let draftHtml = $state("");
  let draftScheduledAt = $state("");
  let saving = $state(false);

  // ── Detalle / stats ──────────────────────────────────────────────────────
  let statsFor = $state<string | null>(null);
  let statsData = $state<{
    status: string;
    stats: Record<string, number>;
    breakdown: { status: string; count: number }[];
  } | null>(null);

  // ── Confirmación de envío ────────────────────────────────────────────────
  let confirmSend = $state<{ id: string; subject: string; recipients: number } | null>(null);

  // ── Segmentos: preview de alcance ────────────────────────────────────────
  let segmentFilter = $state('{\n  "status": ["subscribed"]\n}');
  let segmentResult = $state<{ total: number; sample: string[] } | null>(null);
  let segmentError = $state<string | null>(null);

  const STATUS_STYLE: Record<string, string> = {
    sent: "bg-kitsuden-green/15 text-kitsuden-green",
    sending: "bg-kitsuden-accent/15 text-kitsuden-accent",
    scheduled: "bg-kitsuden-accent/15 text-kitsuden-accent",
    draft: "bg-kitsuden-subtle/15 text-kitsuden-text-dim",
    failed: "bg-kitsuden-danger/15 text-kitsuden-danger",
    canceled: "bg-kitsuden-subtle/15 text-kitsuden-text-dim",
    subscribed: "bg-kitsuden-green/15 text-kitsuden-green",
    pending: "bg-kitsuden-subtle/15 text-kitsuden-text-dim",
    unsubscribed: "bg-kitsuden-danger/15 text-kitsuden-danger",
    cleaned: "bg-kitsuden-danger/15 text-kitsuden-danger",
  };

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE}${path}`, { credentials: "include", ...init });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  async function load() {
    loading = true;
    error = null;
    try {
      const [n, c, m, s] = await Promise.all([
        api<{ newsletters: typeof newsletters }>("/newsletters"),
        api<{ campaigns: Campaign[] }>("/campaigns"),
        api<{ members: Member[] }>("/members"),
        api<{ suppressions: Suppression[] }>("/suppressions"),
      ]);
      newsletters = n.newsletters;
      campaigns = c.campaigns;
      members = m.members;
      suppressions = s.suppressions;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  function startNew() {
    editing = null;
    draftSubject = "";
    draftPreview = "";
    draftHtml = "<h1>Hola 👋</h1>\n<p>Escribe aquí tu boletín…</p>";
    draftScheduledAt = "";
    editorOpen = true;
  }

  function startEdit(campaign: Campaign) {
    editing = campaign;
    draftSubject = campaign.subject;
    draftPreview = campaign.previewText ?? "";
    draftHtml = campaign.html;
    draftScheduledAt = campaign.scheduledAt ? campaign.scheduledAt.slice(0, 16) : "";
    editorOpen = true;
  }

  let editorOpen = $state(false);

  async function saveDraft() {
    if (!draftSubject.trim() || !draftHtml.trim()) {
      notice = t("newsletterView.faltaElAsuntoOEl");
      return;
    }
    saving = true;
    try {
      const payload: Record<string, unknown> = {
        newsletterId: editing?.newsletterId ?? newsletters[0]?.id,
        subject: draftSubject,
        previewText: draftPreview || undefined,
        html: draftHtml,
        scheduledAt: draftScheduledAt ? new Date(draftScheduledAt).toISOString() : undefined,
      };

      if (editing) {
        // No hay PATCH en la API: se crea una campaña nueva. Editar un draft
        // enviado no tiene sentido y editar uno pendiente crea historial.
        await api("/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        notice = t("newsletterView.guardadaComoCampanaNuevaLas");
      } else {
        const created = await api<{ campaign: Campaign }>("/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        // Si lleva fecha, se prepara ya: el planificador solo mira las
        // campañas en estado `scheduled`.
        if (draftScheduledAt) {
          await api(`/campaigns/${created.campaign.id}/prepare`, { method: "POST" });
          notice = t("newsletterView.campanaProgramada");
        } else {
          notice = t("newsletterView.borradorGuardado");
        }
      }
      editorOpen = false;
      await load();
    } catch (e) {
      notice = e instanceof Error ? e.message : String(e);
    } finally {
      saving = false;
    }
  }

  /** Paso 1 del envío: resolver el segmento y ENSEÑAR el número. */
  async function askSend(campaign: Campaign) {
    try {
      const prep = await api<{ recipients: number }>(`/campaigns/${campaign.id}/prepare`, {
        method: "POST",
      });
      confirmSend = { id: campaign.id, subject: campaign.subject, recipients: prep.recipients };
    } catch (e) {
      // Ya preparada: el número está en stats.
      const stats = await api<{ stats: Record<string, number> }>(
        `/campaigns/${campaign.id}/stats`
      ).catch(() => null);
      confirmSend = {
        id: campaign.id,
        subject: campaign.subject,
        recipients: stats?.stats?.recipients ?? 0,
      };
      void e;
    }
  }

  /** Paso 2: el envío de verdad. */
  async function doSend() {
    if (!confirmSend) return;
    try {
      await api(`/campaigns/${confirmSend.id}/send`, { method: "POST" });
      notice = t("newsletterView.envioLanzadoElProgresoAparece");
    } catch (e) {
      notice = e instanceof Error ? e.message : String(e);
    }
    confirmSend = null;
    await load();
  }

  async function openStats(id: string) {
    statsFor = id;
    statsData = null;
    try {
      statsData = await api(`/campaigns/${id}/stats`);
    } catch (e) {
      notice = e instanceof Error ? e.message : String(e);
    }
  }

  async function addSuppression() {
    const email = prompt(t("newsletterView.direccionASuprimirNoRecibira"));
    if (!email) return;
    await api("/suppressions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, detail: "añadida desde el admin" }),
    }).catch((e) => (notice = String(e)));
    await load();
  }

  async function removeSuppression(email: string) {
    if (!confirm(t("newsletterView.quitarDeLaListaDe", { email })))
      return;
    await api(`/suppressions/${encodeURIComponent(email)}`, { method: "DELETE" }).catch(
      (e) => (notice = String(e))
    );
    await load();
  }

  async function previewSegment() {
    segmentError = null;
    segmentResult = null;
    let filter: unknown;
    try {
      filter = JSON.parse(segmentFilter);
    } catch {
      segmentError = t("newsletterView.elFiltroNoEsJson");
      return;
    }
    try {
      segmentResult = await api("/segments/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filter }),
      });
    } catch (e) {
      segmentError = e instanceof Error ? e.message : String(e);
    }
  }

  // Refresco mientras haya campañas enviándose.
  let timer: ReturnType<typeof setInterval> | null = null;
  $effect(() => {
    load();
    timer = setInterval(() => {
      if (campaigns.some((c) => c.status === "sending")) load();
    }, 5000);
    return () => {
      if (timer) clearInterval(timer);
    };
  });
  onDestroy(() => timer && clearInterval(timer));

  const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleString(localeFormato()) : "—");
  const pct = (part: number, total: number) =>
    total > 0 ? `${((part / total) * 100).toFixed(1)}%` : "—";
</script>

<div class="p-6 space-y-4">
  <header class="flex items-center justify-between">
    <div>
      <h1 class="text-xl font-semibold">{t("newsletterView.newsletter")}</h1>
      <p class="text-sm text-kitsuden-text-dim">
        {newsletters[0]?.name ?? t("newsletterView.sinNewsletter")} {t("newsletterView.miembrosSuprimidos", { membersCount: members.length, suppressionsCount: suppressions.length })}
      </p>
    </div>
    <button
      class="px-4 py-2 rounded-lg bg-kitsuden-accent text-white text-sm font-medium"
      onclick={startNew}
    >
      {t("newsletterView.nuevaCampana")}
    </button>
  </header>

  {#if notice}
    <div
      class="px-4 py-2 rounded-lg bg-kitsuden-accent/10 text-kitsuden-accent text-sm flex justify-between"
    >
      <span>{notice}</span>
      <button onclick={() => (notice = null)}>×</button>
    </div>
  {/if}

  <nav class="flex gap-1 border-b border-kitsuden-border">
    {#each [["campaigns", "Campañas"], ["members", "Miembros"], ["suppressions", "Supresiones"], ["segments", "Segmentos"]] as [id, label] (id)}
      <button
        class="px-4 py-2 text-sm rounded-t-lg {tab === id
          ? 'bg-kitsuden-surface font-medium'
          : 'text-kitsuden-text-dim hover:bg-kitsuden-surface/50'}"
        onclick={() => (tab = id as Tab)}
      >
        {label}
      </button>
    {/each}
  </nav>

  {#if loading}
    <p class="text-kitsuden-text-dim text-sm py-8 text-center">{t("common.cargando")}</p>
  {:else if error}
    <p class="text-kitsuden-danger text-sm py-8 text-center">{error}</p>
  {:else if tab === "campaigns"}
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-kitsuden-text-dim border-b border-kitsuden-border">
          <th class="py-2">{t("newsletterView.asunto")}</th>
          <th>{t("common.estado")}</th>
          <th>{t("newsletterView.programada")}</th>
          <th>{t("newsletterView.enviados")}</th>
          <th>{t("newsletterView.aperturas")}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each campaigns as campaign (campaign.id)}
          <tr class="border-b border-kitsuden-border/50 hover:bg-kitsuden-surface/40">
            <td class="py-2 font-medium">{campaign.subject}</td>
            <td>
              <span class="px-2 py-0.5 rounded text-xs {STATUS_STYLE[campaign.status] ?? ''}">
                {campaign.status}
              </span>
            </td>
            <td class="text-kitsuden-text-dim">{fmtDate(campaign.scheduledAt)}</td>
            <td>{campaign.stats?.sent ?? 0}/{campaign.stats?.recipients ?? 0}</td>
            <td>{pct(campaign.stats?.opened ?? 0, campaign.stats?.sent ?? 0)}</td>
            <td class="text-right space-x-2">
              <button class="text-kitsuden-accent" onclick={() => openStats(campaign.id)}
                >{t("newsletterView.stats")}</button
              >
              {#if campaign.status === "draft" || campaign.status === "scheduled"}
                <button class="text-kitsuden-accent" onclick={() => startEdit(campaign)}
                  >{t("newsletterView.editar")}</button
                >
                <button class="text-kitsuden-green" onclick={() => askSend(campaign)}>{t("newsletterView.enviar")}</button
                >
              {/if}
              <a
                class="text-kitsuden-text-dim"
                href={`${BASE}/campaigns/${campaign.id}/preview?format=html`}
                target="_blank"
                rel="noreferrer">{t("newsletterView.ver")}</a
              >
            </td>
          </tr>
        {:else}
          <tr
            ><td colspan="6" class="py-8 text-center text-kitsuden-text-dim">
              {t("newsletterView.sinCampanasAunCreaLa")}
            </td></tr
          >
        {/each}
      </tbody>
    </table>
  {:else if tab === "members"}
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-kitsuden-text-dim border-b border-kitsuden-border">
          <th class="py-2">{t("common.email")}</th><th>{t("common.nombre")}</th><th>{t("common.estado")}</th><th>{t("common.idioma")}</th>
          <th>{t("newsletterView.consentimiento")}</th>
        </tr>
      </thead>
      <tbody>
        {#each members as member (member.id)}
          <tr class="border-b border-kitsuden-border/50">
            <td class="py-2">{member.email}</td>
            <td>{member.name ?? "—"}</td>
            <td>
              <span class="px-2 py-0.5 rounded text-xs {STATUS_STYLE[member.status] ?? ''}">
                {member.status}
              </span>
            </td>
            <td>{member.locale}</td>
            <td class="text-kitsuden-text-dim">{fmtDate(member.consentAt)}</td>
          </tr>
        {:else}
          <tr
            ><td colspan="5" class="py-8 text-center text-kitsuden-text-dim">
              {t("newsletterView.sinMiembrosElFormularioPublico")}
            </td></tr
          >
        {/each}
      </tbody>
    </table>
  {:else if tab === "suppressions"}
    <div class="flex justify-end">
      <button class="text-sm text-kitsuden-danger" onclick={addSuppression}>
        {t("newsletterView.suprimirDireccion")}
      </button>
    </div>
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-kitsuden-text-dim border-b border-kitsuden-border">
          <th class="py-2">{t("common.email")}</th><th>{t("newsletterView.motivo")}</th><th>{t("newsletterView.origen")}</th><th>{t("newsletterView.fecha")}</th><th></th>
        </tr>
      </thead>
      <tbody>
        {#each suppressions as suppression (suppression.id)}
          <tr class="border-b border-kitsuden-border/50">
            <td class="py-2">{suppression.email}</td>
            <td>{suppression.reason}</td>
            <td class="text-kitsuden-text-dim">{suppression.source}</td>
            <td class="text-kitsuden-text-dim">{fmtDate(suppression.createdAt)}</td>
            <td class="text-right">
              <button
                class="text-kitsuden-text-dim"
                onclick={() => removeSuppression(suppression.email)}>{t("newsletterView.quitar")}</button
              >
            </td>
          </tr>
        {:else}
          <tr
            ><td colspan="5" class="py-8 text-center text-kitsuden-text-dim">
              {t("newsletterView.listaDeSupresionVaciaBuena")}
            </td></tr
          >
        {/each}
      </tbody>
    </table>
  {:else if tab === "segments"}
    <div class="grid md:grid-cols-2 gap-4">
      <div>
        <p class="text-sm text-kitsuden-text-dim mb-2">
          {t("newsletterView.filtroDeclarativoStatusLocalesTiers")}
        </p>
        <textarea
          class="w-full h-40 font-mono text-sm p-3 rounded-lg bg-kitsuden-surface border border-kitsuden-border"
          bind:value={segmentFilter}
        ></textarea>
        <button
          class="mt-2 px-4 py-2 rounded-lg bg-kitsuden-accent text-white text-sm"
          onclick={previewSegment}>{t("newsletterView.calcularAlcance")}</button
        >
      </div>
      <div class="rounded-lg bg-kitsuden-surface border border-kitsuden-border p-4">
        {#if segmentError}
          <p class="text-kitsuden-danger text-sm">{segmentError}</p>
        {:else if segmentResult}
          <p class="text-2xl font-semibold">{segmentResult.total}</p>
          <p class="text-sm text-kitsuden-text-dim mb-3">{t("newsletterView.destinatariosAlcanzados")}</p>
          {#each segmentResult.sample as email (email)}
            <p class="text-xs text-kitsuden-text-dim">{email}</p>
          {/each}
        {:else}
          <p class="text-sm text-kitsuden-text-dim">{t("newsletterView.elResultadoApareceraAqui")}</p>
        {/if}
      </div>
    </div>
  {/if}
</div>

<!-- ══ Editor ══ -->
{#if editorOpen}
  <div class="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-6">
    <div
      class="bg-kitsuden-bg rounded-xl border border-kitsuden-border w-full max-w-5xl max-h-[90vh] overflow-auto p-6 space-y-4"
    >
      <h2 class="text-lg font-semibold">
        {editing ? t("newsletterView.editarCampanaCreaUnaNueva") : t("newsletterView.nuevaCampana")}
      </h2>

      <input
        class="w-full p-3 rounded-lg bg-kitsuden-surface border border-kitsuden-border"
        placeholder={t("newsletterView.asunto")}
        bind:value={draftSubject}
      />
      <input
        class="w-full p-3 rounded-lg bg-kitsuden-surface border border-kitsuden-border text-sm"
        placeholder={t("newsletterView.preheaderLoQueSeVe")}
        bind:value={draftPreview}
      />

      <div class="grid md:grid-cols-2 gap-4">
        <textarea
          class="w-full h-72 font-mono text-sm p-3 rounded-lg bg-kitsuden-surface border border-kitsuden-border"
          placeholder={t("newsletterView.htmlDelBoletin")}
          bind:value={draftHtml}
        ></textarea>
        <!-- sandbox sin allow-scripts: el HTML es contenido, no código. -->
        <iframe
          class="w-full h-72 rounded-lg border border-kitsuden-border bg-white"
          sandbox=""
          title={t("newsletterView.vistaPrevia")}
          srcdoc={draftHtml}
        ></iframe>
      </div>

      <div class="flex items-center gap-3">
        <label class="text-sm text-kitsuden-text-dim" for="nl-schedule">{t("newsletterView.programarPara")}</label>
        <input
          id="nl-schedule"
          type="datetime-local"
          class="p-2 rounded-lg bg-kitsuden-surface border border-kitsuden-border text-sm"
          bind:value={draftScheduledAt}
        />
        <span class="text-xs text-kitsuden-text-dim">
          {t("newsletterView.vacioQuedaEnBorradorEl")}
        </span>
      </div>

      <div class="flex justify-end gap-2">
        <button
          class="px-4 py-2 text-sm text-kitsuden-text-dim"
          onclick={() => (editorOpen = false)}
        >
          {t("common.cancelar")}
        </button>
        <button
          class="px-4 py-2 rounded-lg bg-kitsuden-accent text-white text-sm"
          disabled={saving}
          onclick={saveDraft}
        >
          {saving ? t("newsletterView.guardando") : draftScheduledAt ? t("newsletterView.guardarYProgramar") : t("newsletterView.guardarBorrador")}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ══ Confirmación de envío ══ -->
{#if confirmSend}
  <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6">
    <div class="bg-kitsuden-bg rounded-xl border border-kitsuden-border max-w-md p-6 space-y-4">
      <h2 class="text-lg font-semibold">{t("newsletterView.confirmarEnvio")}</h2>
      <p class="text-sm">
        {t("newsletterView.seEnviaraA", { subject: confirmSend.subject })}
        <strong class="text-kitsuden-accent">{confirmSend.recipients}</strong> {t("newsletterView.destinatarios")}
      </p>
      <p class="text-xs text-kitsuden-text-dim">
        {t("newsletterView.estoNoSePuedeDeshacer")}
      </p>
      <div class="flex justify-end gap-2">
        <button
          class="px-4 py-2 text-sm text-kitsuden-text-dim"
          onclick={() => (confirmSend = null)}
        >
          {t("common.cancelar")}
        </button>
        <button class="px-4 py-2 rounded-lg bg-kitsuden-green text-white text-sm" onclick={doSend}>
          {t("newsletterView.enviarA", { recipients: confirmSend.recipients })}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ══ Stats ══ -->
{#if statsFor}
  <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6">
    <div
      class="bg-kitsuden-bg rounded-xl border border-kitsuden-border max-w-lg w-full p-6 space-y-4"
    >
      <div class="flex justify-between items-center">
        <h2 class="text-lg font-semibold">{t("newsletterView.estadisticas")}</h2>
        <button
          class="text-kitsuden-text-dim"
          onclick={() => ((statsFor = null), (statsData = null))}
        >
          ×
        </button>
      </div>
      {#if statsData}
        <div class="grid grid-cols-3 gap-3 text-center">
          {#each [["Destinatarios", statsData.stats.recipients ?? 0], ["Enviados", statsData.stats.sent ?? 0], ["Fallidos", statsData.stats.failed ?? 0], ["Entregados", statsData.stats.delivered ?? 0], ["Rebotados", statsData.stats.bounced ?? 0], ["Quejas", statsData.stats.complained ?? 0]] as [label, value] (label)}
            <div class="rounded-lg bg-kitsuden-surface p-3">
              <p class="text-xl font-semibold">{value}</p>
              <p class="text-xs text-kitsuden-text-dim">{label}</p>
            </div>
          {/each}
        </div>
        <div>
          <p class="text-sm text-kitsuden-text-dim mb-1">
            {t("newsletterView.desglosePorEntregaLaFuente")}
          </p>
          {#each statsData.breakdown as row (row.status)}
            <div class="flex justify-between text-sm py-1 border-b border-kitsuden-border/40">
              <span>{row.status}</span><span>{row.count}</span>
            </div>
          {/each}
        </div>
      {:else}
        <p class="text-sm text-kitsuden-text-dim">{t("common.cargando")}</p>
      {/if}
    </div>
  </div>
{/if}
