<!--
  Consentimiento OAuth para MCP (docs/agents/oauth.md). Un cliente MCP
  (Claude, Cursor…) pidió conectarse: el humano elige COMO QUÉ AGENTE actúa
  (o crea uno, si es admin) y qué scopes le da. Los scopes solo estrechan lo
  que el agente y el humano ya tienen; quien aprueba pasa a ser el firmante
  del agente. La API lo vuelve a comprobar todo (routes/oauth.ts).
-->
<script lang="ts">
  import { t } from "$lib/i18n";
  import { AlertTriangle, Bot, Check, KeyRound, Plug, X } from "lucide-svelte";
  import { onMount } from "svelte";

  import Button from "$lib/components/ui/Button.svelte";
  import {
    decidir,
    leerConsentimiento,
    scopesDeEntrada,
    type VistaDeConsentimiento,
  } from "$lib/services/oauth";

  import { page } from "$app/stores";

  const idPeticion = $page.url.searchParams.get("request") ?? "";

  let vista = $state<VistaDeConsentimiento | null>(null);
  let cargando = $state(true);
  let enviando = $state(false);
  let error = $state<string | null>(null);
  /** id de agente, o "__nuevo__" para crear uno */
  let agenteElegido = $state<string>("");
  let nombreNuevo = $state("");
  let elegidos = $state<string[]>([]);

  const NUEVO = "__nuevo__";

  onMount(async () => {
    if (!idPeticion) {
      error = t("oauthConsent.missingRequest");
      cargando = false;
      return;
    }
    try {
      vista = await leerConsentimiento(idPeticion);
      nombreNuevo = vista.client.name;
      if (vista.agents.length === 1) elegir(vista.agents[0]!.id);
      else if (vista.agents.length === 0 && vista.human.canCreateAgent) elegir(NUEVO);
    } catch (e) {
      error = (e as { status?: number }).status === 404 ? t("oauthConsent.expired") : e instanceof Error ? e.message : String(e);
    } finally {
      cargando = false;
    }
  });

  const agente = $derived(vista?.agents.find((a) => a.id === agenteElegido) ?? null);

  /** Lo que se puede marcar: lo delegable del agente, o (agente nuevo) lo básico + lo pedido. */
  const ofrecidos = $derived.by(() => {
    if (!vista) return [] as string[];
    if (agenteElegido === NUEVO) {
      return [...new Set([...vista.basicScopes, ...vista.request.requestedScopes])].filter((s) => !s.startsWith("!"));
    }
    return agente?.grantable ?? [];
  });

  function elegir(id: string) {
    agenteElegido = id;
    if (!vista) return;
    const delegables =
      id === NUEVO
        ? [...new Set([...vista.basicScopes, ...vista.request.requestedScopes])]
        : (vista.agents.find((a) => a.id === id)?.grantable ?? []);
    elegidos = scopesDeEntrada(vista.request.requestedScopes, vista.basicScopes, delegables);
  }

  function alternar(s: string) {
    elegidos = elegidos.includes(s) ? elegidos.filter((x) => x !== s) : [...elegidos, s];
  }

  const puedeAprobar = $derived(
    !!vista &&
      !!agenteElegido &&
      elegidos.includes("mcp:connect") &&
      (agenteElegido !== NUEVO || nombreNuevo.trim().length > 0)
  );

  async function enviar(decision: "approve" | "deny") {
    if (!vista) return;
    enviando = true;
    error = null;
    try {
      const r = await decidir(
        idPeticion,
        decision === "deny"
          ? { decision }
          : agenteElegido === NUEVO
            ? { decision, newAgent: { name: nombreNuevo.trim() }, scopes: elegidos }
            : { decision, agentId: agenteElegido, scopes: elegidos }
      );
      window.location.href = r.redirectTo;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      enviando = false;
    }
  }
</script>

