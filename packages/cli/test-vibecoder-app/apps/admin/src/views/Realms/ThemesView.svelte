<script lang="ts">
  import { Palette, Check, Download, Trash2 } from "lucide-svelte";
  import { currentTheme, setTheme, themes } from "$lib/theme.svelte";

  function installTheme(id: string) {
    // Install logic would go here
  }

  function uninstallTheme(id: string) {
    // Uninstall logic would go here
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-xl font-bold text-gremius-text">Themes</h2>
      <p class="text-sm text-gremius-text-dim mt-0.5">Customize the appearance</p>
    </div>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {#each themes as theme}
      <div class="card p-4 relative group" class:border-gremius-cyan={$currentTheme === theme.id}>
        {#if $currentTheme === theme.id}
          <div class="absolute top-2 right-2">
            <span class="px-2 py-1 text-[10px] font-medium bg-gremius-cyan/10 text-gremius-cyan rounded-full">
              Active
            </span>
          </div>
        {/if}
        
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background: {theme.preview}">
            <Palette class="w-5 h-5 text-gremius-text" />
          </div>
          <div>
            <h3 class="font-semibold text-gremius-text">{theme.name}</h3>
            <p class="text-xs text-gremius-subtle">{theme.description}</p>
          </div>
        </div>

        <div class="flex items-center gap-2 mt-4">
          {#if $currentTheme === theme.id}
            <button class="btn-secondary flex-1" disabled>
              <Check class="w-4 h-4" /> Active
            </button>
          {:else}
            <button class="btn-primary flex-1" onclick={() => setTheme(theme.id)}>
              Activate
            </button>
          {/if}
          
          {#if theme.id !== "default"}
            <button 
              class="p-2 rounded-lg text-gremius-text-dim hover:bg-gremius-pink/10 hover:text-gremius-pink transition-colors"
              onclick={() => uninstallTheme(theme.id)}
            >
              <Trash2 class="w-4 h-4" />
            </button>
          {/if}
        </div>
      </div>
    {/each}
    
    <!-- Install new theme card -->
    <button class="card p-4 border-dashed border-2 border-gremius-border hover:border-gremius-cyan/50 transition-colors flex flex-col items-center justify-center min-h-[160px] gap-3">
      <div class="w-10 h-10 rounded-lg bg-gremius-surface flex items-center justify-center">
        <Download class="w-5 h-5 text-gremius-cyan" />
      </div>
      <div class="text-center">
        <h3 class="font-semibold text-gremius-text">Install Theme</h3>
        <p class="text-xs text-gremius-subtle mt-0.5">Import from file or URL</p>
      </div>
    </button>
  </div>
</div>
