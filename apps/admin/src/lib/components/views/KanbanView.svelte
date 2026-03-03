<script lang="ts">
  import { Trash2 } from "lucide-svelte";
  import type { DatasetDefinition, DatasetEntry } from "../../../types/datasets";

  // Props
  interface Props {
    definition: DatasetDefinition;
    entries: DatasetEntry[];
    onEdit?: (entry: DatasetEntry) => void;
    onDelete?: (entry: DatasetEntry) => void;
    onInlineUpdate?: (entryId: string, fieldKey: string, newValue: string) => void;
  }

  let { definition, entries, onEdit, onDelete, onInlineUpdate }: Props = $props();

  // 1. Determine Grouping Field (First "select" field)
  const groupField = $derived(definition.fields.find(f => f.type === 'select'));

  // 2. Group Entries
  const groupedEntries = $derived(() => {
    if (!groupField) return [];
    
    const optionsRaw = groupField.options;
    let options: string[] = [];

    if (Array.isArray(optionsRaw)) {
      options = optionsRaw.map(String);
    } else if (typeof optionsRaw === "string") {
      options = optionsRaw.split(',').map((o: string) => o.trim());
    }
    
    return options.map((opt: string) => ({
      key: opt,
      label: opt,
      entries: entries.filter(e => e.data[groupField.key] === opt)
    }));
  });

  // 3. Find ungrouped entries
  const ungroupedEntries = $derived(() => {
    if (!groupField) return entries;
    
    const optionsRaw = groupField.options;
    let options: string[] = [];
    if (Array.isArray(optionsRaw)) {
      options = optionsRaw.map(String);
    } else if (typeof optionsRaw === "string") {
      options = optionsRaw.split(',').map((o: string) => o.trim());
    }

    return entries.filter(e => !options.includes(e.data[groupField.key]));
  });

  // 4. Preview fields (First 3 non-group fields)
  const previewFields = $derived(() => {
    return definition.fields
      .filter(f => f.key !== groupField?.key && (f.type as string) !== 'rich-text')
      .slice(0, 3);
  });

  // 5. Drag & Drop Logic
  function onDragStart(event: DragEvent, entry: DatasetEntry) {
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", entry.id);
    }
  }

  function onDrop(event: DragEvent, newStatus: string) {
    const entryId = event.dataTransfer?.getData("text/plain");
    if (entryId && groupField) {
      onInlineUpdate?.(entryId, groupField.key, newStatus);
    }
  }
</script>

<div class="h-full flex gap-4 overflow-x-auto pb-4">
  <!-- Grouped Columns -->
  {#each groupedEntries() as group (group.key)}
    <div class="w-72 shrink-0 flex flex-col max-h-full">
      <!-- Header -->
      <div class="flex items-center justify-between mb-3 px-1">
        <div class="flex items-center gap-2">
          <h3 class="font-semibold text-gremius-text text-sm uppercase tracking-wide">
            {group.label}
          </h3>
          <span class="bg-gremius-border text-[10px] px-1.5 rounded-full text-gremius-text-dim">
            {group.entries.length}
          </span>
        </div>
      </div>

      <!-- Column (Drop Zone) -->
      <div
        class="flex-1 bg-gremius-card/30 rounded-xl p-2 overflow-y-auto space-y-2 border border-transparent transition-colors"
        ondragover={(e) => e.preventDefault()}
        ondrop={(e) => onDrop(e, group.key)}
        role="region"
        aria-label="{group.label} column"
      >
        <!-- Cards -->
        {#each group.entries as entry (entry.id)}
          <div
            class="bg-gremius-card border border-gremius-border rounded-lg p-3 shadow-sm hover:border-gremius-cyan/50 cursor-grab active:cursor-grabbing group transition-all"
            draggable="true"
            ondragstart={(e) => onDragStart(e, entry)}
            onclick={() => onEdit?.(entry)}
            role="button"
            tabindex="0"
            onkeydown={(e) => e.key === 'Enter' && onEdit?.(entry)}
          >
            <!-- Thumbnail if available -->
            {#if (entry as any).thumbnailId}
              <div class="mb-2 rounded overflow-hidden h-24 bg-black/20">
                <div class="w-full h-full flex items-center justify-center text-xs text-gremius-text-dim">
                  Image
                </div>
              </div>
            {/if}

            <h4 class="font-medium text-gremius-text text-sm mb-1 line-clamp-2">{entry.data.title || 'Untitled'}</h4>
            
            <!-- Fields Preview -->
            <div class="space-y-1">
              {#each previewFields() as field (field.key)}
                <div class="text-[10px] text-gremius-text-dim flex justify-between">
                  <span class="opacity-70">{field.label}:</span>
                  <span class="truncate ml-2 max-w-[120px]">{entry.data[field.key]}</span>
                </div>
              {/each}
            </div>

            <!-- Actions on Hover -->
            <div class="mt-2 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
              <button class="p-1 hover:text-gremius-danger" onclick={(e) => { e.stopPropagation(); onDelete?.(entry); }}>
                <Trash2 class="w-3 h-3" />
              </button>
            </div>
          </div>
        {/each}

        <!-- Empty state for column -->
        {#if group.entries.length === 0}
          <div class="h-24 border-2 border-dashed border-gremius-border/50 rounded-lg flex items-center justify-center text-xs text-gremius-text-dim/50">
            Empty
          </div>
        {/if}
      </div>
    </div>
  {/each}

  <!-- Unmatched / No Group -->
  {#if ungroupedEntries().length > 0}
    <div class="w-72 shrink-0 flex flex-col">
      <div class="flex items-center gap-2 mb-3 px-1">
        <h3 class="font-semibold text-gremius-text-dim text-sm uppercase tracking-wide">Unassigned</h3>
        <span class="bg-gremius-border text-[10px] px-1.5 rounded-full text-gremius-text-dim">{ungroupedEntries().length}</span>
      </div>
      <div class="flex-1 bg-gremius-card/10 rounded-xl p-2 overflow-y-auto space-y-2 border border-dashed border-gremius-border/30">
        {#each ungroupedEntries() as entry (entry.id)}
          <div
            class="bg-gremius-card/50 border border-gremius-border/50 rounded-lg p-3 opacity-70 hover:opacity-100"
            draggable="true"
            ondragstart={(e) => onDragStart(e, entry)}
          >
            <h4 class="font-medium text-sm">{entry.data.title || 'Untitled'}</h4>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
