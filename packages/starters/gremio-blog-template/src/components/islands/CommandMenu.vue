<template>
  <Teleport to="body">
    <Transition name="overlay">
      <div v-if="isOpen" class="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" @click.self="close">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" />

        <!-- Modal -->
        <div class="relative w-full max-w-xl mx-4 animate-enter" @click.stop>
          <div class="glass-card rounded-2xl shadow-2xl shadow-black/50 overflow-hidden border border-white/10">
            <!-- Search input -->
            <div class="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]">
              <svg class="w-5 h-5 text-gremius-cyan shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref="inputRef"
                v-model="query"
                type="text"
                placeholder="Search games, posts, data..."
                class="flex-1 bg-transparent text-lg text-gremius-text placeholder:text-zinc-500 outline-none"
                @keydown.escape="close"
              />
              <kbd class="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[11px] text-zinc-400 font-mono">
                ESC
              </kbd>
            </div>

            <!-- Results -->
            <div class="max-h-[50vh] overflow-y-auto">
              <div v-if="!query" class="px-5 py-6 text-center text-zinc-500 text-sm">
                <p>Type to search across all content</p>
                <div class="flex justify-center gap-2 mt-3">
                  <span class="gremius-badge text-[10px]">Games</span>
                  <span class="gremius-badge-pink text-[10px]">Posts</span>
                  <span class="gremius-badge text-[10px]">Data Sets</span>
                </div>
              </div>

              <div v-else-if="loading" class="px-5 py-8 text-center">
                <div class="w-5 h-5 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin mx-auto" />
              </div>

              <div v-else-if="results.length === 0 && query.length >= 2" class="px-5 py-8 text-center text-zinc-500 text-sm">
                No results for "{{ query }}"
              </div>

              <div v-else class="py-2">
                <div v-for="(group, key) in groupedResults" :key="key">
                  <p class="px-5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{{ key }}</p>
                  <a
                    v-for="item in group"
                    :key="item.url"
                    :href="item.url"
                    class="flex items-center gap-3 px-5 py-2.5 hover:bg-white/[0.04] transition-colors group"
                    @click="close"
                  >
                    <span class="text-lg">{{ item.icon }}</span>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium text-gremius-text group-hover:text-gremius-cyan transition-colors truncate">{{ item.title }}</p>
                      <p v-if="item.subtitle" class="text-xs text-zinc-500 truncate">{{ item.subtitle }}</p>
                    </div>
                    <svg class="w-4 h-4 text-zinc-600 group-hover:text-gremius-cyan transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import { isSearchOpen, closeSearch } from "@/stores/ui";

interface SearchResult {
  title: string;
  subtitle?: string;
  url: string;
  icon: string;
  category: string;
}

const inputRef = ref<HTMLInputElement>();
const query = ref("");
const loading = ref(false);
const results = ref<SearchResult[]>([]);

const isOpen = computed(() => isSearchOpen.value);

const groupedResults = computed(() => {
  const groups: Record<string, SearchResult[]> = {};
  for (const r of results.value) {
    if (!groups[r.category]) groups[r.category] = [];
    groups[r.category].push(r);
  }
  return groups;
});

function close() {
  closeSearch();
  query.value = "";
  results.value = [];
}

// Auto-focus input when opened
watch(isOpen, async (val) => {
  if (val) {
    await nextTick();
    inputRef.value?.focus();
    document.body.style.overflow = "hidden";
  } else {
    document.body.style.overflow = "";
  }
});

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout>;
watch(query, (q) => {
  clearTimeout(searchTimeout);
  if (q.length < 2) { results.value = []; return; }
  loading.value = true;
  searchTimeout = setTimeout(() => doSearch(q), 250);
});

async function doSearch(q: string) {
  const API = import.meta.env?.VITE_API_URL || "http://localhost:3001";
  try {
    const [gamesRes] = await Promise.allSettled([
      fetch(`${API}/api/games?search=${encodeURIComponent(q)}&limit=5`).then(r => r.json()),
    ]);

    const items: SearchResult[] = [];

    if (gamesRes.status === "fulfilled" && gamesRes.value.docs) {
      for (const g of gamesRes.value.docs) {
        items.push({
          title: g.title,
          subtitle: `${g.developer} · ${g.metacriticScore ? g.metacriticScore + '/100' : 'No score'}`,
          url: `/games/${g.slug}`,
          icon: "🎮",
          category: "Games",
        });
      }
    }

    results.value = items;
  } catch {
    results.value = [];
  } finally {
    loading.value = false;
  }
}

// Keyboard shortcut: CMD+K / Ctrl+K
function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
    e.preventDefault();
    isSearchOpen.value ? close() : (isSearchOpen.value = true);
  }
}

onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => document.removeEventListener("keydown", onKeydown));
</script>

<style scoped>
.overlay-enter-active,
.overlay-leave-active {
  transition: opacity 0.15s ease;
}
.overlay-enter-from,
.overlay-leave-to {
  opacity: 0;
}
</style>
