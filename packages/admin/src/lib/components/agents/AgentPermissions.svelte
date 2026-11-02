<!--
  Permisos de un agente (fase E)

  Dos maneras de editar la MISMA lista de scopes:
    · «Amplio»: presets (reemplazan la lista) y scopes amplios, cada uno con lo
      que concede de verdad (operaciones y datasets que abre, calculado por la API).
    · «Fino»: una fila por operación del SDK de kons y por dataset × acción, con
      Permitir / Denegar. Denegar escribe `!scope`: gana a todo, admin incluido.
  Y la vista fusionada «Lo que puede hacer», calculada por la API con la lista
  GUARDADA (amplio ∪ fino − denegado). La regla: docs/agents/permissions.md.
-->
<script lang="ts">
  import { t } from "$lib/i18n";
  import { Check, Ban, ShieldCheck, RotateCcw, Save } from "lucide-svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  import Button from "$lib/components/ui/Button.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import { getAccessCatalog, getAgentAccess, setAgentScopes } from "$lib/services/agents";
  import type { AccessCatalog, AgentAccess, AccessState } from "$lib/types/agents";

  interface Props {
    agentId: string;
  }
  const { agentId }: Props = $props();

  let catalogo = $state<AccessCatalog | null>(null);
  let acceso = $state<AgentAccess | null>(null);
  let borrador = $state<string[]>([]);
  let modo = $state<"broad" | "fine" | "raw">("broad");
  let cargando = $state(true);
  let guardando = $state(false);
  let error = $state<string | null>(null);
  let crudo = $state("");

  onMount(cargar);

  async function cargar() {
    try {
      cargando = true;
      error = null;
      [catalogo, acceso] = await Promise.all([getAccessCatalog(), getAgentAccess(agentId)]);
      borrador = [...acceso.scopes];
      crudo = borrador.join("\n");
      // Si ya tiene finos (o denegaciones), se abre en fino.
      if (borrador.some((s) => s.startsWith("!") || s.startsWith("kon:") || /^datasets:[^*]/.test(s))) modo = "fine";
    } catch (e) {
      error = e instanceof Error ? e.message : t("agentAccess.errorLoading");
    } finally {
      cargando = false;
    }
  }

  const cambiado = $derived(acceso ? borrador.join("\n") !== acceso.scopes.join("\n") : false);

  async function guardar() {
    if (modo === "raw") borrador = crudo.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    try {
      guardando = true;
      acceso = await setAgentScopes(agentId, borrador);
      borrador = [...acceso.scopes];
      crudo = borrador.join("\n");
      toast.success(t("agentAccess.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("agentAccess.errorSaving"));
    } finally {
      guardando = false;
    }
  }

  function deshacer() {
    if (!acceso) return;
    borrador = [...acceso.scopes];
    crudo = borrador.join("\n");
  }

  // ── Amplio ──
  const TEXTOS_DE_PRESET: Record<string, { nombre: () => string; desc: () => string }> = {
    "connect-only": { nombre: () => t("agentAccess.presetConnectOnly"), desc: () => t("agentAccess.presetConnectOnlyDesc") },
    "read-only": { nombre: () => t("agentAccess.presetReadOnly"), desc: () => t("agentAccess.presetReadOnlyDesc") },
    "content-editor": {
      nombre: () => t("agentAccess.presetContentEditor"),
      desc: () => t("agentAccess.presetContentEditorDesc"),
    },
    "data-editor": { nombre: () => t("agentAccess.presetDataEditor"), desc: () => t("agentAccess.presetDataEditorDesc") },
    "full-admin": { nombre: () => t("agentAccess.presetFullAdmin"), desc: () => t("agentAccess.presetFullAdminDesc") },
  };

  const DESCRIPCION_AMPLIA: Record<string, () => string> = {
    admin: () => t("agentAccess.broadAdmin"),
    "mcp:connect": () => t("agentAccess.broadMcpConnect"),
    "mcp:read": () => t("agentAccess.broadMcpRead"),
    "mcp:write": () => t("agentAccess.broadMcpWrite"),
    "mcp:admin": () => t("agentAccess.broadMcpAdmin"),
    "contenido:editar": () => t("agentAccess.broadContentEdit"),
    "memory:read": () => t("agentAccess.broadMemoryRead"),
    "memory:write": () => t("agentAccess.broadMemoryWrite"),
    "brain:read": () => t("agentAccess.broadBrainRead"),
    "brain:write": () => t("agentAccess.broadBrainWrite"),
    "promotion:propose": () => t("agentAccess.broadPromotionPropose"),
    "kon:*": () => t("agentAccess.broadAllKonOps"),
    "datasets:*:read": () => t("agentAccess.broadAllDatasetsRead"),
    "datasets:*:write": () => t("agentAccess.broadAllDatasetsWrite"),
    "datasets:*:delete": () => t("agentAccess.broadAllDatasetsDelete"),
  };

  function descripcionAmplia(scope: string): string {
    const fija = DESCRIPCION_AMPLIA[scope];
    if (fija) return fija();
    const kon = scope.endsWith(":*") ? scope.slice(0, -2) : scope;
    return t("agentAccess.broadKonWide", { kon });
  }

  function aplicarPreset(scopes: readonly string[]) {
    borrador = [...scopes];
    crudo = borrador.join("\n");
  }

  function alternar(scope: string, activo: boolean) {
    borrador = activo ? [...new Set([...borrador, scope])] : borrador.filter((s) => s !== scope);
    crudo = borrador.join("\n");
  }

  // ── Fino ──
  type Eleccion = "none" | "allow" | "deny";
  function eleccionDe(scope: string): Eleccion {
    if (borrador.includes(`!${scope}`)) return "deny";
    if (borrador.includes(scope)) return "allow";
    return "none";
  }
  function elegir(scope: string, e: Eleccion) {
    const sin = borrador.filter((s) => s !== scope && s !== `!${scope}`);
    borrador = e === "allow" ? [...sin, scope] : e === "deny" ? [...sin, `!${scope}`] : sin;
    crudo = borrador.join("\n");
  }

  const ACCIONES = ["read", "write", "delete"] as const;
  const NOMBRE_ACCION: Record<(typeof ACCIONES)[number], () => string> = {
    read: () => t("agentAccess.actionRead"),
    write: () => t("agentAccess.actionWrite"),
    delete: () => t("agentAccess.actionDelete"),
  };

  // ── Vista fusionada ──
  const ESTADO: Record<AccessState, { texto: () => string; clase: string }> = {
    granted: { texto: () => t("agentAccess.stateGranted"), clase: "bg-emerald-500/15 text-emerald-300" },
    denied: { texto: () => t("agentAccess.stateDenied"), clase: "bg-red-500/15 text-red-300" },
    open: { texto: () => t("agentAccess.stateOpen"), clase: "bg-sky-500/15 text-sky-300" },
    policy: { texto: () => t("agentAccess.statePolicy"), clase: "bg-amber-500/15 text-amber-300" },
    none: { texto: () => t("agentAccess.stateNone"), clase: "bg-zinc-700/40 text-zinc-400" },
  };

  const resumen = $derived.by(() => {
    const ops = acceso?.operations ?? [];
    return {
      concedidas: ops.filter((o) => o.state === "granted").length,
      denegadas: ops.filter((o) => o.state === "denied").length,
      politica: ops.filter((o) => o.state === "policy").length,
      total: ops.length,
    };
  });

  const opsConPermiso = $derived(
    (acceso?.operations ?? []).filter((o) => o.state === "granted" || o.state === "denied")
  );

  /** Lo concedido/denegado, agrupado por kon (una lista plana de 80 filas no se lee). */
  const porKon = $derived.by(() => {
    const grupos = new Map<string, typeof opsConPermiso>();
    for (const o of opsConPermiso) grupos.set(o.kon, [...(grupos.get(o.kon) ?? []), o]);
    return [...grupos.entries()].map(([kon, ops]) => ({
      kon,
      ops,
      concedidas: ops.filter((o) => o.state === "granted").length,
      denegadas: ops.filter((o) => o.state === "denied").length,
    }));
  });

  // Qué kons están desplegados en el modo fino. Con  fijo, cada
  // cambio de la lista volvía a plegarlos y la fila elegida desaparecía.
  let desplegados = $state<Record<string, boolean>>({});
</script>

<div class="space-y-6" data-testid="agent-permissions">
  {#if cargando}
    <div class="flex items-center justify-center h-32">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
    </div>
  {:else if error}
    <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">{error}</div>
  {:else if catalogo && acceso}
    <!-- Barra: modo + guardar -->
    <div class="flex flex-wrap items-center gap-3">
      <div class="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg" role="tablist">
        {#each [["broad", () => t("agentAccess.modeBroad")], ["fine", () => t("agentAccess.modeFine")], ["raw", () => t("agentAccess.modeRaw")]] as [id, texto] (id)}
          <button
            role="tab"
            aria-selected={modo === id}
            data-testid="mode-{id}"
            class="px-3 py-1.5 text-sm rounded-md transition-colors {modo === id
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300'}"
            onclick={() => {
              if (modo === "raw") borrador = crudo.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
              modo = id as typeof modo;
              crudo = borrador.join("\n");
            }}>{(texto as () => string)()}</button
          >
        {/each}
      </div>
      <div class="flex-1"></div>
      {#if cambiado}
        <span class="text-xs text-amber-400">{t("agentAccess.unsaved")}</span>
        <Button variant="ghost" size="sm" onclick={deshacer}>
          <RotateCcw size={14} class="mr-1" />{t("agentAccess.discard")}
        </Button>
      {/if}
      <Button variant="primary" size="sm" loading={guardando} onclick={guardar}>
        <Save size={14} class="mr-1" />{t("agentAccess.save")}
      </Button>
    </div>

    <p class="text-sm text-zinc-500">{t("agentAccess.unionRule")}</p>

    {#if modo === "broad"}
      <!-- Presets -->
      <section class="space-y-3">
        <h3 class="text-sm font-semibold text-zinc-300">{t("agentAccess.presets")}</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {#each catalogo.presets as p (p.id)}
            <Card class="p-4 min-w-0 space-y-2">
              <div class="flex items-center gap-2">
                <ShieldCheck size={16} class="text-indigo-400 shrink-0" />
                <h4 class="font-medium text-zinc-100">{TEXTOS_DE_PRESET[p.id]?.nombre() ?? p.id}</h4>
              </div>
              <p class="text-sm text-zinc-400">{TEXTOS_DE_PRESET[p.id]?.desc() ?? ""}</p>
              <div class="flex flex-wrap gap-1">
                {#each p.scopes as s (s)}
                  <code class="text-[11px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">{s}</code>
                {/each}
              </div>
              <Button variant="secondary" size="sm" onclick={() => aplicarPreset(p.scopes)}>
                {t("agentAccess.applyPreset")}
              </Button>
            </Card>
          {/each}
        </div>
        <p class="text-xs text-zinc-500">{t("agentAccess.presetReplaces")}</p>
      </section>

      <!-- Scopes amplios -->
      <section class="space-y-2">
        <h3 class="text-sm font-semibold text-zinc-300">{t("agentAccess.broadScopes")}</h3>
        <div class="divide-y divide-zinc-800 border border-zinc-800 rounded-lg">
          {#each catalogo.broad as b (b.scope)}
            <label class="flex items-start gap-3 p-3 hover:bg-zinc-900/50 cursor-pointer">
              <input
                type="checkbox"
                class="mt-1 w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-indigo-500"
                checked={borrador.includes(b.scope)}
                onchange={(e) => alternar(b.scope, (e.currentTarget as HTMLInputElement).checked)}
              />
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <code class="text-xs text-indigo-300">{b.scope}</code>
                  {#if b.operations.length || b.datasets.length}
                    <span class="text-[11px] text-zinc-500"
                      >{t("agentAccess.opensCount", { ops: b.operations.length, ds: b.datasets.length })}</span
                    >
                  {/if}
                </div>
                <p class="text-sm text-zinc-400">{descripcionAmplia(b.scope)}</p>
                {#if b.operations.length}
                  <details class="mt-1">
                    <summary class="text-xs text-zinc-500 cursor-pointer">{t("agentAccess.showOperations")}</summary>
                    <div class="mt-1 flex flex-wrap gap-1">
                      {#each b.operations as o (o)}
                        <code class="text-[11px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{o}</code>
                      {/each}
                    </div>
                  </details>
                {/if}
              </div>
            </label>
          {/each}
        </div>
      </section>
    {:else if modo === "fine"}
      <section class="space-y-3">
        <h3 class="text-sm font-semibold text-zinc-300">{t("agentAccess.operationsByKon")}</h3>
        <p class="text-xs text-zinc-500">{t("agentAccess.denyExplained")}</p>
        {#each catalogo.kons as k (k.konId)}
          <details
            class="border border-zinc-800 rounded-lg"
            bind:open={
              () => desplegados[k.konId] ?? catalogo!.kons.length <= 2,
              (v) => (desplegados[k.konId] = v)
            }
          >
            <summary class="px-3 py-2 cursor-pointer text-sm text-zinc-200 flex items-center gap-2">
              <span class="font-medium">{k.kon}</span>
              <code class="text-[11px] text-zinc-500">kon:{k.kon}:*</code>
              <span class="ml-auto text-xs text-zinc-500"
                >{t("agentAccess.selectedCount", {
                  n: k.operations.filter((o) => eleccionDe(o.scope) !== "none").length,
                  total: k.operations.length,
                })}</span
              >
            </summary>
            <div class="divide-y divide-zinc-800/70">
              {#each k.operations as o (o.scope)}
                <div class="flex flex-wrap items-center gap-2 px-3 py-2 min-w-0" data-testid="op-{o.scope}">
                  <span
                    class="text-[10px] font-mono w-14 shrink-0 text-center rounded px-1 py-0.5 {o.write
                      ? 'bg-amber-500/10 text-amber-300'
                      : 'bg-sky-500/10 text-sky-300'}">{o.method}</span
                  >
                  <div class="min-w-0 flex-1">
                    <div class="text-sm text-zinc-200 truncate">{o.summary}</div>
                    <code class="text-[11px] text-zinc-500 break-all">{o.scope}</code>
                  </div>
                  {#if o.sensitive}
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-300">{t("agentAccess.sensitive")}</span>
                  {/if}
                  {#if o.cost !== 1}
                    <span class="text-[10px] text-zinc-500">{t("agentAccess.cost", { n: o.cost })}</span>
                  {/if}
                  <select
                    class="px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-100"
                    aria-label={t("agentAccess.permissionFor", { scope: o.scope })}
                    value={eleccionDe(o.scope)}
                    onchange={(e) => elegir(o.scope, (e.currentTarget as HTMLSelectElement).value as Eleccion)}
                  >
                    <option value="none">{t("agentAccess.choiceNone")}</option>
                    <option value="allow">{t("agentAccess.choiceAllow")}</option>
                    <option value="deny">{t("agentAccess.choiceDeny")}</option>
                  </select>
                </div>
              {/each}
            </div>
          </details>
        {/each}
        {#if catalogo.legacyKons.length}
          <p class="text-xs text-zinc-500">
            {t("agentAccess.legacyKons", { list: catalogo.legacyKons.map((k) => k.kon).join(", ") })}
          </p>
        {/if}
      </section>

      <section class="space-y-2">
        <h3 class="text-sm font-semibold text-zinc-300">{t("agentAccess.datasets")}</h3>
        <p class="text-xs text-zinc-500">{t("agentAccess.datasetsExplained")}</p>
        {#if catalogo.datasets.length === 0}
          <p class="text-sm text-zinc-500">{t("agentAccess.noDatasets")}</p>
        {:else}
          <div class="overflow-x-auto border border-zinc-800 rounded-lg">
            <table class="w-full text-sm">
              <thead class="text-xs text-zinc-500">
                <tr>
                  <th class="text-left px-3 py-2">{t("agentAccess.dataset")}</th>
                  {#each ACCIONES as a (a)}<th class="text-left px-3 py-2">{NOMBRE_ACCION[a]()}</th>{/each}
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-800/70">
                {#each catalogo.datasets as d (d.slug)}
                  <tr data-testid="ds-{d.slug}">
                    <td class="px-3 py-2 min-w-0">
                      <div class="text-zinc-200">{d.name}</div>
                      <code class="text-[11px] text-zinc-500">{d.slug}</code>
                    </td>
                    {#each ACCIONES as a (a)}
                      <td class="px-3 py-2">
                        <select
                          class="px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-100"
                          aria-label={t("agentAccess.permissionFor", { scope: `datasets:${d.slug}:${a}` })}
                          value={eleccionDe(`datasets:${d.slug}:${a}`)}
                          onchange={(e) =>
                            elegir(`datasets:${d.slug}:${a}`, (e.currentTarget as HTMLSelectElement).value as Eleccion)}
                        >
                          <option value="none">{t("agentAccess.choiceNone")}</option>
                          <option value="allow">{t("agentAccess.choiceAllow")}</option>
                          <option value="deny">{t("agentAccess.choiceDeny")}</option>
                        </select>
                      </td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </section>
    {:else}
      <section class="space-y-2">
        <label for="raw-scopes" class="block text-sm font-semibold text-zinc-300">{t("agentAccess.rawScopes")}</label>
        <p class="text-xs text-zinc-500">{t("agentAccess.rawHelp")}</p>
        <textarea
          id="raw-scopes"
          bind:value={crudo}
          rows={10}
          class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm font-mono text-zinc-100"
        ></textarea>
      </section>
    {/if}

    <!-- Lo que puede hacer (guardado) -->
    <section class="space-y-3" data-testid="effective-access">
      <h3 class="text-sm font-semibold text-zinc-300">{t("agentAccess.effectiveTitle")}</h3>
      <p class="text-xs text-zinc-500">{t("agentAccess.effectiveHelp")}</p>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card class="p-3"><div class="text-xs text-zinc-500">{t("agentAccess.statGranted")}</div><div class="text-xl text-emerald-300">{resumen.concedidas}</div></Card>
        <Card class="p-3"><div class="text-xs text-zinc-500">{t("agentAccess.statDenied")}</div><div class="text-xl text-red-300">{resumen.denegadas}</div></Card>
        <Card class="p-3"><div class="text-xs text-zinc-500">{t("agentAccess.statPolicy")}</div><div class="text-xl text-amber-300">{resumen.politica}</div></Card>
        <Card class="p-3"><div class="text-xs text-zinc-500">{t("agentAccess.statTotal")}</div><div class="text-xl text-zinc-200">{resumen.total}</div></Card>
      </div>

      {#if acceso.broad.length}
        <div class="space-y-1">
          <h4 class="text-xs font-semibold text-zinc-400">{t("agentAccess.broadHeld")}</h4>
          {#each acceso.broad as b (b.scope)}
            <div class="flex flex-wrap items-baseline gap-2 text-sm">
              <Check size={14} class="text-emerald-400 shrink-0" />
              <code class="text-xs text-indigo-300">{b.scope}</code>
              <span class="text-zinc-400">{b.known ? descripcionAmplia(b.scope) : t("agentAccess.unknownScope")}</span>
            </div>
          {/each}
        </div>
      {/if}
      {#if acceso.denies.length}
        <div class="space-y-1">
          <h4 class="text-xs font-semibold text-zinc-400">{t("agentAccess.deniesHeld")}</h4>
          {#each acceso.denies as d (d)}
            <div class="flex items-center gap-2 text-sm">
              <Ban size={14} class="text-red-400 shrink-0" /><code class="text-xs text-red-300">{d}</code>
            </div>
          {/each}
        </div>
      {/if}

      {#if opsConPermiso.length}
        <div class="space-y-2">
          {#each porKon as g (g.kon)}
            <details class="border border-zinc-800 rounded-lg" data-testid="effective-{g.kon}">
              <summary class="px-3 py-2 cursor-pointer text-sm text-zinc-200 flex flex-wrap items-center gap-2">
                <span class="font-medium">{g.kon}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded {ESTADO.granted.clase}"
                  >{t("agentAccess.groupGranted", { n: g.concedidas })}</span
                >
                {#if g.denegadas}
                  <span class="text-[10px] px-1.5 py-0.5 rounded {ESTADO.denied.clase}"
                    >{t("agentAccess.groupDenied", { n: g.denegadas })}</span
                  >
                {/if}
              </summary>
              <div class="divide-y divide-zinc-800/70 border-t border-zinc-800">
                {#each g.ops as o (o.scope)}
                  <div class="flex flex-wrap items-center gap-2 px-3 py-2 text-sm min-w-0">
                    <span class="text-[10px] px-1.5 py-0.5 rounded {ESTADO[o.state].clase}">{ESTADO[o.state].texto()}</span>
                    <span class="font-mono text-[11px] text-zinc-500">{o.method}</span>
                    <span class="text-zinc-300 truncate min-w-0">{o.path}</span>
                    {#if o.by}<code class="ml-auto text-[11px] text-zinc-500">{t("agentAccess.by", { scope: o.by })}</code>{/if}
                  </div>
                {/each}
              </div>
            </details>
          {/each}
        </div>
      {:else}
        <p class="text-sm text-zinc-500">{t("agentAccess.noOperationGrants")}</p>
      {/if}

      {#if acceso.datasets.length}
        <div class="overflow-x-auto border border-zinc-800 rounded-lg">
          <table class="w-full text-sm">
            <thead class="text-xs text-zinc-500">
              <tr>
                <th class="text-left px-3 py-2">{t("agentAccess.dataset")}</th>
                {#each ACCIONES as a (a)}<th class="text-left px-3 py-2">{NOMBRE_ACCION[a]()}</th>{/each}
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-800/70">
              {#each acceso.datasets as d (d.slug)}
                <tr>
                  <td class="px-3 py-2"><code class="text-xs text-zinc-300">{d.slug}</code></td>
                  {#each ACCIONES as a (a)}
                    <td class="px-3 py-2">
                      <span class="text-[10px] px-1.5 py-0.5 rounded {ESTADO[d[a].state].clase}" title={d[a].by ?? ""}
                        >{ESTADO[d[a].state].texto()}</span
                      >
                    </td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  {/if}
</div>
