import { k as ssr_context, g as getContext, s as sanitize_props, a as spread_props, b as slot, e as escape_html, d as attr_class, f as stringify, c as ensure_array_like, i as attr, j as derived, l as store_get, m as unsubscribe_stores } from "../../../../../chunks/index.js";
import { X, L as Loader_circle, D as DataTable } from "../../../../../chunks/DataTable.js";
import "clsx";
import { C as Chevron_down, A as Arrow_left, L as Layout_grid } from "../../../../../chunks/layout-grid.js";
import { S as Save } from "../../../../../chunks/save.js";
import "@sveltejs/kit/internal";
import "../../../../../chunks/exports.js";
import "../../../../../chunks/utils2.js";
import "@sveltejs/kit/internal/server";
import "../../../../../chunks/root.js";
import "../../../../../chunks/state.svelte.js";
import { I as Icon } from "../../../../../chunks/Icon.js";
import { F as Funnel } from "../../../../../chunks/funnel.js";
import { S as Settings } from "../../../../../chunks/settings.js";
import { P as Plus } from "../../../../../chunks/plus.js";
function onDestroy(fn) {
  /** @type {SSRContext} */
  ssr_context.r.on_destroy(fn);
}
const getStores = () => {
  const stores$1 = getContext("__svelte__");
  return {
    /** @type {typeof page} */
    page: {
      subscribe: stores$1.page.subscribe
    },
    /** @type {typeof navigating} */
    navigating: {
      subscribe: stores$1.navigating.subscribe
    },
    /** @type {typeof updated} */
    updated: stores$1.updated
  };
};
const page = {
  subscribe(fn) {
    const store = getStores().page;
    return store.subscribe(fn);
  }
};
function Database($$renderer, $$props) {
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
    ["ellipse", { "cx": "12", "cy": "5", "rx": "9", "ry": "3" }],
    ["path", { "d": "M3 5V19A9 3 0 0 0 21 19V5" }],
    ["path", { "d": "M3 12A9 3 0 0 0 21 12" }]
  ];
  Icon($$renderer, spread_props([
    { name: "database" },
    $$sanitized_props,
    {
      /**
       * @component @name Database
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8ZWxsaXBzZSBjeD0iMTIiIGN5PSI1IiByeD0iOSIgcnk9IjMiIC8+CiAgPHBhdGggZD0iTTMgNVYxOUE5IDMgMCAwIDAgMjEgMTlWNSIgLz4KICA8cGF0aCBkPSJNMyAxMkE5IDMgMCAwIDAgMjEgMTIiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/database
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      iconNode,
      children: ($$renderer2) => {
        $$renderer2.push(`<!--[-->`);
        slot($$renderer2, $$props, "default", {}, null);
        $$renderer2.push(`<!--]-->`);
      },
      $$slots: { default: true }
    }
  ]));
}
function Kanban($$renderer, $$props) {
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
    ["path", { "d": "M5 3v14" }],
    ["path", { "d": "M12 3v8" }],
    ["path", { "d": "M19 3v18" }]
  ];
  Icon($$renderer, spread_props([
    { name: "kanban" },
    $$sanitized_props,
    {
      /**
       * @component @name Kanban
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNNSAzdjE0IiAvPgogIDxwYXRoIGQ9Ik0xMiAzdjgiIC8+CiAgPHBhdGggZD0iTTE5IDN2MTgiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/kanban
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      iconNode,
      children: ($$renderer2) => {
        $$renderer2.push(`<!--[-->`);
        slot($$renderer2, $$props, "default", {}, null);
        $$renderer2.push(`<!--]-->`);
      },
      $$slots: { default: true }
    }
  ]));
}
function List($$renderer, $$props) {
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
    ["path", { "d": "M3 5h.01" }],
    ["path", { "d": "M3 12h.01" }],
    ["path", { "d": "M3 19h.01" }],
    ["path", { "d": "M8 5h13" }],
    ["path", { "d": "M8 12h13" }],
    ["path", { "d": "M8 19h13" }]
  ];
  Icon($$renderer, spread_props([
    { name: "list" },
    $$sanitized_props,
    {
      /**
       * @component @name List
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMyA1aC4wMSIgLz4KICA8cGF0aCBkPSJNMyAxMmguMDEiIC8+CiAgPHBhdGggZD0iTTMgMTloLjAxIiAvPgogIDxwYXRoIGQ9Ik04IDVoMTMiIC8+CiAgPHBhdGggZD0iTTggMTJoMTMiIC8+CiAgPHBhdGggZD0iTTggMTloMTMiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/list
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      iconNode,
      children: ($$renderer2) => {
        $$renderer2.push(`<!--[-->`);
        slot($$renderer2, $$props, "default", {}, null);
        $$renderer2.push(`<!--]-->`);
      },
      $$slots: { default: true }
    }
  ]));
}
function RelationshipField($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      value,
      relationType,
      label = "",
      placeholder = "Select...",
      helpText = "",
      required = false,
      error = ""
    } = $$props;
    let searchQuery = "";
    let items = [];
    let selectedIds = derived(() => () => {
      if (!value) return [];
      return Array.isArray(value) ? value : [value];
    });
    let selectedItem = derived(() => () => {
      if (!value || Array.isArray(value)) return null;
      return items.find((i) => i.id === value) || null;
    });
    function getDisplayLabel(item) {
      return item.label;
    }
    function getDisplayById(id) {
      const item = items.find((i) => i.id === id);
      return item?.label || id.slice(0, 8) + "...";
    }
    function onClickOutside(e) {
    }
    onDestroy(() => {
      document.removeEventListener("mousedown", onClickOutside);
    });
    $$renderer2.push(`<div class="space-y-1.5">`);
    if (
      // Re-fetch when target changes
      label
    ) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<label class="label block">${escape_html(label)} `);
      if (required) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<span class="text-gremius-pink">*</span>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></label>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (relationType === "one-to-one") {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="relative"><button type="button"${attr_class(`input flex items-center justify-between gap-2 text-left ${stringify(!selectedItem()() ? "text-gremius-subtle" : "")}`)}><span class="truncate">${escape_html(selectedItem()() ? getDisplayLabel(selectedItem()()) : placeholder)}</span> `);
      Chevron_down($$renderer2, {
        class: `w-4 h-4 text-gremius-subtle transition-transform shrink-0 ${stringify("")}`
      });
      $$renderer2.push(`<!----></button> `);
      {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (relationType !== "one-to-one") {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div><button type="button" class="input min-h-[2.5rem] flex flex-wrap items-center gap-1.5 cursor-text w-full text-left"><!--[-->`);
      const each_array_1 = ensure_array_like(selectedIds()());
      for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
        let id = each_array_1[$$index_1];
        $$renderer2.push(`<span class="inline-flex items-center gap-1 rounded-md bg-gremius-cyan-10 border border-gremius-cyan-20 px-2 py-0.5 text-xs text-gremius-cyan svelte-11k9kqe">${escape_html(getDisplayById(id))} <span class="hover:text-gremius-pink transition-colors cursor-pointer">`);
        X($$renderer2, { class: "w-3 h-3" });
        $$renderer2.push(`<!----></span></span>`);
      }
      $$renderer2.push(`<!--]--> <input${attr("value", searchQuery)} type="text"${attr("placeholder", selectedIds()().length === 0 ? placeholder : "")} class="flex-1 min-w-[60px] bg-transparent text-sm outline-none placeholder:text-gremius-subtle"/></button> `);
      {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (helpText) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<p class="text-[10px] text-gremius-subtle">${escape_html(helpText)}</p>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (error) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<p class="text-[10px] text-gremius-pink">${escape_html(error)}</p>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
function DynamicForm($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      fields,
      submitLabel = "Save Entry"
    } = $$props;
    let formData = {};
    let fieldErrors = {};
    let submitting = false;
    let visibleFields = derived(() => [...fields].sort((a, b) => a.order - b.order));
    function setField(key, value) {
      formData[key] = value;
      if (fieldErrors[key]) delete fieldErrors[key];
    }
    $$renderer2.push(`<form class="space-y-5"><!--[-->`);
    const each_array = ensure_array_like(visibleFields());
    for (let $$index_1 = 0, $$length = each_array.length; $$index_1 < $$length; $$index_1++) {
      let field = each_array[$$index_1];
      $$renderer2.push(`<div class="space-y-1.5">`);
      if (field.type === "text") {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<label class="label block">${escape_html(field.label)} `);
        if (field.isRequired) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="text-gremius-pink">*</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></label> <input${attr("value", formData[field.key] || "")} type="text"${attr("placeholder", field.helpText || `Enter ${field.label.toLowerCase()}`)}${attr_class(
          `input ${stringify(fieldErrors[field.key] ? "border-gremius-pink-50 focus:ring-gremius-pink-30" : "")}`,
          "svelte-b8539n"
        )}/>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (field.type === "number") {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<label class="label block">${escape_html(field.label)} `);
        if (field.isRequired) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="text-gremius-pink">*</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></label> <input${attr("value", formData[field.key] || "")} type="number"${attr("min", field.minValue)}${attr("max", field.maxValue)}${attr("placeholder", field.helpText || "0")}${attr_class(
          `input ${stringify(fieldErrors[field.key] ? "border-gremius-pink-50 focus:ring-gremius-pink-30" : "")}`,
          "svelte-b8539n"
        )}/>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (field.type === "boolean") {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="flex items-center justify-between py-1"><div><label class="text-sm font-medium text-gremius-text">${escape_html(field.label)} `);
        if (field.isRequired) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="text-gremius-pink">*</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></label> `);
        if (field.helpText) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<p class="text-[10px] text-gremius-subtle">${escape_html(field.helpText)}</p>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div> <button type="button"${attr_class(`relative w-10 h-6 rounded-full transition-colors ${stringify(formData[field.key] ? "bg-gremius-cyan" : "bg-gremius-border")}`)}><span${attr_class(`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${stringify(formData[field.key] ? "translate-x-[18px]" : "translate-x-[2px]")}`)}></span></button></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (field.type === "date") {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<label class="label block">${escape_html(field.label)} `);
        if (field.isRequired) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="text-gremius-pink">*</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></label> <input${attr("value", formData[field.key] || "")} type="date"${attr_class(
          `input ${stringify(fieldErrors[field.key] ? "border-gremius-pink-50 focus:ring-gremius-pink-30" : "")}`,
          "svelte-b8539n"
        )}/>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (field.type === "url") {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<label class="label block">${escape_html(field.label)} `);
        if (field.isRequired) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="text-gremius-pink">*</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></label> <input${attr("value", formData[field.key] || "")} type="url" placeholder="https://"${attr_class(
          `input ${stringify(fieldErrors[field.key] ? "border-gremius-pink-50 focus:ring-gremius-pink-30" : "")}`,
          "svelte-b8539n"
        )}/>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (field.type === "email") {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<label class="label block">${escape_html(field.label)} `);
        if (field.isRequired) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="text-gremius-pink">*</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></label> <input${attr("value", formData[field.key] || "")} type="email"${attr("placeholder", field.helpText || "email@example.com")}${attr_class(
          `input ${stringify(fieldErrors[field.key] ? "border-gremius-pink-50 focus:ring-gremius-pink-30" : "")}`,
          "svelte-b8539n"
        )}/>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (field.type === "image") {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<label class="label block">${escape_html(field.label)} `);
        if (field.isRequired) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="text-gremius-pink">*</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></label> <div class="flex items-end gap-3"><div class="flex-1"><input${attr("value", formData[field.key] || "")} type="url" placeholder="Image URL or upload path"${attr_class(
          `input ${stringify(fieldErrors[field.key] ? "border-gremius-pink-50 focus:ring-gremius-pink-30" : "")}`,
          "svelte-b8539n"
        )}/></div> `);
        if (formData[field.key]) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="w-10 h-10 rounded-lg border border-gremius-border overflow-hidden shrink-0"><img${attr("src", formData[field.key])} class="w-full h-full object-cover" alt=""/></div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (field.type === "select") {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<label class="label block">${escape_html(field.label)} `);
        if (field.isRequired) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="text-gremius-pink">*</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></label> `);
        $$renderer2.select(
          {
            value: formData[field.key] || "",
            onchange: (e) => setField(field.key, e.currentTarget.value),
            class: `select ${stringify(fieldErrors[field.key] ? "border-gremius-pink-50 focus:ring-gremius-pink-30" : "")}`
          },
          ($$renderer3) => {
            $$renderer3.option({ value: "" }, ($$renderer4) => {
              $$renderer4.push(`— Select —`);
            });
            $$renderer3.push(`<!--[-->`);
            const each_array_1 = ensure_array_like(field.options || []);
            for (let $$index = 0, $$length2 = each_array_1.length; $$index < $$length2; $$index++) {
              let opt = each_array_1[$$index];
              $$renderer3.option({ value: opt.value }, ($$renderer4) => {
                $$renderer4.push(`${escape_html(opt.label)}`);
              });
            }
            $$renderer3.push(`<!--]-->`);
          },
          "svelte-b8539n"
        );
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (field.type === "json") {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<label class="label block">${escape_html(field.label)} `);
        if (field.isRequired) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="text-gremius-pink">*</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></label> <textarea rows="4" placeholder="{ &quot;key&quot;: &quot;value&quot; }"${attr_class(
          `textarea font-mono text-xs ${stringify(fieldErrors[field.key] ? "border-gremius-pink-50 focus:ring-gremius-pink-30" : "")}`,
          "svelte-b8539n"
        )}>`);
        const $$body = escape_html(typeof formData[field.key] === "string" ? formData[field.key] : JSON.stringify(formData[field.key], null, 2));
        if ($$body) {
          $$renderer2.push(`${$$body}`);
        }
        $$renderer2.push(`</textarea>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (field.type === "richtext") {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<label class="label block">${escape_html(field.label)} `);
        if (field.isRequired) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="text-gremius-pink">*</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></label> <textarea rows="5"${attr("placeholder", field.helpText || "Enter content (Markdown supported)")}${attr_class(
          `textarea ${stringify(fieldErrors[field.key] ? "border-gremius-pink-50 focus:ring-gremius-pink-30" : "")}`,
          "svelte-b8539n"
        )}>`);
        const $$body_1 = escape_html(formData[field.key] || "");
        if ($$body_1) {
          $$renderer2.push(`${$$body_1}`);
        }
        $$renderer2.push(`</textarea>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (field.type === "relation" && field.relation) {
        $$renderer2.push("<!--[-->");
        RelationshipField($$renderer2, {
          value: formData[field.key],
          target: field.relation.target,
          targetDatasetId: field.relation.targetDatasetId,
          relationType: field.relation.type,
          displayField: field.relation.displayField,
          label: field.label,
          helpText: field.helpText,
          required: field.isRequired,
          error: fieldErrors[field.key]
        });
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (field.type !== "relation" && field.type !== "boolean") {
        $$renderer2.push("<!--[-->");
        if (field.helpText && !fieldErrors[field.key]) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<p class="text-[10px] text-gremius-subtle">${escape_html(field.helpText)}</p>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (fieldErrors[field.key]) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<p class="text-[10px] text-gremius-pink">${escape_html(fieldErrors[field.key])}</p>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]-->`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]--> <div class="flex items-center justify-between pt-4 border-t border-gremius-border"><div>`);
    if (Object.keys(fieldErrors).length > 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<p class="text-xs text-gremius-pink">${escape_html(Object.keys(fieldErrors).length)} field(s) need attention</p>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div> <div class="flex items-center gap-3"><button type="button" class="btn-ghost">Cancel</button> <button type="submit"${attr("disabled", submitting, true)} class="btn-primary">`);
    {
      $$renderer2.push("<!--[!-->");
      Save($$renderer2, { class: "w-4 h-4" });
    }
    $$renderer2.push(`<!--]--> ${escape_html(submitLabel)}</button></div></div></form>`);
  });
}
function DataSetEntries($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    let {
      datasetId = store_get($$store_subs ??= {}, "$page", page).params.id
    } = $$props;
    let loading = true;
    let dataset = null;
    let entries = [];
    let showEntryForm = false;
    let editingEntry = null;
    let columns = derived(() => []);
    function handleRowClick(row) {
      editingEntry = row;
      showEntryForm = true;
    }
    $$renderer2.push(`<div class="space-y-6 animate-fade-in svelte-1sn2ha0"><div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4"><div class="flex items-start gap-4"><button class="p-2 rounded-lg hover:bg-gremius-card text-gremius-text-dim transition-colors">`);
    Arrow_left($$renderer2, { class: "w-5 h-5" });
    $$renderer2.push(`<!----></button> <div><div class="flex items-center gap-3"><h1 class="text-2xl font-bold text-white flex items-center gap-3"><div class="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-20 to-purple-20 border border-cyan-20 flex items-center justify-center">`);
    Database($$renderer2, { class: "w-5 h-5 text-gremius-cyan" });
    $$renderer2.push(`<!----></div> `);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<span class="animate-pulse">Loading...</span>`);
    }
    $$renderer2.push(`<!--]--></h1> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div> <p class="text-sm text-gremius-subtle mt-1">${escape_html(`Manage entries for this dataset`)}</p></div></div> <div class="flex items-center gap-2 w-full lg:w-auto"><div class="flex items-center bg-gremius-card border border-gremius-border rounded-lg p-0.5"><button${attr_class(`p-1.5 rounded transition-colors ${stringify("bg-cyan-10 text-gremius-cyan")}`)} title="Table view">`);
    List($$renderer2, { class: "w-4 h-4" });
    $$renderer2.push(`<!----></button> <button${attr_class(`p-1.5 rounded transition-colors ${stringify("text-gremius-text-dim hover:text-gremius-text")}`)} title="Grid view">`);
    Layout_grid($$renderer2, { class: "w-4 h-4" });
    $$renderer2.push(`<!----></button> <button${attr_class(`p-1.5 rounded transition-colors ${stringify("text-gremius-text-dim hover:text-gremius-text")}`)} title="Kanban view">`);
    Kanban($$renderer2, { class: "w-4 h-4" });
    $$renderer2.push(`<!----></button></div> <button class="btn-secondary">`);
    Funnel($$renderer2, { class: "w-4 h-4" });
    $$renderer2.push(`<!----> Filter</button> <button class="btn-secondary">`);
    Settings($$renderer2, { class: "w-4 h-4" });
    $$renderer2.push(`<!----> Schema</button> <button class="btn-primary">`);
    Plus($$renderer2, { class: "w-4 h-4" });
    $$renderer2.push(`<!----> New Entry</button></div></div> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (entries.length === 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="card p-12 text-center">`);
      Loader_circle($$renderer2, { class: "w-8 h-8 text-gremius-cyan animate-spin mx-auto mb-4" });
      $$renderer2.push(`<!----> <p class="text-gremius-subtle">Loading entries...</p></div>`);
    } else if (entries.length === 0 && !loading) {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`<div class="card p-12 text-center"><div class="w-16 h-16 mx-auto mb-4 rounded-full bg-gremius-cyan/10 flex items-center justify-center">`);
      Database($$renderer2, { class: "w-8 h-8 text-gremius-cyan/50" });
      $$renderer2.push(`<!----></div> <h3 class="text-lg font-medium text-white mb-2">No Entries Yet</h3> <p class="text-sm text-gremius-subtle max-w-md mx-auto mb-6">Create your first entry in this dataset.</p> <button class="btn-primary">`);
      Plus($$renderer2, { class: "w-4 h-4" });
      $$renderer2.push(`<!----> Create First Entry</button></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      {
        $$renderer2.push("<!--[-->");
        DataTable($$renderer2, {
          data: entries,
          columns: columns(),
          title: "",
          loading,
          enableSorting: true,
          enableFiltering: true,
          enablePagination: true,
          pageSize: 10,
          onRowClick: handleRowClick,
          emptyMessage: "No entries found in this dataset"
        });
      }
      $$renderer2.push(`<!--]-->`);
    }
    $$renderer2.push(`<!--]--></div> `);
    if (showEntryForm && dataset) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"><div class="card w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"><div class="flex items-center justify-between p-4 border-b border-gremius-border"><h2 class="text-xl font-bold text-white">${escape_html(editingEntry ? "Edit" : "New")} Entry</h2> <button class="btn-icon">`);
      X($$renderer2, { class: "w-5 h-5" });
      $$renderer2.push(`<!----></button></div> <div class="flex-1 overflow-y-auto p-6">`);
      if (dataset.fields.length > 0) {
        $$renderer2.push("<!--[-->");
        DynamicForm($$renderer2, {
          fields: dataset.fields,
          initialData: editingEntry?.data || {},
          submitLabel: editingEntry ? "Update Entry" : "Create Entry"
        });
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<p class="text-gremius-subtle text-center py-8">No fields defined for this dataset. <a${attr("href", `/datasets/${datasetId}/schema`)} class="text-gremius-cyan">Configure schema first</a>.</p>`);
      }
      $$renderer2.push(`<!--]--></div></div></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]-->`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    DataSetEntries($$renderer2, {
      datasetId: store_get($$store_subs ??= {}, "$page", page).params.id
    });
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
export {
  _page as default
};
