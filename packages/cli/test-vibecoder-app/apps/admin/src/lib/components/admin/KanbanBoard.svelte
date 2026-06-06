<script lang="ts">
  import type { KanbanView } from "$lib/types/admin";
  import { Plus, MoreHorizontal } from "lucide-svelte";
  import { onMount } from "svelte";

  interface Props {
    view: KanbanView;
    apiEndpoint?: string;
  }

  const { view, apiEndpoint }: Props = $props();

  const API_URL = import.meta.env.VITE_API_URL ?? "";
  const endpoint = apiEndpoint || `/api/explorer/${view.table}`;

  let data = $state<any[]>([]);
  let loading = $state(true);
  let dragItem = $state<any | null>(null);
  let dragOverColumn = $state<string | null>(null);
  
  // Validation state
  let hasValidGroupBy = $state(true);

  // Discover unique values for the groupBy field
  const stages = $derived.by<string[]>(() => {
    const unique = new Set<string>();
    for (const item of data) {
      const val = item[view.groupBy];
      if (val !== undefined && val !== null) unique.add(String(val));
    }
    const sorted = Array.from(unique);
    return sorted.length > 0 ? sorted : ["No Stage"];
  });

  // Group data by stage
  const grouped = $derived.by<Record<string, any[]>>(() => {
    const groups: Record<string, any[]> = {};
    for (const stage of stages()) {
      groups[stage] = [];
    }
    for (const item of data) {
      const stage = String(item[view.groupBy] || "No Stage");
      if (!groups[stage]) groups[stage] = [];
      groups[stage].push(item);
    }
    return groups;
  });

  // Card display fields
  const cardFields = $derived(view.cardFields || []);

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    loading = true;
    hasValidGroupBy = true;
    try {
      const res = await fetch(`${API_URL}${endpoint}?limit=200`, { credentials: "include" });
      if (res.ok) {
        const result = await res.json();
        data = result.data || result.docs || result;
        
        // Validate that at least one item has the groupBy field (or the dataset is empty)
        if (data.length > 0) {
           const sampleHasField = data.some(item => view.groupBy in item);
           if (!sampleHasField) {
             hasValidGroupBy = false;
           }
        }
      }
    } catch (e) {
      console.error("Failed to load kanban data", e);
    } finally {
      loading = false;
    }
  }

  function handleDragStart(item: any) {
    dragItem = item;
  }

  function handleDragOver(e: DragEvent, stage: string) {
    e.preventDefault();
    dragOverColumn = stage;
  }

  function handleDragLeave() {
    dragOverColumn = null;
  }

  async function handleDrop(targetStage: string) {
    dragOverColumn = null;
    if (!dragItem || String(dragItem[view.groupBy]) === targetStage) {
      dragItem = null;
      return;
    }

    const itemId = dragItem.id;
    const oldStage = String(dragItem[view.groupBy]);

    // Optimistic update
    dragItem[view.groupBy] = targetStage;
    data = [...data];
    dragItem = null;

    // Persist via PATCH
    try {
      await fetch(`${API_URL}/api/explorer/${view.table}/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ [view.groupBy]: targetStage }),
      });
    } catch (e) {
      console.error("Failed to update stage", e);
      // Revert on failure
      const item = data.find(d => d.id === itemId);
      if (item) item[view.groupBy] = oldStage;
      data = [...data];
    }
  }

  function formatCardValue(value: any): string {
    if (value === null || value === undefined) return "-";
    if (typeof value === "number") return value.toLocaleString();
    if (typeof value === "boolean") return value ? "✓" : "✗";
    return String(value);
  }

  function getStageColor(stage: string, index: number): string {
    const palette = [
      "border-gray-500/30",
      "border-blue-500/30",
      "border-yellow-500/30",
      "border-orange-500/30",
      "border-green-500/30",
      "border-red-500/30",
      "border-purple-500/30",
      "border-pink-500/30",
    ];
    return palette[index % palette.length];
  }

  function getStageHeaderColor(stage: string, index: number): string {
    const palette = [
      "bg-gray-500/10 text-gray-400",
      "bg-blue-500/10 text-blue-400",
      "bg-yellow-500/10 text-yellow-400",
      "bg-orange-500/10 text-orange-400",
      "bg-green-500/10 text-green-400",
      "bg-red-500/10 text-red-400",
      "bg-purple-500/10 text-purple-400",
      "bg-pink-500/10 text-pink-400",
    ];
    return palette[index % palette.length];
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h2 class="text-xl font-semibold text-gremius-text">{view.title}</h2>
    <span class="text-sm text-gremius-text-dim">{data.length} records</span>
  </div>

  {#if loading}
    <div class="flex items-center justify-center h-64">
      <div class="w-8 h-8 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div>
    </div>
  {:else if !hasValidGroupBy}
    <div class="flex items-center justify-center h-64 bg-gremius-bg/50 border border-gremius-border border-dashed rounded-xl">
      <div class="text-center max-w-md p-6">
        <div class="text-4xl mb-4">⚠️</div>
        <h3 class="text-lg font-semibold text-gremius-text mb-2">Incompatible Kanban View</h3>
        <p class="text-sm text-gremius-subtle mb-4">
          This Kanban view is configured to group cards by <code class="bg-gremius-bg px-1.5 py-0.5 rounded text-gremius-cyan">'{view.groupBy}'</code>, but the current dataset does not contain this field.
        </p>
        <p class="text-xs text-gremius-text-dim">
          Please update the grimoire config to use a valid field, or switch to Grid view.
        </p>
      </div>
    </div>
  {:else}
    <div class="flex gap-4 overflow-x-auto pb-4" style="min-height: 400px;">
      {#each stages() as stage, i}
        {@const items = grouped()[stage] || []}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="flex-shrink-0 w-72 flex flex-col rounded-xl border-2 bg-gremius-bg transition-colors {dragOverColumn === stage ? 'border-gremius-cyan/50 bg-gremius-cyan/5' : getStageColor(stage, i)}"
          ondragover={(e) => handleDragOver(e, stage)}
          ondragleave={handleDragLeave}
          ondrop={() => handleDrop(stage)}
        >
          <!-- Column Header -->
          <div class="flex items-center justify-between px-3 py-2.5 border-b border-gremius-border/50">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full {getStageHeaderColor(stage, i)}">
                {stage}
              </span>
              <span class="text-xs text-gremius-subtle">{items.length}</span>
            </div>
            <button class="p-1 rounded hover:bg-gremius-border/30">
              <Plus class="w-3.5 h-3.5 text-gremius-text-dim" />
            </button>
          </div>

          <!-- Cards -->
          <div class="flex-1 p-2 space-y-2 overflow-y-auto">
            {#each items as item}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="bg-gremius-card border border-gremius-border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-gremius-cyan/30 transition-all shadow-sm hover:shadow-md"
                draggable="true"
                ondragstart={() => handleDragStart(item)}
              >
                <!-- Card Title (first cardField or ID) -->
                <div class="flex items-center justify-between mb-2">
                  <p class="text-sm font-medium text-gremius-text truncate">
                    {item[cardFields[0]] || item.title || item.name || item.id}
                  </p>
                  <button class="p-1 rounded hover:bg-gremius-border/30 shrink-0">
                    <MoreHorizontal class="w-3.5 h-3.5 text-gremius-text-dim" />
                  </button>
                </div>

                <!-- Card Fields -->
                {#each cardFields.slice(1) as field}
                  {#if item[field] !== undefined && item[field] !== null}
                    <div class="flex items-center justify-between text-xs mb-1">
                      <span class="text-gremius-subtle capitalize">{field.replace(/_/g, " ")}</span>
                      <span class="text-gremius-text-dim font-medium">{formatCardValue(item[field])}</span>
                    </div>
                  {/if}
                {/each}
              </div>
            {/each}

            {#if items.length === 0}
              <div class="flex items-center justify-center h-20 text-xs text-gremius-subtle">
                No items
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
