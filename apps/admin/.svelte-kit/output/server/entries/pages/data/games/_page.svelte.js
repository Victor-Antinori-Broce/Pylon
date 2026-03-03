import "clsx";
import { i as attr } from "../../../../chunks/index.js";
import { S as Search } from "../../../../chunks/search.js";
import { F as Funnel } from "../../../../chunks/funnel.js";
function DataExplorer($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let search = "";
    $$renderer2.push(`<div class="space-y-4"><div class="flex items-center justify-between"><div><h2 class="text-xl font-bold text-gremius-text">Data Explorer</h2> <p class="text-sm text-gremius-text-dim mt-0.5">Browse and query game data</p></div></div> <div class="flex items-center gap-3"><div class="relative flex-1 max-w-md">`);
    Search($$renderer2, {
      class: "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gremius-subtle"
    });
    $$renderer2.push(`<!----> <input type="text" placeholder="Search games..."${attr("value", search)} class="w-full pl-10 pr-4 py-2 bg-gremius-card border border-gremius-border rounded-lg text-sm focus:outline-none focus:border-gremius-cyan"/></div> <button class="btn-secondary">`);
    Funnel($$renderer2, { class: "w-4 h-4" });
    $$renderer2.push(`<!----> Filter</button></div> `);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex justify-center py-20"><div class="w-6 h-6 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div></div>`);
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
function _page($$renderer) {
  DataExplorer($$renderer);
}
export {
  _page as default
};
