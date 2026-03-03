/**
 * Datasets Pinia Store
 * Manages dataset definitions (schemas) and entries (rows)
 */
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { DatasetDefinition, DatasetEntry } from "../types/datasets";
import { useApi } from "../composables/useApi";

export const useDatasetsStore = defineStore("datasets", () => {
  const api = useApi();

  const definitions = ref<DatasetDefinition[]>([]);
  const activeDefinition = ref<DatasetDefinition | null>(null);
  const entries = ref<DatasetEntry[]>([]);
  const loading = ref(false);

  // ─── Computed ─────────────────────────────────────
  const sidebarItems = computed(() =>
    definitions.value.map((d) => ({
      id: d.id,
      name: d.name,
      slug: d.slug,
      icon: d.icon || "📦",
      fieldCount: d.fields.length,
    }))
  );

  // ─── Definitions CRUD ─────────────────────────────
  async function loadDefinitions() {
    loading.value = true;
    try {
      const res = await api.get<any>("/data-sets?limit=100");
      if (res.docs) {
        definitions.value = res.docs.map(mapApiToDefinition);
      }
    } catch {
      // Use local state only
    } finally {
      loading.value = false;
    }
  }

  async function saveDefinition(def: DatasetDefinition) {
    loading.value = true;
    try {
      if (def.id && definitions.value.find((d) => d.id === def.id)) {
        // Update
        const res = await api.patch<any>(`/data-sets/${def.id}`, mapDefinitionToApi(def));
        const idx = definitions.value.findIndex((d) => d.id === def.id);
        if (idx >= 0) definitions.value[idx] = { ...def, ...res };
      } else {
        // Create
        const res = await api.post<any>("/data-sets", mapDefinitionToApi(def));
        def.id = res.id;
        definitions.value.push(def);
      }
    } catch (err) {
      console.error("Failed to save definition:", err);
      // Save locally anyway for offline UX
      const idx = definitions.value.findIndex((d) => d.id === def.id);
      if (idx >= 0) definitions.value[idx] = def;
      else definitions.value.push(def);
    } finally {
      loading.value = false;
    }
  }

  async function deleteDefinition(id: string) {
    try {
      await api.del(`/data-sets/${id}`);
    } catch { /* continue */ }
    definitions.value = definitions.value.filter((d) => d.id !== id);
    if (activeDefinition.value?.id === id) activeDefinition.value = null;
  }

  // ─── Entries CRUD ─────────────────────────────────
  async function loadEntries(datasetId: string) {
    loading.value = true;
    entries.value = [];
    try {
      const res = await api.get<any>(`/data-sets/${datasetId}/entries?limit=500`);
      if (res.docs) entries.value = res.docs;
      else if (Array.isArray(res)) entries.value = res;
    } catch { /* empty */ }
    finally { loading.value = false; }
  }

  async function saveEntry(datasetId: string, entry: Partial<DatasetEntry>) {
    try {
      if (entry.id) {
        const res = await api.patch<any>(`/data-sets/${datasetId}/entries/${entry.id}`, { data: entry.data });
        const idx = entries.value.findIndex((e) => e.id === entry.id);
        if (idx >= 0) entries.value[idx] = { ...entries.value[idx], ...res };
        return res;
      } else {
        const res = await api.post<any>(`/data-sets/${datasetId}/entries`, { data: entry.data });
        entries.value.push(res);
        return res;
      }
    } catch (err) {
      console.error("Failed to save entry:", err);
      throw err;
    }
  }

  async function deleteEntry(datasetId: string, entryId: string) {
    try {
      await api.del(`/data-sets/${datasetId}/entries/${entryId}`);
    } catch { /* continue */ }
    entries.value = entries.value.filter((e) => e.id !== entryId);
  }

  // ─── API Mapping Helpers ──────────────────────────
  function mapApiToDefinition(api: any): DatasetDefinition {
    return {
      id: api.id,
      name: api.name,
      slug: api.slug,
      description: api.description,
      icon: api.icon,
      fields: api.schema || api.fields || [],
      policyJson: api.policyJson || null,
      workflowJson: api.workflowJson || null,
      createdAt: api.createdAt,
      updatedAt: api.updatedAt,
    };
  }

  function mapDefinitionToApi(def: DatasetDefinition) {
    return {
      name: def.name,
      slug: def.slug,
      description: def.description,
      icon: def.icon,
      schema: def.fields,
      policyJson: def.policyJson || null,
      workflowJson: def.workflowJson || null,
    };
  }

  return {
    definitions, activeDefinition, entries, loading,
    sidebarItems,
    loadDefinitions, saveDefinition, deleteDefinition,
    loadEntries, saveEntry, deleteEntry,
  };
});
