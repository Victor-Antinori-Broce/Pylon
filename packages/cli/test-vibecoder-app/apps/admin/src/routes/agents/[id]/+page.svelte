<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { ArrowLeft, Save, Bot, Play, Trash2, Key } from 'lucide-svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import ChatInterface from '$lib/components/agents/ChatInterface.svelte';
  import Timeline from '$lib/components/agents/Timeline.svelte';
  import { getAgent, updateAgent, sendPlaygroundMessage } from '$lib/services/agents';
  import type { Agent, AgentTraceStep } from '$lib/types/agents';
  import type { PlaygroundMessage } from '$lib/services/agents';
  
  const agentId = $page.params.id;
  
  let agent: Agent | null = $state(null);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let activeTab = $state<'settings' | 'playground' | 'traces'>('playground');
  
  // Playground state
  let messages = $state<Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    metadata?: {
      tokensIn?: number;
      tokensOut?: number;
      duration?: number;
    };
  }>>([]);
  let chatLoading = $state(false);
  
  // Settings form
  let formData = $state<Partial<Agent>>({});
  
  onMount(async () => {
    await loadAgent();
  });
  
  async function loadAgent() {
    try {
      loading = true;
      error = null;
      agent = await getAgent(agentId);
      formData = { ...agent };
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error cargando agente';
    } finally {
      loading = false;
    }
  }
  
  async function handleSave() {
    try {
      saving = true;
      await updateAgent(agentId, formData);
      await loadAgent();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error guardando cambios';
    } finally {
      saving = false;
    }
  }
  
  async function handleSendMessage(content: string) {
    const userMessage: PlaygroundMessage = { role: 'user', content };
    
    messages = [...messages, {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date()
    }];
    
    chatLoading = true;
    
    try {
      const history: PlaygroundMessage[] = messages.slice(-10).map(m => ({
        role: m.role,
        content: m.content
      }));
      
      const response = await sendPlaygroundMessage(agentId, [...history, userMessage]);
      
      messages = [...messages, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.message,
        timestamp: new Date(),
        metadata: response.metadata
      }];
    } catch (e) {
      messages = [...messages, {
        id: crypto.randomUUID(),
        role: 'system',
        content: `Error: ${e instanceof Error ? e.message : 'Unknown error'}`,
        timestamp: new Date()
      }];
    } finally {
      chatLoading = false;
    }
  }
  
  // Mock trace steps for demo
  const mockSteps: AgentTraceStep[] = [
    {
      id: '1',
      traceId: 'trace-1',
      stepType: 'thinking',
      content: { thought: 'El usuario quiere saber sobre el estado del servidor. Debo consultar las métricas actuales.' },
      tokensUsed: 45,
      latencyMs: 120,
      createdAt: new Date().toISOString()
    },
    {
      id: '2',
      traceId: 'trace-1',
      stepType: 'tool_call',
      content: { 
        tool: 'get_server_metrics',
        input: { server: 'main' }
      },
      tokensUsed: 12,
      latencyMs: 850,
      createdAt: new Date(Date.now() + 120).toISOString()
    },
    {
      id: '3',
      traceId: 'trace-1',
      stepType: 'tool_result',
      content: {
        cpu: '45%',
        memory: '68%',
        uptime: '15d 4h 32m'
      },
      tokensUsed: 28,
      latencyMs: 50,
      createdAt: new Date(Date.now() + 970).toISOString()
    }
  ];
</script>

<div class="h-full flex flex-col">
  <!-- Header -->
  <div class="flex items-center gap-4 px-6 py-4 border-b border-zinc-800">
    <Button variant="ghost" size="sm" href="/agents">
      <ArrowLeft size={18} />
    </Button>
    
    {#if loading}
      <div class="animate-pulse h-6 w-48 bg-zinc-800 rounded"></div>
    {:else if agent}
      <div class="flex items-center gap-3">
        <div class="p-2 bg-indigo-500/10 rounded-lg">
          <Bot size={20} class="text-indigo-400" />
        </div>
        <div>
          <h1 class="text-xl font-semibold text-zinc-100">{agent.name}</h1>
          <p class="text-xs text-zinc-500">{agent.model} • {agent.status}</p>
        </div>
      </div>
    {/if}
    
    <div class="flex-1"></div>
    
    <!-- Tabs -->
    <div class="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg">
      <button
        class="px-3 py-1.5 text-sm rounded-md transition-colors {activeTab === 'playground' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}"
        onclick={() => activeTab = 'playground'}
      >
        <Play size={14} class="inline mr-1.5" />
        Playground
      </button>
      <button
        class="px-3 py-1.5 text-sm rounded-md transition-colors {activeTab === 'settings' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}"
        onclick={() => activeTab = 'settings'}
      >
        Configuración
      </button>
      <button
        class="px-3 py-1.5 text-sm rounded-md transition-colors {activeTab === 'traces' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}"
        onclick={() => activeTab = 'traces'}
      >
        Traces
      </button>
    </div>
  </div>
  
  <!-- Content -->
  <div class="flex-1 overflow-hidden">
    {#if loading}
      <div class="flex items-center justify-center h-full">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
      </div>
    {:else if error}
      <div class="p-8 text-center text-red-400">{error}</div>
    {:else if agent}
      {#if activeTab === 'playground'}
        <div class="h-full p-4">
          <ChatInterface
            {messages}
            loading={chatLoading}
            agentName={agent.name}
            onSend={handleSendMessage}
            class="h-full"
          />
        </div>
      {:else if activeTab === 'settings'}
        <div class="p-6 max-w-2xl">
          <Card class="p-6 space-y-6">
            <div>
              <label class="block text-sm font-medium text-zinc-300 mb-1.5">Nombre</label>
              <input
                type="text"
                bind:value={formData.name}
                class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>
            
            <div>
              <label class="block text-sm font-medium text-zinc-300 mb-1.5">Descripción</label>
              <textarea
                bind:value={formData.description}
                rows={3}
                class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
              ></textarea>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-zinc-300 mb-1.5">Modelo</label>
              <select
                bind:value={formData.model}
                class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              >
                <option value="gpt-4">GPT-4</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                <option value="claude-3-opus">Claude 3 Opus</option>
                <option value="claude-3-sonnet">Claude 3 Sonnet</option>
              </select>
            </div>
            
            <div class="flex items-center justify-between pt-4 border-t border-zinc-800">
              <Button
                variant="secondary"
                class="text-red-400 hover:text-red-300"
              >
                <Trash2 size={16} class="mr-2" />
                Eliminar
              </Button>
              <Button
                variant="primary"
                loading={saving}
                onclick={handleSave}
              >
                <Save size={16} class="mr-2" />
                Guardar Cambios
              </Button>
            </div>
          </Card>
        </div>
      {:else if activeTab === 'traces'}
        <div class="p-6 space-y-6">
          <Timeline steps={mockSteps} />
        </div>
      {/if}
    {/if}
  </div>
</div>
