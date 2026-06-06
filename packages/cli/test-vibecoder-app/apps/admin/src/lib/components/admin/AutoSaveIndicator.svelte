<script lang="ts">
  import { autosaveStore } from "$lib/states/autosave.svelte";
  import { Save, Check, AlertCircle, ChevronDown } from "lucide-svelte";

  import VersionHistory from "./VersionHistory.svelte";

  let showDropdown = $state(false);

  function toggleDropdown() {
    showDropdown = !showDropdown;
  }

  function closeDropdown() {
    showDropdown = false;
  }
</script>

<div class="relative">
  <button
    class="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors
      {autosaveStore.status === 'saving' ? 'text-amber-400 bg-amber-400/10' : 
       autosaveStore.status === 'unsaved' ? 'text-gremius-pink bg-gremius-pink/10' : 
       'text-emerald-400 bg-emerald-400/10'}"
    onclick={toggleDropdown}
    aria-haspopup="true"
    aria-expanded={showDropdown}
  >
    {#if autosaveStore.status === 'saving'}
      <Save class="w-3.5 h-3.5 animate-pulse" />
      <span>Saving...</span>
    {:else if autosaveStore.status === 'unsaved'}
      <AlertCircle class="w-3.5 h-3.5" />
      <span>Unsaved changes</span>
    {:else}
      <Check class="w-3.5 h-3.5" />
      <span>Saved</span>
    {/if}
    <ChevronDown class="w-3 h-3 ml-0.5 transition-transform {showDropdown ? 'rotate-180' : ''}" />
  </button>

  {#if showDropdown}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-40" onclick={closeDropdown}></div>
    <div class="absolute right-0 top-full mt-2 z-50 w-72 bg-gremius-card border border-gremius-border rounded-lg shadow-xl p-3">
      <VersionHistory onRestore={closeDropdown} />
    </div>
  {/if}
</div>
