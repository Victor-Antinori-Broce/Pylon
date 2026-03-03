<!--
  InteractiveGrid.vue — AirTable-style data grid for the public site.

  Features:
    - Client-side sorting (click headers)
    - Global search
    - Optional grouping by a field
    - Smart cell renderers based on dataset schema field types
    - Cyberpunk / Glassmorphism styling
    - Horizontal scroll on mobile
    - Virtualization for > 100 rows (via simple windowing)
-->
<template>
  <div class="smart-grid-wrapper">
    <!-- Title bar -->
    <div class="grid-header">
      <h3 class="grid-title">{{ datasetName }}</h3>
      <div class="grid-toolbar">
        <span class="grid-count">{{ filteredRows.length }} rows</span>
        <div class="search-box">
          <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search..."
            class="search-input"
          />
        </div>
      </div>
    </div>

    <!-- Table container (horizontal scroll on mobile) -->
    <div class="grid-scroll-container" ref="scrollContainer">
      <table class="grid-table">
        <thead>
          <tr>
            <th
              v-for="col in visibleFields"
              :key="col.key"
              @click="toggleSort(col.key)"
              class="grid-th"
              :class="{ 'sort-active': sortKey === col.key }"
            >
              <span class="th-label">{{ col.label }}</span>
              <span v-if="sortKey === col.key" class="sort-arrow">
                {{ sortDir === 'asc' ? '↑' : '↓' }}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          <!-- Grouped rendering -->
          <template v-if="enableGrouping && groupByField && groups.length > 0">
            <template v-for="group in groups" :key="group.label">
              <tr class="group-header-row">
                <td :colspan="visibleFields.length" class="group-header-cell">
                  <span class="group-label">{{ group.label }}</span>
                  <span class="group-count">{{ group.rows.length }} items</span>
                </td>
              </tr>
              <tr
                v-for="(row, ri) in group.rows"
                :key="row._id || ri"
                class="grid-row"
              >
                <td v-for="col in visibleFields" :key="col.key" class="grid-td">
                  <CellRenderer :value="row[col.key]" :field="col" />
                </td>
              </tr>
            </template>
          </template>

          <!-- Flat rendering (with optional virtualization) -->
          <template v-else>
            <tr v-if="useVirtualization" :style="{ height: topPad + 'px' }" />
            <tr
              v-for="(row, ri) in displayRows"
              :key="row._id || ri"
              class="grid-row"
            >
              <td v-for="col in visibleFields" :key="col.key" class="grid-td">
                <CellRenderer :value="row[col.key]" :field="col" />
              </td>
            </tr>
            <tr v-if="useVirtualization" :style="{ height: bottomPad + 'px' }" />
          </template>

          <!-- Empty state -->
          <tr v-if="filteredRows.length === 0">
            <td :colspan="visibleFields.length" class="empty-td">
              No data found.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, defineComponent, h } from "vue";

// ── Props ──
// ── Props ──
interface Props {
  datasetName: string;
  schema: { fields: any[] };
  rows: any[];
  visibleColumns: string[];
  initialSort: string;
  enableGrouping: boolean;
  groupByField: string;
  readOnly?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  readOnly: false
});

// ── State ──
const searchQuery = ref("");
const sortKey = ref(props.initialSort || "");
const sortDir = ref<"asc" | "desc">("asc");
const scrollContainer = ref<HTMLElement | null>(null);
const scrollTop = ref(0);
const containerHeight = ref(600);

const ROW_HEIGHT = 44;
const VIRTUALIZATION_THRESHOLD = 100;

// ── Computed: visible fields ──
const visibleFields = computed(() => {
  const fields: any[] = props.schema.fields || [];
  if (props.visibleColumns.length > 0) {
    return props.visibleColumns
      .map((key: string) => fields.find((f: any) => f.key === key))
      .filter(Boolean);
  }
  return fields.filter((f: any) => !f.hidden).sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
});

