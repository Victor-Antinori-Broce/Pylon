<template>
  <div class="space-y-4 animate-fade-in">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-bold">Game Database</h2>
        <p class="text-sm text-gremius-text-dim mt-0.5">Manage your gaming library</p>
      </div>
      <button class="btn-primary" @click="showCreate = true">
        <Plus class="w-4 h-4" /> Add Game
      </button>
    </div>

    <DataTable
      title="Games"
      :data="games"
      :columns="columns"
      :page-size="15"
      @row-click="onRowClick"
    >
      <template #filters>
        <select v-model="statusFilter" class="select w-36 bg-gremius-bg text-xs">
          <option value="">All Statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
      </template>
    </DataTable>

    <!-- Quick Create Modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showCreate" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" @click.self="showCreate = false">
          <div class="card w-full max-w-lg p-6 space-y-4 shadow-2xl shadow-black/50 animate-slide-in" @click.stop>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold">New Game</h3>
              <button @click="showCreate = false" class="btn-icon p-1"><X class="w-4 h-4" /></button>
            </div>
            <div class="space-y-3">
              <div>
                <label class="label mb-1 block">Title</label>
                <input v-model="newGame.title" class="input" placeholder="Game title..." />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="label mb-1 block">Developer</label>
                  <input v-model="newGame.developer" class="input" placeholder="Studio name..." />
                </div>
                <div>
                  <label class="label mb-1 block">Publisher</label>
                  <input v-model="newGame.publisher" class="input" placeholder="Publisher..." />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="label mb-1 block">Release Date</label>
                  <input v-model="newGame.releaseDate" type="date" class="input" />
                </div>
                <div>
                  <label class="label mb-1 block">Metacritic Score</label>
                  <input v-model.number="newGame.metacriticScore" type="number" min="0" max="100" class="input" placeholder="0–100" />
                </div>
              </div>
              <div>
                <label class="label mb-1 block">Excerpt</label>
                <textarea v-model="newGame.excerpt" class="textarea" rows="2" placeholder="Short description..." />
              </div>
            </div>
            <div class="flex justify-end gap-3 pt-2">
              <button @click="showCreate = false" class="btn-secondary btn-sm">Cancel</button>
              <button @click="createGame" class="btn-primary btn-sm" :disabled="!newGame.title">
                <Plus class="w-3.5 h-3.5" /> Create Game
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, h, watch } from "vue";
import { type ColumnDef } from "@tanstack/vue-table";
import { Plus, X, ExternalLink, Star } from "lucide-vue-next";
import DataTable from "../components/data-table/DataTable.vue";
import StatusBadge from "../components/ui/StatusBadge.vue";
import RelationCell from "../components/data-table/RelationCell.vue";
import ScoreCell from "../components/data-table/ScoreCell.vue";
import { useMockData, type GameRow } from "../composables/useMockData";
import { useApi } from "../composables/useApi";

const api = useApi();
const mock = useMockData();
const games = ref<any[]>(mock.games);
const statusFilter = ref("");
const showCreate = ref(false);
const newGame = ref({ title: "", developer: "", publisher: "", releaseDate: "", metacriticScore: null as number | null, excerpt: "" });

const columns: ColumnDef<any, any>[] = [
  {
    accessorKey: "title",
    header: "Title",
    size: 260,
    cell: ({ row }) => h("div", { class: "flex flex-col gap-0.5" }, [
      h("span", { class: "font-medium text-gremius-text" }, row.original.title),
      h("span", { class: "text-[11px] font-mono text-gremius-subtle truncate max-w-[200px]" }, row.original.slug),
    ]),
  },
  {
    accessorKey: "developer",
    header: "Developer",
    size: 160,
    cell: ({ getValue }) => h("span", { class: "text-gremius-text-dim" }, getValue()),
  },
  {
    accessorKey: "status",
    header: "Status",
    size: 110,
    cell: ({ getValue }) => h(StatusBadge, { status: getValue() }),
  },
  {
    accessorKey: "metacriticScore",
    header: "Score",
    size: 80,
    cell: ({ getValue }) => h(ScoreCell, { score: getValue() }),
  },
  {
    accessorKey: "platforms",
    header: "Platforms",
    size: 200,
    enableSorting: false,
    cell: ({ getValue }) => {
      const val = getValue();
      const items = Array.isArray(val) ? val.map((p: any) => typeof p === "string" ? p : p.shortName || p.name) : [];
      return h(RelationCell, { items });
    },
  },
  {
    accessorKey: "tags",
    header: "Tags",
    size: 200,
    enableSorting: false,
    cell: ({ getValue }) => {
      const val = getValue();
      const items = Array.isArray(val) ? val.map((t: any) => typeof t === "string" ? t : t.name) : [];
      return h(RelationCell, { items });
    },
  },
  {
    accessorKey: "releaseDate",
    header: "Release",
    size: 110,
    cell: ({ getValue }) => {
      const v = getValue();
      return h("span", { class: "text-xs font-mono text-gremius-text-dim" }, v ? new Date(v).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "TBD");
    },
  },
  {
    accessorKey: "isFeaturedOnHome",
    header: "Featured",
    size: 80,
    enableSorting: false,
    cell: ({ row }) => {
      const featured = row.original.isFeaturedOnHome;
      return h("button", {
        class: "flex items-center justify-center w-full",
        title: featured ? "Remove from homepage" : "Show on homepage",
        onClick: (e: Event) => { e.stopPropagation(); toggleFeatured(row.original); },
      }, [
        h(Star, {
          class: `w-4 h-4 transition-colors cursor-pointer ${featured ? 'fill-gremius-cyan text-gremius-cyan' : 'text-gremius-muted hover:text-gremius-cyan/60'}`,
        }),
      ]);
    },
  },
];

function onRowClick(row: any) {
  // TODO: Navigate to edit page
  console.log("Clicked:", row);
}

async function toggleFeatured(game: any) {
  try {
    const newVal = !game.isFeaturedOnHome;
    await api.patch(`/games/${game.id}`, { isFeaturedOnHome: newVal });
    game.isFeaturedOnHome = newVal;
  } catch (err) {
    console.error("Failed to toggle featured:", err);
  }
}

async function createGame() {
  try {
    const slug = newGame.value.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    await api.post("/games", { ...newGame.value, slug, status: "draft" });
    showCreate.value = false;
    newGame.value = { title: "", developer: "", publisher: "", releaseDate: "", metacriticScore: null, excerpt: "" };
    await loadGames();
  } catch (err) {
    console.error("Failed to create game:", err);
  }
}

async function loadGames() {
  try {
    const params = statusFilter.value ? `?status=${statusFilter.value}&limit=100` : "?limit=100";
    const data = await api.get<any>(`/games${params}`);
    if (data.docs?.length) games.value = data.docs;
  } catch {
    // Fallback to mock
  }
}

watch(statusFilter, loadGames);
onMounted(loadGames);
</script>
