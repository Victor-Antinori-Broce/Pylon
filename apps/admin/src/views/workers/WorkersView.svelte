<script lang="ts">
  import { onMount } from "svelte";
  import { Plus, Sword, Play, Pause, RotateCcw, X, Loader2, Users } from "lucide-svelte";
  import { api } from "$lib/api";

  interface Worker {
    id: string;
    name: string;
    description?: string;
    schedule: string;
    isActive: boolean;
    lastRun?: string;
    nextRun?: string;
  }

  let workers = $state<Worker[]>([]);
  let loading = $state(true);
  let showForm = $state(false);
  let saving = $state(false);

  // Form fields
  let formName = $state("");
  let formDescription = $state("");
  let formTrigger = $state("cron");
  let formSchedule = $state("0 * * * *");
  let formCode = $state("export default async function(context) {\n  console.log('Worker running');\n}");

  onMount(async () => {
    await loadWorkers();
  });

  async function loadWorkers() {
    try {
      loading = true;
      const data = await api.get<{ docs?: Worker[]; docs: Worker[] }>("/functions");
      // Handle both { docs: [] } and direct array response
      workers = data.docs || [];
    } catch (err: any) {
      console.error("Failed to load workers:", err);
      workers = [];
    } finally {
      loading = false;
    }
  }

  function openForm() {
    formName = "";
    formDescription = "";
    formTrigger = "cron";
    formSchedule = "0 * * * *";
    formCode = "export default async function(context) {\n  console.log('Worker running');\n}";
    showForm = true;
  }

  function closeForm() {
    showForm = false;
  }

  async function saveWorker() {
    if (!formName) return;
    saving = true;
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
      
      // Validate required fields
      if (!formCode || formCode.trim() === "") {
        throw new Error("Code is required");
      }
      
      const payload = {
        name: formName,
        description: formDescription || undefined,
        trigger: formTrigger,
        cronExpression: formTrigger === "cron" ? formSchedule : undefined,
        code: formCode,
        status: "active",
      };
      
      console.log("Creating worker:", payload);
      
      const res = await fetch(`${API_URL}/api/functions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || err.message || `HTTP ${res.status}`);
      }
      
      const result = await res.json();
      console.log("Worker created:", result);
      
      showForm = false;
      await loadWorkers();
    } catch (err: any) {
      console.error("Failed to create worker:", err);
      alert(err.message || "Failed to create worker");
    } finally {
      saving = false;
    }
  }

  async function toggleWorker(id: string) {
    // Toggle logic would go here
  }

  async function runWorker(id: string) {
    // Run logic would go here
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-xl font-bold text-gremius-text">Background Workers</h2>
      <p class="text-sm text-gremius-text-dim mt-0.5">Scheduled jobs and automations</p>
    </div>
    <button class="btn-primary inline-flex items-center gap-2" onclick={openForm}>
      <Plus class="w-4 h-4" /> New Worker
    </button>
  </div>

  <!-- Inline Create Form -->
  {#if showForm}
    <div class="card p-5 border-gremius-cyan/20 space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-semibold text-gremius-text">New Worker</h3>
        <button class="p-1 text-gremius-subtle hover:text-gremius-text" onclick={closeForm}>
          <X class="w-4 h-4" />
        </button>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label class="text-xs text-gremius-subtle block mb-1">Name *</label>
          <input type="text" bind:value={formName} placeholder="e.g. Email Digest"
            class="w-full bg-gremius-bg text-gremius-text placeholder-gremius-text-dim border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none" />
        </div>
        <div>
          <label class="text-xs text-gremius-subtle block mb-1">Trigger Type</label>
          <select bind:value={formTrigger} class="w-full bg-gremius-bg text-gremius-text border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none">
            <option value="cron">Cron Schedule</option>
            <option value="webhook">Webhook/API</option>
            <option value="event">System Event</option>
          </select>
        </div>
        <div>
          <label class="text-xs text-gremius-subtle block mb-1">Cron Expression (if cron)</label>
          <input type="text" bind:value={formSchedule} placeholder="0 * * * *" disabled={formTrigger !== 'cron'}
            class="w-full bg-gremius-bg text-gremius-text placeholder-gremius-text-dim border border-gremius-border rounded-lg px-3 py-2 text-sm font-mono focus:border-gremius-cyan/50 focus:outline-none disabled:opacity-50" />
        </div>
      </div>
      <div>
        <label class="text-xs text-gremius-subtle block mb-1">Description</label>
        <input type="text" bind:value={formDescription} placeholder="What does this worker do?"
          class="w-full bg-gremius-bg text-gremius-text placeholder-gremius-text-dim border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none" />
      </div>
      <div>
        <label class="text-xs text-gremius-subtle block mb-1">Code</label>
        <textarea bind:value={formCode} rows="3"
          class="w-full bg-gremius-bg text-gremius-text placeholder-gremius-text-dim border border-gremius-border rounded-lg px-3 py-2 text-sm font-mono focus:border-gremius-cyan/50 focus:outline-none"></textarea>
      </div>
      <div class="flex justify-end gap-2">
        <button class="btn-secondary" onclick={closeForm}>Cancel</button>
        <button class="btn-primary inline-flex items-center gap-2" onclick={saveWorker} disabled={saving || !formName}>
          {#if saving}
            <Loader2 class="w-4 h-4 animate-spin" /> Saving...
          {:else}
            <Plus class="w-4 h-4" /> Create
          {/if}
        </button>
      </div>
    </div>
  {/if}

  {#if loading}
    <div class="flex justify-center py-20">
      <div class="w-6 h-6 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div>
    </div>
  {:else if workers.length === 0 && !showForm}
    <div class="card p-16 text-center">
      <div class="flex justify-center mb-4">
        <div class="w-16 h-16 rounded-full bg-gremius-cyan/10 flex items-center justify-center">
          <Users class="w-8 h-8 text-gremius-cyan" />
        </div>
      </div>
      <p class="text-gremius-text-dim">No workers configured.</p>
      <p class="text-xs text-gremius-subtle mt-1">Create your first background worker.</p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each workers as worker}
        <div class="card p-4 flex items-center justify-between">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-lg bg-gremius-surface flex items-center justify-center">
              <Sword class="w-5 h-5 text-gremius-cyan" />
            </div>
            <div>
              <h3 class="font-semibold text-gremius-text">{worker.name}</h3>
              {#if worker.description}
                <p class="text-xs text-gremius-subtle mt-0.5">{worker.description}</p>
              {/if}
              <div class="flex items-center gap-3 mt-1 text-xs text-gremius-subtle">
                <span>Schedule: {worker.schedule}</span>
                {#if worker.lastRun}
                  <span>Last: {new Date(worker.lastRun).toLocaleString()}</span>
                {/if}
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="p-2 rounded-lg hover:bg-gremius-surface transition-colors"
              title="Run now"
              onclick={() => runWorker(worker.id)}
            >
              <RotateCcw class="w-4 h-4" />
            </button>
            <button
              class="p-2 rounded-lg {worker.isActive ? 'text-gremius-green hover:bg-gremius-green/10' : 'text-gremius-subtle hover:bg-gremius-surface'} transition-colors"
              title={worker.isActive ? "Pause" : "Resume"}
              onclick={() => toggleWorker(worker.id)}
            >
              {#if worker.isActive}
                <Pause class="w-4 h-4" />
              {:else}
                <Play class="w-4 h-4" />
              {/if}
            </button>
            <span class="px-2 py-1 text-xs rounded-full border {worker.isActive ? 'bg-gremius-green/10 text-gremius-green border-gremius-green/20' : 'bg-gremius-subtle/10 text-gremius-subtle border-gremius-subtle/20'}">
              {worker.isActive ? "Active" : "Paused"}
            </span>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
