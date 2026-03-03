import "clsx";
import { P as Plus } from "../../../chunks/plus.js";
function StreamersView($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    $$renderer2.push(`<div class="space-y-4"><div class="flex items-center justify-between"><div><h2 class="text-xl font-bold text-gremius-text">Streamers</h2> <p class="text-sm text-gremius-text-dim mt-0.5">Manage partnered streamers</p></div> <a href="/streamers/new" class="btn-primary inline-flex items-center gap-2">`);
    Plus($$renderer2, { class: "w-4 h-4" });
    $$renderer2.push(`<!----> Add Streamer</a></div> `);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex justify-center py-20"><div class="w-6 h-6 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div></div>`);
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
function _page($$renderer) {
  StreamersView($$renderer);
}
export {
  _page as default
};
