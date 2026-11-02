<!--
  Promoción de código de UN agente (fase I): `suggestion` (de fábrica: todo
  borrador es una propuesta para una persona) o `turbo` (se activa solo cuando
  todas las pruebas y comprobaciones pasan y nada amplía permisos; necesita el
  tope global). Solo un admin lo cambia; queda auditado.
-->
<script lang="ts">
  import { t } from "$lib/i18n";
  import { Save } from "lucide-svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  import { isAdmin } from "$lib/auth.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { getPromotionSettings, setAgentPromotionMode } from "$lib/services/promotion";
  import type { PromotionMode } from "$lib/types/promotion";

  interface Props {
    agentId: string;
  }
  const { agentId }: Props = $props();

  const MODOS: PromotionMode[] = ["suggestion", "turbo"];
  let modo = $state<PromotionMode>("suggestion");
  let guardado = $state<PromotionMode>("suggestion");
  let turboGlobal = $state(false);
  let puedeProponer = $state(false);
  let cargando = $state(true);
  let guardando = $state(false);
  let error = $state<string | null>(null);

  onMount(cargar);

  async function cargar() {
    try {
      cargando = true;
      error = null;
      const a = await getPromotionSettings();
      turboGlobal = a.config.turboAllowed;
      const este = a.agents.find((x) => x.id === agentId);
      modo = guardado = este?.mode ?? "suggestion";
      puedeProponer = este?.canPropose ?? false;
    } catch (e) {
      error = e instanceof Error ? e.message : t("agentPromotion.errorLoading");
    } finally {
      cargando = false;
    }
  }

  async function guardar() {
    try {
      guardando = true;
      const r = await setAgentPromotionMode(agentId, modo);
      modo = guardado = r.mode;
      toast.success(t("agentPromotion.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("agentPromotion.errorSaving"));
    } finally {
      guardando = false;
    }
  }
</script>

<div class="space-y-4" data-testid="agent-promotion">
  <div>
    <h3 class="text-sm font-semibold text-zinc-300">{t("agentPromotion.title")}</h3>
    <p class="text-xs text-zinc-500">{t("agentPromotion.help")}</p>
  </div>

  {#if cargando}
    <div class="flex items-center justify-center h-24">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div>
    </div>
  {:else if error}
    <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">{error}</div>
  {:else}
    {#if !puedeProponer}
      <p class="text-xs text-zinc-400 bg-zinc-800/40 border border-zinc-800 rounded px-3 py-2" data-testid="no-scope-note">
        {t("agentPromotion.noScope")}
      </p>
    {/if}
    {#if modo === "turbo" && !turboGlobal}
      <p class="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2" data-testid="turbo-capped-note">
        {t("agentPromotion.turboCapped")}
      </p>
    {/if}
    <fieldset class="space-y-2" disabled={!isAdmin()}>
      <legend class="sr-only">{t("agentPromotion.title")}</legend>
      {#each MODOS as m}
        <label
          class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer {modo === m ? 'border-indigo-500/60 bg-indigo-500/5' : 'border-zinc-800'}"
          data-testid="promotion-mode-{m}"
        >
          <input type="radio" name="modo-promocion" value={m} bind:group={modo} class="mt-1" />
          <span>
            <span class="block text-sm text-zinc-200">{t(`promotion.mode_${m}`)}</span>
            <span class="block text-xs text-zinc-500">{t(`agentPromotion.modeHelp_${m}`)}</span>
          </span>
        </label>
      {/each}
    </fieldset>
    <div class="flex flex-wrap items-center gap-3">
      {#if isAdmin()}
        <Button variant="primary" size="sm" loading={guardando} disabled={modo === guardado} onclick={guardar}>
          <Save size={14} class="mr-1" />{t("agentPromotion.save")}
        </Button>
      {:else}
        <p class="text-xs text-amber-300/80">{t("approvals.readOnly")}</p>
      {/if}
      <a href="/approvals?tab=promotion" class="text-xs text-indigo-300 hover:underline">{t("agentPromotion.pipelineLink")}</a>
    </div>
  {/if}
</div>
