<script lang="ts">
  import { autosaveStore } from "$lib/states/autosave.svelte";
  import { History, Trash2, RotateCcw } from "lucide-svelte";

  interface Props {
    onRestore?: () => void;
  }

  let { onRestore }: Props = $props();

  function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }

  function handleRestore(index: number) {
    autosaveStore.restoreVersion(index);
    onRestore?.();
  }

  function handleDeleteAll() {
    if (confirm('Delete all autosaved versions for this entry?')) {
      autosaveStore.deleteAllVersions();
    }
  }
</script>

<div>
  <div class="flex items-center justify-between mb-2 pb-2 border-b border-gremius-border">
    <h3 class="text-sm font-semibold text-gremius-text flex items-center gap-2">
      <History class="w-4 h-4 text-gremius-cyan" />
      Version History
    </h3>
    {#if autosaveStore.versions.length > 0}
      <button
        class="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
        onclick={handleDeleteAll}
      >
        <Trash2 class="w-3 h-3" />
        Delete all
      </button>
    {/if}
  </div>

  {#if autosaveStore.versions.length === 0}
    <p class="text-sm text-gremius-text-dim text-center py-4">
      No autosaved versions yet.
    </p>
  {:else}
    <div class="space-y-2 max-h-64 overflow-y-auto pr-1">
      {#each autosaveStore.versions as version, i}
        <div class="flex items-center justify-between gap-2 p-2 rounded-lg bg-gremius-bg border border-gremius-border hover:border-gremius-cyan/30 transition-colors">
          <div class="min-w-0 flex-1">
            <p class="text-xs font-medium text-gremius-text">
              Version {autosaveStore.versions.length - i}
            </p>
            <p class="text-[10px] text-gremius-text-dim truncate">
              {formatTime(version.timestamp)}
            </p>
          </div>
          <button
            class="px-2 py-1 text-xs font-medium rounded-md bg-gremius-cyan/10 text-gremius-cyan hover:bg-gremius-cyan/20 transition-colors flex items-center gap-1 shrink-0"
            onclick={() => handleRestore(i)}
          >
            <RotateCcw class="w-3 h-3" />
            Restore
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>
