import "clsx";
import "@sveltejs/kit/internal";
import "../../chunks/exports.js";
import "../../chunks/utils2.js";
import "@sveltejs/kit/internal/server";
import "../../chunks/root.js";
import "../../chunks/state.svelte.js";
function _layout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="min-h-screen flex items-center justify-center bg-gremius-bg"><div class="flex flex-col items-center gap-4"><div class="w-8 h-8 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div> <p class="text-gremius-subtle text-sm">Loading...</p></div></div>`);
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  _layout as default
};
