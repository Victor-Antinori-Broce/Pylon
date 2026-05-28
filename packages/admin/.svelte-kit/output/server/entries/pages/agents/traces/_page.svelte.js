import { e as escape_html } from "../../../../chunks/index.js";
import "clsx";
import { A as Activity } from "../../../../chunks/activity.js";
import { F as Funnel } from "../../../../chunks/funnel.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let total = 0;
    $$renderer2.push(`<div class="flex h-full"><div class="w-96 border-r border-zinc-800 flex flex-col"><div class="p-4 border-b border-zinc-800"><div class="flex items-center gap-3">`);
    Activity($$renderer2, { size: 20, class: "text-indigo-400" });
    $$renderer2.push(`<!----> <h1 class="text-lg font-semibold text-zinc-100">Traces</h1></div> <p class="text-xs text-zinc-500 mt-1">${escape_html(total)} traces registrados</p></div> <div class="p-3 border-b border-zinc-800"><div class="flex items-center gap-2"><div class="flex-1 relative"><input type="text" placeholder="Buscar traces..." class="w-full pl-8 pr-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"/> `);
    Funnel($$renderer2, {
      size: 14,
      class: "absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
    });
    $$renderer2.push(`<!----></div></div></div> <div class="flex-1 overflow-y-auto">`);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex items-center justify-center h-32"><div class="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div></div>`);
    }
    $$renderer2.push(`<!--]--></div></div> <div class="flex-1 overflow-y-auto">`);
    {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="flex items-center justify-center h-full text-zinc-500"><div class="text-center">`);
      Activity($$renderer2, { size: 48, class: "mx-auto mb-4 opacity-50" });
      $$renderer2.push(`<!----> <p>Selecciona un trace para ver los detalles</p></div></div>`);
    }
    $$renderer2.push(`<!--]--></div></div>`);
  });
}
export {
  _page as default
};
