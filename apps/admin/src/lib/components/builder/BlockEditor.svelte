<script lang="ts">
  /**
   * BlockEditor.svelte — Edit form for a single block's data
   */
  import { X, Trash2, Check, Sparkles, FileText, Images, Map, Tv, Code2, AlertTriangle, Minus, Clapperboard, SlidersHorizontal, Columns, Table2 } from "lucide-svelte";
  import { getBlockDef, type PageBlock } from "../../../types/blocks";

  interface Props {
    block: PageBlock;
    onUpdate?: (block: PageBlock) => void;
    onDelete?: () => void;
    onClose?: () => void;
  }
  
  let { block, onUpdate, onDelete, onClose }: Props = $props();

  const iconMap: Record<string, typeof Sparkles> = {
    Sparkles, FileText, Images, Map, Tv, Code2, AlertTriangle, Minus,
    Clapperboard, SlidersHorizontal, Columns, Table2,
  };

  let blockDef = $derived(getBlockDef(block.type));
  let jsonErrors: Record<string, string> = $state({});

  function updateField(key: string, value: any) {
    const updated = { ...block, data: { ...block.data, [key]: value } };
    onUpdate?.(updated);
  }

  function updateJsonField(key: string, raw: string) {
    try {
      const parsed = JSON.parse(raw);
      updateField(key, parsed);
      delete jsonErrors[key];
    } catch {
      jsonErrors[key] = "Invalid JSON";
    }
  }

  function jsonStringify(val: any): string {
    if (val === undefined || val === null) return "";
    if (typeof val === "string") return val;
    return JSON.stringify(val, null, 2);
  }

  function getIcon(iconName: string): typeof Sparkles {
    return iconMap[iconName] || FileText;
  }
</script>

<div class="h-full flex flex-col">
  <!-- Header -->
  <div class="p-4 border-b border-gremius-border shrink-0">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        {#if blockDef}
          {@const BI = getIcon(blockDef.icon)}
          <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: {blockDef.color}15; border: 1px solid {blockDef.color}25">
            <BI class="w-4 h-4" style="color: {blockDef.color}" />
          </div>
        {/if}
        <div>
          <h3 class="text-sm font-semibold text-gremius-text">{blockDef?.label || "Block"}</h3>
          <p class="text-[10px] text-gremius-subtle font-mono">{block.type}</p>
        </div>
      </div>
      <button onclick={onClose} class="btn-icon p-1"><X class="w-4 h-4" /></button>
    </div>
  </div>

  <!-- Fields -->
  <div class="flex-1 overflow-y-auto p-4 space-y-4">
    {#each blockDef?.fields || [] as field}
      <div class="space-y-1.5">
        <!-- Text -->
        {#if field.type === "text"}
          <label class="label block">{field.label} {#if field.required}<span class="text-gremius-pink">*</span>{/if}</label>
          <input value={block.data[field.key] || ""} oninput={(e) => updateField(field.key, e.currentTarget.value)} type="text" placeholder={field.placeholder} class="input" />
        {/if}

        <!-- Textarea -->
        {#if field.type === "textarea"}
          <label class="label block">{field.label} {#if field.required}<span class="text-gremius-pink">*</span>{/if}</label>
          <textarea value={block.data[field.key] || ""} oninput={(e) => updateField(field.key, e.currentTarget.value)} placeholder={field.placeholder} rows="4" class="textarea"></textarea>
        {/if}

        <!-- URL / Image -->
        {#if field.type === "url" || field.type === "image"}
          <label class="label block">{field.label} {#if field.required}<span class="text-gremius-pink">*</span>{/if}</label>
          <input value={block.data[field.key] || ""} oninput={(e) => updateField(field.key, e.currentTarget.value)} type="url" placeholder={field.placeholder || "https://"} class="input" />
          {#if field.type === "image" && block.data[field.key]}
            <div class="mt-2 rounded-lg border border-gremius-border overflow-hidden">
              <img src={block.data[field.key]} class="w-full h-32 object-cover" alt="" />
            </div>
          {/if}
        {/if}

        <!-- Select -->
        {#if field.type === "select"}
          <label class="label block">{field.label} {#if field.required}<span class="text-gremius-pink">*</span>{/if}</label>
          <select value={block.data[field.key] || ""} onchange={(e) => updateField(field.key, e.currentTarget.value)} class="select">
            {#each field.options || [] as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
        {/if}

        <!-- Number -->
        {#if field.type === "number"}
          <label class="label block">{field.label} {#if field.required}<span class="text-gremius-pink">*</span>{/if}</label>
          <input value={block.data[field.key] || ""} oninput={(e) => updateField(field.key, Number(e.currentTarget.value))} type="number" class="input" />
        {/if}

        <!-- Boolean -->
        {#if field.type === "boolean"}
          <div class="flex items-center justify-between py-1">
            <label class="text-sm text-gremius-text">{field.label}</label>
            <button type="button" onclick={() => updateField(field.key, !block.data[field.key])} class="relative w-10 h-6 rounded-full transition-colors {block.data[field.key] ? 'bg-gremius-cyan' : 'bg-gremius-border'}">
              <span class="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform {block.data[field.key] ? 'translate-x-[18px]' : 'translate-x-[2px]'}"></span>
            </button>
          </div>
        {/if}

        <!-- JSON -->
        {#if field.type === "json"}
          <label class="label block">{field.label} {#if field.required}<span class="text-gremius-pink">*</span>{/if}</label>
          <textarea value={jsonStringify(block.data[field.key])} oninput={(e) => updateJsonField(field.key, e.currentTarget.value)} rows="5" placeholder={field.helpText} class="textarea font-mono text-xs"></textarea>
          {#if jsonErrors[field.key]}<p class="text-[10px] text-gremius-pink">{jsonErrors[field.key]}</p>{/if}
        {/if}

        <!-- Help text -->
        {#if field.helpText && field.type !== "json"}
          <p class="text-[10px] text-gremius-subtle">{field.helpText}</p>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Footer -->
  <div class="p-4 border-t border-gremius-border shrink-0 flex items-center justify-between">
    <button onclick={onDelete} class="btn-ghost btn-sm text-gremius-pink hover:bg-gremius-pink/10"><Trash2 class="w-3.5 h-3.5" /> Remove</button>
    <button onclick={onClose} class="btn-primary btn-sm"><Check class="w-3.5 h-3.5" /> Done</button>
  </div>
</div>
