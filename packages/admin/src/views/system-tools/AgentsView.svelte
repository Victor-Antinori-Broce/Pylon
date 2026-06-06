<script lang="ts">
  import { Plus, Bot, Play, Activity, Trash2, Key, Settings } from "lucide-svelte";
  import { onMount } from "svelte";

  import TokenDisplay from "$lib/components/agents/TokenDisplay.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import Modal from "$lib/components/ui/Modal.svelte";
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
      error = e instanceof Error ? e.message : "Error cargando agentes";
    } finally {
      loading = false;
    }
  }

  async function handleCreate() {
    try {
      creating = true;
      const result = await createAgent(formData);
      newToken = result.token;
      await loadAgents();
      showCreateModal = false;
      formData = { name: "", description: "", identityId: "", model: "gpt-4", enabled: true };
    } catch (e) {
      error = e instanceof Error ? e.message : "Error creando agente";
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
      error = e instanceof Error ? e.message : "Error eliminando agente";
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
      <h1 class="text-2xl font-bold text-zinc-100">Agentes</h1>
      <p class="text-zinc-500 mt-1">Gestiona tus agentes AI y monitorea su actividad</p>
    </div>
    <Button variant="primary" onclick={() => (showCreateModal = true)}>
      <Plus size={18} class="mr-2" />
      Nuevo Agente
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
      <h3 class="text-lg font-medium text-zinc-300">No hay agentes</h3>
      <p class="text-zinc-500 mt-2 mb-6">Crea tu primer agente para empezar</p>
      <Button variant="primary" onclick={() => (showCreateModal = true)}>
        <Plus size={18} class="mr-2" />
        Crear Agente
      </Button>
    </Card>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each agents as agent}
        <Card class="p-5 hover:border-indigo-500/30 transition-colors group">
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-indigo-500/10 rounded-lg">
                <Bot size={20} class="text-indigo-400" />
              </div>
              <div>
                <h3 class="font-medium text-zinc-100">{agent.name}</h3>
                <p class="text-xs text-zinc-500">{agent.model}</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full {getStatusColor(agent.status)}"></span>
            </div>
          </div>

          {#if agent.description}
            <p class="mt-3 text-sm text-zinc-400 line-clamp-2">{agent.description}</p>
          {/if}

          <div class="mt-4 flex items-center gap-4 text-xs text-zinc-500">
            <span class="flex items-center gap-1">
              <Activity size={14} />
              {agent.totalTraces || 0} traces
            </span>
            <span class="flex items-center gap-1">
              <Key size={14} />
              {agent.totalTokens?.toLocaleString() || 0} tokens
            </span>
          </div>

          <div class="mt-4 pt-4 border-t border-zinc-800 flex items-center gap-2">
            <Button variant="ghost" size="sm" href="/agents/{agent.id}/playground">
              <Play size={16} class="mr-1" />
              Playground
            </Button>
            <Button variant="ghost" size="sm" href="/agents/{agent.id}">
              <Settings size={16} class="mr-1" />
              Configurar
            </Button>
            <div class="flex-1"></div>
            <Button
              variant="ghost"
              size="sm"
              class="text-red-400 hover:text-red-300 hover:bg-red-500/10"
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
  title="Crear Nuevo Agente"
  description="Configura un nuevo agente AI"
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
      <label class="block text-sm font-medium text-zinc-300 mb-1.5">Nombre</label>
      <input
        type="text"
        bind:value={formData.name}
        placeholder="Mi Agente"
        required
        class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50"
      />
    </div>

    <div>
      <label class="block text-sm font-medium text-zinc-300 mb-1.5">Descripción</label>
      <textarea
        bind:value={formData.description}
        placeholder="Describe el propósito de este agente..."
        rows={3}
        class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 resize-none"
      ></textarea>
    </div>

    <div>
      <label class="block text-sm font-medium text-zinc-300 mb-1.5">Modelo</label>
      <select
        bind:value={formData.model}
        class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50"
      >
        <option value="gpt-4">GPT-4</option>
        <option value="gpt-4-turbo">GPT-4 Turbo</option>
        <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
        <option value="claude-3-opus">Claude 3 Opus</option>
        <option value="claude-3-sonnet">Claude 3 Sonnet</option>
      </select>
    </div>

    <div class="flex items-center gap-2 pt-2">
      <input
        type="checkbox"
        id="enabled"
        bind:checked={formData.enabled}
        class="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-indigo-500 focus:ring-indigo-500/50"
      />
      <label for="enabled" class="text-sm text-zinc-300">Activar inmediatamente</label>
    </div>

    <div class="flex justify-end gap-3 pt-4">
      <Button type="button" variant="secondary" onclick={() => (showCreateModal = false)}>
        Cancelar
      </Button>
      <Button type="submit" variant="primary" loading={creating}>Crear</Button>
    </div>
  </form>
</Modal>

<!-- Delete Confirmation Modal -->
<Modal
  open={!!showDeleteModal}
  title="Eliminar Agente"
  description="¿Estás seguro? Esta acción no se puede deshacer."
  size="sm"
  onClose={() => (showDeleteModal = null)}
>
  <div class="flex justify-end gap-3">
    <Button variant="secondary" onclick={() => (showDeleteModal = null)}>Cancelar</Button>
    <Button
      variant="primary"
      class="bg-red-600 hover:bg-red-500"
      loading={deleting}
      onclick={() => showDeleteModal && handleDelete(showDeleteModal)}
    >
      Eliminar
    </Button>
  </div>
</Modal>

<!-- Token Display -->
<TokenDisplay token={newToken} onCopy={() => {}} />
