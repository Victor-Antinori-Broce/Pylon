<!--
  GameCard.vue — Interactive game card for horizontal collection sections.
  Fires hover events to the interaction store for background changes.
-->
<template>
  <a
    :href="`/games/${game.slug}`"
    class="game-card group"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
  >
    <!-- Cover image -->
    <div class="card-image">
      <img
        v-if="coverUrl"
        :src="coverUrl"
        :alt="game.title"
        loading="lazy"
        class="card-img"
      />
      <div v-else class="card-placeholder">
        <span>🎮</span>
      </div>

      <!-- Score badge -->
      <div v-if="game.metacriticScore" :class="['score-badge', scoreClass]">
        {{ game.metacriticScore }}
      </div>

      <!-- Bottom gradient -->
      <div class="card-gradient" />
    </div>

    <!-- Info -->
    <div class="card-info">
      <h3 class="card-title">{{ game.title }}</h3>
      <p class="card-developer">{{ game.developer || 'Unknown Studio' }}</p>

      <!-- Platform chips -->
      <div v-if="platformNames.length" class="card-platforms">
        <span v-for="p in platformNames.slice(0, 3)" :key="p" class="platform-chip">{{ p }}</span>
      </div>
    </div>
  </a>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { setActiveBackground } from "../../stores/interaction";

const props = defineProps<{
  game: {
    id: string;
    title: string;
    slug: string;
    developer?: string;
    metacriticScore?: number | null;
    coverArt?: { url: string } | null;
    platforms?: any[];
    tags?: any[];
  };
}>();

const coverUrl = computed(() => props.game.coverArt?.url || null);

const scoreClass = computed(() => {
  const s = props.game.metacriticScore;
  if (!s) return "";
  return s >= 85 ? "score-high" : s >= 70 ? "score-mid" : "score-low";
});

const platformNames = computed(() => {
  const p = props.game.platforms || [];
  return p.map((plat: any) => (typeof plat === "string" ? plat : plat.shortName || plat.name));
});

function onEnter() {
  if (coverUrl.value) {
    setActiveBackground(coverUrl.value);
  }
}

function onLeave() {
  setActiveBackground(null);
}
</script>

<style scoped>
.game-card {
  flex: 0 0 200px;
  scroll-snap-align: start;
  border-radius: 0.75rem;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
  text-decoration: none;
  display: block;
}

.game-card:hover {
  border-color: rgba(0, 229, 255, 0.25);
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
}

.card-image {
  position: relative;
  aspect-ratio: 3 / 4;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.02);
}

.card-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s ease;
}

.game-card:hover .card-img {
  transform: scale(1.08);
}

.card-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(255,255,255,0.02), rgba(0,229,255,0.04));
  font-size: 2rem;
  opacity: 0.3;
}

.score-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.65rem;
  font-weight: 700;
  backdrop-filter: blur(8px);
}
.score-high {
  background: rgba(0, 200, 83, 0.2);
  color: #00E676;
  border: 1px solid rgba(0, 200, 83, 0.3);
}
.score-mid {
  background: rgba(255, 214, 0, 0.2);
  color: #FFD600;
  border: 1px solid rgba(255, 214, 0, 0.3);
}
.score-low {
  background: rgba(255, 23, 68, 0.2);
  color: #FF1744;
  border: 1px solid rgba(255, 23, 68, 0.3);
}

.card-gradient {
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  height: 60%;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent);
  pointer-events: none;
}

.card-info {
  padding: 0.75rem;
}

.card-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: #fff;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  transition: color 0.2s;
}
.game-card:hover .card-title {
  color: #00E5FF;
}

.card-developer {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 2px;
}

.card-platforms {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.platform-chip {
  font-size: 0.55rem;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.45);
}
</style>
