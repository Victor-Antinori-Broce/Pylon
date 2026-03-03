<!--
  DynamicCarousel.vue — Client-side hydrated island
  Fetches games or streamers from the API and renders a CSS scroll-snap carousel.
-->
<template>
  <div class="dynamic-carousel">
    <!-- Loading skeleton -->
    <div v-if="loading" class="carousel-track">
      <div v-for="n in 4" :key="n" class="carousel-card skeleton">
        <div class="skeleton-img" />
        <div class="skeleton-text" />
        <div class="skeleton-text short" />
      </div>
    </div>

    <!-- Carousel -->
    <div v-else-if="items.length > 0" class="carousel-wrapper" ref="trackRef">
      <div class="carousel-track">
        <div
          v-for="item in items"
          :key="item.id"
          class="carousel-card"
        >
          <div class="card-image">
            <img
              v-if="item.imageUrl"
              :src="item.imageUrl"
              :alt="item.title"
              loading="lazy"
            />
            <div v-else class="card-image-placeholder">{{ source === 'games' ? '🎮' : '📺' }}</div>
            <span v-if="item.badge" class="card-badge" :class="item.badgeClass">{{ item.badge }}</span>
          </div>
          <div class="card-body">
            <h3 class="card-title">{{ item.title }}</h3>
            <p v-if="item.subtitle" class="card-subtitle">{{ item.subtitle }}</p>
          </div>
        </div>
      </div>

      <!-- Nav arrows -->
      <button class="carousel-nav prev" @click="scroll(-1)" aria-label="Previous">‹</button>
      <button class="carousel-nav next" @click="scroll(1)" aria-label="Next">›</button>
    </div>

    <!-- Empty -->
    <div v-else class="carousel-empty">
      <p>No {{ source }} found.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";

const props = defineProps<{
  source: "games" | "streamers";
  sortBy: "date" | "score" | "name";
  limit: number;
  autoplay: boolean;
}>();

interface CarouselItem {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  badge?: string;
  badgeClass?: string;
}

const loading = ref(true);
const items = ref<CarouselItem[]>([]);
const trackRef = ref<HTMLElement | null>(null);
let autoplayTimer: ReturnType<typeof setInterval> | null = null;

const API = (import.meta.env.PUBLIC_API_URL || import.meta.env.VITE_API_URL || "http://localhost:3001") as string;

async function fetchData() {
  loading.value = true;
  try {
    const endpoint = props.source === "games" ? "/api/games" : "/api/streamers";
    const res = await fetch(`${API}${endpoint}`);
    if (!res.ok) throw new Error("fetch failed");
    const json = await res.json();
    const docs: any[] = json.docs || json || [];

    // Map + sort
    let mapped: CarouselItem[];
    if (props.source === "games") {
      mapped = docs.map((g: any) => ({
        id: g.id,
        title: g.title || g.name || "Untitled",
        subtitle: g.genre || g.developer || "",
        imageUrl: g.coverUrl || g.coverImage || g.imageUrl || "",
        badge: g.rating ? `${g.rating}/10` : undefined,
        badgeClass: "badge-score",
      }));
    } else {
      mapped = docs.map((s: any) => ({
        id: s.id,
        title: s.displayName || s.channelName || "Streamer",
        subtitle: s.platform || "",
        imageUrl: s.avatarUrl || s.profileImageUrl || "",
        badge: s.isLive ? "LIVE" : undefined,
        badgeClass: s.isLive ? "badge-live" : "",
      }));
    }

    // Sort
    if (props.sortBy === "score") {
      mapped.sort((a, b) => {
        const sa = parseFloat(a.badge || "0");
        const sb = parseFloat(b.badge || "0");
        return sb - sa;
      });
    } else if (props.sortBy === "name") {
      mapped.sort((a, b) => a.title.localeCompare(b.title));
    }
    // "date" — use API default order (newest first)

    items.value = mapped.slice(0, props.limit);
  } catch {
    items.value = [];
  } finally {
    loading.value = false;
  }
}

function scroll(dir: number) {
  const el = trackRef.value?.querySelector(".carousel-track") as HTMLElement | null;
  if (!el) return;
  const cardWidth = el.querySelector(".carousel-card")?.clientWidth || 280;
  el.scrollBy({ left: dir * (cardWidth + 16), behavior: "smooth" });
}

onMounted(() => {
  fetchData();
  if (props.autoplay) {
    autoplayTimer = setInterval(() => scroll(1), 4000);
  }
});

onUnmounted(() => {
  if (autoplayTimer) clearInterval(autoplayTimer);
});
</script>

<style scoped>
.dynamic-carousel {
  position: relative;
  width: 100%;
}

.carousel-wrapper {
  position: relative;
}

.carousel-track {
  display: flex;
  gap: 1rem;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding: 0.5rem 0;
}
.carousel-track::-webkit-scrollbar { display: none; }

.carousel-card {
  flex: 0 0 260px;
  scroll-snap-align: start;
  border-radius: 1rem;
  overflow: hidden;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  transition: transform 0.2s, box-shadow 0.2s;
}
.carousel-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}

.card-image {
  position: relative;
  aspect-ratio: 16/9;
  overflow: hidden;
  background: rgba(255,255,255,0.02);
}
.card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.card-image-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  background: linear-gradient(135deg, rgba(0,229,255,0.05), rgba(224,64,251,0.05));
}

.card-badge {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.2em 0.6em;
  border-radius: 9999px;
  backdrop-filter: blur(8px);
}
.badge-score {
  background: rgba(0,229,255,0.2);
  color: #00E5FF;
  border: 1px solid rgba(0,229,255,0.25);
}
.badge-live {
  background: rgba(255,42,109,0.3);
  color: #FF2A6D;
  border: 1px solid rgba(255,42,109,0.3);
  animation: pulse-live 2s ease infinite;
}
@keyframes pulse-live {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.card-body {
  padding: 0.75rem 1rem 1rem;
}
.card-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: #fff;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-subtitle {
  font-size: 0.75rem;
  color: rgba(255,255,255,0.4);
  margin-top: 0.2rem;
}

/* Nav arrows */
.carousel-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255,255,255,0.1);
  color: #fff;
  font-size: 1.2rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
  z-index: 2;
}
.carousel-nav:hover { background: rgba(0,229,255,0.2); }
.carousel-nav.prev { left: -12px; }
.carousel-nav.next { right: -12px; }

/* Skeleton */
.skeleton { pointer-events: none; }
.skeleton-img {
  aspect-ratio: 16/9;
  background: rgba(255,255,255,0.05);
  border-radius: 0.5rem 0.5rem 0 0;
  animation: shimmer 1.5s ease infinite;
}
.skeleton-text {
  height: 12px;
  margin: 0.75rem 1rem 0;
  background: rgba(255,255,255,0.05);
  border-radius: 4px;
  animation: shimmer 1.5s ease infinite;
}
.skeleton-text.short { width: 60%; margin-bottom: 0.75rem; }

@keyframes shimmer {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

.carousel-empty {
  text-align: center;
  padding: 3rem;
  color: rgba(255,255,255,0.3);
  font-size: 0.9rem;
}
</style>
