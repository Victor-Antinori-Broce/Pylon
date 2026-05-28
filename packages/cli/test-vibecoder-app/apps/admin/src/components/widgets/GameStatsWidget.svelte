<script lang="ts">
  /**
   * GameStatsWidget
   * 
   * Widget de ejemplo que muestra estadísticas de juegos.
   * Demuestra cómo recibir props y usar componentes dinámicos.
   */
  import { Gamepad2, TrendingUp, Users, Star } from "lucide-svelte";
  
  interface Props {
    title?: string;
    showChart?: boolean;
  }
  
  let { title = "Game Statistics", showChart = true }: Props = $props();
  
  // Datos de ejemplo
  const stats = [
    { label: "Total Games", value: 156, icon: Gamepad2, color: "text-gremius-cyan" },
    { label: "Active Players", value: "12.5K", icon: Users, color: "text-gremius-green" },
    { label: "Avg Rating", value: "4.8", icon: Star, color: "text-gremius-amber" },
  ];
  
  const recentGames = [
    { name: "Cyberpunk 2077", players: 5420, trend: "up" },
    { name: "Elden Ring", players: 4890, trend: "up" },
    { name: "Baldur's Gate 3", players: 3210, trend: "down" },
  ];
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h3 class="font-semibold text-gremius-text flex items-center gap-2">
      <Gamepad2 class="w-4 h-4 text-gremius-cyan" />
      {title}
    </h3>
    <span class="badge-cyan text-[10px]">GAMES MODULE</span>
  </div>
  
  <!-- Stats Grid -->
  <div class="grid grid-cols-3 gap-3">
    {#each stats as stat}
      {@const Icon = stat.icon}
      <div class="text-center p-3 bg-gremius-bg rounded-lg">
        <Icon class="w-4 h-4 {stat.color} mx-auto mb-1" />
        <p class="text-lg font-bold text-gremius-text">{stat.value}</p>
        <p class="text-[10px] text-gremius-subtle">{stat.label}</p>
      </div>
    {/each}
  </div>
  
  <!-- Recent Games List -->
  <div class="space-y-2">
    <p class="text-xs text-gremius-subtle uppercase tracking-wider">Popular Now</p>
    {#each recentGames as game}
      <div class="flex items-center justify-between p-2 hover:bg-gremius-bg rounded-lg transition-colors">
        <span class="text-sm text-gremius-text">{game.name}</span>
        <div class="flex items-center gap-2">
          <span class="text-xs text-gremius-subtle">{game.players.toLocaleString()} players</span>
          {#if game.trend === "up"}
            <TrendingUp class="w-3 h-3 text-gremius-green" />
          {:else}
            <TrendingUp class="w-3 h-3 text-gremius-pink rotate-180" />
          {/if}
        </div>
      </div>
    {/each}
  </div>
  
  {#if showChart}
    <div class="pt-2 border-t border-gremius-border">
      <div class="flex items-center justify-between text-xs text-gremius-subtle">
        <span>Weekly Growth</span>
        <span class="text-gremius-green">+23.5%</span>
      </div>
      <div class="mt-2 h-8 flex items-end gap-1">
        {#each [40, 65, 45, 80, 55, 90, 70] as height}
          <div 
            class="flex-1 bg-gremius-cyan/20 rounded-t"
            style="height: {height}%"
          ></div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .badge-cyan {
    @apply inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider;
    background-color: rgba(0, 229, 255, 0.1);
    color: #00e5ff;
    border: 1px solid rgba(0, 229, 255, 0.2);
  }
</style>
