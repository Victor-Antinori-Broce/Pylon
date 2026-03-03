import "clsx";
import { S as Settings } from "../../../chunks/settings.js";
function Settings_1($$renderer) {
  $$renderer.push(`<div class="space-y-6 animate-fade-in svelte-1xc311x"><div class="flex items-center justify-between"><div><h1 class="text-2xl font-bold text-white flex items-center gap-3"><div class="w-10 h-10 rounded-xl bg-gradient-to-br from-gremius-green/20 to-gremius-cyan/20 border border-gremius-green/20 flex items-center justify-center">`);
  Settings($$renderer, { class: "w-5 h-5 text-gremius-green" });
  $$renderer.push(`<!----></div> Settings</h1> <p class="text-sm text-gremius-subtle mt-1">Configure your CMS preferences.</p></div></div> <div class="card p-12 text-center"><p class="text-gremius-subtle">Settings view - Migration in progress</p></div></div>`);
}
function _page($$renderer) {
  Settings_1($$renderer);
}
export {
  _page as default
};
