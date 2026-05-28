import { f as store_get, c as attr_class, i as unsubscribe_stores, o as stringify } from "../../../../chunks/index.js";
import { p as page } from "../../../../chunks/stores.js";
import { B as Button, P as Play } from "../../../../chunks/Button.js";
import "clsx";
import { A as Arrow_left } from "../../../../chunks/arrow-left.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    store_get($$store_subs ??= {}, "$page", page).params.id;
    [
      {
        id: "1",
        traceId: "trace-1",
        stepType: "thinking",
        content: {
          thought: "El usuario quiere saber sobre el estado del servidor. Debo consultar las métricas actuales."
        },
        tokensUsed: 45,
        latencyMs: 120,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      },
      {
        id: "2",
        traceId: "trace-1",
        stepType: "tool_call",
        content: { tool: "get_server_metrics", input: { server: "main" } },
        tokensUsed: 12,
        latencyMs: 850,
        createdAt: new Date(Date.now() + 120).toISOString()
      },
      {
        id: "3",
        traceId: "trace-1",
        stepType: "tool_result",
        content: { cpu: "45%", memory: "68%", uptime: "15d 4h 32m" },
        tokensUsed: 28,
        latencyMs: 50,
        createdAt: new Date(Date.now() + 970).toISOString()
      }
    ];
    $$renderer2.push(`<div class="h-full flex flex-col"><div class="flex items-center gap-4 px-6 py-4 border-b border-zinc-800">`);
    Button($$renderer2, {
      variant: "ghost",
      size: "sm",
      href: "/agents",
      children: ($$renderer3) => {
        Arrow_left($$renderer3, { size: 18 });
      }
    });
    $$renderer2.push(`<!----> `);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="animate-pulse h-6 w-48 bg-zinc-800 rounded"></div>`);
    }
    $$renderer2.push(`<!--]--> <div class="flex-1"></div> <div class="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg"><button${attr_class(`px-3 py-1.5 text-sm rounded-md transition-colors ${stringify(
      "bg-zinc-800 text-zinc-100"
    )}`)}>`);
    Play($$renderer2, { size: 14, class: "inline mr-1.5" });
    $$renderer2.push(`<!----> Playground</button> <button${attr_class(`px-3 py-1.5 text-sm rounded-md transition-colors ${stringify("text-zinc-500 hover:text-zinc-300")}`)}>Configuración</button> <button${attr_class(`px-3 py-1.5 text-sm rounded-md transition-colors ${stringify("text-zinc-500 hover:text-zinc-300")}`)}>Traces</button></div></div> <div class="flex-1 overflow-hidden">`);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex items-center justify-center h-full"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div></div>`);
    }
    $$renderer2.push(`<!--]--></div></div>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
export {
  _page as default
};
