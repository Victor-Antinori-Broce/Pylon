<!--
  Ajustes MCP de un agente: toolset por defecto (acota tools/list; nunca concede
  nada) y cómo se envuelve el texto escrito por otros en los resultados.
  API: GET/PUT /api/v1/agents/:id/mcp-settings (lib/ajustes-mcp.ts).
-->
<script lang="ts">
  import { t } from "$lib/i18n";
  import { Save } from "lucide-svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  import Button from "$lib/components/ui/Button.svelte";
  import { getAgentMcpSettings, setAgentMcpSettings } from "$lib/services/agents";
  import type { AgentMcpSettings, UntrustedWrap } from "$lib/types/agents";

  interface Props {
    agentId: string;
  }
  const { agentId }: Props = $props();

  let ajustes = $state<AgentMcpSettings | null>(null);
  let cargando = $state(true);
  let guardando = $state(false);
  let error = $state<string | null>(null);
  let toolset = $state("");
  let envoltorio = $state<UntrustedWrap>("none");

  onMount(cargar);

  function rellenar(a: AgentMcpSettings) {
    ajustes = a;
    toolset = a.settings.toolset ?? "";
    envoltorio = a.settings.untrustedWrap;
  }

  async function cargar() {
    try {
      cargando = true;
      error = null;
      rellenar(await getAgentMcpSettings(agentId));
    } catch (e) {
      error = e instanceof Error ? e.message : t("agentMcpSettings.errorLoading");
    } finally {
      cargando = false;
    }
  }

  async function guardar() {
    try {
      guardando = true;
      rellenar(
        await setAgentMcpSettings(agentId, { toolset: toolset.trim() || null, untrustedWrap: envoltorio })
      );
      toast.success(t("agentMcpSettings.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("agentMcpSettings.errorSaving"));
    } finally {
      guardando = false;
    }
  }

  const ETIQUETA_DE_ENVOLTORIO: Record<UntrustedWrap, () => string> = {
    none: () => t("agentMcpSettings.wrapNone"),
    delimiters: () => t("agentMcpSettings.wrapDelimiters"),
    object: () => t("agentMcpSettings.wrapObject"),
  };
</script>

<div class="space-y-4" data-testid="agent-mcp-settings">
  <div>
    <h3 class="text-sm font-semibold text-zinc-300">{t("agentMcpSettings.title")}</h3>
    <p class="text-xs text-zinc-500">{t("agentMcpSettings.help")}</p>
  </div>

  {#if cargando}
    <div class="flex items-center justify-center h-16">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div>
    </div>
  {:else if error}
    <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">{error}</div>
  {:else if ajustes}
    <form
      class="grid grid-cols-1 md:grid-cols-2 gap-3 items-end"
      onsubmit={(e) => {
        e.preventDefault();
        guardar();
      }}
    >
      <div class="min-w-0">
        <label for="mcp-toolset" class="block text-sm text-zinc-300 mb-1.5">{t("agentMcpSettings.toolset")}</label>
        <input
          id="mcp-toolset"
          type="text"
          list="mcp-toolsets"
          bind:value={toolset}
          placeholder={t("agentMcpSettings.toolsetAll")}
          class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100"
        />
        <datalist id="mcp-toolsets">
          {#each [...ajustes.options.toolsets, ...ajustes.options.kons] as opcion (opcion)}
            <option value={opcion}></option>
          {/each}
        </datalist>
        <p class="text-[11px] text-zinc-500 mt-1">{t("agentMcpSettings.toolsetHelp")}</p>
      </div>
      <div class="min-w-0">
        <label for="mcp-wrap" class="block text-sm text-zinc-300 mb-1.5">{t("agentMcpSettings.wrap")}</label>
        <select
          id="mcp-wrap"
          bind:value={envoltorio}
          class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100"
        >
          {#each ajustes.options.untrustedWrap as modo (modo)}
            <option value={modo}>{ETIQUETA_DE_ENVOLTORIO[modo]?.() ?? modo}</option>
          {/each}
        </select>
        <p class="text-[11px] text-zinc-500 mt-1">{t("agentMcpSettings.wrapHelp")}</p>
      </div>
      <div class="md:col-span-2 flex justify-end">
        <Button type="submit" variant="primary" size="sm" loading={guardando}>
          <Save size={14} class="mr-1" />{t("agentMcpSettings.save")}
        </Button>
      </div>
    </form>
  {/if}
</div>
