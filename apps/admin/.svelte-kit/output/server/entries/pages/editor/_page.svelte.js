import "clsx";
import { s as sanitize_props, a as spread_props, b as slot, d as attr_class, i as attr, e as escape_html, f as stringify } from "../../../chunks/index.js";
import { I as Icon } from "../../../chunks/Icon.js";
import { S as Save } from "../../../chunks/save.js";
function html(value) {
  var html2 = String(value);
  var open = "<!---->";
  return open + html2 + "<!---->";
}
function Panel_right_open($$renderer, $$props) {
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
      "rect",
      { "width": "18", "height": "18", "x": "3", "y": "3", "rx": "2" }
    ],
    ["path", { "d": "M15 3v18" }],
    ["path", { "d": "m10 15-3-3 3-3" }]
  ];
  Icon($$renderer, spread_props([
    { name: "panel-right-open" },
    $$sanitized_props,
    {
      /**
       * @component @name PanelRightOpen
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cmVjdCB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHg9IjMiIHk9IjMiIHJ4PSIyIiAvPgogIDxwYXRoIGQ9Ik0xNSAzdjE4IiAvPgogIDxwYXRoIGQ9Im0xMCAxNS0zLTMgMy0zIiAvPgo8L3N2Zz4K) - https://lucide.dev/icons/panel-right-open
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
function MdxEditor($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { value = "" } = $$props;
    let localContent = value;
    let previewHtml = "";
    $$renderer2.push(`<div class="mdx-editor h-full flex flex-col sm:flex-row overflow-hidden border border-gremius-border rounded-xl bg-gremius-card shadow-sm relative z-0"><div class="h-1/2 sm:h-full w-full sm:w-1/2 flex flex-col border-b sm:border-b-0 sm:border-r border-gremius-border"><div class="flex items-center justify-between px-4 py-2 border-b border-gremius-border bg-gremius-bg"><h3 class="text-xs font-semibold uppercase tracking-wider text-gremius-text-dim">Markdown / MDX</h3></div> <div class="flex-1 overflow-auto bg-[#282c34] code-wrapper relative"></div></div> <div class="h-1/2 sm:h-full w-full sm:w-1/2 flex flex-col bg-gremius-bg"><div class="flex items-center justify-between px-4 py-2 border-b border-gremius-border bg-gremius-bg flex-shrink-0"><h3 class="text-xs font-semibold uppercase tracking-wider text-gremius-text-dim">Live Preview</h3> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div> <div class="flex-1 overflow-auto p-4 sm:p-8"><article class="prose prose-invert prose-slate max-w-none prose-headings:font-bold prose-a:text-gremius-cyan prose-img:rounded-xl prose-pre:bg-gremius-card prose-pre:border prose-pre:border-gremius-border">${html(previewHtml)}</article> `);
    if (!localContent.trim()) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="h-full flex flex-col items-center justify-center text-gremius-subtle"><p class="text-sm">Preview will appear here...</p></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div></div></div>`);
  });
}
function EditorView($$renderer) {
  let content = `# Welcome to the Dev-First MDX Editor 🚀

This is a premium, split-screen editor designed for developers. It supports standard **Markdown**, *MDX* components, and live **Mermaid** diagrams.

## Real-time Mermaid Rendering

Try editing the diagram below. The syntax is intercepted and rendered directly in your browser!

\`\`\`mermaid
flowchart LR
    A[Raw Markdown] --> B(CodeMirror)
    B --> C{Is it Mermaid?}
    C -->|Yes| D[Render Client-Side SVG]
    C -->|No| E[Send to Astro SSR]
    E --> F[Inject HTML Preview]
    D --> F
\`\`\`

## Fast Astro SSR Previews

For everything else, we send the content to an Astro \`/api/preview\` endpoint.

- **Fast:** Debounced typing
- **Accurate:** Uses the real frontend engine
- **Clean:** No AI-slop wrappers

> Go ahead, delete this text and start writing!
`;
  let blocks = [];
  let $$settled = true;
  let $$inner_renderer;
  function $$render_inner($$renderer2) {
    $$renderer2.push(`<div class="h-[calc(100vh-4rem)] flex flex-col bg-gremius-bg"><div class="flex items-center justify-between px-4 sm:px-6 py-3 flex-shrink-0 border-b border-gremius-border bg-gremius-card"><div><h1 class="text-lg font-bold text-gremius-text">Content Editor</h1> <p class="text-[11px] text-gremius-subtle mt-0.5">Markdown + Dynamic Blocks → JSONB</p></div> <div class="flex items-center gap-2"><button${attr_class(`btn-ghost btn-sm gap-1.5 ${stringify("")}`)}${attr("title", "Show SEO panel")}>SEO `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></button> <button${attr_class(`btn-ghost btn-sm gap-1.5 ${stringify("")}`)}${attr("title", "Show blocks panel")}>`);
    {
      $$renderer2.push("<!--[!-->");
      Panel_right_open($$renderer2, { class: "w-4 h-4" });
    }
    $$renderer2.push(`<!--]--> <span>Blocks</span> `);
    if (blocks.length > 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<span class="text-[10px] font-mono bg-gremius-cyan-20 text-gremius-cyan rounded-full px-1.5 py-0.5 leading-none">${escape_html(blocks.length)}</span>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></button> <button class="btn-primary btn-sm gap-1.5">`);
    Save($$renderer2, { class: "w-4 h-4" });
    $$renderer2.push(`<!----> <span>Save Draft</span></button></div></div> <div class="flex-1 min-h-0 flex"><div class="flex-1 min-w-0 p-4 sm:p-6">`);
    MdxEditor($$renderer2, {
      get value() {
        return content;
      },
      set value($$value) {
        content = $$value;
        $$settled = false;
      }
    });
    $$renderer2.push(`<!----></div> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div></div>`);
  }
  do {
    $$settled = true;
    $$inner_renderer = $$renderer.copy();
    $$render_inner($$inner_renderer);
  } while (!$$settled);
  $$renderer.subsume($$inner_renderer);
}
function _page($$renderer) {
  EditorView($$renderer);
}
export {
  _page as default
};