<div class="max-w-2xl mx-auto p-6 space-y-6" data-testid="oauth-consent">
  {#if cargando}
    <div class="flex items-center justify-center h-40">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div>
    </div>
  {:else if !vista}
    <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400" data-testid="oauth-consent-error">
      {error}
    </div>
  {:else}
    <div class="flex items-start gap-3">
      <div class="p-2 rounded-lg bg-indigo-500/10 text-indigo-300"><Plug size={22} /></div>
      <div>
        <h1 class="text-xl font-semibold text-zinc-100">{t("oauthConsent.title", { client: vista.client.name })}</h1>
        <p class="text-sm text-zinc-400">{t("oauthConsent.subtitle")}</p>
      </div>
    </div>

    <section class="p-4 rounded-lg border border-zinc-800 space-y-1 text-sm">
      <p class="text-zinc-300">
        {t("oauthConsent.clientId")}
        <code class="text-xs text-zinc-400 break-all">{vista.client.id}</code>
      </p>
      <p class="text-zinc-300">
        {vista.client.kind === "cimd" ? t("oauthConsent.kindCimd") : t("oauthConsent.kindDcr")}
      </p>
      <p class="text-zinc-300" data-testid="oauth-redirect-host">
        {t("oauthConsent.redirectsTo", { host: vista.client.redirectHost })}
      </p>
      {#if vista.client.localhostRedirect}
        <p class="flex items-start gap-2 text-amber-300 text-xs pt-1" data-testid="oauth-localhost-warning">
          <AlertTriangle size={14} class="mt-0.5 shrink-0" />
          {t("oauthConsent.localhostWarning", { host: vista.client.redirectHost })}
        </p>
      {/if}
    </section>

    <section class="space-y-2">
      <h2 class="text-sm font-semibold text-zinc-300 flex items-center gap-2"><Bot size={16} />{t("oauthConsent.actAs")}</h2>
      {#if vista.agents.length === 0 && !vista.human.canCreateAgent}
        <p class="text-sm text-amber-300">{t("oauthConsent.noAgents")}</p>
      {/if}
      {#if vista.moreAgents}
        <p class="text-xs text-zinc-500" data-testid="consent-more-agents">{t("oauthConsent.moreAgents")}</p>
      {/if}
      {#each vista.agents as a (a.id)}
        <label class="flex items-start gap-3 p-3 rounded-lg border {agenteElegido === a.id ? 'border-indigo-500/60 bg-indigo-500/5' : 'border-zinc-800'} cursor-pointer">
          <input type="radio" name="agente" checked={agenteElegido === a.id} onchange={() => elegir(a.id)} class="mt-1" />
          <span>
            <span class="block text-sm text-zinc-100">{a.name}</span>
            {#if a.description}<span class="block text-xs text-zinc-500">{a.description}</span>{/if}
            {#if a.sponsorUserId && a.sponsorUserId !== vista.human.id}
              <span class="block text-xs text-amber-300/80">{t("oauthConsent.signerChanges")}</span>
            {/if}
          </span>
        </label>
      {/each}
      {#if vista.human.canCreateAgent}
        <label class="flex items-start gap-3 p-3 rounded-lg border {agenteElegido === NUEVO ? 'border-indigo-500/60 bg-indigo-500/5' : 'border-zinc-800'} cursor-pointer">
          <input type="radio" name="agente" checked={agenteElegido === NUEVO} onchange={() => elegir(NUEVO)} class="mt-1" />
          <span class="flex-1">
            <span class="block text-sm text-zinc-100">{t("oauthConsent.newAgent")}</span>
            {#if agenteElegido === NUEVO}
              <input
                type="text"
                bind:value={nombreNuevo}
                maxlength="100"
                aria-label={t("oauthConsent.newAgentName")}
                placeholder={t("oauthConsent.newAgentName")}
                class="mt-2 w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100"
              />
            {/if}
          </span>
        </label>
      {/if}
    </section>

    {#if agenteElegido}
      <section class="space-y-2" data-testid="oauth-scopes">
        <h2 class="text-sm font-semibold text-zinc-300 flex items-center gap-2"><KeyRound size={16} />{t("oauthConsent.scopes")}</h2>
        <p class="text-xs text-zinc-500">{t("oauthConsent.scopesHelp")}</p>
        {#if ofrecidos.length === 0}
          <p class="text-sm text-amber-300">{t("oauthConsent.noScopes")}</p>
        {/if}
        <div class="grid gap-1">
          {#each ofrecidos as s (s)}
            <label class="flex items-center gap-2 text-sm text-zinc-200">
              <input type="checkbox" checked={elegidos.includes(s)} onchange={() => alternar(s)} />
              <code class="text-xs">{s}</code>
              {#if vista.request.requestedScopes.includes(s)}
                <span class="text-[10px] uppercase tracking-wide text-indigo-300">{t("oauthConsent.requested")}</span>
              {/if}
            </label>
          {/each}
        </div>
        {#if agente && agente.notDelegable.length}
          <p class="text-xs text-zinc-500">{t("oauthConsent.notDelegable", { scopes: agente.notDelegable.join(", ") })}</p>
        {/if}
        {#if agente && agente.denies.length}
          <p class="text-xs text-zinc-500">{t("oauthConsent.denies", { scopes: agente.denies.join(", ") })}</p>
        {/if}
        {#if !elegidos.includes("mcp:connect")}
          <p class="text-xs text-amber-300">{t("oauthConsent.needsConnect")}</p>
        {/if}
      </section>
    {/if}

    <ul class="text-xs text-zinc-500 list-disc pl-5 space-y-1">
      <li>{t("oauthConsent.ruleSigner")}</li>
      <li>{t("oauthConsent.ruleNarrow")}</li>
      <li>{t("oauthConsent.ruleRevoke")}</li>
    </ul>

    {#if error}
      <div class="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400" data-testid="oauth-consent-error">{error}</div>
    {/if}

    <div class="flex justify-end gap-3">
      <Button variant="ghost" disabled={enviando} onclick={() => enviar("deny")}>
        <X size={14} class="mr-1" />{t("oauthConsent.deny")}
      </Button>
      <Button variant="primary" loading={enviando} disabled={!puedeAprobar} onclick={() => enviar("approve")}>
        <Check size={14} class="mr-1" />{t("oauthConsent.approve")}
      </Button>
    </div>
  {/if}
</div>
