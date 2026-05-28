<script lang="ts">
  import { X, Loader2, Save } from "lucide-svelte";
  import type { SchemaColumn } from "$lib/types/admin";
  import { autosaveStore } from "$lib/states/autosave.svelte";
  import AutoSaveIndicator from "./AutoSaveIndicator.svelte";
  import { onMount } from "svelte";

  interface Props {
    /** Table/collection name for API calls */
    tableName: string;
    /** Columns from schema introspection */
    columns: SchemaColumn[];
    /** Existing record data (null = create mode) */
    editData?: Record<string, any> | null;
    /** Custom API endpoint base (e.g., /api/directory). If not provided, uses /api/explorer */
    apiEndpoint?: string;
    /** Called on successful save */
    onsave?: () => void;
    /** Called when modal is closed */
    onclose?: () => void;
  }

  let { tableName, columns, editData = null, apiEndpoint, onsave, onclose }: Props = $props();

  const API_URL = import.meta.env.VITE_API_URL ?? "";
  const isEdit = $derived(!!editData);

  // Form state — initialize from editData or empty
  let formData = $state<Record<string, any>>({});
  let saving = $state(false);
  let error = $state<string | null>(null);
  let relationOptions = $state<Record<string, { value: string; label: string }[]>>({});
  let loadingRelations = $state(false);

  // Autosave key for this form
  const autosaveKey = $derived(`${tableName}_${editData?.id || 'new'}`);

  // Start autosave when form is ready
  onMount(() => {
    // Wait a tick so the $effect initializer runs first
    const timer = setTimeout(() => {
      if (Object.keys(formData).length > 0) {
        autosaveStore.startAutosave(autosaveKey, formData);
      }
    }, 0);

    return () => {
      clearTimeout(timer);
      autosaveStore.stopAutosave();
    };
  });

  // Track form changes for autosave
  $effect(() => {
    autosaveStore.updateData(formData);
  });

  // Apply restored version data to the form
  $effect(() => {
    if (autosaveStore.restoredData) {
      for (const key of Object.keys(autosaveStore.restoredData)) {
        if (editableColumns.some(c => c.name === key)) {
          formData[key] = autosaveStore.restoredData[key];
        }
      }
      autosaveStore.restoredData = null;
    }
  });

  // Readonly fields excluded from the form
  const READONLY_FIELDS = new Set(["id", "created_at", "updated_at", "createdAt", "updatedAt"]);

  // Editable columns = all except readonly
  let editableColumns = $derived(
    columns.filter(c => !READONLY_FIELDS.has(c.name) && !c.isPrimary)
  );

  // FK column name → related table name mapping
  const FK_TABLE_MAP: Record<string, string> = {
    game_id: "games", gameId: "games",
    platform_id: "platforms", platformId: "platforms",
    tag_id: "tags", tagId: "tags",
    streamer_id: "streamers", streamerId: "streamers",
    collection_id: "collections", collectionId: "collections",
    user_id: "auth_users", userId: "auth_users",
    author_id: "auth_users", authorId: "auth_users",
    assigned_to_id: "auth_users", assignedToId: "auth_users",
    contact_id: "contacts", contactId: "contacts",
    dataset_id: "datasets", datasetId: "datasets",
  };

  function isRelationColumn(col: SchemaColumn): boolean {
    return col.type === "relation" || col.name.endsWith("_id") || (col.name.endsWith("Id") && col.name !== "id");
  }

  function getRelatedTable(colName: string): string | undefined {
    if (FK_TABLE_MAP[colName]) return FK_TABLE_MAP[colName];
    const base = colName.replace(/_id$/, "").replace(/Id$/, "");
    const plural = base.endsWith("s") ? base : base + "s";
    return plural;
  }

  function inferInputType(col: SchemaColumn): string {
    if (isRelationColumn(col)) return "relation";
    const t = col.type?.toLowerCase() || "text";
    if (t === "boolean") return "checkbox";
    if (t === "number" || t === "integer" || t === "float" || t === "numeric") return "number";
    if (t === "date") return "date";
    if (t === "datetime" || t === "timestamp") return "datetime-local";
    if (t === "json" || t === "jsonb") return "json";
    if (t === "email") return "email";
    if (t === "url") return "url";
    if (col.name.includes("description") || col.name.includes("content") || col.name.includes("body") || col.name.includes("notes") || col.name.includes("bio")) return "textarea";
    return "text";
  }

  function formatLabel(name: string): string {
    return name
      .replace(/_id$/, "")
      .replace(/Id$/, "")
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .replace(/^\w/, c => c.toUpperCase())
      .trim();
  }

  // Initialize form data
  $effect(() => {
    const initial: Record<string, any> = {};
    for (const col of editableColumns) {
      if (editData && editData[col.name] !== undefined) {
        initial[col.name] = editData[col.name];
      } else {
        const inputType = inferInputType(col);
        initial[col.name] = inputType === "checkbox" ? false : inputType === "number" ? null : "";
      }
    }
    formData = initial;
  });

  // Load FK options
  $effect(() => {
    const relationCols = editableColumns.filter(isRelationColumn);
    if (relationCols.length === 0) return;

    loadingRelations = true;
    const promises = relationCols.map(async (col) => {
      const relTable = getRelatedTable(col.name);
      if (!relTable) return;
      try {
        const res = await fetch(`${API_URL}/api/explorer/${relTable}/options`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          relationOptions[col.name] = data.options || [];
        }
      } catch {
        // Table might not be in registry — skip
      }
    });

    Promise.all(promises).then(() => { loadingRelations = false; });
  });

  async function handleSubmit() {
    saving = true;
    error = null;

    // Build payload with proper type handling
    const payload: Record<string, any> = {};
    for (const col of editableColumns) {
      const key = col.name;
      let value = formData[key];
      const inputType = inferInputType(col);
      
      // Skip undefined values unless it's a required field
      if ((value === "" || value === undefined || value === null) && col.nullable) {
        payload[key] = null;
        continue;
      }
      
      // Handle different types
      if (inputType === "number") {
        // Convert to number or null
        const num = value === "" || value === null ? null : Number(value);
        payload[key] = num;
      } else if (inputType === "json") {
        // Parse JSON or send as-is if already object
        if (typeof value === "string" && value.trim() !== "") {
          try {
            payload[key] = JSON.parse(value);
          } catch {
            error = `Invalid JSON in field "${formatLabel(key)}"`;
            saving = false;
            return;
          }
        } else if (typeof value === "object") {
          payload[key] = value;
        } else {
          payload[key] = null;
        }
      } else if (inputType === "checkbox") {
        // Ensure boolean
        payload[key] = Boolean(value);
      } else if (inputType === "relation") {
        // Handle empty relation
        payload[key] = value === "" ? null : value;
      } else {
        // Text and other types
        payload[key] = value === "" ? null : value;
      }
    }

    try {
      // Use custom apiEndpoint if provided, otherwise fall back to /api/explorer
      // apiEndpoint is the base path (e.g., /api/directory), tableName gets appended
      const baseUrl = apiEndpoint ? `${API_URL}${apiEndpoint}` : `${API_URL}/api/explorer`;
      const url = isEdit
        ? `${baseUrl}/${tableName}/${editData!.id}`
        : `${baseUrl}/${tableName}`;

      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        autosaveStore.clearCurrentAutosave();
        onsave?.();
        onclose?.();
      } else {
        const err = await res.json().catch(() => ({}));
        error = err.error || err.message || `Failed to ${isEdit ? "update" : "create"} record`;
      }
    } catch (e: any) {
      error = e.message || "Network error";
    } finally {
      saving = false;
    }
  }
