<script lang="ts">
  import { onMount } from "svelte";
  import { Plus, ChartLine, X, Loader2 } from "lucide-svelte";
  import { api } from "$lib/api";

  interface Formula {
    id: string;
    name: string;
    kpiName?: string;
    description?: string;
    expression: string;
    isActive: boolean;
  }

  let formulas = $state<Formula[]>([]);
  let loading = $state(true);
  let showForm = $state(false);
  let saving = $state(false);

  // Form fields
  let formName = $state("");
  let formExpression = $state("");
  let formDescription = $state("");

  onMount(async () => {
    await loadFormulas();
  });

  async function loadFormulas() {
    try {
      loading = true;
      const data = await api.get<{ docs: Formula[] }>("/formulas");
      formulas = data.docs || [];
    } catch (err: any) {
      console.error("Failed to load formulas:", err);
      formulas = [];
    } finally {
      loading = false;
    }
  }

  function openForm() {
    formName = "";
    formExpression = "";
    formDescription = "";
    showForm = true;
  }

  function closeForm() {
    showForm = false;
  }

  async function saveFormula() {
    if (!formName || !formExpression) return;
    saving = true;
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
      const res = await fetch(`${API_URL}/api/formulas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          kpiName: formName,
          expression: formExpression,
          description: formDescription,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      showForm = false;
      await loadFormulas();
    } catch (err: any) {
      alert(err.message || "Failed to create formula");
    } finally {
      saving = false;
    }
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-xl font-bold text-gremius-text">KPI Formulas</h2>
      <p class="text-sm text-gremius-text-dim mt-0.5">Define custom metrics and calculations</p>
    </div>
    <button class="btn-primary inline-flex items-center gap-2" onclick={openForm}>
      <Plus class="w-4 h-4" /> New Formula
    </button>
  </div>

  <!-- Inline Create Form -->
  {#if showForm}
    <div class="card p-5 border-gremius-cyan/20 space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-semibold text-gremius-text">New Formula</h3>
        <button class="p-1 text-gremius-subtle hover:text-gremius-text" onclick={closeForm}>
          <X class="w-4 h-4" />
        </button>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="text-xs text-gremius-subtle block mb-1">KPI Name *</label>
          <input type="text" bind:value={formName} placeholder="e.g. Total Revenue"
            class="w-full bg-gremius-bg text-gremius-text placeholder-gremius-text-dim border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none" />
        </div>
        <div>
          <label class="text-xs text-gremius-subtle block mb-1">Expression *</label>
          <input type="text" bind:value={formExpression} placeholder="SUM({sales.amount})"
            class="w-full bg-gremius-bg text-gremius-text placeholder-gremius-text-dim border border-gremius-border rounded-lg px-3 py-2 text-sm font-mono focus:border-gremius-cyan/50 focus:outline-none" />
        </div>
      </div>
      <div>
        <label class="text-xs text-gremius-subtle block mb-1">Description</label>
        <input type="text" bind:value={formDescription} placeholder="What does this KPI track?"
          class="w-full bg-gremius-bg text-gremius-text placeholder-gremius-text-dim border border-gremius-border rounded-lg px-3 py-2 text-sm focus:border-gremius-cyan/50 focus:outline-none" />
      </div>
      <div class="flex justify-end gap-2">
        <button class="btn-secondary" onclick={closeForm}>Cancel</button>
        <button class="btn-primary inline-flex items-center gap-2" onclick={saveFormula} disabled={saving || !formName || !formExpression}>
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
  {:else if formulas.length === 0 && !showForm}
    <div class="card p-16 text-center">
      <div class="text-4xl mb-3">🧮</div>
      <p class="text-gremius-text-dim">No formulas yet.</p>
      <p class="text-xs text-gremius-subtle mt-1">Create your first KPI formula.</p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each formulas as formula}
        <div class="card p-4 flex items-center justify-between group hover:border-gremius-cyan/30 transition-colors">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-lg bg-gremius-surface flex items-center justify-center">
              <ChartLine class="w-5 h-5 text-gremius-cyan" />
            </div>
            <div>
              <h3 class="font-semibold text-gremius-text group-hover:text-gremius-cyan transition-colors">
                {formula.kpiName || formula.name}
              </h3>
              {#if formula.description}
                <p class="text-xs text-gremius-subtle mt-0.5">{formula.description}</p>
              {/if}
            </div>
          </div>
          <div class="flex items-center gap-3">
            <code class="text-xs bg-gremius-surface px-2 py-1 rounded">{formula.expression}</code>
            <span class="px-2 py-1 text-xs rounded-full border {formula.isActive ? 'bg-gremius-green/10 text-gremius-green border-gremius-green/20' : 'bg-gremius-subtle/10 text-gremius-subtle border-gremius-subtle/20'}">
              {formula.isActive ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
