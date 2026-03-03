<script setup lang="ts">
/**
 * InteractiveMap Island — Pannable/zoomable game map with markers.
 * Hydrates only when scrolled into view (client:visible).
 */
import { ref, computed } from "vue";

interface MapMarker {
  id: string;
  label: string;
  x: number;
  y: number;
  category?: string;
  description?: string;
  icon?: string;
}

const props = withDefaults(
  defineProps<{
    mapImageUrl: string;
    mapTitle?: string;
    markers?: MapMarker[];
    categories?: { name: string; color: string; icon: string }[];
  }>(),
  { mapTitle: "Game Map", markers: () => [], categories: () => [] }
);

const scale = ref(1);
const tx = ref(0);
const ty = ref(0);
const dragging = ref(false);
const dragStart = ref({ x: 0, y: 0 });
const selected = ref<MapMarker | null>(null);
const activeCats = ref<Set<string>>(new Set(props.categories.map((c) => c.name)));
const search = ref("");

const filtered = computed(() =>
  props.markers.filter((m) => {
    if (m.category && !activeCats.value.has(m.category)) return false;
    if (search.value.trim()) {
      const q = search.value.toLowerCase();
      return m.label.toLowerCase().includes(q) || m.description?.toLowerCase().includes(q);
    }
    return true;
  })
);

function onWheel(e: WheelEvent) {
  e.preventDefault();
  scale.value = Math.max(0.5, Math.min(4, scale.value + (e.deltaY > 0 ? -0.15 : 0.15)));
}
function startDrag(e: MouseEvent) { dragging.value = true; dragStart.value = { x: e.clientX - tx.value, y: e.clientY - ty.value }; }
function onDrag(e: MouseEvent) { if (!dragging.value) return; tx.value = e.clientX - dragStart.value.x; ty.value = e.clientY - dragStart.value.y; }
function stopDrag() { dragging.value = false; }
function reset() { scale.value = 1; tx.value = 0; ty.value = 0; }

function toggleCat(name: string) {
  const s = new Set(activeCats.value);
  s.has(name) ? s.delete(name) : s.add(name);
  activeCats.value = s;
}

function catColor(name?: string) {
  return props.categories.find((c) => c.name === name)?.color || "#00E5FF";
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-4">
      <input v-model="search" type="text" placeholder="Search markers..."
        class="flex-1 rounded-md border border-gremius-border bg-gremius-surface px-4 py-2 text-sm text-gremius-text placeholder-gremius-muted outline-none focus:border-gremius-cyan" style="min-width:180px" />
      <div class="flex gap-1">
        <button @click="scale = Math.min(4, scale + 0.3)" class="gremius-btn-secondary px-3 py-2 text-sm">+</button>
        <button @click="scale = Math.max(0.5, scale - 0.3)" class="gremius-btn-secondary px-3 py-2 text-sm">−</button>
        <button @click="reset" class="gremius-btn-secondary px-3 py-2 text-sm">⟲</button>
      </div>
      <span class="text-xs text-gremius-muted">{{ Math.round(scale * 100) }}%</span>
    </div>

    <div v-if="categories.length" class="flex flex-wrap gap-2">
      <button v-for="c in categories" :key="c.name" @click="toggleCat(c.name)"
        class="rounded-full px-3 py-1 text-xs font-semibold transition-all border"
        :style="{ color: activeCats.has(c.name) ? c.color : '#6B7280', background: activeCats.has(c.name) ? c.color+'15' : 'transparent', borderColor: activeCats.has(c.name) ? c.color+'50' : '#1E1E2E' }">
        {{ c.icon }} {{ c.name }}
      </button>
    </div>

    <div class="relative overflow-hidden rounded-lg border border-gremius-border bg-gremius-bg" style="height:500px"
      :style="{ cursor: dragging ? 'grabbing' : 'grab' }"
      @wheel="onWheel" @mousedown="startDrag" @mousemove="onDrag" @mouseup="stopDrag" @mouseleave="stopDrag">
      <div class="absolute inset-0 origin-center transition-transform duration-75"
        :style="{ transform: `translate(${tx}px,${ty}px) scale(${scale})` }">
        <img :src="mapImageUrl" :alt="mapTitle" class="h-full w-full object-contain select-none pointer-events-none" draggable="false" />
        <button v-for="m in filtered" :key="m.id" @click.stop="selected = selected?.id === m.id ? null : m"
          class="absolute -translate-x-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold transition-all hover:scale-125"
          :style="{ left: m.x+'%', top: m.y+'%', borderColor: catColor(m.category), background: selected?.id===m.id ? catColor(m.category) : catColor(m.category)+'30', color: selected?.id===m.id ? '#0A0A0F' : catColor(m.category), boxShadow: `0 0 8px ${catColor(m.category)}40` }"
          :title="m.label">{{ m.icon || '●' }}</button>
      </div>

      <Transition name="fade">
        <div v-if="selected" class="absolute bottom-4 left-4 right-4 z-10 rounded-lg border border-gremius-border bg-gremius-surface/95 p-4 backdrop-blur-sm md:left-auto md:max-w-xs">
          <div class="flex justify-between gap-3">
            <div>
              <h3 class="font-display font-semibold text-gremius-heading">{{ selected.label }}</h3>
              <p v-if="selected.category" class="mt-1 text-xs" :style="{ color: catColor(selected.category) }">{{ selected.category }}</p>
            </div>
            <button @click="selected = null" class="text-gremius-muted hover:text-gremius-heading text-lg leading-none">&times;</button>
          </div>
          <p v-if="selected.description" class="mt-2 text-sm text-gremius-text">{{ selected.description }}</p>
        </div>
      </Transition>
    </div>
    <p class="text-xs text-gremius-muted">{{ filtered.length }} markers visible</p>
  </div>
</template>

<style scoped>
.fade-enter-active,.fade-leave-active{transition:opacity .2s ease}
.fade-enter-from,.fade-leave-to{opacity:0}
</style>
