import { j as sanitize_props, k as spread_props, h as slot, a as ensure_array_like, e as escape_html, c as attr_class, o as stringify } from "../../../chunks/index.js";
import { D as Database } from "../../../chunks/database.js";
import { S as Search } from "../../../chunks/search.js";
import { I as Icon } from "../../../chunks/Icon.js";
import { C as Chevron_right } from "../../../chunks/chevron-right.js";
import { S as Settings } from "../../../chunks/settings.js";
function Chevron_down($$renderer, $$props) {
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
  const iconNode = [["path", { "d": "m6 9 6 6 6-6" }]];
  Icon($$renderer, spread_props([
    { name: "chevron-down" },
    $$sanitized_props,
    {
      /**
       * @component @name ChevronDown
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJtNiA5IDYgNiA2LTYiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/chevron-down
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
function Table_2($$renderer, $$props) {
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
        "d": "M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"
      }
    ]
  ];
  Icon($$renderer, spread_props([
    { name: "table-2" },
    $$sanitized_props,
    {
      /**
       * @component @name Table2
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNOSAzSDVhMiAyIDAgMCAwLTIgMnY0bTYtNmgxMGEyIDIgMCAwIDEgMiAydjRNOSAzdjE4bTAgMGgxMGEyIDIgMCAwIDAgMi0yVjlNOSAyMUg1YTIgMiAwIDAgMS0yLTJWOW0wIDBoMTgiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/table-2
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
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let grimoires = [];
    let expandedGrimoires = /* @__PURE__ */ new Set();
    let selectedTable = null;
    $$renderer2.push(`<div class="h-[calc(100vh-4rem)] flex">`);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="w-64 border-r border-gremius-border bg-gremius-card flex flex-col"><div class="p-4 border-b border-gremius-border"><div class="flex items-center gap-2 mb-3">`);
      Database($$renderer2, { class: "w-5 h-5 text-gremius-cyan" });
      $$renderer2.push(`<!----> <span class="font-semibold text-gremius-text">Tables</span></div> <div class="relative">`);
      Search($$renderer2, {
        class: "absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gremius-text-dim"
      });
      $$renderer2.push(`<!----> <input type="text" placeholder="Search tables..." class="w-full pl-9 pr-3 py-2 text-sm bg-gremius-bg border border-gremius-border rounded-lg text-gremius-text placeholder:text-gremius-text-dim focus:outline-none focus:border-gremius-cyan/50"/></div></div> <div class="flex-1 overflow-y-auto p-2 space-y-1"><!--[-->`);
      const each_array = ensure_array_like(grimoires);
      for (let $$index_1 = 0, $$length = each_array.length; $$index_1 < $$length; $$index_1++) {
        let grimoire = each_array[$$index_1];
        $$renderer2.push(`<div class="mb-1"><button class="w-full text-left px-2 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 text-gremius-text hover:bg-gremius-bg">`);
        if (expandedGrimoires.has(grimoire.key)) {
          $$renderer2.push("<!--[-->");
          Chevron_down($$renderer2, { class: "w-4 h-4 text-gremius-text-dim" });
        } else {
          $$renderer2.push("<!--[!-->");
          Chevron_right($$renderer2, { class: "w-4 h-4 text-gremius-text-dim" });
        }
        $$renderer2.push(`<!--]--> <span class="text-lg">${escape_html(grimoire.icon)}</span> <span class="font-medium truncate">${escape_html(grimoire.name)}</span> <span class="ml-auto text-xs text-gremius-subtle bg-gremius-bg px-1.5 py-0.5 rounded">${escape_html(grimoire.tables.length)}</span></button> `);
        if (expandedGrimoires.has(grimoire.key)) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="ml-4 mt-1 space-y-0.5 border-l-2 border-gremius-border pl-2"><!--[-->`);
          const each_array_1 = ensure_array_like(grimoire.tables);
          for (let $$index = 0, $$length2 = each_array_1.length; $$index < $$length2; $$index++) {
            let table = each_array_1[$$index];
            $$renderer2.push(`<button${attr_class(`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${stringify(selectedTable?.name === table.name ? "bg-gremius-cyan/10 text-gremius-cyan" : "text-gremius-text-dim hover:text-gremius-text hover:bg-gremius-bg")}`)}>`);
            Table_2($$renderer2, { class: "w-4 h-4" });
            $$renderer2.push(`<!----> <span class="truncate">${escape_html(table.name)}</span> <span class="ml-auto text-xs opacity-60">${escape_html(table.column_count)}</span></button>`);
          }
          $$renderer2.push(`<!--]--></div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div>`);
      }
      $$renderer2.push(`<!--]--></div> <div class="p-3 border-t border-gremius-border"><button class="w-full flex items-center gap-2 px-3 py-2 text-sm text-gremius-subtle hover:text-gremius-text hover:bg-gremius-bg rounded-lg transition-colors">`);
      Settings($$renderer2, { class: "w-4 h-4" });
      $$renderer2.push(`<!----> Configure Views</button></div></div>`);
    }
    $$renderer2.push(`<!--]--> <div class="flex-1 flex flex-col min-w-0"><div class="p-4 border-b border-gremius-border bg-gremius-card flex items-center justify-between"><div class="flex items-center gap-3"><button class="p-2 rounded-lg hover:bg-gremius-bg text-gremius-text-dim">`);
    Database($$renderer2, { class: "w-5 h-5" });
    $$renderer2.push(`<!----></button> `);
    {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<h1 class="text-lg font-semibold text-gremius-text">Select a table</h1>`);
    }
    $$renderer2.push(`<!--]--></div> <div class="flex items-center gap-2">`);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div></div> `);
    {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="flex-1 flex items-center justify-center"><div class="text-center">`);
      Database($$renderer2, { class: "w-16 h-16 text-gremius-cyan/30 mx-auto mb-4" });
      $$renderer2.push(`<!----> <h3 class="text-lg font-semibold text-gremius-text mb-2">Select a table to start</h3> <p class="text-gremius-subtle max-w-sm">Choose a table from the sidebar to explore and edit data</p></div></div>`);
    }
    $$renderer2.push(`<!--]--></div></div> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  _page as default
};
