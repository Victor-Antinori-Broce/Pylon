<script setup lang="ts">
/**
 * DataTable Island — Sortable, filterable NocoDB-like data table.
 * Hydrates only when scrolled into view (client:visible).
 */
import { ref, computed } from "vue";

interface SchemaField {
  fieldName: string;
  fieldType: string;
  options?: string;
}

interface DataEntry {
  id: string;
  title: string;
  data: Record<string, unknown>;
  sortOrder?: number;
}

const props = defineProps<{
  schema: SchemaField[];
  entries: DataEntry[];
  dataSetName: string;
}>();

const searchQuery = ref("");
const sortField = ref<string | null>(null);
const sortDir = ref<"asc" | "desc">("asc");
const colFilters = ref<Record<string, string>>({});

function fieldSlug(f: SchemaField): string {
  return f.fieldName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function toggleSort(fName: string) {
  if (sortField.value === fName) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortField.value = fName;
    sortDir.value = "asc";
  }
}

const filtered = computed(() => {
  let result = [...props.entries];
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    result = result.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        Object.values(e.data).some((v) => String(v).toLowerCase().includes(q))
    );
  }
  for (const [key, val] of Object.entries(colFilters.value)) {
    if (!val) continue;
    result = result.filter((e) =>
      String(e.data[key] ?? "").toLowerCase().includes(val.toLowerCase())
    );
  }
  if (sortField.value) {
    const f = sortField.value;
    result.sort((a, b) => {
      const av = a.data[f] ?? "";
      const bv = b.data[f] ?? "";
      const an = Number(av), bn = Number(bv);
      if (!isNaN(an) && !isNaN(bn))
        return sortDir.value === "asc" ? an - bn : bn - an;
      return sortDir.value === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }
  return result;
});

function getSelectOptions(f: SchemaField): string[] {
  if (!f.options) return [];
  return f.options.split(",").map((s) => s.trim()).filter(Boolean);
}

function cell(val: unknown, type: string): string {
  if (val == null) return "—";
  if (type === "boolean") return val ? "✓" : "✗";
  return String(val);
}
</script>

<template>
  <div class="space-y-4">
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-4">
      <div class="relative flex-1" style="min-width: 200px">
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="`Search ${dataSetName}...`"
          class="w-full rounded-md border border-gremius-border bg-gremius-surface px-4 py-2.5 pl-10 text-sm text-gremius-text placeholder-gremius-muted outline-none transition-colors focus:border-gremius-cyan"
        />
        <svg class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gremius-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <span class="text-sm text-gremius-muted">
        {{ filtered.length }} / {{ entries.length }} entries
      </span>
    </div>

    <!-- Table -->
    <div class="overflow-x-auto rounded-lg border border-gremius-border">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gremius-border bg-gremius-surface">
            <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gremius-muted">#</th>
            <th
              v-for="f in schema"
              :key="f.fieldName"
              class="cursor-pointer select-none px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gremius-muted hover:text-gremius-cyan transition-colors"
              @click="toggleSort(fieldSlug(f))"
            >
              <span class="flex items-center gap-1.5">
                {{ f.fieldName }}
                <span v-if="sortField === fieldSlug(f)" class="text-gremius-cyan">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
              </span>
            </th>
          </tr>
          <!-- Filter row -->
          <tr class="border-b border-gremius-border bg-gremius-bg">
            <td class="px-4 py-2" />
            <td v-for="f in schema" :key="`flt-${f.fieldName}`" class="px-4 py-2">
              <select
                v-if="f.fieldType === 'select'"
                v-model="colFilters[fieldSlug(f)]"
                class="w-full rounded border border-gremius-border bg-gremius-surface px-2 py-1 text-xs text-gremius-text outline-none focus:border-gremius-cyan"
              >
                <option value="">All</option>
                <option v-for="o in getSelectOptions(f)" :key="o" :value="o">{{ o }}</option>
              </select>
              <input
                v-else-if="f.fieldType !== 'boolean'"
                v-model="colFilters[fieldSlug(f)]"
                type="text"
                placeholder="Filter..."
                class="w-full rounded border border-gremius-border bg-gremius-surface px-2 py-1 text-xs text-gremius-text placeholder-gremius-muted outline-none focus:border-gremius-cyan"
              />
            </td>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(entry, idx) in filtered"
            :key="entry.id"
            class="border-b border-gremius-border transition-colors hover:bg-gremius-surface/50"
          >
            <td class="px-4 py-3 font-mono text-xs text-gremius-muted">{{ idx + 1 }}</td>
            <td v-for="f in schema" :key="`${entry.id}-${f.fieldName}`" class="px-4 py-3">
              <span v-if="f.fieldType === 'number'" class="font-mono text-gremius-cyan">
                {{ cell(entry.data[fieldSlug(f)], f.fieldType) }}
              </span>
              <span
                v-else-if="f.fieldType === 'select' && entry.data[fieldSlug(f)]"
                class="inline-block rounded-full border border-gremius-pink/30 bg-gremius-pink/10 px-2 py-0.5 text-xs text-gremius-pink"
              >
                {{ entry.data[fieldSlug(f)] }}
              </span>
              <span
                v-else-if="f.fieldType === 'boolean'"
                :class="entry.data[fieldSlug(f)] ? 'text-gremius-green' : 'text-gremius-muted'"
              >
                {{ entry.data[fieldSlug(f)] ? '✓' : '✗' }}
              </span>
              <span v-else class="text-gremius-text">
                {{ cell(entry.data[fieldSlug(f)], f.fieldType) }}
              </span>
            </td>
          </tr>
          <tr v-if="filtered.length === 0">
            <td :colspan="schema.length + 1" class="px-4 py-12 text-center text-gremius-muted">
              No entries match your filters
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
