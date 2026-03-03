import "clsx";
import { s as sanitize_props, a as spread_props, b as slot, e as escape_html, c as ensure_array_like, d as attr_class, j as derived } from "../../../chunks/index.js";
import { I as Icon } from "../../../chunks/Icon.js";
import { P as Plus } from "../../../chunks/plus.js";
import { A as Activity } from "../../../chunks/activity.js";
import { E as Eye } from "../../../chunks/eye.js";
function Circle_alert($$renderer, $$props) {
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
    ["circle", { "cx": "12", "cy": "12", "r": "10" }],
    ["line", { "x1": "12", "x2": "12", "y1": "8", "y2": "12" }],
    [
      "line",
      { "x1": "12", "x2": "12.01", "y1": "16", "y2": "16" }
    ]
  ];
  Icon($$renderer, spread_props([
    { name: "circle-alert" },
    $$sanitized_props,
    {
      /**
       * @component @name CircleAlert
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIgLz4KICA8bGluZSB4MT0iMTIiIHgyPSIxMiIgeTE9IjgiIHkyPSIxMiIgLz4KICA8bGluZSB4MT0iMTIiIHgyPSIxMi4wMSIgeTE9IjE2IiB5Mj0iMTYiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/circle-alert
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
function Clock($$renderer, $$props) {
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
    ["circle", { "cx": "12", "cy": "12", "r": "10" }],
    ["path", { "d": "M12 6v6l4 2" }]
  ];
  Icon($$renderer, spread_props([
    { name: "clock" },
    $$sanitized_props,
    {
      /**
       * @component @name Clock
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIgLz4KICA8cGF0aCBkPSJNMTIgNnY2bDQgMiIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/clock
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
        slot($$renderer2, $$props, "default", {}, null);
        $$renderer2.push(`<!--]-->`);
      },
      $$slots: { default: true }
    }
  ]));
}
function WebhooksView($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const API = "http://localhost:3001";
    let webhooks = [];
    let failedJobs = [];
    let logs = [];
    let activeTab = "webhooks";
    const activeWebhooks = derived(() => webhooks.filter((w) => w.enabled));
    const tabs = [
      { id: "webhooks", label: "Webhooks" },
      { id: "failed", label: "Failed Jobs" },
      { id: "logs", label: "All Logs" }
    ];
    async function loadWebhooks() {
      try {
        const res = await fetch(`${API}/api/custom/webhooks`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          webhooks = data.docs || [];
        }
      } catch (e) {
        console.error("Failed to load webhooks:", e);
      } finally {
      }
    }
    loadWebhooks();
    $$renderer2.push(`<div class="space-y-6 animate-fade-in svelte-w0wflo"><div class="flex items-center justify-between"><div><h1 class="text-2xl font-bold text-white flex items-center gap-3"><div class="w-10 h-10 rounded-xl bg-gradient-to-br from-gremius-cyan/20 to-gremius-purple/20 border border-gremius-cyan/20 flex items-center justify-center">`);
    Webhook($$renderer2, { class: "w-5 h-5 text-gremius-cyan" });
    $$renderer2.push(`<!----></div> Webhooks</h1> <p class="text-sm text-gremius-subtle mt-1">Manage webhook endpoints and monitor delivery status.</p></div> <button class="btn-primary">`);
    Plus($$renderer2, { class: "w-4 h-4" });
    $$renderer2.push(`<!----> New Webhook</button></div> <div class="grid grid-cols-1 md:grid-cols-4 gap-4"><div class="card p-4"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-lg bg-gremius-cyan/10 flex items-center justify-center">`);
    Webhook($$renderer2, { class: "w-5 h-5 text-gremius-cyan" });
    $$renderer2.push(`<!----></div> <div><p class="text-2xl font-bold text-white">${escape_html(webhooks.length)}</p> <p class="text-xs text-gremius-subtle uppercase tracking-wider">Total</p></div></div></div> <div class="card p-4"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-lg bg-gremius-green/10 flex items-center justify-center">`);
    Activity($$renderer2, { class: "w-5 h-5 text-gremius-green" });
    $$renderer2.push(`<!----></div> <div><p class="text-2xl font-bold text-white">${escape_html(activeWebhooks().length)}</p> <p class="text-xs text-gremius-subtle uppercase tracking-wider">Active</p></div></div></div> <div class="card p-4"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-lg bg-gremius-pink/10 flex items-center justify-center">`);
    Circle_alert($$renderer2, { class: "w-5 h-5 text-gremius-pink" });
    $$renderer2.push(`<!----></div> <div><p class="text-2xl font-bold text-white">${escape_html(failedJobs.length)}</p> <p class="text-xs text-gremius-subtle uppercase tracking-wider">Failed</p></div></div></div> <div class="card p-4"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-lg bg-gremius-amber/10 flex items-center justify-center">`);
    Clock($$renderer2, { class: "w-5 h-5 text-gremius-amber" });
    $$renderer2.push(`<!----></div> <div><p class="text-2xl font-bold text-white">${escape_html(logs.length)}</p> <p class="text-xs text-gremius-subtle uppercase tracking-wider">Logs</p></div></div></div></div> <div class="border-b border-gremius-border"><div class="flex gap-1"><!--[-->`);
    const each_array = ensure_array_like(tabs);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let tab = each_array[$$index];
      $$renderer2.push(`<button${attr_class("px-4 py-2.5 text-sm font-medium border-b-2 transition-colors", void 0, {
        "border-gremius-cyan": activeTab === tab.id,
        "text-gremius-cyan": activeTab === tab.id,
        "border-transparent": activeTab !== tab.id,
        "text-gremius-text-dim": activeTab !== tab.id,
        "hover:text-gremius-text": activeTab !== tab.id
      })}>${escape_html(tab.label)}</button>`);
    }
    $$renderer2.push(`<!--]--></div></div> `);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="card overflow-hidden">`);
      if (webhooks.length > 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<table class="data-table"><thead><tr><th>Status</th><th>Name</th><th>Event</th><th>Target URL</th><th>Actions</th></tr></thead><tbody><!--[-->`);
        const each_array_1 = ensure_array_like(webhooks);
        for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
          let webhook = each_array_1[$$index_1];
          $$renderer2.push(`<tr class="hover:bg-gremius-cyan/[0.03]"><td><span${attr_class(webhook.enabled ? "badge-green" : "badge-muted")}>${escape_html(webhook.enabled ? "Active" : "Inactive")}</span></td><td class="font-medium text-white">${escape_html(webhook.name)}</td><td><span class="badge-cyan">${escape_html(webhook.event)}</span></td><td class="font-mono text-xs text-gremius-text-dim truncate max-w-[200px]">${escape_html(webhook.targetUrl)}</td><td><button class="btn-icon">`);
          Eye($$renderer2, { class: "w-4 h-4" });
          $$renderer2.push(`<!----></button></td></tr>`);
        }
        $$renderer2.push(`<!--]--></tbody></table>`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<div class="p-12 text-center">`);
        Webhook($$renderer2, { class: "w-12 h-12 mx-auto text-gremius-muted mb-4" });
        $$renderer2.push(`<!----> <h3 class="text-lg font-medium text-white mb-2">No webhooks configured</h3> <button class="btn-primary mt-4">Create Webhook</button></div>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
function _page($$renderer) {
  WebhooksView($$renderer);
}
export {
  _page as default
};
