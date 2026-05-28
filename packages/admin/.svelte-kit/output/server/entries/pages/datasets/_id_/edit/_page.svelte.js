import "clsx";
import "@sveltejs/kit/internal";
import "../../../../../chunks/exports.js";
import "../../../../../chunks/utils2.js";
import "@sveltejs/kit/internal/server";
import "../../../../../chunks/root.js";
import "../../../../../chunks/state.svelte.js";
import "hono";
import "../../../../../chunks/SchemaBuilder.svelte_svelte_type_style_lang.js";
import { A as Arrow_left } from "../../../../../chunks/arrow-left.js";
import { L as Loader_circle } from "../../../../../chunks/loader-circle.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    $$renderer2.push(`<div class="space-y-6 animate-fade-in pb-20"><div class="flex items-center gap-4"><button class="btn-icon p-2 hover:bg-gremius-surface rounded-lg transition-colors text-gremius-subtle svelte-1jgnubv">`);
    Arrow_left($$renderer2, { class: "w-5 h-5" });
    $$renderer2.push(`<!----></button> <div><h1 class="text-2xl font-bold text-gremius-text">`);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`Loading...`);
    }
    $$renderer2.push(`<!--]--></h1> <p class="text-sm text-gremius-text-dim mt-1">Modify the schema, fields, and configuration of your dataset.</p></div></div> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="card p-12 text-center svelte-1jgnubv">`);
      Loader_circle($$renderer2, { class: "w-8 h-8 text-gremius-cyan animate-spin mx-auto mb-4" });
      $$renderer2.push(`<!----> <p class="text-gremius-subtle">Loading dataset...</p></div>`);
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
export {
  _page as default
};
