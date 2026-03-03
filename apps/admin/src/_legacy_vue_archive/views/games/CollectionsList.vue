<template>
  <div class="space-y-4 animate-fade-in">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-bold">Game Collections</h2>
        <p class="text-sm text-gremius-text-dim mt-0.5">Curated sections for the homepage</p>
      </div>
      <router-link to="/games/collections/new" class="btn-primary">
        <Plus class="w-4 h-4" /> New Collection
      </router-link>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-20">
      <div class="w-6 h-6 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin" />
    </div>

    <!-- Empty state -->
    <div v-else-if="collections.length === 0" class="card p-16 text-center">
      <div class="text-4xl mb-3">📦</div>
      <p class="text-gremius-text-dim">No collections yet.</p>
      <p class="text-xs text-gremius-subtle mt-1">Create your first curated section to feature on the homepage.</p>
    </div>

    <!-- Collections list -->
    <div v-else class="space-y-3">
      <router-link
        v-for="col in collections"
        :key="col.id"
        :to="`/games/collections/${col.id}`"
        class="card p-4 flex items-center justify-between group hover:border-gremius-cyan/30 transition-colors"
      >
        <div class="flex items-center gap-4">
          <div class="w-10 h-10 rounded-lg bg-gremius-surface flex items-center justify-center text-gremius-cyan font-bold text-sm">
            {{ col.displayOrder + 1 }}
          </div>
          <div>
            <h3 class="font-semibold text-gremius-text group-hover:text-gremius-cyan transition-colors">
              {{ col.title }}
            </h3>
            <p class="text-xs text-gremius-subtle mt-0.5">
              {{ col.games?.length || 0 }} games · /{{ col.slug }}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <!-- Game preview avatars -->
          <div class="flex -space-x-2" v-if="col.games?.length">
            <div
              v-for="(game, i) in col.games.slice(0, 4)"
              :key="game.id"
              class="w-8 h-8 rounded-md border-2 border-gremius-card bg-gremius-surface overflow-hidden"
              :style="{ zIndex: 10 - i }"
            >
              <img
                v-if="game.coverArt?.url"
                :src="game.coverArt.url"
                :alt="game.title"
                class="w-full h-full object-cover"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-[10px]">🎮</div>
            </div>
            <div
              v-if="col.games.length > 4"
              class="w-8 h-8 rounded-md border-2 border-gremius-card bg-gremius-surface flex items-center justify-center text-[10px] text-gremius-subtle font-medium"
            >
              +{{ col.games.length - 4 }}
            </div>
          </div>
          <ChevronRight class="w-4 h-4 text-gremius-subtle group-hover:text-gremius-cyan transition-colors" />
        </div>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Plus, ChevronRight } from "lucide-vue-next";
import { useApi } from "../../composables/useApi";

const api = useApi();
const collections = ref<any[]>([]);
const loading = ref(true);

onMounted(async () => {
  try {
    const data = await api.get<any>("/collections");
    collections.value = data.docs || [];
  } catch {
    // empty
  } finally {
    loading.value = false;
  }
});
</script>
