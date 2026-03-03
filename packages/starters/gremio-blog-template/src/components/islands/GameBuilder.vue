<script setup lang="ts">
/**
 * GameBuilder Island — Build/loadout planner with stat aggregation.
 * Hydrates only when scrolled into view (client:visible).
 */
import { ref, computed } from "vue";

interface BuildOption {
  id: string;
  name: string;
  stats: Record<string, number>;
  rarity?: "common" | "uncommon" | "rare" | "epic" | "legendary";
}

interface BuildSlot {
  id: string;
  name: string;
  icon: string;
  options: BuildOption[];
}

const props = withDefaults(
  defineProps<{ title?: string; slots: BuildSlot[]; statLabels?: Record<string, string> }>(),
  { title: "Build Planner", statLabels: () => ({}) }
);

const selections = ref<Record<string, string>>({});
const buildName = ref("My Build");
const toast = ref(false);

const rarityColor: Record<string, string> = {
  common: "#6B7280", uncommon: "#76FF03", rare: "#00E5FF", epic: "#E040FB", legendary: "#FF6D00",
};

const totalStats = computed(() => {
  const t: Record<string, number> = {};
  for (const slot of props.slots) {
    const opt = slot.options.find((o) => o.id === selections.value[slot.id]);
    if (!opt) continue;
    for (const [k, v] of Object.entries(opt.stats)) t[k] = (t[k] || 0) + v;
  }
  return t;
});

const allKeys = computed(() => {
  const s = new Set<string>();
  props.slots.forEach((sl) => sl.options.forEach((o) => Object.keys(o.stats).forEach((k) => s.add(k))));
  return [...s];
});

const filled = computed(() => Object.values(selections.value).filter(Boolean).length);

function select(slotId: string, optId: string) {
  selections.value = selections.value[slotId] === optId
    ? { ...selections.value, [slotId]: "" }
    : { ...selections.value, [slotId]: optId };
}

function share() {
  const url = `${window.location.href}?build=${btoa(JSON.stringify({ name: buildName.value, s: selections.value }))}`;
  navigator.clipboard.writeText(url).then(() => { toast.value = true; setTimeout(() => (toast.value = false), 2000); });
}

function getOpt(slot: BuildSlot) { return slot.options.find((o) => o.id === selections.value[slot.id]); }
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <input v-model="buildName" class="bg-transparent font-display text-2xl font-bold text-gremius-heading outline-none border-b border-transparent focus:border-gremius-cyan transition-colors" :placeholder="title" />
        <p class="mt-1 text-sm text-gremius-muted">{{ filled }}/{{ slots.length }} slots</p>
      </div>
      <div class="flex gap-2">
        <button @click="share" class="gremius-btn-secondary text-xs">Share Build</button>
        <button @click="selections = {}" class="gremius-btn-secondary text-xs text-gremius-pink border-gremius-pink/30 hover:border-gremius-pink">Clear</button>
      </div>
    </div>

    <Transition name="fade">
      <div v-if="toast" class="fixed top-4 right-4 z-50 rounded-lg border border-gremius-green/50 bg-gremius-surface px-4 py-3 text-sm text-gremius-green shadow-lg">✓ Link copied</div>
    </Transition>

    <div class="grid gap-6 lg:grid-cols-3">
      <div class="lg:col-span-2 space-y-4">
        <div v-for="slot in slots" :key="slot.id" class="rounded-lg border border-gremius-border bg-gremius-surface p-4">
          <h3 class="mb-3 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wider text-gremius-muted">
            <span>{{ slot.icon }}</span><span>{{ slot.name }}</span>
            <span v-if="getOpt(slot)" class="ml-auto text-xs font-normal normal-case" :style="{ color: rarityColor[getOpt(slot)?.rarity||'common'] }">{{ getOpt(slot)?.name }}</span>
          </h3>
          <div class="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            <button v-for="opt in slot.options" :key="opt.id" @click="select(slot.id, opt.id)"
              class="rounded-lg border p-3 text-left text-sm transition-all"
              :class="selections[slot.id] === opt.id ? 'border-gremius-cyan bg-gremius-cyan/10' : 'border-gremius-border hover:border-gremius-muted'">
              <div class="flex items-center justify-between">
                <span class="font-medium text-gremius-heading">{{ opt.name }}</span>
                <span v-if="opt.rarity" class="h-2 w-2 rounded-full" :style="{ background: rarityColor[opt.rarity] }" />
              </div>
              <div class="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                <span v-for="(v, k) in opt.stats" :key="String(k)" class="font-mono text-xs" :class="v >= 0 ? 'text-gremius-green' : 'text-gremius-pink'">
                  {{ v >= 0 ? '+' : '' }}{{ v }} {{ statLabels[String(k)] || k }}
                </span>
              </div>
            </button>
          </div>
        </div>
      </div>

      <aside class="lg:sticky lg:top-24 lg:self-start">
        <div class="rounded-lg border border-gremius-border bg-gremius-surface p-5">
          <h3 class="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-gremius-muted">Build Stats</h3>
          <div v-if="Object.keys(totalStats).length" class="space-y-3">
            <div v-for="k in allKeys" :key="k">
              <div class="flex justify-between text-sm">
                <span class="text-gremius-text">{{ statLabels[k] || k }}</span>
                <span class="font-mono font-bold" :class="(totalStats[k]||0) > 0 ? 'text-gremius-green' : (totalStats[k]||0) < 0 ? 'text-gremius-pink' : 'text-gremius-muted'">
                  {{ (totalStats[k]||0) >= 0 ? '+' : '' }}{{ totalStats[k] || 0 }}
                </span>
              </div>
              <div class="mt-1 h-1 w-full overflow-hidden rounded-full bg-gremius-bg">
                <div class="h-full rounded-full transition-all duration-300" :style="{ width: Math.min(100, Math.abs(totalStats[k]||0))+'%', background: (totalStats[k]||0)>=0?'#76FF03':'#FF2A6D' }" />
              </div>
            </div>
          </div>
          <p v-else class="text-sm text-gremius-muted">Select items to see combined stats</p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,.fade-leave-active{transition:opacity .2s ease}
.fade-enter-from,.fade-leave-to{opacity:0}
</style>
