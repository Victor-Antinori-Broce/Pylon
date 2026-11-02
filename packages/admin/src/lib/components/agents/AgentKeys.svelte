<!--
  Claves de un agente (fase E): crear con caducidad, rotar sin corte (la vieja
  sigue valiendo durante la gracia), revocar al instante y ver el último uso.
  El secreto solo se enseña una vez, con TokenDisplay.
-->
<script lang="ts">
  import { t, localeFormato } from "$lib/i18n";
  import { KeyRound, RefreshCw, Ban, Plus } from "lucide-svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  import TokenDisplay from "$lib/components/agents/TokenDisplay.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Modal from "$lib/components/ui/Modal.svelte";
  import { createAgentKey, listAgentKeys, revokeAgentKey, rotateAgentKey } from "$lib/services/agents";
  import type { AgentApiKey } from "$lib/types/agents";

  interface Props {
    agentId: string;
  }
  const { agentId }: Props = $props();

  let claves = $state<AgentApiKey[]>([]);
  let cargando = $state(true);
  let error = $state<string | null>(null);
  let secreto = $state<string | undefined>();

  let creando = $state(false);
  let nombre = $state("");
  let caducidad = $state<string>("90");

  let rotando = $state<AgentApiKey | null>(null);
  let gracia = $state<string>("24");
  let revocando = $state<AgentApiKey | null>(null);
  let ocupado = $state(false);

  onMount(cargar);

  async function cargar() {
    try {
      cargando = true;
      error = null;
      claves = await listAgentKeys(agentId);
    } catch (e) {
      error = e instanceof Error ? e.message : t("agentKeys.errorLoading");
    } finally {
      cargando = false;
    }
  }

  const dias = (v: string): number | null => (v === "never" ? null : Number(v));

  async function crear() {
    try {
      ocupado = true;
      const r = await createAgentKey(agentId, { name: nombre || undefined, expiresInDays: dias(caducidad) });
      secreto = r.apiKey;
      creando = false;
      nombre = "";
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("agentKeys.errorCreating"));
    } finally {
      ocupado = false;
    }
  }

  async function rotar() {
    if (!rotando) return;
    try {
      ocupado = true;
      const r = await rotateAgentKey(agentId, rotando.id, { graceHours: Number(gracia) });
      secreto = r.apiKey;
      rotando = null;
      await cargar();
      toast.success(t("agentKeys.rotated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("agentKeys.errorRotating"));
    } finally {
      ocupado = false;
    }
  }

  async function revocar() {
    if (!revocando) return;
    try {
      ocupado = true;
      await revokeAgentKey(agentId, revocando.id);
      revocando = null;
      await cargar();
      toast.success(t("agentKeys.revoked"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("agentKeys.errorRevoking"));
    } finally {
      ocupado = false;
    }
  }

  const fecha = (v: string | null) => (v ? new Date(v).toLocaleString(localeFormato()) : "—");

  const ESTADO: Record<AgentApiKey["status"], { texto: () => string; clase: string }> = {
    active: { texto: () => t("agentKeys.statusActive"), clase: "bg-emerald-500/15 text-emerald-300" },
    expiring: { texto: () => t("agentKeys.statusExpiring"), clase: "bg-amber-500/15 text-amber-300" },
    expired: { texto: () => t("agentKeys.statusExpired"), clase: "bg-zinc-700/40 text-zinc-400" },
    revoked: { texto: () => t("agentKeys.statusRevoked"), clase: "bg-red-500/15 text-red-300" },
  };
  const vivas = (k: AgentApiKey) => k.status === "active" || k.status === "expiring";
</script>

<div class="space-y-4" data-testid="agent-keys">
  <div class="flex flex-wrap items-center gap-3">
    <div class="min-w-0">
      <h3 class="text-sm font-semibold text-zinc-300">{t("agentKeys.title")}</h3>
      <p class="text-xs text-zinc-500">{t("agentKeys.help")}</p>
    </div>
    <div class="flex-1"></div>
    <Button variant="primary" size="sm" onclick={() => (creando = true)}>
      <Plus size={14} class="mr-1" />{t("agentKeys.newKey")}
    </Button>
  </div>

  {#if cargando}
    <div class="flex items-center justify-center h-24">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div>
    </div>
  {:else if error}
    <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">{error}</div>
  {:else if claves.length === 0}
    <p class="text-sm text-zinc-500">{t("agentKeys.none")}</p>
  {:else}
    <div class="overflow-x-auto border border-zinc-800 rounded-lg">
      <table class="w-full text-sm">
        <thead class="text-xs text-zinc-500">
          <tr>
            <th class="text-left px-3 py-2">{t("agentKeys.key")}</th>
            <th class="text-left px-3 py-2">{t("agentKeys.status")}</th>
            <th class="text-left px-3 py-2">{t("agentKeys.created")}</th>
            <th class="text-left px-3 py-2">{t("agentKeys.lastUsed")}</th>
            <th class="text-left px-3 py-2">{t("agentKeys.expires")}</th>
            <th class="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-800/70">
          {#each claves as k (k.id)}
            <tr data-testid="key-row">
              <td class="px-3 py-2 min-w-0">
                <div class="flex items-center gap-2">
                  <KeyRound size={14} class="text-zinc-500 shrink-0" />
                  <span class="text-zinc-200">{k.name || t("agentKeys.unnamed")}</span>
                </div>
                <code class="text-[11px] text-zinc-500 break-all">{k.prefix}</code>
                {#if k.rotatedFrom}
                  <div class="text-[11px] text-zinc-500">{t("agentKeys.rotatedFromNote")}</div>
                {/if}
              </td>
              <td class="px-3 py-2">
                <span class="text-[11px] px-1.5 py-0.5 rounded {ESTADO[k.status].clase}">{ESTADO[k.status].texto()}</span>
              </td>
              <td class="px-3 py-2 text-zinc-400 whitespace-nowrap">{fecha(k.createdAt)}</td>
              <td class="px-3 py-2 text-zinc-400 whitespace-nowrap">{k.lastUsedAt ? fecha(k.lastUsedAt) : t("agentKeys.never")}</td>
              <td class="px-3 py-2 text-zinc-400 whitespace-nowrap">
                {k.revokedAt ? fecha(k.revokedAt) : k.expiresAt ? fecha(k.expiresAt) : t("agentKeys.noExpiry")}
              </td>
              <td class="px-3 py-2">
                {#if vivas(k)}
                  <div class="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onclick={() => (rotando = k)}>
                      <RefreshCw size={14} class="mr-1" />{t("agentKeys.rotate")}
                    </Button>
                    <Button variant="ghost" size="sm" class="text-red-400 hover:text-red-300" onclick={() => (revocando = k)}>
                      <Ban size={14} class="mr-1" />{t("agentKeys.revoke")}
                    </Button>
                  </div>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<Modal open={creando} title={t("agentKeys.newKey")} description={t("agentKeys.newKeyHelp")} onClose={() => (creando = false)}>
  <form
    class="space-y-4"
    onsubmit={(e) => {
      e.preventDefault();
      crear();
    }}
  >
    <div>
      <label for="key-name" class="block text-sm font-medium text-zinc-300 mb-1.5">{t("agentKeys.name")}</label>
      <input
        id="key-name"
        bind:value={nombre}
        placeholder={t("agentKeys.namePlaceholder")}
        class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100"
      />
    </div>
    <div>
      <label for="key-expiry" class="block text-sm font-medium text-zinc-300 mb-1.5">{t("agentKeys.expiry")}</label>
      <select id="key-expiry" bind:value={caducidad} class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100">
        <option value="30">{t("agentKeys.days", { n: 30 })}</option>
        <option value="90">{t("agentKeys.days", { n: 90 })}</option>
        <option value="365">{t("agentKeys.days", { n: 365 })}</option>
        <option value="never">{t("agentKeys.noExpiry")}</option>
      </select>
    </div>
    <div class="flex justify-end gap-3 pt-2">
      <Button type="button" variant="secondary" onclick={() => (creando = false)}>{t("common.cancelar")}</Button>
      <Button type="submit" variant="primary" loading={ocupado}>{t("agentKeys.create")}</Button>
    </div>
  </form>
</Modal>

<Modal open={!!rotando} title={t("agentKeys.rotateTitle")} description={t("agentKeys.rotateHelp")} onClose={() => (rotando = null)}>
  <div class="space-y-4">
    <div>
      <label for="key-grace" class="block text-sm font-medium text-zinc-300 mb-1.5">{t("agentKeys.grace")}</label>
      <select id="key-grace" bind:value={gracia} class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100">
        <option value="0">{t("agentKeys.graceNow")}</option>
        <option value="1">{t("agentKeys.hours", { n: 1 })}</option>
        <option value="24">{t("agentKeys.hours", { n: 24 })}</option>
        <option value="72">{t("agentKeys.hours", { n: 72 })}</option>
        <option value="168">{t("agentKeys.hours", { n: 168 })}</option>
      </select>
    </div>
    <div class="flex justify-end gap-3">
      <Button variant="secondary" onclick={() => (rotando = null)}>{t("common.cancelar")}</Button>
      <Button variant="primary" loading={ocupado} onclick={rotar}>{t("agentKeys.rotate")}</Button>
    </div>
  </div>
</Modal>

<Modal open={!!revocando} title={t("agentKeys.revokeTitle")} description={t("agentKeys.revokeHelp")} size="sm" onClose={() => (revocando = null)}>
  <div class="flex justify-end gap-3">
    <Button variant="secondary" onclick={() => (revocando = null)}>{t("common.cancelar")}</Button>
    <Button variant="danger" loading={ocupado} onclick={revocar}>{t("agentKeys.revoke")}</Button>
  </div>
</Modal>

{#if secreto}
  {#key secreto}
    <TokenDisplay token={secreto} />
  {/key}
{/if}
