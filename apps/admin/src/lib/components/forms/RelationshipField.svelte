<script lang="ts">
  /**
   * RelationshipField.svelte — Combobox / MultiSelect for relation fields
   * Fetches related records from API, supports 1:1, 1:N, M:N
   */
  import { Search, ChevronDown, Check, X } from "lucide-svelte";
  import type { RelationType, RelationTarget } from "../../../types/datasets";
  import { onMount, onDestroy } from "svelte";

  // ─── Types ──────────────────────────────────────────
  interface RelatedItem {
    id: string;
    label: string;
    subtitle?: string;
    image?: string;
  }

  // ─── Props ──────────────────────────────────────────
  interface Props {
    value: string | string[] | null;
    target: RelationTarget;
    targetDatasetId?: string;
    relationType: RelationType;
    displayField?: string;
    label?: string;
    placeholder?: string;
    helpText?: string;
    required?: boolean;
    error?: string;
    onChange?: (value: string | string[] | null) => void;
  }
  
  let {
    value,
    target,
    targetDatasetId,
    relationType,
    displayField = "title",
    label = "",
    placeholder = "Select...",
    helpText = "",
    required = false,
    error = "",
    onChange
  }: Props = $props();

  // ─── State ──────────────────────────────────────────
  let open = $state(false);
  let searchQuery = $state("");
  let fetching = $state(false);
  let items = $state<RelatedItem[]>([]);
  let wrapperRef: HTMLElement;
  let searchInputRef: HTMLInputElement;
  let multiInputRef: HTMLInputElement;

  // ─── Computed ───────────────────────────────────────
  let selectedIds = $derived<string[]>(() => {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  });

  let selectedItem = $derived<RelatedItem | null>(() => {
    if (!value || Array.isArray(value)) return null;
    return items.find((i) => i.id === value) || null;
  });

  let filteredItems = $derived(() => {
    if (!searchQuery) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (i) => i.label.toLowerCase().includes(q) || i.subtitle?.toLowerCase().includes(q)
    );
  });

  // ─── API Fetch ──────────────────────────────────────
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

  const endpointMap: Record<string, string> = {
    "games": "/api/games",
    "blog-posts": "/api/blog-posts",
    "platforms": "/api/platforms",
    "tags": "/api/tags",
    "streamers": "/api/streamers",
  };

  async function fetchItems() {
    fetching = true;
    try {
      let url: string;
      if (target === "dataset" && targetDatasetId) {
        url = `${API_URL}/api/data-sets/${targetDatasetId}/entries?limit=200`;
      } else {
        url = `${API_URL}${endpointMap[target] || "/api/" + target}?limit=200`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error("fetch failed");
      const json = await res.json();
      const docs = json.docs || json.data || (Array.isArray(json) ? json : []);

      items = docs.map((doc: any) => {
        const displayKey = displayField || "title";
        const labelValue =
          doc[displayKey] ||
          doc.title ||
          doc.name ||
          doc.displayName ||
          (doc.data && (doc.data[displayKey] || doc.data.title || doc.data.name)) ||
          doc.id;

        return {
          id: doc.id,
          label: String(labelValue),
          subtitle: doc.developer || doc.slug || undefined,
          image: doc.coverArt?.url || doc.avatarUrl || doc.image?.url || undefined,
        };
      });
    } catch {
      items = [];
    } finally {
      fetching = false;
    }
  }

  // ─── Actions ────────────────────────────────────────
  function toggleOpen() {
    open = !open;
    if (open) {
      setTimeout(() => searchInputRef?.focus(), 0);
    }
  }

  function openMulti() {
    open = true;
    setTimeout(() => multiInputRef?.focus(), 0);
  }

  function selectSingle(item: RelatedItem | null) {
    onChange?.(item?.id || null);
    open = false;
    searchQuery = "";
  }

  function toggleMulti(item: RelatedItem) {
    const current = selectedIds();
    const idx = current.indexOf(item.id);
    if (idx >= 0) current.splice(idx, 1);
    else current.push(item.id);
    onChange?.(current);
  }

  function removeId(id: string) {
    const current = selectedIds().filter((i) => i !== id);
    onChange?.(current.length > 0 ? current : (relationType === "one-to-one" ? null : []));
  }

  function getDisplayLabel(item: RelatedItem): string {
    return item.label;
  }

  function getDisplayById(id: string): string {
    const item = items.find((i) => i.id === id);
    return item?.label || id.slice(0, 8) + "...";
  }

  // ─── Click outside ──────────────────────────────────
  function onClickOutside(e: MouseEvent) {
    if (wrapperRef && !wrapperRef.contains(e.target as Node)) {
      open = false;
    }
  }

  onMount(() => {
    fetchItems();
    document.addEventListener("mousedown", onClickOutside);
  });
  
  onDestroy(() => {
    document.removeEventListener("mousedown", onClickOutside);
  });

  // Re-fetch when target changes
  $effect(() => {
    target;
    targetDatasetId;
    fetchItems();
  });
</script>

<div class="space-y-1.5">
  {#if label}
    <label class="label block">
      {label}
      {#if required}<span class="text-gremius-pink">*</span>{/if}
    </label>
  {/if}

  <!-- ═══ Single select (1:1) ═══ -->
  {#if relationType === "one-to-one"}
    <div class="relative" bind:this={wrapperRef}>
      <button
        type="button"
        onclick={toggleOpen}
        class="input flex items-center justify-between gap-2 text-left {!selectedItem() ? 'text-gremius-subtle' : ''}"
      >
        <span class="truncate">{selectedItem() ? getDisplayLabel(selectedItem()!) : placeholder}</span>
        <ChevronDown class="w-4 h-4 text-gremius-subtle transition-transform shrink-0 {open ? 'rotate-180' : ''}" />
      </button>

      {#if open}
        <div class="absolute z-50 top-full mt-1 w-full card shadow-xl shadow-black/30 max-h-64 overflow-hidden">
          <div class="p-2 border-b border-gremius-border">
            <div class="relative">
              <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gremius-subtle" />
              <input
                bind:this={searchInputRef}
                bind:value={searchQuery}
                type="text"
                placeholder="Search..."
                class="input pl-8 py-1.5 text-xs bg-gremius-bg"
              />
            </div>
          </div>
          <div class="overflow-y-auto max-h-48">
            {#if fetching}
              <div class="flex justify-center py-4">
                <div class="w-4 h-4 border-2 border-gremius-cyan-30 border-t-gremius-cyan rounded-full animate-spin"></div>
              </div>
            {:else if filteredItems().length === 0}
              <div class="py-4 text-center text-xs text-gremius-subtle">No results found</div>
            {:else}
              {#if value}
                <button
                  type="button"
                  onclick={() => selectSingle(null)}
                  class="flex items-center gap-3 w-full px-3 py-2 text-left text-xs text-gremius-subtle hover:bg-gremius-border/30 transition-colors border-b border-gremius-border/30"
                >
                  <X class="w-3 h-3" /> Clear selection
                </button>
              {/if}
              {#each filteredItems() as item}
                <button
                  type="button"
                  onclick={() => selectSingle(item)}
                  class="flex items-center gap-3 w-full px-3 py-2 text-left text-sm hover:bg-gremius-border/30 transition-colors {value === item.id ? 'bg-gremius-cyan/[0.06] text-gremius-cyan' : ''}"
                >
                  {#if item.image}
                    <img src={item.image} alt={item.label} class="w-6 h-6 rounded object-cover shrink-0" />
                  {/if}
                  <div class="min-w-0 flex-1">
                    <p class="truncate">{getDisplayLabel(item)}</p>
                    {#if item.subtitle}
                      <p class="text-[10px] text-gremius-subtle truncate">{item.subtitle}</p>
                    {/if}
                  </div>
                  {#if value === item.id}
                    <Check class="w-4 h-4 text-gremius-cyan shrink-0" />
                  {/if}
                </button>
              {/each}
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- ═══ Multi select (1:N, M:N) ═══ -->
  {#if relationType !== "one-to-one"}
    <div bind:this={wrapperRef}>
      <button
        type="button"
        class="input min-h-[2.5rem] flex flex-wrap items-center gap-1.5 cursor-text w-full text-left"
        onclick={openMulti}
      >
        {#each selectedIds() as id}
          <span class="inline-flex items-center gap-1 rounded-md bg-gremius-cyan-10 border border-gremius-cyan-20 px-2 py-0.5 text-xs text-gremius-cyan">
            {getDisplayById(id)}
            <span onclick={(e) => { e.stopPropagation(); removeId(id); }} class="hover:text-gremius-pink transition-colors cursor-pointer">
              <X class="w-3 h-3" />
            </span>
          </span>
        {/each}
        <input
          bind:this={multiInputRef}
          bind:value={searchQuery}
          type="text"
          placeholder={selectedIds().length === 0 ? placeholder : ""}
          class="flex-1 min-w-[60px] bg-transparent text-sm outline-none placeholder:text-gremius-subtle"
          onfocus={() => open = true}
        />
      </button>

      {#if open}
        <div class="relative">
          <div class="absolute z-50 top-1 w-full card shadow-xl shadow-black/30 max-h-56 overflow-y-auto">
            {#if fetching}
              <div class="flex justify-center py-4">
                <div class="w-4 h-4 border-2 border-gremius-cyan-30 border-t-gremius-cyan rounded-full animate-spin"></div>
              </div>
            {:else if filteredItems().length === 0}
              <div class="py-4 text-center text-xs text-gremius-subtle">No results found</div>
            {:else}
              {#each filteredItems() as item}
                <button
                  type="button"
                  onclick={() => toggleMulti(item)}
                  class="flex items-center gap-3 w-full px-3 py-2 text-left text-sm hover:bg-gremius-border/30 transition-colors {selectedIds().includes(item.id) ? 'bg-gremius-cyan/[0.06]' : ''}"
                >
                  <div class="w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 {selectedIds().includes(item.id) ? 'bg-gremius-cyan border-gremius-cyan' : 'border-gremius-border'}">
                    {#if selectedIds().includes(item.id)}
                      <Check class="w-3 h-3 text-gremius-bg" />
                    {/if}
                  </div>
                  {#if item.image}
                    <img src={item.image} alt={item.label} class="w-6 h-6 rounded object-cover shrink-0" />
                  {/if}
                  <div class="min-w-0 flex-1">
                    <p class="truncate">{getDisplayLabel(item)}</p>
                    {#if item.subtitle}
                      <p class="text-[10px] text-gremius-subtle truncate">{item.subtitle}</p>
                    {/if}
                  </div>
                </button>
              {/each}
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  {#if helpText}
    <p class="text-[10px] text-gremius-subtle">{helpText}</p>
  {/if}
  {#if error}
    <p class="text-[10px] text-gremius-pink">{error}</p>
  {/if}
</div>

<style>
  .border-gremius-cyan-30 { border-color: rgb(0 229 255 / 0.3); }
  .bg-gremius-cyan-10 { background-color: rgb(0 229 255 / 0.1); }
  .border-gremius-cyan-20 { border-color: rgb(0 229 255 / 0.2); }
</style>
