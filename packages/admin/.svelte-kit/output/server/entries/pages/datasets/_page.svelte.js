import "clsx";
import { j as sanitize_props, k as spread_props, h as slot, l as derived, e as escape_html, a as ensure_array_like } from "../../../chunks/index.js";
import { Z as Zap } from "../../../chunks/zap.js";
import { P as Plus } from "../../../chunks/plus.js";
import { X } from "../../../chunks/x.js";
import { L as Loader_circle } from "../../../chunks/loader-circle.js";
import { I as Icon } from "../../../chunks/Icon.js";
import { T as Trash_2 } from "../../../chunks/trash-2.js";
function Pencil($$renderer, $$props) {
  const $$sanitized_props = sanitize_props($$props);
  /**
   * @license lucide-svelte v0.575.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   * ---
   *
   * The MIT License (MIT) (for portions derived from Feather)
   *
   * Copyright (c) 2013-2026 Cole Bemis
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   *
   */
  const iconNode = [
    [
      "path",
      {
        "d": "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
      }
    ],
    ["path", { "d": "m15 5 4 4" }]
  ];
  Icon($$renderer, spread_props([
    { name: "pencil" },
    $$sanitized_props,
    {
      /**
       * @component @name Pencil
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMjEuMTc0IDYuODEyYTEgMSAwIDAgMC0zLjk4Ni0zLjk4N0wzLjg0MiAxNi4xNzRhMiAyIDAgMCAwLS41LjgzbC0xLjMyMSA0LjM1MmEuNS41IDAgMCAwIC42MjMuNjIybDQuMzUzLTEuMzJhMiAyIDAgMCAwIC44My0uNDk3eiIgLz4KICA8cGF0aCBkPSJtMTUgNSA0IDQiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/pencil
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      iconNode,
      children: ($$renderer2) => {
        $$renderer2.push(`<!--[-->`);
        slot($$renderer2, $$props, "default", {});
        $$renderer2.push(`<!--]-->`);
      },
      $$slots: { default: true }
    }
  ]));
}
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
      const response = await fetch(`${API_URL}/api/datasets`, { credentials: "include" });
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
      const response = await fetch(`${API_URL}/api/datasets/${id}`, { credentials: "include" });
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
        credentials: "include",
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
        credentials: "include",
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
      const response = await fetch(`${API_URL}/api/datasets/${id}`, { method: "DELETE", credentials: "include" });
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
function DataSets($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    $$renderer2.push(`<div class="space-y-6 animate-fade-in"><div class="flex items-center justify-between"><div><h1 class="text-2xl font-bold text-gremius-text flex items-center gap-3"><div class="w-10 h-10 rounded-xl bg-gradient-to-br from-gremius-cyan/20 to-gremius-purple/20 border border-gremius-cyan/20 flex items-center justify-center">`);
    Zap($$renderer2, { class: "w-5 h-5 text-gremius-cyan" });
    $$renderer2.push(`<!----></div> Data Sets</h1> <p class="text-sm text-gremius-subtle mt-1">Manage your data collections and schemas.</p></div> <a href="/datasets/new" class="btn-primary inline-flex items-center gap-2">`);
    Plus($$renderer2, { class: "w-4 h-4" });
    $$renderer2.push(`<!----> New Data Set</a></div> `);
    if (datasetStore.error) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="card p-4 border-l-4 border-l-gremius-pink bg-gremius-pink/5"><div class="flex items-center justify-between"><p class="text-gremius-pink">${escape_html(datasetStore.error)}</p> <button class="text-gremius-text-dim hover:text-gremius-text">`);
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
      $$renderer2.push(`<!----></div> <h3 class="text-lg font-medium text-gremius-text mb-2">No Data Sets Yet</h3> <p class="text-sm text-gremius-subtle max-w-md mx-auto mb-6">Create your first dataset to start collecting and managing data.</p> <a href="/datasets/new" class="btn-primary inline-flex items-center gap-2">`);
      Plus($$renderer2, { class: "w-4 h-4" });
      $$renderer2.push(`<!----> Create First Data Set</a></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="card overflow-hidden"><table class="w-full text-left"><thead><tr class="border-b border-gremius-border bg-gremius-surface/50"><th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gremius-subtle">Name</th><th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gremius-subtle">Slug</th><th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gremius-subtle">Fields</th><th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gremius-subtle">Description</th><th class="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gremius-subtle text-right">Actions</th></tr></thead><tbody><!--[-->`);
      const each_array = ensure_array_like(datasetStore.datasets);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let dataset = each_array[$$index];
        $$renderer2.push(`<tr class="border-b border-gremius-border/50 hover:bg-gremius-surface/30 transition-colors cursor-pointer group"><td class="px-4 py-3"><span class="font-medium text-gremius-text group-hover:text-gremius-cyan transition-colors">${escape_html(dataset.icon || "📦")} ${escape_html(dataset.name)}</span></td><td class="px-4 py-3"><code class="text-xs text-gremius-subtle bg-gremius-surface px-2 py-0.5 rounded">${escape_html(dataset.slug)}</code></td><td class="px-4 py-3 text-sm text-gremius-text-dim">${escape_html(dataset.fields?.length || 0)} field${escape_html((dataset.fields?.length || 0) !== 1 ? "s" : "")}</td><td class="px-4 py-3 text-sm text-gremius-text-dim truncate max-w-[200px]">${escape_html(dataset.description || "—")}</td><td class="px-4 py-3 text-right"><div class="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button class="p-1.5 rounded-lg hover:bg-gremius-cyan/10 text-gremius-text-dim hover:text-gremius-cyan transition-colors" title="Edit schema">`);
        Pencil($$renderer2, { class: "w-4 h-4" });
        $$renderer2.push(`<!----></button> <button class="p-1.5 rounded-lg hover:bg-gremius-pink/10 text-gremius-text-dim hover:text-gremius-pink transition-colors" title="Delete">`);
        Trash_2($$renderer2, { class: "w-4 h-4" });
        $$renderer2.push(`<!----></button></div></td></tr>`);
      }
      $$renderer2.push(`<!--]--></tbody></table></div>`);
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
function _page($$renderer) {
  DataSets($$renderer);
}
export {
  _page as default
};
