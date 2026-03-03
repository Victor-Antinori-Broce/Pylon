<script lang="ts">
  import { CheckCircle, PowerOff, Loader2, Lock, Sparkles } from "lucide-svelte";
  import { slide } from "svelte/transition";
  
  interface ModuleData {
    id: string;
    name: string;
    description?: string;
    icon?: string;
    version?: string;
    category: "core" | "optional" | "theme";
    enabled: boolean;
    themeId?: string;
    tables?: string[];
    dependsOn?: string[];
    color?: string;
  }
  
  interface Props {
    module: ModuleData;
    toggling?: boolean;
    checking?: boolean;
    isDepEnabled?: (key: string) => boolean;
    onToggle?: () => void;
  }
  
  let { module, toggling = false, checking = false, isDepEnabled = () => false, onToggle }: Props = $props();
  
  let isThemeModule = $derived(module.category === "theme");
  
  let stripeClass = $derived(() => {
    if (isThemeModule && module.enabled) return "bg-gradient-to-r from-gremius-pink/60 via-gremius-purple/30 to-transparent";
    if (module.enabled) return "bg-gradient-to-r from-green-500/60 via-green-400/30 to-transparent";
    return "bg-gradient-to-r from-gremius-subtle/20 to-transparent";
  });
  
  let iconBg = $derived(module.enabled ? (module.color || "#00E5FF") + "12" : "rgba(63,63,70,0.3)");
  let iconBorder = $derived(module.enabled ? (module.color || "#00E5FF") + "25" : "rgba(63,63,70,0.5)");
</script>

<div class="card p-5 relative overflow-hidden transition-all duration-300 {module.enabled ? 'ring-1 ring-gremius-green/30' : 'opacity-75'} {isThemeModule ? 'ring-1 ring-gremius-pink/20' : ''}">
  <div class="absolute top-0 left-0 right-0 h-0.5 transition-all duration-500 {stripeClass()}"></div>

  <div class="flex items-start gap-3">
    <div class="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 transition-all duration-300 {module.enabled ? 'scale-100' : 'scale-95 grayscale'}" style="background: {iconBg}; border: 1px solid {iconBorder}">
      {module.icon || "📦"}
    </div>

    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 flex-wrap">
        <p class="font-semibold text-gremius-text text-sm">{module.name}</p>
        {#if module.category === "core"}
          <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full {module.enabled ? 'bg-gremius-cyan/10 text-gremius-cyan border border-gremius-cyan/20' : 'bg-gremius-border/50 text-gremius-subtle border border-gremius-border'}">CORE</span>
        {/if}
        {#if isThemeModule}
          <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gremius-pink/10 text-gremius-pink border border-gremius-pink/20 flex items-center gap-1">
            <Sparkles class="w-2.5 h-2.5" /> THEME
          </span>
        {/if}
        {#if module.version}
          <span class="text-[9px] px-1.5 py-0.5 rounded bg-gremius-subtle/20 text-gremius-text-dim border border-gremius-border">v{module.version}</span>
        {/if}
      </div>

      <p class="text-xs text-gremius-subtle mt-1 line-clamp-2 leading-relaxed">{module.description}</p>

      {#if module.dependsOn?.length}
        <div class="mt-2 flex items-center gap-1 flex-wrap">
          <span class="text-[10px] text-gremius-subtle">Requiere:</span>
          {#each module.dependsOn as dep}
            <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gremius-bg border border-gremius-border {isDepEnabled(dep) ? 'text-gremius-green' : 'text-gremius-pink'}">{dep}</span>
          {/each}
        </div>
      {/if}
    </div>

    <div class="shrink-0 mt-0.5">
      {#if isThemeModule}
        <button class="w-11 h-6 rounded-full bg-gremius-pink/20 flex items-center justify-center cursor-not-allowed" title="Controlled by theme activation" onclick={onToggle}>
          <Lock class="w-3 h-3 text-gremius-pink" />
        </button>
      {:else}
        <button onclick={onToggle} disabled={toggling || checking} class="relative w-11 h-6 rounded-full transition-colors duration-300 {module.enabled ? 'bg-gremius-green/30' : 'bg-gremius-border'} {(toggling || checking) ? 'opacity-50 cursor-wait' : 'cursor-pointer'}" title={module.enabled ? "Click to disable" : "Click to enable"}>
          {#if checking}
            <span class="absolute inset-0 flex items-center justify-center"><Loader2 class="w-3.5 h-3.5 text-gremius-amber animate-spin" /></span>
          {:else}
            <span class="absolute top-0.5 w-5 h-5 rounded-full shadow-lg transition-all duration-300 {module.enabled ? 'translate-x-[1.35rem] bg-gremius-green shadow-gremius-green/30' : 'translate-x-0.5 bg-gremius-subtle'}"></span>
          {/if}
        </button>
      {/if}
    </div>
  </div>

  {#if module.enabled && !isThemeModule}
    <div transition:slide={{ duration: 200 }} class="mt-3 pt-3 border-t border-gremius-border/50 flex items-center justify-between">
      <span class="flex items-center gap-1.5 text-xs text-gremius-green"><CheckCircle class="w-3.5 h-3.5" /> Activo</span>
      {#if module.tables?.length}<span class="text-[10px] text-gremius-subtle font-mono">{module.tables.length} tabla{module.tables.length !== 1 ? "s" : ""}</span>{/if}
    </div>
  {/if}

  {#if isThemeModule && module.enabled}
    <div transition:slide={{ duration: 200 }} class="mt-3 pt-3 border-t border-gremius-pink/20 flex items-center justify-between">
      <span class="flex items-center gap-1.5 text-xs text-gremius-pink"><Sparkles class="w-3.5 h-3.5" /> Enabled by Theme</span>
      {#if module.themeId}<span class="text-[10px] text-gremius-subtle font-mono">{module.themeId}</span>{/if}
    </div>
  {/if}

  {#if !module.enabled && !isThemeModule}
    <div transition:slide={{ duration: 200 }} class="mt-3 pt-3 border-t border-gremius-border/50 flex items-center gap-1.5 text-xs text-gremius-subtle">
      <PowerOff class="w-3.5 h-3.5" /> Desactivado — datos ocultos, no eliminados
    </div>
  {/if}
</div>

<style>
  .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
</style>