// ── Computed: filtered + sorted rows ──
const filteredRows = computed(() => {
  let result = [...props.rows];

  // Global search
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    result = result.filter((row: any) =>
      Object.values(row).some((val: any) =>
        val !== null && val !== undefined && String(val).toLowerCase().includes(q)
      )
    );
  }

  // Sort
  if (sortKey.value) {
    const key = sortKey.value;
    const dir = sortDir.value === "asc" ? 1 : -1;
    result.sort((a: any, b: any) => {
      const va = a[key];
      const vb = b[key];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }

  return result;
});

// ── Grouping ──
interface Group { label: string; rows: any[] }

const groups = computed((): Group[] => {
  if (!props.enableGrouping || !props.groupByField) return [];
  const map = new Map<string, any[]>();
  for (const row of filteredRows.value) {
    const key = row[props.groupByField] ?? "(No value)";
    const label = String(key);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(row);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, rows]) => ({ label, rows }));
});

// ── Virtualization ──
const useVirtualization = computed(() =>
  filteredRows.value.length > VIRTUALIZATION_THRESHOLD &&
  !props.enableGrouping
);

const visibleRange = computed(() => {
  if (!useVirtualization.value) return { start: 0, end: filteredRows.value.length };
  const start = Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - 5);
  const visibleCount = Math.ceil(containerHeight.value / ROW_HEIGHT) + 10;
  const end = Math.min(filteredRows.value.length, start + visibleCount);
  return { start, end };
});

const displayRows = computed(() => {
  if (!useVirtualization.value) return filteredRows.value;
  return filteredRows.value.slice(visibleRange.value.start, visibleRange.value.end);
});

const topPad = computed(() =>
  useVirtualization.value ? visibleRange.value.start * ROW_HEIGHT : 0
);

const bottomPad = computed(() =>
  useVirtualization.value
    ? (filteredRows.value.length - visibleRange.value.end) * ROW_HEIGHT
    : 0
);

function onScroll() {
  if (scrollContainer.value) {
    scrollTop.value = scrollContainer.value.scrollTop;
  }
}

onMounted(() => {
  if (scrollContainer.value) {
    scrollContainer.value.addEventListener("scroll", onScroll, { passive: true });
    containerHeight.value = scrollContainer.value.clientHeight || 600;
  }
});

onUnmounted(() => {
  scrollContainer.value?.removeEventListener("scroll", onScroll);
});

// ── Sort toggle ──
function toggleSort(key: string) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortKey.value = key;
    sortDir.value = "asc";
  }
}

// ── CellRenderer (inline functional component) ──
const CellRenderer = defineComponent({
  props: {
    value: { type: null, default: null },
    field: { type: Object, required: true },
  },
  setup(props) {
    return () => {
      const val = props.value;
      const type = props.field?.type || "text";

      // Null / undefined
      if (val === null || val === undefined || val === "") {
        return h("span", { class: "cell-empty" }, "—");
      }

      // Boolean
      if (type === "boolean") {
        return h("span", {
          class: val ? "cell-badge cell-badge-green" : "cell-badge cell-badge-dim"
        }, val ? "Yes" : "No");
      }

      // Image
      if (type === "image") {
        const src = typeof val === "string" ? val : val?.url;
        if (!src) return h("span", { class: "cell-empty" }, "—");
        return h("img", {
          src,
          alt: "",
          class: "cell-avatar",
          loading: "lazy",
        });
      }

      // URL
      if (type === "url") {
        return h("a", {
          href: val,
          target: "_blank",
          rel: "noopener",
          class: "cell-link",
        }, truncate(String(val), 40));
      }

      // Email
      if (type === "email") {
        return h("a", {
          href: `mailto:${val}`,
          class: "cell-link",
        }, String(val));
      }

      // Select (render as badge)
      if (type === "select") {
        return h("span", { class: "cell-badge cell-badge-accent" }, String(val));
      }

      // Number
      if (type === "number") {
        return h("span", { class: "cell-number" }, formatNumber(val));
      }

      // Date
      if (type === "date") {
        try {
          return h("span", { class: "cell-date" },
            new Date(val).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })
          );
        } catch {
          return h("span", {}, String(val));
        }
      }

      // Relation
      if (type === "relation") {
        if (Array.isArray(val)) {
          return h("div", { class: "cell-relations" },
            val.map((item: any) =>
              h("span", { class: "cell-badge cell-badge-relation" },
                item.title || item.name || item.id || String(item)
              )
            )
          );
        }
        const label = val?.title || val?.name || val?.id || String(val);
        return h("span", { class: "cell-badge cell-badge-relation" }, label);
      }

      // JSON
      if (type === "json") {
        return h("code", { class: "cell-json" },
          typeof val === "string" ? val : JSON.stringify(val)
        );
      }

      // Default: text / richtext
      return h("span", { class: "cell-text" }, truncate(String(val), 80));
    };
  },
});

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function formatNumber(n: any): string {
  const num = Number(n);
  if (isNaN(num)) return String(n);
  return num.toLocaleString();
}
</script>

