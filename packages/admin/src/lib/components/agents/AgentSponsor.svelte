<!--
  Firmante humano de un agente (fase F, decisión del propietario): la cuenta
  (admin o editor) que FIRMA lo que el agente crea — autor de las entradas del
  blog, dueño de las entradas de datasets —. Lo elige un admin. Si esa cuenta
  se borra o pierde su rol, el agente no crea contenido firmado hasta que se
  reasigne.
-->
<script lang="ts">
  import { t } from "$lib/i18n";
  import { Save, UserX } from "lucide-svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  import { isAdmin } from "$lib/auth.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { getAgentSponsor, setAgentSponsor } from "$lib/services/agents";
  import type { AgentSponsor } from "$lib/types/agents";

  interface Props {
    agentId: string;
  }
  const { agentId }: Props = $props();

  let datos = $state<AgentSponsor | null>(null);
  let elegido = $state<string>("");
  let cargando = $state(true);
  let guardando = $state(false);
  let error = $state<string | null>(null);

  onMount(cargar);

  function rellenar(d: AgentSponsor) {
    datos = d;
    elegido = d.sponsor?.userId ?? "";
  }

  async function cargar() {
    try {
      cargando = true;
      error = null;
      rellenar(await getAgentSponsor(agentId));
    } catch (e) {
      error = e instanceof Error ? e.message : t("agentSponsor.errorLoading");
    } finally {
      cargando = false;
    }
  }

  async function guardar(userId: string | null) {
    try {
      guardando = true;
      rellenar(await setAgentSponsor(agentId, userId));
      toast.success(userId ? t("agentSponsor.saved") : t("agentSponsor.removed"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("agentSponsor.errorSaving"));
    } finally {
      guardando = false;
    }
  }

  const ROL: Record<string, () => string> = {
    admin: () => t("agentSponsor.roleAdmin"),
    editor: () => t("agentSponsor.roleEditor"),
  };
</script>

<div class="space-y-4" data-testid="agent-sponsor">
  <div>
    <h3 class="text-sm font-semibold text-zinc-300">{t("agentSponsor.title")}</h3>
    <p class="text-xs text-zinc-500">{t("agentSponsor.help")}</p>
  </div>

  {#if cargando}
    <div class="flex items-center justify-center h-24">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div>
    </div>
  {:else if error}
    <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">{error}</div>
  {:else if datos}
    <div class="p-3 rounded-lg border {datos.sponsor && !datos.sponsor.valid ? 'border-red-500/40 bg-red-500/5' : 'border-zinc-800'}" data-testid="sponsor-current">
      {#if !datos.sponsor}
        <p class="text-sm text-zinc-400">{t("agentSponsor.none")}</p>
        <p class="text-xs text-zinc-500">{t("agentSponsor.noneHelp")}</p>
      {:else}
        <p class="text-sm text-zinc-200">
          {datos.sponsor.name ?? datos.sponsor.userId}
          {#if datos.sponsor.email}<span class="text-xs text-zinc-500 ml-1">{datos.sponsor.email}</span>{/if}
        </p>
        {#if datos.sponsor.valid}
          <p class="text-xs text-emerald-300">{t("agentSponsor.valid", { role: ROL[datos.sponsor.role ?? ""]?.() ?? datos.sponsor.role ?? "" })}</p>
        {:else}
          <p class="text-xs text-red-300" data-testid="sponsor-invalid">
            {datos.sponsor.reason === "not_found" ? t("agentSponsor.invalidDeleted") : t("agentSponsor.invalidRole")}
          </p>
        {/if}
      {/if}
    </div>

    {#if isAdmin()}
      <div class="flex flex-wrap items-end gap-3">
        <div class="min-w-64 flex-1">
          <label for="sponsor-select" class="block text-sm text-zinc-300 mb-1.5">{t("agentSponsor.choose")}</label>
          <select
            id="sponsor-select"
            bind:value={elegido}
            class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100"
          >
            <option value="">{t("agentSponsor.nobody")}</option>
            {#each datos.candidates as c (c.id)}
              <option value={c.id}>{t("agentSponsor.candidate", { name: c.name, email: c.email, role: ROL[c.role]?.() ?? c.role })}</option>
            {/each}
          </select>
        </div>
        <Button
          variant="primary"
          size="sm"
          loading={guardando}
          disabled={elegido === (datos.sponsor?.userId ?? "")}
          onclick={() => guardar(elegido || null)}
        >
          <Save size={14} class="mr-1" />{t("agentSponsor.save")}
        </Button>
        {#if datos.sponsor}
          <Button variant="ghost" size="sm" class="text-red-400" disabled={guardando} onclick={() => guardar(null)}>
            <UserX size={14} class="mr-1" />{t("agentSponsor.remove")}
          </Button>
        {/if}
      </div>
    {:else}
      <p class="text-xs text-amber-300/80">{t("agentSponsor.readOnly")}</p>
    {/if}
    <ul class="text-xs text-zinc-500 list-disc pl-5 space-y-1">
      <li>{t("agentSponsor.rule1")}</li>
      <li>{t("agentSponsor.rule2")}</li>
      <li>{t("agentSponsor.rule3")}</li>
    </ul>
  {/if}
</div>
