<script lang="ts">
  /**
   * ActionsView.svelte — Unified UI for Workers + Webhooks (Phase 1 & 2)
   * 
   * Uses the new unified /api/actions API.
   * Falls back to legacy APIs if the new API is not available.
   */
  import { onMount } from "svelte";
  import { 
    Zap, Webhook, Plus, Play, Pause, RotateCcw, X, Loader2,
    Clock, Activity, AlertCircle, CheckCircle, Eye, Code, Globe,
    ChevronRight, Terminal, Timer
  } from "lucide-svelte";

  const API = import.meta.env.VITE_API_URL ?? "";

  // ═══════════════════════════════════════════════════════════════════════════
  // Types
  // ═══════════════════════════════════════════════════════════════════════════
  
  type ActionType = 'code' | 'webhook_out' | 'webhook_in' | 'agent';
  type ActionTrigger = 'manual' | 'cron' | 'event' | 'http';
  type ActionStatus = 'active' | 'paused' | 'error';
  
  interface Action {
    id: string;
    type: ActionType;
    name: string;
    slug: string;
    description?: string;
    trigger: ActionTrigger;
    status: ActionStatus;
    triggerConfig?: {
      cronExpression?: string;
      eventName?: string;
      datasetId?: string;
      httpMethod?: string;
      httpPath?: string;
    };
    config?: {
      code?: string;
      url?: string;
      headers?: Record<string, string>;
    };
    lastExecutedAt?: string;
    executionCount: number;
    errorCount: number;
    createdAt: string;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // State
  // ═══════════════════════════════════════════════════════════════════════════
  
  let actions = $state<Action[]>([]);
  let loading = $state(true);
  let activeTab = $state<'all' | 'code' | 'webhook_out'>('all');
  let showCreateModal = $state(false);
  let createType = $state<'code' | 'webhook_out'>('code');
  let useNewApi = $state(true); // Will fall back to legacy if new API fails
  
  // Form states
  let saving = $state(false);
  let formName = $state("");
  let formDescription = $state("");
  let formTrigger = $state<ActionTrigger>("cron");
  let formCronExpression = $state("0 * * * *");
  let formEventName = $state("entry.created");
  let formCode = $state("export default async function(context) {\n  console.log('Action running');\n  // context.action, context.event, context.env\n}");
  let formUrl = $state("");
  let formHeaders = $state("{}");

  // ═══════════════════════════════════════════════════════════════════════════
  // Computed
  // ═══════════════════════════════════════════════════════════════════════════
  
  const filteredActions = $derived(
    activeTab === 'all' 
      ? actions 
      : actions.filter(a => a.type === activeTab)
  );
  
  const stats = $derived({
    total: actions.length,
    code: actions.filter(a => a.type === 'code').length,
    webhooks: actions.filter(a => a.type === 'webhook_out').length,
    active: actions.filter(a => a.status === 'active').length,
    paused: actions.filter(a => a.status === 'paused').length,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Data Loading
  // ═══════════════════════════════════════════════════════════════════════════
  
  onMount(async () => {
    await loadActions();
  });

  async function loadActions() {
    loading = true;
    try {
      // Try new API first
      const res = await fetch(`${API}/api/actions`, { credentials: "include" });
      
      if (res.ok) {
        const data = await res.json();
        actions = data.docs || [];
        useNewApi = true;
      } else if (res.status === 404) {
        // New API not available, fall back to legacy
        console.log("[Actions] New API not available, falling back to legacy");
        useNewApi = false;
        await loadLegacyActions();
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      console.error("Failed to load actions:", err);
      // Try legacy as fallback
      await loadLegacyActions();
    } finally {
      loading = false;
    }
  }

  // Fallback to legacy APIs
  async function loadLegacyActions() {
    try {
      const [workersRes, webhooksRes] = await Promise.all([
        fetch(`${API}/api/functions`, { credentials: "include" }),
        fetch(`${API}/api/custom/webhooks`, { credentials: "include" }).catch(() => null)
      ]);

      const workers = workersRes.ok ? await workersRes.json() : { docs: [] };
      const webhooks = webhooksRes?.ok ? await webhooksRes.json() : { docs: [] };

      // Normalize to Action interface
      const workerActions: Action[] = (workers.docs || []).map((w: any) => ({
        id: w.id,
        type: 'code',
        name: w.name,
        slug: w.slug,
        description: w.description,
        trigger: w.trigger === 'cron' ? 'cron' : 'event',
        status: w.status === 'active' ? 'active' : 'paused',
        triggerConfig: w.cronExpression ? { cronExpression: w.cronExpression } : { eventName: w.trigger },
        config: { code: w.code },
        lastExecutedAt: w.lastExecutedAt,
        executionCount: w.executionCount || 0,
        errorCount: w.errorCount || 0,
        createdAt: w.createdAt,
      }));

      const webhookActions: Action[] = (webhooks.docs || []).map((w: any) => ({
        id: w.id,
        type: 'webhook_out',
        name: w.name,
        slug: w.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        description: `Webhook for ${w.event}`,
        trigger: 'event',
        status: w.enabled ? 'active' : 'paused',
        triggerConfig: { eventName: w.event },
        config: { url: w.targetUrl || w.url },
        executionCount: 0,
        errorCount: 0,
        createdAt: w.createdAt || new Date().toISOString(),
      }));

      actions = [...workerActions, ...webhookActions];
    } catch (err) {
      console.error("Failed to load legacy actions:", err);
      actions = [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════════════════════════════════════

  function openCreateModal(type: 'code' | 'webhook_out') {
    createType = type;
    formName = "";
    formDescription = "";
    formTrigger = type === 'code' ? 'cron' : 'event';
    formCronExpression = "0 * * * *";
    formEventName = "entry.created";
    formCode = "export default async function(context) {\n  console.log('Action running');\n}";
    formUrl = "";
    formHeaders = "{}";
    showCreateModal = true;
  }

  function closeCreateModal() {
    showCreateModal = false;
  }

  async function saveAction(e: Event) {
    e.preventDefault();
    if (!formName) return;
    
    saving = true;
    try {
      if (useNewApi) {
        await saveViaNewApi();
      } else {
        await saveViaLegacyApi();
      }
      
      showCreateModal = false;
      await loadActions();
    } catch (err: any) {
      console.error("Failed to save action:", err);
      alert(err.message || "Failed to create action");
    } finally {
      saving = false;
    }
  }

  async function saveViaNewApi() {
    const payload: any = {
      name: formName,
      description: formDescription || undefined,
      type: createType,
      trigger: formTrigger,
      triggerConfig: formTrigger === 'cron' 
        ? { cronExpression: formCronExpression }
        : { eventName: formEventName },
      config: createType === 'code' 
        ? { code: formCode }
        : { url: formUrl, headers: JSON.parse(formHeaders || '{}') },
      status: 'active',
    };

    const res = await fetch(`${API}/api/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error('Failed to create action');
  }

  async function saveViaLegacyApi() {
    if (createType === 'code') {
      const payload = {
        name: formName,
        description: formDescription,
        trigger: formTrigger === 'cron' ? 'cron' : formEventName.replace('.', '_'),
        cronExpression: formTrigger === 'cron' ? formCronExpression : undefined,
        code: formCode,
        status: 'active',
      };

      const res = await fetch(`${API}/api/functions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed to create worker');
    } else {
      const payload = {
        name: formName,
        event: formEventName.replace('.', '_'),
        targetUrl: formUrl,
        enabled: true,
      };

      const res = await fetch(`${API}/api/custom/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed to create webhook');
    }
  }

  async function toggleAction(action: Action) {
    const newStatus = action.status === 'active' ? 'paused' : 'active';
    
    try {
      if (useNewApi) {
        await fetch(`${API}/api/actions/${action.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: newStatus }),
        });
      } else {
        // Legacy API
        const endpoint = action.type === 'code' 
          ? `${API}/api/functions/${action.id}`
          : `${API}/api/custom/webhooks/${action.id}`;
        
        await fetch(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ 
            status: newStatus === 'active' ? 'active' : 'inactive',
            enabled: newStatus === 'active'
          }),
        });
      }
      
      await loadActions();
    } catch (err) {
      console.error("Failed to toggle action:", err);
    }
  }

  async function runAction(action: Action) {
    if (action.type !== 'code') return;
    
    try {
      const endpoint = useNewApi
        ? `${API}/api/actions/${action.id}/execute`
        : `${API}/api/functions/${action.id}/execute`;
      
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      
      await loadActions();
    } catch (err) {
      console.error("Failed to run action:", err);
    }
  }

  function getTriggerLabel(action: Action): string {
    if (action.trigger === 'cron' && action.triggerConfig?.cronExpression) {
      return `Cron: ${action.triggerConfig.cronExpression}`;
    }
    if (action.trigger === 'event' && action.triggerConfig?.eventName) {
      return `On ${action.triggerConfig.eventName}`;
    }
    return action.trigger;
  }

  function getTriggerBadgeClass(action: Action): string {
    switch (action.trigger) {
      case 'cron': return 'badge-cyan';
      case 'event': return 'badge-amber';
      case 'http': return 'badge-purple';
      case 'manual': return 'badge-muted';
      default: return 'badge-muted';
    }
  }

  function getTypeIcon(type: ActionType) {
    switch (type) {
      case 'code': return Terminal;
      case 'webhook_out': return Globe;
      case 'webhook_in': return Webhook;
      case 'agent': return Zap;
      default: return Zap;
    }
  }

  function getTypeColor(type: ActionType): string {
    switch (type) {
      case 'code': return 'text-gremius-amber bg-gremius-amber/10';
      case 'webhook_out': return 'text-gremius-purple bg-gremius-purple/10';
      case 'webhook_in': return 'text-gremius-cyan bg-gremius-cyan/10';
      case 'agent': return 'text-gremius-pink bg-gremius-pink/10';
      default: return 'text-gremius-subtle bg-gremius-subtle/10';
    }
  }
</script>

<div class="space-y-6 animate-fade-in">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-gremius-text flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-gremius-cyan/20 to-gremius-purple/20 border border-gremius-cyan/20 flex items-center justify-center">
          <Zap class="w-5 h-5 text-gremius-cyan" />
        </div>
        Acciones
      </h1>
      <p class="text-sm text-gremius-subtle mt-1">
        Automatizaciones, webhooks y tareas programadas — todo en un solo lugar.
        {#if !useNewApi}
          <span class="text-gremius-amber">(Legacy Mode)</span>
        {/if}
      </p>
    </div>
    <div class="flex items-center gap-2">
      <button 
        onclick={() => openCreateModal('code')} 
        class="group inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-amber-500/5 hover:border-amber-500/20 hover:text-amber-400 transition-all duration-200"
      >
        <Code class="w-4 h-4 group-hover:scale-110 transition-transform" />
        Nuevo Worker
      </button>
      <button 
        onclick={() => openCreateModal('webhook_out')} 
        class="group inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-gremius-cyan to-cyan-400 text-black rounded-xl font-semibold shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-105 active:scale-95 transition-all duration-200"
      >
        <Webhook class="w-4 h-4 group-hover:rotate-12 transition-transform" />
        Nuevo Webhook
      </button>
    </div>
  </div>

  <!-- Stats -->
  <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
    <div class="card p-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-gremius-cyan/10 flex items-center justify-center">
          <Zap class="w-5 h-5 text-gremius-cyan" />
        </div>
        <div>
          <p class="text-2xl font-bold text-gremius-text">{stats.total}</p>
          <p class="text-xs text-gremius-subtle uppercase tracking-wider">Total Acciones</p>
        </div>
      </div>
    </div>
    <div class="card p-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-gremius-green/10 flex items-center justify-center">
          <Activity class="w-5 h-5 text-gremius-green" />
        </div>
        <div>
          <p class="text-2xl font-bold text-gremius-text">{stats.active}</p>
          <p class="text-xs text-gremius-subtle uppercase tracking-wider">Activos</p>
        </div>
      </div>
    </div>
    <div class="card p-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-gremius-amber/10 flex items-center justify-center">
          <Terminal class="w-5 h-5 text-gremius-amber" />
        </div>
        <div>
          <p class="text-2xl font-bold text-gremius-text">{stats.code}</p>
          <p class="text-xs text-gremius-subtle uppercase tracking-wider">Workers</p>
        </div>
      </div>
    </div>
    <div class="card p-4">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-gremius-purple/10 flex items-center justify-center">
          <Globe class="w-5 h-5 text-gremius-purple" />
        </div>
        <div>
          <p class="text-2xl font-bold text-gremius-text">{stats.webhooks}</p>
          <p class="text-xs text-gremius-subtle uppercase tracking-wider">Webhooks</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Tabs -->
  <div class="border-b border-gremius-border">
    <div class="flex gap-1">
      {#each [
        { id: 'all', label: 'Todas las Acciones', icon: Zap },
        { id: 'code', label: 'Workers', icon: Terminal },
        { id: 'webhook_out', label: 'Webhooks', icon: Globe },
      ] as tab}
        <button
          onclick={() => activeTab = tab.id as any}
          class="group px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-200 inline-flex items-center gap-2"
          class:border-gremius-cyan={activeTab === tab.id}
          class:text-gremius-cyan={activeTab === tab.id}
          class:border-transparent={activeTab !== tab.id}
          class:text-gremius-text-dim={activeTab !== tab.id}
          class:hover:text-gremius-text={activeTab !== tab.id}
        >
          <tab.icon class="w-4 h-4 group-hover:scale-110 transition-transform" />
          {tab.label}
        </button>
      {/each}
    </div>
  </div>

  <!-- Actions List -->
  <div class="card overflow-hidden">
    {#if loading}
      <div class="flex justify-center py-20">
        <div class="w-6 h-6 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div>
      </div>
    {:else if filteredActions.length === 0}
      <div class="p-16 text-center">
        <Zap class="w-16 h-16 mx-auto text-gremius-cyan/30 mb-4" />
        <h3 class="text-lg font-medium text-gremius-text mb-2">
          No actions configured
        </h3>
        <p class="text-sm text-gremius-subtle mb-4">
          Create your first automation to get started.
        </p>
        <div class="flex justify-center gap-3">
          <button 
            onclick={() => openCreateModal('code')} 
            class="group inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-amber-500/5 hover:border-amber-500/20 hover:text-amber-400 transition-all duration-200"
          >
            <Code class="w-4 h-4 group-hover:scale-110 transition-transform" />
            Nuevo Worker
          </button>
          <button 
            onclick={() => openCreateModal('webhook_out')} 
            class="group inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-gremius-cyan to-cyan-400 text-black rounded-xl font-semibold shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-105 active:scale-95 transition-all duration-200"
          >
            <Webhook class="w-4 h-4 group-hover:rotate-12 transition-transform" />
            Nuevo Webhook
          </button>
        </div>
      </div>
    {:else}
      <table class="w-full">
        <thead class="bg-gremius-surface/50 border-b border-gremius-border">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-medium text-gremius-subtle uppercase">Tipo</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gremius-subtle uppercase">Nombre</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gremius-subtle uppercase">Trigger</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gremius-subtle uppercase">Estado</th>
            <th class="px-4 py-3 text-right text-xs font-medium text-gremius-subtle uppercase">Acciones</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gremius-border">
          {#each filteredActions as action}
            {@const Icon = getTypeIcon(action.type)}
            <tr class="hover:bg-gremius-surface/30 group">
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-lg flex items-center justify-center {getTypeColor(action.type)}">
                    <Icon class="w-4 h-4" />
                  </div>
                  <span class="text-sm text-gremius-text capitalize">{action.type.replace('_', ' ')}</span>
                </div>
              </td>
              <td class="px-4 py-3">
                <div class="font-medium text-gremius-text">{action.name}</div>
                {#if action.description}
                  <div class="text-xs text-gremius-subtle">{action.description}</div>
                {/if}
                {#if action.config?.url}
                  <div class="text-xs text-gremius-subtle font-mono truncate max-w-[200px]">{action.config.url}</div>
                {/if}
              </td>
              <td class="px-4 py-3">
                <span class="inline-flex px-2 py-1 text-xs rounded-full border {getTriggerBadgeClass(action)}">
                  {getTriggerLabel(action)}
                </span>
              </td>
              <td class="px-4 py-3">
                <span class="inline-flex px-2 py-1 text-xs rounded-full border {action.status === 'active' ? 'border-gremius-green/30 bg-gremius-green/10 text-gremius-green' : 'border-gremius-subtle/30 bg-gremius-subtle/10 text-gremius-subtle'}">
                  {action.status === 'active' ? 'Activo' : 'Pausado'}
                </span>
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {#if action.type === 'code'}
                    <button
                      class="group/btn p-2 rounded-xl text-gremius-text-dim hover:text-gremius-cyan hover:bg-gremius-cyan/10 transition-all duration-200 hover:scale-110"
                      title="Ejecutar ahora"
                      onclick={() => runAction(action)}
                    >
                      <RotateCcw class="w-4 h-4 group-hover/btn:rotate-180 transition-transform duration-500" />
                    </button>
                  {/if}
                  <button
                    class="group/btn p-2 rounded-xl transition-all duration-200 hover:scale-110 {action.status !== 'active' ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-amber-400 hover:bg-amber-500/10'}"
                    title={action.status === 'active' ? "Pausar" : "Reanudar"}
                    onclick={() => toggleAction(action)}
                  >
                    {#if action.status === 'active'}
                      <Pause class="w-4 h-4 group-hover/btn:scale-90 transition-transform" />
                    {:else}
                      <Play class="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
                    {/if}
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

<!-- Create Modal -->
{#if showCreateModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick={() => showCreateModal = false}></div>
    
    <div class="relative bg-gremius-card border border-gremius-border rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between p-6 border-b border-gremius-border">
        <h3 class="text-lg font-semibold text-gremius-text">
          Nuevo {createType === 'code' ? 'Worker' : 'Webhook'}
        </h3>
        <button 
          onclick={() => showCreateModal = false} 
          class="group p-2 rounded-xl text-gremius-text-dim hover:text-gremius-text hover:bg-gremius-bg transition-all duration-200 hover:rotate-90"
        >
          <X class="w-5 h-5 transition-transform" />
        </button>
      </div>

      <form onsubmit={saveAction} class="p-6 space-y-4">
        <div>
          <label class="block text-xs text-gremius-subtle mb-1">Nombre *</label>
          <input 
            bind:value={formName} 
            type="text" 
            placeholder={createType === 'code' ? "ej. Resumen Diario de Emails" : "ej. Notificar Slack"}
            class="w-full bg-gremius-bg text-gremius-text border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none" 
            required 
          />
        </div>

        <div>
          <label class="block text-xs text-gremius-subtle mb-1">Descripción</label>
          <input 
            bind:value={formDescription} 
            type="text" 
            placeholder="¿Qué hace esta acción?"
            class="w-full bg-gremius-bg text-gremius-text border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none" 
          />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs text-gremius-subtle mb-1">Trigger</label>
            <select 
              bind:value={formTrigger} 
              class="w-full bg-gremius-bg text-gremius-text border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none"
            >
              {#if createType === 'code'}
                <option value="cron">Programación Cron</option>
                <option value="event">Evento del Sistema</option>
              {:else}
                <option value="event">En Evento</option>
              {/if}
              <option value="manual">Solo Manual</option>
            </select>
          </div>
          
          {#if formTrigger === 'cron'}
            <div>
              <label class="block text-xs text-gremius-subtle mb-1">Expresión Cron</label>
              <input 
                bind:value={formCronExpression} 
                type="text" 
                placeholder="0 * * * *"
                class="w-full bg-gremius-bg text-gremius-text border border-gremius-border rounded-lg px-3 py-2 text-sm font-mono focus:border-gremius-cyan/50 focus:outline-none" 
              />
            </div>
          {:else if formTrigger === 'event'}
            <div>
              <label class="block text-xs text-gremius-subtle mb-1">Nombre del Evento</label>
              <select 
                bind:value={formEventName}
                class="w-full bg-gremius-bg text-gremius-text border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none"
              >
                <option value="entry.created">Entry Created</option>
                <option value="entry.updated">Entry Updated</option>
                <option value="entry.deleted">Entry Deleted</option>
                <option value="post.published">Post Published</option>
              </select>
            </div>
          {/if}
        </div>

        {#if createType === 'code'}
          <div>
            <label class="block text-xs text-gremius-subtle mb-1">Código</label>
            <textarea 
              bind:value={formCode} 
              rows="6"
              class="w-full bg-gremius-bg text-gremius-text border border-gremius-border rounded-lg px-3 py-2 text-sm font-mono focus:border-gremius-cyan/50 focus:outline-none"
            ></textarea>
          </div>
        {:else}
          <div>
            <label class="block text-xs text-gremius-subtle mb-1">URL de Destino *</label>
            <input 
              bind:value={formUrl} 
              type="url" 
              placeholder="https://hooks.slack.com/services/..."
              class="w-full bg-gremius-bg text-gremius-text border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none" 
              required 
            />
          </div>
          
          <div>
            <label class="block text-xs text-gremius-subtle mb-1">Headers (JSON)</label>
            <textarea 
              bind:value={formHeaders} 
              rows="3"
              placeholder="{`{\"Authorization\": \"Bearer token\"}`}"
              class="w-full bg-gremius-bg text-gremius-text border border-gremius-border rounded-lg px-3 py-2 text-sm font-mono focus:border-gremius-cyan/50 focus:outline-none"
            ></textarea>
          </div>
        {/if}

        <div class="flex justify-end gap-3 pt-4 border-t border-gremius-border">
          <button 
            type="button" 
            onclick={() => showCreateModal = false} 
            class="px-5 py-2.5 text-sm font-medium rounded-xl bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-gremius-bg transition-all duration-200"
          >
            Cancelar
          </button>
          <button 
            type="submit" 
            disabled={saving || !formName || (createType === 'webhook_out' && !formUrl)} 
            class="group inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-gremius-cyan to-cyan-400 text-black shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100"
          >
            {#if saving}
              <Loader2 class="w-4 h-4 animate-spin" />
              Creando...
            {:else}
              <Plus class="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
              Crear
            {/if}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
