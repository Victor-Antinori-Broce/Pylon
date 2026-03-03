<template>
  <div class="space-y-4 animate-fade-in">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-bold">Streamers</h2>
        <p class="text-sm text-gremius-text-dim mt-0.5">Track Twitch, YouTube, and Kick creators</p>
      </div>
      <button class="btn-primary"><Plus class="w-4 h-4" /> Add Streamer</button>
    </div>

    <DataTable title="Streamers" :data="streamers" :columns="columns" :page-size="15" @row-click="onRowClick" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, h } from "vue";
import { type ColumnDef } from "@tanstack/vue-table";
import { Plus } from "lucide-vue-next";
import DataTable from "../components/data-table/DataTable.vue";
import StatusBadge from "../components/ui/StatusBadge.vue";
import { useMockData } from "../composables/useMockData";
import { useApi } from "../composables/useApi";

const api = useApi();
const mock = useMockData();
const streamers = ref<any[]>(mock.streamers);

function formatNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

const columns: ColumnDef<any, any>[] = [
  {
    accessorKey: "displayName",
    header: "Name",
    size: 200,
    cell: ({ row }) => {
      const s = row.original;
      return h("div", { class: "flex items-center gap-3" }, [
        h("div", {
          class: "w-8 h-8 rounded-full bg-gremius-cyan/10 border border-gremius-cyan/20 flex items-center justify-center text-xs font-bold text-gremius-cyan shrink-0",
        }, s.displayName[0]),
        h("div", {}, [
          h("span", { class: "font-medium text-gremius-text block" }, s.displayName),
          h("span", { class: "text-[11px] font-mono text-gremius-subtle" }, `@${s.slug}`),
        ]),
      ]);
    },
  },
  {
    accessorKey: "platform",
    header: "Platform",
    size: 100,
    cell: ({ getValue }) => h(StatusBadge, { status: getValue() }),
  },
  {
    accessorKey: "isLive",
    header: "Status",
    size: 90,
    cell: ({ getValue }) => h(StatusBadge, { status: getValue() ? "live" : "offline", dot: true }),
  },
  {
    accessorKey: "viewerCount",
    header: "Viewers",
    size: 100,
    cell: ({ row }) => {
      const s = row.original;
      return s.isLive
        ? h("span", { class: "text-xs font-mono font-bold text-gremius-pink" }, formatNum(s.viewerCount))
        : h("span", { class: "text-xs text-gremius-subtle" }, "—");
    },
  },
  {
    accessorKey: "followerCount",
    header: "Followers",
    size: 110,
    cell: ({ getValue }) => h("span", { class: "text-xs font-mono text-gremius-text-dim" }, formatNum(getValue())),
  },
  {
    accessorKey: "currentStreamTitle",
    header: "Stream Title",
    size: 300,
    cell: ({ getValue }) => {
      const v = getValue();
      return h("span", { class: "text-xs text-gremius-text-dim truncate block max-w-[280px]" }, v || "—");
    },
  },
];

function onRowClick(row: any) {
  console.log("Streamer clicked:", row);
}

onMounted(async () => {
  try {
    const data = await api.get<any>("/streamers?limit=100");
    if (data.docs?.length) streamers.value = data.docs;
  } catch { /* fallback to mock */ }
});
</script>
