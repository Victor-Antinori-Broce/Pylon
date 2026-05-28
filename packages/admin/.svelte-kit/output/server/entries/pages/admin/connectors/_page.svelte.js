import "clsx";
import { j as sanitize_props, k as spread_props, h as slot, e as escape_html } from "../../../../chunks/index.js";
import { I as Icon } from "../../../../chunks/Icon.js";
import { R as Refresh_cw } from "../../../../chunks/refresh-cw.js";
import { P as Plus } from "../../../../chunks/plus.js";
import { D as Database } from "../../../../chunks/database.js";
import { G as Globe } from "../../../../chunks/globe.js";
function Plug($$renderer, $$props) {
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
    ["path", { "d": "M12 22v-5" }],
    ["path", { "d": "M15 8V2" }],
    [
      "path",
      {
        "d": "M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z"
      }
    ],
    ["path", { "d": "M9 8V2" }]
  ];
  Icon($$renderer, spread_props([
    { name: "plug" },
    $$sanitized_props,
    {
      /**
       * @component @name Plug
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTIgMjJ2LTUiIC8+CiAgPHBhdGggZD0iTTE1IDhWMiIgLz4KICA8cGF0aCBkPSJNMTcgOGExIDEgMCAwIDEgMSAxdjRhNCA0IDAgMCAxLTQgNGgtNGE0IDQgMCAwIDEtNC00VjlhMSAxIDAgMCAxIDEtMXoiIC8+CiAgPHBhdGggZD0iTTkgOFYyIiAvPgo8L3N2Zz4K) - https://lucide.dev/icons/plug
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
function ConnectorsView($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let connectors = [];
    $$renderer2.push(`<div class="space-y-6 animate-fade-in"><div class="flex items-center justify-between"><div><h1 class="text-2xl font-bold text-gremius-text flex items-center gap-3"><div class="w-10 h-10 rounded-xl bg-gradient-to-br from-gremius-purple/20 to-gremius-cyan/20 border border-gremius-purple/20 flex items-center justify-center">`);
    Plug($$renderer2, { class: "w-5 h-5 text-gremius-purple" });
    $$renderer2.push(`<!----></div> Data Connectors</h1> <p class="text-sm text-gremius-subtle mt-1">Connect external databases (MySQL, MariaDB) and APIs as read-only data sources.</p></div> <div class="flex items-center gap-2"><button class="btn-secondary-sm">`);
    Refresh_cw($$renderer2, { class: "w-4 h-4" });
    $$renderer2.push(`<!----></button> <button class="btn-primary">`);
    Plus($$renderer2, { class: "w-4 h-4" });
    $$renderer2.push(`<!----> New Connector</button></div></div> <div class="grid grid-cols-1 md:grid-cols-3 gap-4"><div class="card p-4"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-lg bg-gremius-purple/10 flex items-center justify-center">`);
    Plug($$renderer2, { class: "w-5 h-5 text-gremius-purple" });
    $$renderer2.push(`<!----></div> <div><p class="text-2xl font-bold text-gremius-text">${escape_html(connectors.length)}</p> <p class="text-xs text-gremius-subtle uppercase tracking-wider">Total</p></div></div></div> <div class="card p-4"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-lg bg-gremius-cyan/10 flex items-center justify-center">`);
    Database($$renderer2, { class: "w-5 h-5 text-gremius-cyan" });
    $$renderer2.push(`<!----></div> <div><p class="text-2xl font-bold text-gremius-text">${escape_html(connectors.filter((c) => c.type === "database").length)}</p> <p class="text-xs text-gremius-subtle uppercase tracking-wider">Databases</p></div></div></div> <div class="card p-4"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-lg bg-gremius-green/10 flex items-center justify-center">`);
    Globe($$renderer2, { class: "w-5 h-5 text-gremius-green" });
    $$renderer2.push(`<!----></div> <div><p class="text-2xl font-bold text-gremius-text">${escape_html(connectors.filter((c) => c.type === "api").length)}</p> <p class="text-xs text-gremius-subtle uppercase tracking-wider">APIs</p></div></div></div></div> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex justify-center py-20"><div class="w-6 h-6 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div></div>`);
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
function _page($$renderer) {
  ConnectorsView($$renderer);
}
export {
  _page as default
};
