<!--
  SmartFilter.vue — Client-side hydrated island
  Dynamic genre, platform, and score filters.
  Fetches data from /api/games (or custom dataset) and renders a filterable grid.
-->
<template>
  <div class="smart-filter">
    <!-- Filter bar -->
    <div class="filter-bar">
      <!-- Genre chips -->
      <div v-if="enableGenreFilter && allGenres.length > 0" class="filter-group">
        <span class="filter-label">Genre</span>
        <div class="chip-list">
          <button
            v-for="genre in allGenres"
            :key="genre"
            class="chip"
            :class="{ active: selectedGenres.has(genre) }"
            @click="toggleGenre(genre)"
          >
            {{ genre }}
          </button>
        </div>
      </div>

      <!-- Platform chips -->
      <div v-if="enablePlatformFilter && allPlatforms.length > 0" class="filter-group">
        <span class="filter-label">Platform</span>
        <div class="chip-list">
          <button
            v-for="plat in allPlatforms"
            :key="plat"
            class="chip"
            :class="{ active: selectedPlatforms.has(plat) }"
            @click="togglePlatform(plat)"
          >
            {{ plat }}
          </button>
        </div>
      </div>

      <!-- Score slider -->
      <div v-if="enableScoreSlider" class="filter-group score-group">
        <span class="filter-label">Min Score: {{ minScore }}</span>
        <input
          type="range"
          min="0"
          max="10"
          step="0.5"
          v-model.number="minScore"
          class="score-slider"
        />
      </div>

      <!-- Active filter count + clear -->
      <div v-if="activeFilterCount > 0" class="filter-actions">
        <span class="filter-count">{{ activeFilterCount }} filter{{ activeFilterCount > 1 ? 's' : '' }} active</span>
        <button class="clear-btn" @click="clearAll">✕ Clear</button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="grid-placeholder">
      <div v-for="n in 6" :key="n" class="grid-skeleton" />
    </div>

    <!-- Results grid -->
    <div v-else-if="filteredItems.length > 0" class="results-grid">
      <div
        v-for="item in filteredItems"
        :key="item.id"
        class="result-card"
      >
        <div class="result-image">
          <img v-if="item.imageUrl" :src="item.imageUrl" :alt="item.title" loading="lazy" />
          <div v-else class="result-placeholder">🎮</div>
        </div>
        <div class="result-body">
          <h4 class="result-title">{{ item.title }}</h4>
          <div class="result-meta">
            <span v-if="item.genre" class="meta-tag genre">{{ item.genre }}</span>
            <span v-if="item.platform" class="meta-tag platform">{{ item.platform }}</span>
            <span v-if="item.rating != null" class="meta-tag score">{{ item.rating }}/10</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty -->
    <div v-else class="empty-state">
      <p>No results match your filters.</p>
      <button class="clear-btn" @click="clearAll">Clear filters</button>
    </div>

    <p class="result-count">{{ filteredItems.length }} of {{ allItems.length }} items</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";

const props = defineProps<{
  enableGenreFilter: boolean;
  enablePlatformFilter: boolean;
  enableScoreSlider: boolean;
  targetDatasetId?: string;
}>();

interface FilterableItem {
  id: string;
  title: string;
  imageUrl?: string;
  genre?: string;
  platform?: string;
  rating?: number;
}

const loading = ref(true);
const allItems = ref<FilterableItem[]>([]);
const selectedGenres = ref(new Set<string>());
const selectedPlatforms = ref(new Set<string>());
const minScore = ref(0);

const API = (import.meta.env.PUBLIC_API_URL || import.meta.env.VITE_API_URL || "http://localhost:3001") as string;

const allGenres = computed(() => {
  const set = new Set<string>();
  for (const item of allItems.value) {
    if (item.genre) item.genre.split(",").map(g => g.trim()).filter(Boolean).forEach(g => set.add(g));
  }
  return [...set].sort();
});

const allPlatforms = computed(() => {
  const set = new Set<string>();
  for (const item of allItems.value) {
    if (item.platform) item.platform.split(",").map(p => p.trim()).filter(Boolean).forEach(p => set.add(p));
  }
  return [...set].sort();
});

const activeFilterCount = computed(() => {
  let count = selectedGenres.value.size + selectedPlatforms.value.size;
  if (minScore.value > 0) count++;
  return count;
});