<style scoped>
/* ── Container ── */
.smart-grid-wrapper {
  background: rgba(24, 24, 32, 0.5);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 1rem;
  overflow: hidden;
  font-family: 'Inter', system-ui, sans-serif;
}

/* ── Header ── */
.grid-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.875rem 1.25rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.grid-title {
  font-size: 0.875rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.85);
  letter-spacing: 0.01em;
}

.grid-toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.grid-count {
  font-size: 0.65rem;
  font-weight: 500;
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.35);
  white-space: nowrap;
}

.search-box {
  position: relative;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: rgba(255, 255, 255, 0.25);
}

.search-input {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 6px 10px 6px 32px;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.8);
  width: 180px;
  outline: none;
  transition: border-color 0.2s, width 0.2s;
}
.search-input::placeholder { color: rgba(255, 255, 255, 0.2); }
.search-input:focus {
  border-color: rgba(0, 229, 255, 0.3);
  width: 220px;
}

/* ── Scroll container ── */
.grid-scroll-container {
  overflow: auto;
  max-height: 600px;
}

/* ── Table ── */
.grid-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 600px; /* force horizontal scroll on narrow screens */
}

/* ── Header cells ── */
.grid-th {
  position: sticky;
  top: 0;
  z-index: 10;
  background: rgba(16, 16, 24, 0.95);
  backdrop-filter: blur(12px);
  padding: 10px 14px;
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.35);
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition: color 0.15s;
}
.grid-th:hover { color: rgba(255, 255, 255, 0.6); }
.grid-th.sort-active { color: #00E5FF; }

.th-label { margin-right: 4px; }

.sort-arrow {
  font-size: 0.6rem;
  color: #00E5FF;
}

/* ── Body rows ── */
.grid-row {
  transition: background 0.15s;
}
.grid-row:hover {
  background: rgba(0, 229, 255, 0.03);
}

.grid-td {
  padding: 10px 14px;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.7);
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  vertical-align: middle;
}

/* ── Group header ── */
.group-header-row {
  background: rgba(0, 229, 255, 0.04);
}

.group-header-cell {
  padding: 8px 14px;
  border-bottom: 1px solid rgba(0, 229, 255, 0.08);
}

.group-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: #00E5FF;
  margin-right: 8px;
}

.group-count {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.3);
}

/* ── Cell renderers ── */
.cell-empty {
  color: rgba(255, 255, 255, 0.12);
}

.cell-text {
  line-height: 1.4;
}

.cell-number {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.cell-date {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
}

.cell-avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  object-fit: cover;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.cell-link {
  color: #00E5FF;
  text-decoration: none;
  font-size: 0.75rem;
  transition: color 0.15s;
}
.cell-link:hover {
  color: #62EFFF;
  text-decoration: underline;
}

.cell-json {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 255, 255, 0.4);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
}

/* ── Badges ── */
.cell-badge {
  display: inline-block;
  font-size: 0.65rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
  letter-spacing: 0.02em;
}

.cell-badge-green {
  background: rgba(0, 200, 83, 0.1);
  color: #69F0AE;
  border: 1px solid rgba(0, 200, 83, 0.15);
}

.cell-badge-dim {
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 255, 255, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.cell-badge-accent {
  background: rgba(0, 229, 255, 0.08);
  color: #00E5FF;
  border: 1px solid rgba(0, 229, 255, 0.12);
}

.cell-badge-relation {
  background: rgba(224, 64, 251, 0.08);
  color: #E040FB;
  border: 1px solid rgba(224, 64, 251, 0.12);
  margin-right: 4px;
}

.cell-relations {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

/* ── Empty state ── */
.empty-td {
  padding: 3rem 1rem;
  text-align: center;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.2);
}

/* ── Mobile ── */
@media (max-width: 640px) {
  .grid-header { flex-direction: column; gap: 0.5rem; align-items: stretch; }
  .search-input { width: 100%; }
  .search-input:focus { width: 100%; }
}
</style>
