<template>
  <div class="space-y-4 animate-fade-in">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-bold">Blog Posts</h2>
        <p class="text-sm text-gremius-text-dim mt-0.5">Create and manage your content</p>
      </div>
      <router-link to="/posts/new" class="btn-primary">
        <Plus class="w-4 h-4" /> New Post
      </router-link>
    </div>

    <DataTable
      title="Posts"
      :data="posts"
      :columns="columns"
      :page-size="15"
      @row-click="onRowClick"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, h } from "vue";
import { type ColumnDef } from "@tanstack/vue-table";
import { Plus } from "lucide-vue-next";
import DataTable from "../components/data-table/DataTable.vue";
import StatusBadge from "../components/ui/StatusBadge.vue";
import RelationCell from "../components/data-table/RelationCell.vue";
import { useMockData } from "../composables/useMockData";
import { useApi } from "../composables/useApi";

const api = useApi();
const mock = useMockData();
const posts = ref<any[]>(mock.posts);

const columns: ColumnDef<any, any>[] = [
  {
    accessorKey: "title",
    header: "Title",
    size: 320,
    cell: ({ row }) => h("div", { class: "flex flex-col gap-0.5" }, [
      h("span", { class: "font-medium text-gremius-text" }, row.original.title),
      h("span", { class: "text-[11px] font-mono text-gremius-subtle" }, `/blog/${row.original.slug}`),
    ]),
  },
  {
    accessorKey: "status",
    header: "Status",
    size: 110,
    cell: ({ getValue }) => h(StatusBadge, { status: getValue() }),
  },
  {
    accessorKey: "authorName",
    header: "Author",
    size: 120,
    cell: ({ getValue }) => h("span", { class: "text-gremius-text-dim" }, getValue() || "—"),
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
    accessorKey: "readingTime",
    header: "Read Time",
    size: 90,
    cell: ({ getValue }) => h("span", { class: "text-xs text-gremius-text-dim" }, `${getValue()} min`),
  },
  {
    accessorKey: "publishedAt",
    header: "Published",
    size: 130,
    cell: ({ getValue }) => {
      const v = getValue();
      return h("span", { class: "text-xs font-mono text-gremius-text-dim" },
        v ? new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"
      );
    },
  },
];

function onRowClick(row: any) {
  console.log("Edit post:", row);
}

onMounted(async () => {
  try {
    const data = await api.get<any>("/blog-posts?limit=100");
    if (data.docs?.length) {
      posts.value = data.docs.map((p: any) => ({
        ...p,
        authorName: p.author?.displayName || "Admin",
        tags: p.tags || [],
      }));
    }
  } catch { /* fallback to mock */ }
});
</script>