const filteredItems = computed(() => {
  return allItems.value.filter(item => {
    // Genre filter
    if (selectedGenres.value.size > 0) {
      const genres = (item.genre || "").split(",").map(g => g.trim());
      if (!genres.some(g => selectedGenres.value.has(g))) return false;
    }
    // Platform filter
    if (selectedPlatforms.value.size > 0) {
      const plats = (item.platform || "").split(",").map(p => p.trim());
      if (!plats.some(p => selectedPlatforms.value.has(p))) return false;
    }
    // Score filter
    if (minScore.value > 0 && (item.rating == null || item.rating < minScore.value)) {
      return false;
    }
    return true;
  });
});

function toggleGenre(g: string) {
  const s = new Set(selectedGenres.value);
  s.has(g) ? s.delete(g) : s.add(g);
  selectedGenres.value = s;
}

function togglePlatform(p: string) {
  const s = new Set(selectedPlatforms.value);
  s.has(p) ? s.delete(p) : s.add(p);
  selectedPlatforms.value = s;
}

function clearAll() {
  selectedGenres.value = new Set();
  selectedPlatforms.value = new Set();
  minScore.value = 0;
}

onMounted(async () => {
  try {
    const endpoint = props.targetDatasetId
      ? `/api/data-sets/${props.targetDatasetId}/entries`
      : "/api/games";
    const res = await fetch(`${API}${endpoint}`);
    if (!res.ok) throw new Error("fetch failed");
    const json = await res.json();
    const docs: any[] = json.docs || json || [];

    allItems.value = docs.map((d: any) => ({
      id: d.id,
      title: d.title || d.name || "Untitled",
      imageUrl: d.coverUrl || d.coverImage || d.imageUrl || "",
      genre: d.genre || d.tags?.join(", ") || "",
      platform: d.platform || d.platforms?.map((p: any) => p.name || p).join(", ") || "",
      rating: d.rating ?? d.score ?? null,
    }));
  } catch {
    allItems.value = [];
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.smart-filter { width: 100%; }

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem;
  align-items: flex-start;
  padding: 1rem 1.25rem;
  border-radius: 1rem;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  margin-bottom: 1.5rem;
}

.filter-group { display: flex; flex-direction: column; gap: 0.4rem; }

.filter-label {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(255,255,255,0.35);
}

.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.chip {
  font-size: 0.75rem;
  padding: 0.3em 0.75em;
  border-radius: 9999px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  transition: all 0.15s;
}
.chip:hover {
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.7);
}
.chip.active {
  background: rgba(0,229,255,0.15);
  border-color: rgba(0,229,255,0.3);
  color: #00E5FF;
}

.score-group { min-width: 160px; }
.score-slider {
  width: 100%;
  accent-color: #00E5FF;
  cursor: pointer;
}

.filter-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-left: auto;
  align-self: flex-end;
}
.filter-count {
  font-size: 0.75rem;
  color: rgba(0,229,255,0.7);
}
.clear-btn {
  font-size: 0.75rem;
  padding: 0.3em 0.8em;
  border-radius: 0.5rem;
  background: rgba(255,42,109,0.1);
  border: 1px solid rgba(255,42,109,0.2);
  color: #FF2A6D;
  cursor: pointer;
  transition: background 0.15s;
}
.clear-btn:hover { background: rgba(255,42,109,0.2); }

/* Results grid */
.results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
}

.result-card {
  border-radius: 0.75rem;
  overflow: hidden;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  transition: transform 0.2s, border-color 0.2s;
}
.result-card:hover {
  transform: translateY(-2px);
  border-color: rgba(0,229,255,0.15);
}

.result-image {
  aspect-ratio: 16/9;
  overflow: hidden;
  background: rgba(255,255,255,0.02);
}
.result-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.result-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
}

.result-body { padding: 0.75rem; }
.result-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.result-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.4rem;
}
.meta-tag {
  font-size: 0.6rem;
  font-weight: 600;
  padding: 0.15em 0.5em;
  border-radius: 4px;
}
.meta-tag.genre {
  background: rgba(224,64,251,0.1);
  color: #E040FB;
}
.meta-tag.platform {
  background: rgba(0,229,255,0.1);
  color: #00E5FF;
}
.meta-tag.score {
  background: rgba(118,255,3,0.1);
  color: #76FF03;
}

.result-count {
  text-align: center;
  font-size: 0.75rem;
  color: rgba(255,255,255,0.25);
  margin-top: 1rem;
}

/* Skeletons */
.grid-placeholder {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
}
.grid-skeleton {
  aspect-ratio: 3/4;
  border-radius: 0.75rem;
  background: rgba(255,255,255,0.03);
  animation: shimmer 1.5s ease infinite;
}
@keyframes shimmer {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

.empty-state {
  text-align: center;
  padding: 3rem;
  color: rgba(255,255,255,0.3);
}
.empty-state p { margin-bottom: 0.75rem; }
</style>
