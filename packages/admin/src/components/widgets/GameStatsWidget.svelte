<script lang="ts">
  import { t, localeFormato } from "$lib/i18n";
  /**
   * GameStatsWidget
   *
   * Widget de EJEMPLO para el registro de widgets (slot `dashboard:stats`):
   * enseña cómo recibir props y usar componentes dinámicos. Las cifras son
   * inventadas y fijas, y el widget lo dice en pantalla: no lo registra el
   * panel por defecto (ver lib/registerDefaultWidgets.ts).
   */
  import { Gamepad2, TrendingUp, Users, Star } from "lucide-svelte";

  interface Props {
    title?: string;
    showChart?: boolean;
  }

  const { title = t("common.gameStatisticsExample"), showChart = true }: Props = $props();

  // Datos inventados: el widget es una demostración
  const stats = [
    { label: t("gameStatsWidget.totalGames"), value: 156, icon: Gamepad2, color: "text-kitsuden-accent" },
    { label: t("gameStatsWidget.activePlayers"), value: "12.5K", icon: Users, color: "text-kitsuden-green" },
    { label: t("gameStatsWidget.avgRating"), value: "4.8", icon: Star, color: "text-kitsuden-amber" },
  ];

  const recentGames = [
    { name: "Cyberpunk 2077", players: 5420, trend: "up" },
    { name: "Elden Ring", players: 4890, trend: "up" },
    { name: "Baldur's Gate 3", players: 3210, trend: "down" },
  ];
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h3 class="font-semibold text-kitsuden-text flex items-center gap-2">
      <Gamepad2 class="w-4 h-4 text-kitsuden-accent" />
      {title}
    </h3>
    <span class="badge-cyan text-[10px]">{t("gameStatsWidget.sampleData")}</span>
  </div>

  <!-- Stats Grid -->
  <div class="grid grid-cols-3 gap-3">
    {#each stats as stat}
      {@const Icon = stat.icon}
      <div class="text-center p-3 bg-kitsuden-bg rounded-lg">
        <Icon class="w-4 h-4 {stat.color} mx-auto mb-1" />
        <p class="text-lg font-bold text-kitsuden-text">{stat.value}</p>
        <p class="text-[10px] text-kitsuden-subtle">{stat.label}</p>
      </div>
    {/each}
  </div>

  <!-- Recent Games List -->
  <div class="space-y-2">
    <p class="text-xs text-kitsuden-subtle uppercase tracking-wider">{t("gameStatsWidget.popularNow")}</p>
    {#each recentGames as game}
      <div
        class="flex items-center justify-between p-2 hover:bg-kitsuden-bg rounded-lg transition-colors"
      >
        <span class="text-sm text-kitsuden-text">{game.name}</span>
        <div class="flex items-center gap-2">
          <span class="text-xs text-kitsuden-subtle">{game.players.toLocaleString(localeFormato())} {t("gameStatsWidget.players")}</span>
          {#if game.trend === "up"}
            <TrendingUp class="w-3 h-3 text-kitsuden-green" />
          {:else}
            <TrendingUp class="w-3 h-3 text-kitsuden-accent-2 rotate-180" />
          {/if}
        </div>
      </div>
    {/each}
  </div>

  {#if showChart}
    <div class="pt-2 border-t border-kitsuden-border">
      <div class="flex items-center justify-between text-xs text-kitsuden-subtle">
        <span>{t("gameStatsWidget.weeklyGrowth")}</span>
        <span class="text-kitsuden-green">+23.5%</span>
      </div>
      <div class="mt-2 h-8 flex items-end gap-1">
        {#each [40, 65, 45, 80, 55, 90, 70] as height}
          <div class="flex-1 bg-kitsuden-accent/20 rounded-t" style="height: {height}%"></div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .badge-cyan {
    @apply inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider;
    background-color: rgba(168, 85, 247, 0.1);
    color: #a855f7;
    border: 1px solid rgba(168, 85, 247, 0.2);
  }
</style>
