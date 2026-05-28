import { a as ensure_array_like, b as attr, c as attr_class, d as clsx, f as store_get, e as escape_html, h as slot, i as unsubscribe_stores } from "../../../chunks/index.js";
import { p as page } from "../../../chunks/stores.js";
import { c as cn } from "../../../chunks/utils3.js";
import { B as Bot, K as Key } from "../../../chunks/key.js";
import { A as Activity } from "../../../chunks/activity.js";
function _layout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    const navItems = [
      { href: "/agents", label: "Agentes", icon: Bot },
      { href: "/agents/traces", label: "Traces", icon: Activity },
      { href: "/agents/identities", label: "Identidades", icon: Key }
    ];
    $$renderer2.push(`<div class="flex h-full"><aside class="w-60 border-r border-zinc-800 bg-zinc-900/50"><div class="p-4"><h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Centro de Control AI</h2></div> <nav class="px-2 space-y-1"><!--[-->`);
    const each_array = ensure_array_like(navItems);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let item = each_array[$$index];
      $$renderer2.push(`<a${attr("href", item.href)}${attr_class(clsx(cn("flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors", store_get($$store_subs ??= {}, "$page", page).url.pathname === item.href ? "bg-indigo-500/10 text-indigo-400" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50")))}>`);
      if (item.icon) {
        $$renderer2.push("<!--[-->");
        item.icon($$renderer2, { size: 18 });
        $$renderer2.push("<!--]-->");
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push("<!--]-->");
      }
      $$renderer2.push(` ${escape_html(item.label)}</a>`);
    }
    $$renderer2.push(`<!--]--></nav></aside> <main class="flex-1 overflow-auto"><!--[-->`);
    slot($$renderer2, $$props, "default", {});
    $$renderer2.push(`<!--]--></main></div>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
export {
  _layout as default
};
