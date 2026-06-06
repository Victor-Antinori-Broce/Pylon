<script lang="ts">
  import Timeline from '$lib/components/agents/Timeline.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import { listTraces, getTrace } from '$lib/services/agents';
  import type { AgentTrace, AgentTraceStep } from '$lib/types/agents';
  import { Activity, Filter, Bot, Clock, Coins } from 'lucide-svelte';
  import { onMount } from 'svelte';
  
  let traces: AgentTrace[] = $state([]);
  let selectedTrace: (AgentTrace & { steps: AgentTraceStep[] }) | null = $state(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let total = $state(0);
  let offset = $state(0);
  const limit = 20;
  
  onMount(async () => {
    await loadTraces();
  });
  
  async function loadTraces() {
    try {
      loading = true;
      error = null;
      const result = await listTraces({ limit, offset });
      traces = result.traces;
      total = result.total;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error cargando traces';
    } finally {
      loading = false;
    }
  }
  
  async function selectTrace(trace: AgentTrace) {
    try {
      selectedTrace = await getTrace(trace.id);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error cargando trace';
    }
  }
  
  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }
  
  function formatDate(date: string): string {
    return new Date(date).toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  function getStatusIcon(status: string) {
    switch (status) {
      case 'completed': return '✓';
      case 'error': return '✗';
      case 'running': return '⟳';
      default: return '○';
    }
  }
  
  function getStatusColor(status: string): string {
    switch (status) {
      case 'completed': return 'text-emerald-400';
      case 'error': return 'text-red-400';
      case 'running': return 'text-amber-400';
      default: return 'text-zinc-500';
    }
  }
</script>

<div class="flex h-full">
  <!-- Sidebar - Trace List -->
  <div class="w-96 border-r border-zinc-800 flex flex-col">
    <div class="p-4 border-b border-zinc-800">
      <div class="flex items-center gap-3">
        <Activity size={20} class="text-indigo-400" />
        <h1 class="text-lg font-semibold text-zinc-100">Traces</h1>
      </div>
      <p class="text-xs text-zinc-500 mt-1">{total} traces registrados</p>
    </div>
    
    <!-- Filters -->
    <div class="p-3 border-b border-zinc-800">
      <div class="flex items-center gap-2">
        <div class="flex-1 relative">
          <input
            type="text"
            placeholder="Buscar traces..."
            class="w-full pl-8 pr-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
          <Filter size={14} class="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
        </div>
      </div>
    </div>
    
    <!-- Trace List -->
    <div class="flex-1 overflow-y-auto">
      {#if loading}
        <div class="flex items-center justify-center h-32">
          <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div>
        </div>
      {:else if error}
        <div class="p-4 m-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      {:else if traces.length === 0}
        <div class="p-8 text-center text-zinc-500">
          <Activity size={32} class="mx-auto mb-3 opacity-50" />
          <p class="text-sm">No hay traces</p>
        </div>
      {:else}
        <div class="divide-y divide-zinc-800/50">
          {#each traces as trace}
            <button
              class="w-full p-3 text-left hover:bg-zinc-800/30 transition-colors {selectedTrace?.id === trace.id ? 'bg-zinc-800/50' : ''}"
              onclick={() => selectTrace(trace)}
            >
              <div class="flex items-start justify-between">
                <div class="flex items-center gap-2">
                  <span class="{getStatusColor(trace.status)}">{getStatusIcon(trace.status)}</span>
                  <span class="text-sm font-medium text-zinc-200 truncate max-w-[140px]">{trace.sessionId || 'Sin sesión'}</span>
                </div>
                <span class="text-xs text-zinc-600">{formatDate(trace.createdAt)}</span>
              </div>
              
              <div class="flex items-center gap-3 mt-2 text-xs text-zinc-500">
                <span class="flex items-center gap-1">
                  <Bot size={12} />
                  {trace.agentName || 'Agent'}
                </span>
                <span class="flex items-center gap-1">
                  <Clock size={12} />
                  {formatDuration(trace.totalDurationMs)}
                </span>
                <span class="flex items-center gap-1">
                  <Coins size={12} />
                  {trace.totalTokens.toLocaleString()}
                </span>
              </div>
            </button>
          {/each}
        </div>
        
        {#if traces.length < total}
          <div class="p-4 text-center">
            <Button
              variant="ghost"
              size="sm"
              onclick={() => { offset += limit; loadTraces(); }}
            >
              Cargar más
            </Button>
          </div>
        {/if}
      {/if}
    </div>
  </div>
  
  <!-- Main Content - Trace Detail -->
  <div class="flex-1 overflow-y-auto">
    {#if selectedTrace}
      <div class="p-6 space-y-6">
        <!-- Header -->
        <div class="flex items-start justify-between">
          <div>
            <div class="flex items-center gap-2">
              <span class="{getStatusColor(selectedTrace.status)} text-lg">{getStatusIcon(selectedTrace.status)}</span>
              <h2 class="text-xl font-semibold text-zinc-100">Trace #{selectedTrace.id.slice(-8)}</h2>
            </div>
            <p class="text-sm text-zinc-500 mt-1">{new Date(selectedTrace.createdAt).toLocaleString('es-ES')}</p>
          </div>
          
          <div class="flex items-center gap-4 text-sm">
            <div class="text-center">
              <p class="text-2xl font-semibold text-zinc-100">{formatDuration(selectedTrace.totalDurationMs)}</p>
              <p class="text-xs text-zinc-500">Duración</p>
            </div>
            <div class="text-center">
              <p class="text-2xl font-semibold text-zinc-100">{selectedTrace.totalTokens.toLocaleString()}</p>
              <p class="text-xs text-zinc-500">Tokens</p>
            </div>
            <div class="text-center">
              <p class="text-2xl font-semibold text-zinc-100">{selectedTrace.steps?.length || 0}</p>
              <p class="text-xs text-zinc-500">Pasos</p>
            </div>
          </div>
        </div>
        
        <!-- Timeline -->
        {#if selectedTrace.steps?.length > 0}
          <Card class="p-6">
            <h3 class="text-sm font-medium text-zinc-400 mb-4">Ejecución</h3>
            <Timeline steps={selectedTrace.steps} />
          </Card>
        {:else}
          <Card class="p-12 text-center">
            <Activity size={48} class="mx-auto text-zinc-600 mb-4" />
            <p class="text-zinc-500">No hay pasos registrados para este trace</p>
          </Card>
        {/if}
      </div>
    {:else}
      <div class="flex items-center justify-center h-full text-zinc-500">
        <div class="text-center">
          <Activity size={48} class="mx-auto mb-4 opacity-50" />
          <p>Selecciona un trace para ver los detalles</p>
        </div>
      </div>
    {/if}
  </div>
</div>
