<script lang="ts">
  import { t, localeFormato } from "$lib/i18n";
  import { Plus, Bot, Play, Activity, Trash2, Key, Settings } from "lucide-svelte";
  import { onMount } from "svelte";

  import TokenDisplay from "$lib/components/agents/TokenDisplay.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import Modal from "$lib/components/ui/Modal.svelte";
  import { PRESETS_DE_AGENTE } from "@kitsuden/shared";
  import { listAgents, createAgent, deleteAgent } from "$lib/services/agents";
  import type { Agent, CreateAgentInput } from "$lib/types/agents";

  let agents: Agent[] = $state([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let newToken = $state<string | undefined>();

  // Modal states
  let showCreateModal = $state(false);
  let showDeleteModal = $state<string | null>(null);
  let creating = $state(false);

  // Sin permisos de lectura, todas las herramientas MCP responden «lacks required
  // scope». Solo lectura por defecto; el resto se ajusta luego en Configurar.
  const ACCESOS = PRESETS_DE_AGENTE.filter((p) =>
    ["read-only", "data-editor", "connect-only"].includes(p.id)
  );
  let acceso = $state("read-only");
  let deleting = $state(false);

  // Form state
  let formData = $state<CreateAgentInput>({
    name: "",
    description: "",
    identityId: "",
    model: "gpt-4",
    enabled: true,
  });

  onMount(async () => {
    await loadAgents();
  });

  async function loadAgents() {
    try {
      loading = true;
      error = null;
      agents = await listAgents();
    } catch (e) {
      error = e instanceof Error ? e.message : t("agentsView.errorCargandoAgentes");
    } finally {
      loading = false;
    }
  }

  async function handleCreate() {
    try {
      creating = true;
      const result = await createAgent({
        ...formData,
        scopes: [...(ACCESOS.find((p) => p.id === acceso)?.scopes ?? ["mcp:connect"])],
      });
      newToken = result.token;
      await loadAgents();
      showCreateModal = false;
      formData = { name: "", description: "", identityId: "", model: "gpt-4", enabled: true };
      acceso = "read-only";
    } catch (e) {
      error = e instanceof Error ? e.message : t("agentsView.errorCreandoAgente");
    } finally {
      creating = false;
    }
  }

  async function handleDelete(id: string) {
    try {
      deleting = true;
      await deleteAgent(id);
      await loadAgents();
      showDeleteModal = null;
    } catch (e) {
      error = e instanceof Error ? e.message : t("agentsView.errorEliminandoAgente");
    } finally {
      deleting = false;
    }
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case "active":
        return "bg-emerald-500";
      case "paused":
        return "bg-amber-500";
      case "error":
        return "bg-red-500";
      default:
        return "bg-zinc-500";
    }
  }
</script>

<div class="p-6 space-y-6">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-zinc-100">{t("agentsView.agentes")}</h1>
      <p class="text-zinc-500 mt-1">{t("agentsView.gestionaTusAgentesAiY")}</p>
    </div>
    <Button variant="primary" onclick={() => (showCreateModal = true)}>
      <Plus size={18} class="mr-2" />
      {t("agentsView.nuevoAgente")}
    </Button>
  </div>

  <!-- Error -->
  {#if error}
    <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
      {error}
    </div>
  {/if}

  <!-- Agents Grid -->
  {#if loading}
    <div class="flex items-center justify-center h-64">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
    </div>
  {:else if agents.length === 0}
    <Card class="p-12 text-center">
      <Bot size={48} class="mx-auto text-zinc-600 mb-4" />
      <h3 class="text-lg font-medium text-zinc-300">{t("agentsView.noHayAgentes")}</h3>
      <p class="text-zinc-500 mt-2 mb-6">{t("agentsView.creaTuPrimerAgentePara")}</p>
      <Button variant="primary" onclick={() => (showCreateModal = true)}>
        <Plus size={18} class="mr-2" />
        {t("agentsView.crearAgente")}
      </Button>
    </Card>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each agents as agent}
        <Card class="p-5 min-w-0 hover:border-indigo-500/30 transition-colors group">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <div class="p-2 bg-indigo-500/10 rounded-lg shrink-0">
                <Bot size={20} class="text-indigo-400" />
              </div>
              <div class="min-w-0">
                <h3 class="font-medium text-zinc-100 truncate" title={agent.name}>{agent.name}</h3>
                <p class="text-xs text-zinc-500 truncate">{agent.model}</p>
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="w-2 h-2 rounded-full {getStatusColor(agent.status)}"></span>
            </div>
          </div>

          {#if agent.description}
            <p class="mt-3 text-sm text-zinc-400 line-clamp-2">{agent.description}</p>
          {/if}

          <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
            <span class="flex items-center gap-1">
              <Activity size={14} />
              {t("agentsView.traces", { v: agent.totalTraces || 0 })}
            </span>
            <span class="flex items-center gap-1">
              <Key size={14} />
              {t("agentsView.tokens", { v: agent.totalTokens?.toLocaleString(localeFormato()) || 0 })}
            </span>
          </div>

          <!--
            `flex-wrap` + `min-w-0`: en la rejilla de tres columnas la tarjeta
            mide ~200 px y «Playground» + «Configurar» + la papelera no caben en
            una línea; sin poder partirse, la papelera se salía por el borde.
            Ahora los botones de texto bajan de línea y la papelera queda
            siempre dentro, pegada a la derecha (`ml-auto`, `shrink-0`).
          -->
          <div
            class="mt-4 pt-4 border-t border-zinc-800 flex flex-wrap items-center gap-2 min-w-0"
            data-testid="agent-card-actions"
          >
            <Button variant="ghost" size="sm" href="/agents/{agent.id}">
              <Play size={16} class="mr-1" />
              {t("agentsView.playground")}
            </Button>
            <Button variant="ghost" size="sm" href="/agents/{agent.id}?tab=settings">
              <Settings size={16} class="mr-1" />
              {t("agentsView.configurar")}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="ml-auto shrink-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
              ariaLabel={t("agentsView.eliminarAgente")}
              title={t("agentsView.eliminarAgente")}
              onclick={() => (showDeleteModal = agent.id)}
            >
              <Trash2 size={16} />
            </Button>
          </div>
        </Card>
      {/each}
    </div>
  {/if}
</div>

<!-- Create Modal -->
<Modal
  open={showCreateModal}
  title={t("agentsView.crearNuevoAgente")}
  description={t("agentsView.configuraUnNuevoAgenteAi")}
  onClose={() => (showCreateModal = false)}
>
  <form
    class="space-y-4"
    onsubmit={(e) => {
      e.preventDefault();
      handleCreate();
    }}
  >
    <div>
      <label for="name" class="block text-sm font-medium text-zinc-300 mb-1.5">{t("common.nombre")}</label>
      <input
        id="name"
        type="text"
        bind:value={formData.name}
        placeholder={t("agentsView.miAgente")}
        required
        class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50"
      />
    </div>

    <div>
      <label for="description" class="block text-sm font-medium text-zinc-300 mb-1.5"
        >{t("common.descripcion")}</label
      >
      <textarea
        id="description"
        bind:value={formData.description}
        placeholder={t("agentsView.describeElPropositoDeEste")}
        rows={3}
        class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 resize-none"
      ></textarea>
    </div>

    <div>
      <label for="model" class="block text-sm font-medium text-zinc-300 mb-1.5">{t("common.modelo")}</label>
      <select
        id="model"
        bind:value={formData.model}
        class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50"
      >
        <option value="gpt-4">{t("agentsView.gpt4")}</option>
        <option value="gpt-4-turbo">{t("agentsView.gpt4Turbo")}</option>
        <option value="gpt-3.5-turbo">{t("agentsView.gpt35Turbo")}</option>
        <option value="claude-3-opus">{t("agentsView.claude3Opus")}</option>
        <option value="claude-3-sonnet">{t("agentsView.claude3Sonnet")}</option>
      </select>
    </div>

    <div>
      <label for="acceso" class="block text-sm font-medium text-zinc-300 mb-1.5">{t("agentsView.acceso")}</label>
      <select
        id="acceso"
        bind:value={acceso}
        class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50"
      >
        <option value="read-only">{t("agentsView.accesoLectura")}</option>
        <option value="data-editor">{t("agentsView.accesoEdicion")}</option>
        <option value="connect-only">{t("agentsView.accesoSoloConectar")}</option>
      </select>
    </div>

    <div class="flex items-center gap-2 pt-2">
      <input
        type="checkbox"
        id="enabled"
        bind:checked={formData.enabled}
        class="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-indigo-500 focus:ring-indigo-500/50"
      />
      <label for="enabled" class="text-sm text-zinc-300">{t("agentsView.activarInmediatamente")}</label>
    </div>

    <div class="flex justify-end gap-3 pt-4">
      <Button type="button" variant="secondary" onclick={() => (showCreateModal = false)}>
        {t("common.cancelar")}
      </Button>
      <Button type="submit" variant="primary" loading={creating}>{t("common.crear")}</Button>
    </div>
  </form>
</Modal>

<!-- Delete Confirmation Modal -->
<Modal
  open={!!showDeleteModal}
  title={t("agentsView.eliminarAgente")}
  description={t("agentsView.estasSeguroEstaAccionNo")}
  size="sm"
  onClose={() => (showDeleteModal = null)}
>
  <div class="flex justify-end gap-3">
    <Button variant="secondary" onclick={() => (showDeleteModal = null)}>{t("common.cancelar")}</Button>
    <Button
      variant="primary"
      class="bg-red-600 hover:bg-red-500"
      loading={deleting}
      onclick={() => showDeleteModal && handleDelete(showDeleteModal)}
    >
      {t("common.eliminar")}
    </Button>
  </div>
</Modal>

<!-- Token Display: solo tras crear un agente (antes salía siempre, vacío, bajo la lista) -->
{#if newToken}
  <TokenDisplay token={newToken} onCopy={() => {}} />
{/if}
