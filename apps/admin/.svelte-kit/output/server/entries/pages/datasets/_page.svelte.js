import "clsx";
import { j as derived, e as escape_html } from "../../../chunks/index.js";
import { z } from "zod";
import { X, L as Loader_circle, D as DataTable } from "../../../chunks/DataTable.js";
import { g as goto } from "../../../chunks/client.js";
import { Z as Zap } from "../../../chunks/zap.js";
import { P as Plus } from "../../../chunks/plus.js";
const API_URL = "http://localhost:3001";
class DatasetStore {
  // ─── Estado Reactivo Core ───
  /** Lista de datasets cargados */
  datasets = [];
  /** Estado de carga para operaciones async */
  isLoading = false;
  /** Dataset seleccionado actualmente (para edición/vista detalle) */
  selectedDataset = null;
  /** Error actual si existe */
  error = null;
  #totalCount = derived(() => this.datasets.length);
  get totalCount() {
    return this.#totalCount();
  }
  set totalCount($$value) {
    return this.#totalCount($$value);
  }
  #sortedDatasets = derived(() => [...this.datasets].sort((a, b) => a.name.localeCompare(b.name)));
  get sortedDatasets() {
    return this.#sortedDatasets();
  }
  set sortedDatasets($$value) {
    return this.#sortedDatasets($$value);
  }
  #hasDatasets = derived(() => this.datasets.length > 0);
  get hasDatasets() {
    return this.#hasDatasets();
  }
  set hasDatasets($$value) {
    return this.#hasDatasets($$value);
  }
  async fetchDatasets() {
    this.isLoading = true;
    this.error = null;
    try {
      const response = await fetch(`${API_URL}/api/datasets`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      this.datasets = data.docs || [];
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Failed to fetch datasets";
      console.error("[DatasetStore] fetchDatasets error:", err);
    } finally {
      this.isLoading = false;
    }
  }
  /**
   * Obtiene un dataset por ID y lo selecciona
   */
  async fetchDatasetById(id) {
    this.isLoading = true;
    this.error = null;
    try {
      const response = await fetch(`${API_URL}/api/datasets/${id}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const dataset = await response.json();
      this.selectedDataset = dataset;
      return dataset;
    } catch (err) {
      this.error = err instanceof Error ? err.message : `Failed to fetch dataset ${id}`;
      console.error(`[DatasetStore] fetchDatasetById(${id}) error:`, err);
      return null;
    } finally {
      this.isLoading = false;
    }
  }
  /**
   * Crea un nuevo dataset
   * Optimistic update: agrega a la lista local inmediatamente
   */
  async createDataset(payload) {
    this.isLoading = true;
    this.error = null;
    try {
      const response = await fetch(`${API_URL}/api/datasets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      const newDataset = await response.json();
      this.datasets = [...this.datasets, newDataset];
      return newDataset;
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Failed to create dataset";
      console.error("[DatasetStore] createDataset error:", err);
      return null;
    } finally {
      this.isLoading = false;
    }
  }
  /**
   * Actualiza un dataset existente
   */
  async updateDataset(id, payload) {
    this.isLoading = true;
    this.error = null;
    try {
      const response = await fetch(`${API_URL}/api/datasets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      const updatedDataset = await response.json();
      this.datasets = this.datasets.map((ds) => ds.id === id ? updatedDataset : ds);
      if (this.selectedDataset?.id === id) {
        this.selectedDataset = updatedDataset;
      }
      return updatedDataset;
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Failed to update dataset";
      console.error(`[DatasetStore] updateDataset(${id}) error:`, err);
      return null;
    } finally {
      this.isLoading = false;
    }
  }
  /**
   * Elimina un dataset
   */
  async deleteDataset(id) {
    this.isLoading = true;
    this.error = null;
    try {
      const response = await fetch(`${API_URL}/api/datasets/${id}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      this.datasets = this.datasets.filter((ds) => ds.id !== id);
      if (this.selectedDataset?.id === id) {
        this.selectedDataset = null;
      }
      return true;
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Failed to delete dataset";
      console.error(`[DatasetStore] deleteDataset(${id}) error:`, err);
      return false;
    } finally {
      this.isLoading = false;
    }
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // Métodos de UI State
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * Selecciona un dataset para edición/vista
   */
  selectDataset(dataset) {
    this.selectedDataset = dataset;
  }
  /**
   * Limpia el error actual
   */
  clearError() {
    this.error = null;
  }
  /**
   * Resetea el store a estado inicial
   */
  reset() {
    this.datasets = [];
    this.selectedDataset = null;
    this.error = null;
    this.isLoading = false;
  }
}
const datasetStore = new DatasetStore();
const FieldTypeSchema = z.enum([
  "text",
  "number",
  "boolean",
  "date",
  "image",
  "url",
  "email",
  "select",
  "json",
  "richtext",
  "relation"
]);
const RelationTypeSchema = z.enum([
  "one-to-one",
  "one-to-many",
  "many-to-many"
]);
const RelationTargetSchema = z.enum([
  "games",
  "blog-posts",
  "platforms",
  "tags",
  "streamers",
  "dataset"
]);
const RelationConfigSchema = z.object({
  target: RelationTargetSchema,
  targetDatasetId: z.string().optional(),
  targetDatasetName: z.string().optional(),
  type: RelationTypeSchema,
  displayField: z.string().optional()
});
const SelectOptionSchema = z.object({
  label: z.string(),
  value: z.string()
});
const FieldDefinitionSchema = z.object({
  // Identificación
  id: z.string().min(1, "Field ID is required"),
  key: z.string().min(1, "Field key is required"),
  label: z.string().min(1, "Field label is required"),
  type: FieldTypeSchema,
  // Metadata
  helpText: z.string().optional(),
  order: z.number().int().min(0).default(0),
  // Validaciones (estilo Django)
  isRequired: z.boolean().default(false),
  isUnique: z.boolean().default(false),
  validationRegex: z.string().optional(),
  defaultValue: z.string().optional(),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  minLength: z.number().int().min(0).optional(),
  maxLength: z.number().int().min(0).optional(),
  // Opciones para selects
  options: z.array(SelectOptionSchema).optional(),
  // Configuración de relaciones
  relation: RelationConfigSchema.optional(),
  // Configuración UI
  width: z.number().optional(),
  hidden: z.boolean().default(false)
});
const DatasetPolicySchema = z.object({
  readAccess: z.enum(["admin", "public", "authenticated"]),
  writeAccess: z.enum(["admin", "authenticated"]),
  enableRLS: z.boolean().default(false),
  rlsRules: z.array(z.object({
    field: z.string(),
    operator: z.enum(["eq", "neq", "contains", "gt", "lt"]),
    value: z.string()
  })).optional()
});
const DatasetWorkflowSchema = z.object({
  requireApproval: z.boolean(),
  approverUserIds: z.array(z.string()).optional()
});
const DatasetDefinitionSchema = z.object({
  // Identificación
  id: z.string(),
  name: z.string().min(1, "Dataset name is required"),
  slug: z.string().min(1, "Dataset slug is required"),
  description: z.string().optional(),
  icon: z.string().optional(),
  // El corazón: array de fields estructurados
  fields: z.array(FieldDefinitionSchema).min(0),
  // Configuración Enterprise
  policyJson: DatasetPolicySchema.nullable().optional(),
  workflowJson: DatasetWorkflowSchema.nullable().optional(),
  // Metadata
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});
z.object({
  id: z.string(),
  datasetId: z.string(),
  data: z.record(z.any()),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});
DatasetDefinitionSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).extend({
  // Campos opcionales para creación
  gameId: z.string().optional(),
  displayConfig: z.object({
    titleField: z.string().optional(),
    sortField: z.string().optional(),
    sortDirection: z.enum(["asc", "desc"]).optional()
  }).optional()
});
DatasetDefinitionSchema.partial().omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).extend({
  gameId: z.string().optional(),
  displayConfig: z.object({
    titleField: z.string().optional(),
    sortField: z.string().optional(),
    sortDirection: z.enum(["asc", "desc"]).optional()
  }).optional()
});
function DataSets($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const columns = [
      {
        accessorKey: "name",
        header: "Name",
        cell: (info) => {
          const ds = info.row.original;
          return `${ds.icon || "📦"} ${ds.name}`;
        }
      },
      { accessorKey: "slug", header: "Slug" },
      {
        accessorKey: "fields",
        header: "Fields",
        cell: (info) => {
          const count = info.getValue()?.length || 0;
          return `${count} field${count !== 1 ? "s" : ""}`;
        }
      },
      { accessorKey: "description", header: "Description" }
    ];
    function handleRowClick(dataset) {
      goto(`/datasets/${dataset.id}/entries`);
    }
    $$renderer2.push(`<div class="space-y-6 animate-fade-in svelte-1sbymb1"><div class="flex items-center justify-between"><div><h1 class="text-2xl font-bold text-white flex items-center gap-3"><div class="w-10 h-10 rounded-xl bg-gradient-to-br from-gremius-cyan/20 to-gremius-purple/20 border border-gremius-cyan/20 flex items-center justify-center">`);
    Zap($$renderer2, { class: "w-5 h-5 text-gremius-cyan" });
    $$renderer2.push(`<!----></div> Data Sets</h1> <p class="text-sm text-gremius-subtle mt-1">Manage your data collections and schemas.</p></div> <button class="btn-primary">`);
    Plus($$renderer2, { class: "w-4 h-4" });
    $$renderer2.push(`<!----> New Data Set</button></div> `);
    if (datasetStore.error) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="card p-4 border-l-4 border-l-gremius-pink bg-gremius-pink/5"><div class="flex items-center justify-between"><p class="text-gremius-pink">${escape_html(datasetStore.error)}</p> <button class="text-gremius-text-dim hover:text-white">`);
      X($$renderer2, { class: "w-4 h-4" });
      $$renderer2.push(`<!----></button></div></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (datasetStore.isLoading && datasetStore.datasets.length === 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="card p-12 text-center">`);
      Loader_circle($$renderer2, { class: "w-8 h-8 text-gremius-cyan animate-spin mx-auto mb-4" });
      $$renderer2.push(`<!----> <p class="text-gremius-subtle">Loading datasets...</p></div>`);
    } else if (datasetStore.datasets.length === 0) {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`<div class="card p-12 text-center"><div class="w-16 h-16 mx-auto mb-4 rounded-full bg-gremius-cyan/10 flex items-center justify-center">`);
      Zap($$renderer2, { class: "w-8 h-8 text-gremius-cyan/50" });
      $$renderer2.push(`<!----></div> <h3 class="text-lg font-medium text-white mb-2">No Data Sets Yet</h3> <p class="text-sm text-gremius-subtle max-w-md mx-auto mb-6">Create your first dataset to start collecting and managing data.</p> <button class="btn-primary">`);
      Plus($$renderer2, { class: "w-4 h-4" });
      $$renderer2.push(`<!----> Create First Data Set</button></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      DataTable($$renderer2, {
        data: datasetStore.datasets,
        columns,
        title: "",
        loading: datasetStore.isLoading,
        enableSorting: true,
        enableFiltering: true,
        enablePagination: true,
        pageSize: 10,
        onRowClick: handleRowClick,
        emptyMessage: "No datasets found"
      });
    }
    $$renderer2.push(`<!--]--></div> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function _page($$renderer) {
  DataSets($$renderer);
}
export {
  _page as default
};
