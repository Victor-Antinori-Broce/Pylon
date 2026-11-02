<!--
  Aprobación humana de UN agente (fase F): heredar (solo lo sensible), «solo
  proponer» (también lo que escribe) o directo (nunca pide aprobación). Con el
  interruptor maestro apagado ningún modo retiene nada, y se avisa. Solo un
  admin lo cambia; queda auditado.
-->
<script lang="ts">
  import { t } from "$lib/i18n";
  import { Save } from "lucide-svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  import { isAdmin } from "$lib/auth.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { getApprovalSettings, setAgentApprovalMode } from "$lib/services/approvals";
  import type { ApprovalMode } from "$lib/types/approvals";

  interface Props {
    agentId: string;
  }
  const { agentId }: Props = $props();

  const MODOS: ApprovalMode[] = ["inherit", "propose", "direct"];
  let modo = $state<ApprovalMode>("inherit");
  let guardado = $state<ApprovalMode>("inherit");
  let globalActivo = $state(false);
  let cargando = $state(true);
  let guardando = $state(false);
  let error = $state<string | null>(null);

  onMount(cargar);

  async function cargar() {
    try {
      cargando = true;
      error = null;
      const a = await getApprovalSettings();
      globalActivo = a.config.enabled;
      const este = a.agents.find((x) => x.id === agentId);
      modo = guardado = este?.mode ?? "inherit";
    } catch (e) {
      error = e instanceof Error ? e.message : t("agentApproval.errorLoading");
    } finally {
      cargando = false;
    }
  }

  async function guardar() {
    try {
      guardando = true;
      const r = await setAgentApprovalMode(agentId, modo);
      modo = guardado = r.mode;
      toast.success(t("agentApproval.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("agentApproval.errorSaving"));
    } finally {
      guardando = false;
    }
  }
</script>

<div class="space-y-4" data-testid="agent-approval">
  <div>
    <h3 class="text-sm font-semibold text-zinc-300">{t("agentApproval.title")}</h3>
    <p class="text-xs text-zinc-500">
      {t("agentApproval.help", { state: globalActivo ? t("agentApproval.globalOn") : t("agentApproval.globalOff") })}
    </p>
  </div>

  {#if !cargando && !error && !globalActivo && modo !== "direct"}
    <p class="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2" data-testid="global-off-note">
      {t("agentApproval.globalOffNote")}
    </p>
  {/if}

  {#if cargando}
    <div class="flex items-center justify-center h-24">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div>
    </div>
  {:else if error}
    <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">{error}</div>
  {:else}
    <fieldset class="space-y-2" disabled={!isAdmin()}>
      <legend class="sr-only">{t("agentApproval.title")}</legend>
      {#each MODOS as m}
        <label
          class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer {modo === m ? 'border-indigo-500/60 bg-indigo-500/5' : 'border-zinc-800'}"
          data-testid="mode-{m}"
        >
          <input type="radio" name="modo-aprobacion" value={m} bind:group={modo} class="mt-1" />
          <span>
            <span class="block text-sm text-zinc-200">{t(`approvals.mode_${m}`)}</span>
            <span class="block text-xs text-zinc-500">{t(`agentApproval.modeHelp_${m}`)}</span>
          </span>
        </label>
      {/each}
    </fieldset>
    <div class="flex flex-wrap items-center gap-3">
      {#if isAdmin()}
        <Button variant="primary" size="sm" loading={guardando} disabled={modo === guardado} onclick={guardar}>
          <Save size={14} class="mr-1" />{t("agentApproval.save")}
        </Button>
      {:else}
        <p class="text-xs text-amber-300/80">{t("approvals.readOnly")}</p>
      {/if}
      <a href="/approvals" class="text-xs text-indigo-300 hover:underline">{t("agentApproval.inboxLink")}</a>
    </div>
  {/if}
</div>
