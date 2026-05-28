import "clsx";
import { j as sanitize_props, k as spread_props, h as slot, e as escape_html, a as ensure_array_like, c as attr_class, l as derived } from "../../../chunks/index.js";
import { Z as Zap } from "../../../chunks/zap.js";
import { I as Icon } from "../../../chunks/Icon.js";
import { A as Activity } from "../../../chunks/activity.js";
import { G as Globe } from "../../../chunks/globe.js";
function Code($$renderer, $$props) {
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
    ["path", { "d": "m16 18 6-6-6-6" }],
    ["path", { "d": "m8 6-6 6 6 6" }]
  ];
  Icon($$renderer, spread_props([
    { name: "code" },
    $$sanitized_props,
    {
      /**
       * @component @name Code
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJtMTYgMTggNi02LTYtNiIgLz4KICA8cGF0aCBkPSJtOCA2LTYgNiA2IDYiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/code
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
function Terminal($$renderer, $$props) {
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
    ["path", { "d": "M12 19h8" }],
    ["path", { "d": "m4 17 6-6-6-6" }]
  ];
  Icon($$renderer, spread_props([
    { name: "terminal" },
    $$sanitized_props,
    {
      /**
       * @component @name Terminal
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTIgMTloOCIgLz4KICA8cGF0aCBkPSJtNCAxNyA2LTYtNi02IiAvPgo8L3N2Zz4K) - https://lucide.dev/icons/terminal
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
function Webhook($$renderer, $$props) {
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
        "d": "M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2"
      }
    ],
    [
      "path",
      {
        "d": "m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06"
      }
    ],
    [
      "path",
      {
        "d": "m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8"
      }
    ]
  ];
  Icon($$renderer, spread_props([
    { name: "webhook" },
    $$sanitized_props,
    {
      /**
       * @component @name Webhook
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTggMTYuOThoLTUuOTljLTEuMSAwLTEuOTUuOTQtMi40OCAxLjlBNCA0IDAgMCAxIDIgMTdjLjAxLS43LjItMS40LjU3LTIiIC8+CiAgPHBhdGggZD0ibTYgMTcgMy4xMy01Ljc4Yy41My0uOTcuMS0yLjE4LS41LTMuMWE0IDQgMCAxIDEgNi44OS00LjA2IiAvPgogIDxwYXRoIGQ9Im0xMiA2IDMuMTMgNS43M0MxNS42NiAxMi43IDE2LjkgMTMgMTggMTNhNCA0IDAgMCAxIDAgOCIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/webhook
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
function ActionsView($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let actions = [];
    let activeTab = "all";
    const stats = derived(() => ({
      total: actions.length,
      code: actions.filter((a) => a.type === "code").length,
      webhooks: actions.filter((a) => a.type === "webhook_out").length,
      active: actions.filter((a) => a.status === "active").length,
      paused: actions.filter((a) => a.status === "paused").length
    }));
    $$renderer2.push(`<div class="space-y-6 animate-fade-in"><div class="flex items-center justify-between"><div><h1 class="text-2xl font-bold text-gremius-text flex items-center gap-3"><div class="w-10 h-10 rounded-xl bg-gradient-to-br from-gremius-cyan/20 to-gremius-purple/20 border border-gremius-cyan/20 flex items-center justify-center">`);
    Zap($$renderer2, { class: "w-5 h-5 text-gremius-cyan" });
    $$renderer2.push(`<!----></div> Acciones</h1> <p class="text-sm text-gremius-subtle mt-1">Automatizaciones, webhooks y tareas programadas — todo en un solo lugar. `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></p></div> <div class="flex items-center gap-2"><button class="group inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-gremius-surface border border-gremius-border text-gremius-text hover:bg-amber-500/5 hover:border-amber-500/20 hover:text-amber-400 transition-all duration-200">`);
    Code($$renderer2, { class: "w-4 h-4 group-hover:scale-110 transition-transform" });
    $$renderer2.push(`<!----> Nuevo Worker</button> <button class="group inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-gremius-cyan to-cyan-400 text-black rounded-xl font-semibold shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-105 active:scale-95 transition-all duration-200">`);
    Webhook($$renderer2, { class: "w-4 h-4 group-hover:rotate-12 transition-transform" });
    $$renderer2.push(`<!----> Nuevo Webhook</button></div></div> <div class="grid grid-cols-1 md:grid-cols-4 gap-4"><div class="card p-4"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-lg bg-gremius-cyan/10 flex items-center justify-center">`);
    Zap($$renderer2, { class: "w-5 h-5 text-gremius-cyan" });
    $$renderer2.push(`<!----></div> <div><p class="text-2xl font-bold text-gremius-text">${escape_html(stats().total)}</p> <p class="text-xs text-gremius-subtle uppercase tracking-wider">Total Acciones</p></div></div></div> <div class="card p-4"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-lg bg-gremius-green/10 flex items-center justify-center">`);
    Activity($$renderer2, { class: "w-5 h-5 text-gremius-green" });
    $$renderer2.push(`<!----></div> <div><p class="text-2xl font-bold text-gremius-text">${escape_html(stats().active)}</p> <p class="text-xs text-gremius-subtle uppercase tracking-wider">Activos</p></div></div></div> <div class="card p-4"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-lg bg-gremius-amber/10 flex items-center justify-center">`);
    Terminal($$renderer2, { class: "w-5 h-5 text-gremius-amber" });
    $$renderer2.push(`<!----></div> <div><p class="text-2xl font-bold text-gremius-text">${escape_html(stats().code)}</p> <p class="text-xs text-gremius-subtle uppercase tracking-wider">Workers</p></div></div></div> <div class="card p-4"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-lg bg-gremius-purple/10 flex items-center justify-center">`);
    Globe($$renderer2, { class: "w-5 h-5 text-gremius-purple" });
    $$renderer2.push(`<!----></div> <div><p class="text-2xl font-bold text-gremius-text">${escape_html(stats().webhooks)}</p> <p class="text-xs text-gremius-subtle uppercase tracking-wider">Webhooks</p></div></div></div></div> <div class="border-b border-gremius-border"><div class="flex gap-1"><!--[-->`);
    const each_array = ensure_array_like([
      { id: "all", label: "Todas las Acciones", icon: Zap },
      { id: "code", label: "Workers", icon: Terminal },
      { id: "webhook_out", label: "Webhooks", icon: Globe }
    ]);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let tab = each_array[$$index];
      $$renderer2.push(`<button${attr_class("group px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-200 inline-flex items-center gap-2", void 0, {
        "border-gremius-cyan": activeTab === tab.id,
        "text-gremius-cyan": activeTab === tab.id,
        "border-transparent": activeTab !== tab.id,
        "text-gremius-text-dim": activeTab !== tab.id,
        "hover:text-gremius-text": activeTab !== tab.id
      })}>`);
      if (tab.icon) {
        $$renderer2.push("<!--[-->");
        tab.icon($$renderer2, { class: "w-4 h-4 group-hover:scale-110 transition-transform" });
        $$renderer2.push("<!--]-->");
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push("<!--]-->");
      }
      $$renderer2.push(` ${escape_html(tab.label)}</button>`);
    }
    $$renderer2.push(`<!--]--></div></div> <div class="card overflow-hidden">`);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex justify-center py-20"><div class="w-6 h-6 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div></div>`);
    }
    $$renderer2.push(`<!--]--></div></div> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function _page($$renderer) {
  ActionsView($$renderer);
}
export {
  _page as default
};