</script>

<!-- Backdrop -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
  onclick={(e) => { if (e.target === e.currentTarget) { autosaveStore.stopAutosave(); onclose?.(); } }}
>
  <div class="bg-gremius-card border border-gremius-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onclick={(e) => e.stopPropagation()}>
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-gremius-border shrink-0">
      <div>
        <h2 class="text-lg font-semibold text-gremius-text">
          {isEdit ? "Edit" : "Create"} Record
        </h2>
        <p class="text-xs text-gremius-subtle mt-0.5">{tableName}</p>
      </div>
      <div class="flex items-center gap-3">
        <AutoSaveIndicator />
        <button
          onclick={() => {
            autosaveStore.stopAutosave();
            onclose?.();
          }}
          class="p-2 rounded-lg hover:bg-gremius-border/30 text-gremius-text-dim hover:text-gremius-text transition-colors"
        >
          <X class="w-5 h-5" />
        </button>
      </div>
    </div>

    <!-- Form Body -->
    <div class="flex-1 overflow-y-auto px-6 py-5">
      {#if error}
        <div class="mb-4 p-3 rounded-lg bg-gremius-pink/10 border border-gremius-pink/20 text-sm text-gremius-pink">
          {error}
        </div>
      {/if}

      <div class="space-y-4">
        {#if editableColumns.length === 0}
          <div class="p-8 text-center">
            <div class="w-12 h-12 rounded-full bg-gremius-cyan/10 flex items-center justify-center mx-auto mb-3">
              <span class="text-2xl">⚠️</span>
            </div>
            <h3 class="text-gremius-text font-medium mb-1">No fields available</h3>
            <p class="text-sm text-gremius-subtle">
              Could not load schema for table "{tableName}".
            </p>
            <p class="text-xs text-gremius-subtle mt-2">
              Total columns received: {columns.length}<br>
              Editable columns: {editableColumns.length}
            </p>
          </div>
        {/if}
        {#each editableColumns as col}
          {@const inputType = inferInputType(col)}
          <div>
            <label class="block text-sm font-medium text-gremius-text mb-1.5">
              {formatLabel(col.name)}
              {#if !col.nullable}
                <span class="text-gremius-pink ml-0.5">*</span>
              {/if}
            </label>

            {#if inputType === "relation"}
              <!-- FK Dropdown -->
              <select
                class="input w-full"
                bind:value={formData[col.name]}
              >
                <option value="">— Select —</option>
                {#if relationOptions[col.name]}
                  {#each relationOptions[col.name] as opt}
                    <option value={opt.value}>{opt.label}</option>
                  {/each}
                {/if}
              </select>
              <p class="text-[10px] text-gremius-subtle mt-1">
                Related to: {getRelatedTable(col.name) || "unknown"}
              </p>

            {:else if inputType === "checkbox"}
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  bind:checked={formData[col.name]}
                  class="w-4 h-4 rounded border-gremius-border accent-gremius-cyan"
                />
                <span class="text-sm text-gremius-text-dim">Enabled</span>
              </label>

            {:else if inputType === "textarea"}
              <textarea
                class="input w-full min-h-[80px] resize-y"
                bind:value={formData[col.name]}
                placeholder={formatLabel(col.name)}
                rows="3"
              ></textarea>

            {:else if inputType === "json"}
              <textarea
                class="input w-full font-mono text-xs min-h-[80px] resize-y"
                bind:value={formData[col.name]}
                placeholder={'{"key": "value"}'}
                rows="3"
              ></textarea>

            {:else if inputType === "number"}
              <input
                type="number"
                class="input w-full"
                bind:value={formData[col.name]}
                placeholder={formatLabel(col.name)}
              />

            {:else if inputType === "date" || inputType === "datetime-local"}
              <input
                type={inputType}
                class="input w-full"
                bind:value={formData[col.name]}
              />

            {:else}
              <input
                type={inputType}
                class="input w-full"
                bind:value={formData[col.name]}
                placeholder={formatLabel(col.name)}
              />
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-gremius-border shrink-0">
      <button
        class="btn-secondary-sm"
        onclick={() => onclose?.()}
        disabled={saving}
      >
        Cancel
      </button>
      <button
        class="btn-primary flex items-center gap-2"
        onclick={handleSubmit}
        disabled={saving}
      >
        {#if saving}
          <Loader2 class="w-4 h-4 animate-spin" />
          Saving...
        {:else}
          <Save class="w-4 h-4" />
          {isEdit ? "Update" : "Create"}
        {/if}
      </button>
    </div>
  </div>
</div>
