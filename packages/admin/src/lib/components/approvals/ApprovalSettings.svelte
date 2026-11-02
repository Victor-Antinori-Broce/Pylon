<!--
  Configuración de la aprobación humana (fase F): el interruptor MAESTRO (con
  aviso al apagarlo si hay agentes en «Solo proponer»), la retención de ese
  modo, la vida de una propuesta, el modo de cada agente, lo sensible por operación
  (con lo que declara el kon como valor de fábrica) y las reglas de las rutas
  legadas. Solo un admin cambia nada; un editor lo ve en lectura.
-->
<script lang="ts">
  import { t, localeFormato } from "$lib/i18n";
  import { Plus, Save, Trash2 } from "lucide-svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  import { isAdmin } from "$lib/auth.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { getApprovalSettings, saveApprovalSettings, setAgentApprovalMode } from "$lib/services/approvals";
  import type { ApprovalMode, ApprovalSettings, LegacyRule, ProposeRetention } from "$lib/types/approvals";

  let ajustes = $state<ApprovalSettings | null>(null);
  let cargando = $state(true);
  let error = $state<string | null>(null);
  let guardando = $state(false);
  let ttl = $state<number>(168);
  let reglas = $state<LegacyRule[]>([]);
  let filtroOps = $state("");
  const editable = $derived(isAdmin());

  onMount(cargar);

  function rellenar(a: ApprovalSettings) {
    ajustes = a;
    ttl = a.config.ttlHours;
    reglas = a.config.legacyRules.map((r) => ({ ...r }));
  }

  async function cargar() {
    try {
      cargando = true;
      error = null;
      rellenar(await getApprovalSettings());
    } catch (e) {
      error = e instanceof Error ? e.message : t("approvals.errorLoading");
    } finally {
      cargando = false;
    }
  }

  async function guardar(cambio: Parameters<typeof saveApprovalSettings>[0]) {
    try {
      guardando = true;
      rellenar(await saveApprovalSettings(cambio));
      toast.success(t("approvals.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("approvals.errorSaving"));
    } finally {
      guardando = false;
    }
  }

  /** El general es el interruptor MAESTRO: apagarlo suelta también a los vigilados. */
  const retenciones = $derived<ProposeRetention[]>(ajustes?.retentions ?? ["selective", "strict"]);
  const vigilados = $derived((ajustes?.agents ?? []).filter((x) => x.mode === "propose").map((x) => x.name));

  function cambiarGlobal() {
    if (!ajustes) return;
    const apagar = ajustes.config.enabled;
    if (apagar && vigilados.length > 0 && !confirm(t("approvals.confirmTurnOff", { names: vigilados.join(", ") }))) return;
    guardar({ enabled: !apagar });
  }

  async function cambiarModo(agentId: string, nombre: string, mode: ApprovalMode) {
    try {
      await setAgentApprovalMode(agentId, mode);
      toast.success(t("approvals.modeSaved", { name: nombre }));
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("approvals.errorSaving"));
    }
  }

  /** `true`/`false` = cambiado por el admin; `default` = lo que declara el kon. */
  function valorDe(override: boolean | null): string {
    return override === null ? "default" : override ? "true" : "false";
  }
  function deValor(v: string): boolean | null {
    return v === "default" ? null : v === "true";
  }

  const operacionesFiltradas = $derived(
    (ajustes?.operations ?? []).filter((o) => {
      const f = filtroOps.trim().toLowerCase();
      return !f || `${o.key} ${o.method} ${o.path} ${o.summary}`.toLowerCase().includes(f);
    })
  );

  const fecha = (v: string | null) => (v ? new Date(v).toLocaleString(localeFormato()) : "—");
</script>

<div class="space-y-6" data-testid="approvals-settings">
  {#if cargando}
    <div class="flex items-center justify-center h-24">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div>
    </div>
  {:else if error}
    <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">{error}</div>
  {:else if ajustes}
    {@const a = ajustes}
    <p class="text-xs text-zinc-500">{t("approvals.settingsHelp")}</p>
    {#if !editable}
      <p class="text-xs text-amber-300/80">{t("approvals.readOnly")}</p>
    {/if}

    <!-- Global -->
    <section class="border border-zinc-800 rounded-lg p-4 space-y-4">
      <div class="flex flex-wrap items-center gap-3">
        <div class="min-w-0 flex-1">
          <h3 class="text-sm font-semibold text-zinc-200">{t("approvals.globalTitle")}</h3>
          <p class="text-xs text-zinc-500">{t("approvals.globalHelp")}</p>
        </div>
        <button
          role="switch"
          aria-checked={a.config.enabled}
          aria-label={t("approvals.globalTitle")}
          disabled={!editable || guardando}
          onclick={cambiarGlobal}
          class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 {a.config.enabled ? 'bg-emerald-500' : 'bg-zinc-700'}"
          data-testid="global-switch"
        >
          <span class="inline-block h-5 w-5 transform rounded-full bg-white transition-transform {a.config.enabled ? 'translate-x-5' : 'translate-x-0.5'}"></span>
        </button>
        <span class="text-sm {a.config.enabled ? 'text-emerald-300' : 'text-zinc-400'}" data-testid="global-state">
          {a.config.enabled ? t("approvals.globalOn") : t("approvals.globalOff")}
        </span>
      </div>
      {#if !a.config.enabled && vigilados.length > 0}
        <p class="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2" data-testid="global-off-warning">
          {t("approvals.globalOffWarning", { names: vigilados.join(", ") })}
        </p>
      {/if}
      <fieldset class="space-y-1.5" disabled={!editable || guardando} data-testid="propose-retention">
        <legend class="text-xs text-zinc-400 mb-1">{t("approvals.retentionTitle")}</legend>
        {#each retenciones as r}
          <label class="flex items-start gap-2 text-xs cursor-pointer">
            <input
              type="radio"
              name="retencion"
              value={r}
              checked={a.config.proposeRetention === r}
              onchange={() => guardar({ proposeRetention: r })}
              class="mt-0.5"
            />
            <span>
              <span class="text-zinc-200">{t(`approvals.retention_${r}`)}</span>
              <span class="block text-zinc-500">{t(`approvals.retentionHelp_${r}`)}</span>
            </span>
          </label>
        {/each}
        <p class="text-[11px] text-zinc-500">{t("approvals.retentionHelp")}</p>
      </fieldset>
      <form
        class="flex flex-wrap items-end gap-3"
        onsubmit={(e) => {
          e.preventDefault();
          guardar({ ttlHours: Number(ttl) });
        }}
      >
        <div>
          <label for="ttl" class="block text-xs text-zinc-400 mb-1">{t("approvals.ttl")}</label>
          <input id="ttl" type="number" min="1" max="720" bind:value={ttl} disabled={!editable} class="w-32 px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100" />
        </div>
        {#if editable}
          <Button type="submit" variant="secondary" size="sm" loading={guardando}>
            <Save size={14} class="mr-1" />{t("approvals.save")}
          </Button>
        {/if}
        <p class="text-[11px] text-zinc-500 basis-full">{t("approvals.ttlHelp")}</p>
      </form>
      {#if a.updatedAt}
        <p class="text-[11px] text-zinc-500" data-testid="last-change">
          {t("approvals.lastChange", { name: a.updatedByName ?? a.updatedBy ?? "—", date: fecha(a.updatedAt) })}
        </p>
      {/if}
    </section>

    <!-- Agentes -->
    <section class="border border-zinc-800 rounded-lg p-4 space-y-3">
      <div>
        <h3 class="text-sm font-semibold text-zinc-200">{t("approvals.agentsTitle")}</h3>
        <p class="text-xs text-zinc-500">{t("approvals.agentsHelp")}</p>
      </div>
      {#if a.agents.length === 0}
        <p class="text-xs text-zinc-500">{t("approvals.noAgents")}</p>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <tbody class="divide-y divide-zinc-800/70">
              {#each a.agents as ag (ag.id)}
                <tr data-testid="agent-mode-row">
                  <td class="py-1.5 pr-3 text-zinc-200 min-w-0">
                    <a href="/agents/{ag.id}?tab=approval" class="hover:underline">{ag.name}</a>
                  </td>
                  <td class="py-1.5 w-48">
                    <select
                      value={ag.mode}
                      disabled={!editable}
                      aria-label={t("approvals.modeFor", { name: ag.name })}
                      onchange={(e) => cambiarModo(ag.id, ag.name, (e.currentTarget as HTMLSelectElement).value as ApprovalMode)}
                      class="w-full px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-100"
                    >
                      {#each a.modes as m}
                        <option value={m}>{t(`approvals.mode_${m}`)}</option>
                      {/each}
                    </select>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>

    <!-- Operaciones del SDK -->
    <section class="border border-zinc-800 rounded-lg p-4 space-y-3">
      <div class="flex flex-wrap items-end gap-3">
        <div class="min-w-0 flex-1">
          <h3 class="text-sm font-semibold text-zinc-200">{t("approvals.operationsTitle")}</h3>
          <p class="text-xs text-zinc-500">{t("approvals.operationsHelp")}</p>
        </div>
        <input
          type="search"
          bind:value={filtroOps}
          placeholder={t("approvals.filterOps")}
          aria-label={t("approvals.filterOps")}
          class="w-56 px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100"
        />
      </div>
      <div class="overflow-x-auto max-h-96 overflow-y-auto border border-zinc-800 rounded">
        <table class="w-full text-xs">
          <thead class="text-zinc-500 sticky top-0 bg-zinc-900">
            <tr>
              <th class="text-left px-2 py-1.5">{t("approvals.colOperation")}</th>
              <th class="text-left px-2 py-1.5">{t("approvals.colDefault")}</th>
              <th class="text-left px-2 py-1.5">{t("approvals.colSetting")}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-800/70">
            {#each operacionesFiltradas as o (o.key)}
              <tr data-testid="operation-row" data-key={o.key}>
                <td class="px-2 py-1.5 min-w-0">
                  <code class="text-zinc-200 break-all">{o.method} {o.path}</code>
                  <div class="text-zinc-500 break-all">{o.key}</div>
                  {#if o.readOnly && o.method !== "GET"}
                    <span class="inline-block mt-0.5 px-1.5 rounded bg-sky-500/10 text-sky-300 text-[10px]" data-testid="read-only-post">{t("approvals.readOnlyPost")}</span>
                  {/if}
                </td>
                <td class="px-2 py-1.5 whitespace-nowrap {o.default ? 'text-amber-300' : 'text-zinc-400'}">
                  {o.default ? t("approvals.sensitive") : t("approvals.notSensitive")}
                </td>
                <td class="px-2 py-1.5 w-44">
                  <select
                    value={valorDe(o.override)}
                    disabled={!editable || guardando}
                    aria-label={t("approvals.settingFor", { name: o.key })}
                    onchange={(e) => guardar({ operations: { [o.key]: deValor((e.currentTarget as HTMLSelectElement).value) } })}
                    class="w-full px-2 py-1 bg-zinc-950 border rounded text-xs text-zinc-100 {o.override === null ? 'border-zinc-800' : 'border-indigo-500/60'}"
                  >
                    <option value="default">{t("approvals.useDefault")}</option>
                    <option value="true">{t("approvals.sensitive")}</option>
                    <option value="false">{t("approvals.notSensitive")}</option>
                  </select>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <!-- Herramientas MCP del núcleo -->
    <section class="border border-zinc-800 rounded-lg p-4 space-y-3">
      <div>
        <h3 class="text-sm font-semibold text-zinc-200">{t("approvals.toolsTitle")}</h3>
        <p class="text-xs text-zinc-500">{t("approvals.toolsHelp")}</p>
      </div>
      <div class="overflow-x-auto border border-zinc-800 rounded">
        <table class="w-full text-xs">
          <tbody class="divide-y divide-zinc-800/70">
            {#each a.mcpTools as h (h.key)}
              <tr>
                <td class="px-2 py-1.5"><code class="text-zinc-200">{h.name}</code></td>
                <td class="px-2 py-1.5 text-zinc-500">{h.write ? t("approvals.writes") : t("approvals.reads")}</td>
                <td class="px-2 py-1.5 whitespace-nowrap {h.default ? 'text-amber-300' : 'text-zinc-400'}">
                  {h.default ? t("approvals.sensitive") : t("approvals.notSensitive")}
                </td>
                <td class="px-2 py-1.5 w-44">
                  <select
                    value={valorDe(h.override)}
                    disabled={!editable || guardando}
                    aria-label={t("approvals.settingFor", { name: h.name })}
                    onchange={(e) => guardar({ operations: { [h.key]: deValor((e.currentTarget as HTMLSelectElement).value) } })}
                    class="w-full px-2 py-1 bg-zinc-950 border rounded text-xs text-zinc-100 {h.override === null ? 'border-zinc-800' : 'border-indigo-500/60'}"
                  >
                    <option value="default">{t("approvals.useDefault")}</option>
                    <option value="true">{t("approvals.sensitive")}</option>
                    <option value="false">{t("approvals.notSensitive")}</option>
                  </select>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <!-- Rutas legadas -->
    <section class="border border-zinc-800 rounded-lg p-4 space-y-3">
      <div>
        <h3 class="text-sm font-semibold text-zinc-200">{t("approvals.legacyTitle")}</h3>
        <p class="text-xs text-zinc-500">{t("approvals.legacyHelp")}</p>
      </div>
      {#if reglas.length === 0}
        <p class="text-xs text-zinc-500">{t("approvals.noRules")}</p>
      {/if}
      {#each reglas as regla, i}
        <div class="flex flex-wrap items-center gap-2" data-testid="legacy-rule">
          <select
            bind:value={regla.method}
            disabled={!editable}
            aria-label={t("approvals.method")}
            class="w-28 px-2 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-100"
          >
            {#each ["*", "GET", "POST", "PUT", "PATCH", "DELETE"] as m}
              <option value={m}>{m}</option>
            {/each}
          </select>
          <input
            bind:value={regla.path}
            disabled={!editable}
            aria-label={t("approvals.path")}
            class="flex-1 min-w-48 px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-100 font-mono"
          />
          {#if editable}
            <Button variant="ghost" size="sm" class="text-red-400" onclick={() => (reglas = reglas.filter((_, j) => j !== i))}>
              <Trash2 size={14} class="mr-1" />{t("approvals.removeRule")}
            </Button>
          {/if}
        </div>
      {/each}
      {#if editable}
        <div class="flex gap-2">
          <Button variant="secondary" size="sm" onclick={() => (reglas = [...reglas, { method: "DELETE", path: "/api/" }])}>
            <Plus size={14} class="mr-1" />{t("approvals.addRule")}
          </Button>
          <Button variant="primary" size="sm" loading={guardando} onclick={() => guardar({ legacyRules: reglas })}>
            <Save size={14} class="mr-1" />{t("approvals.saveRules")}
          </Button>
        </div>
      {/if}
    </section>
  {/if}
</div>
