import "clsx";
import { c as attr_class, d as clsx, e as escape_html, m as bind_props, b as attr, a as ensure_array_like, o as stringify } from "../../../chunks/index.js";
import { B as Button, P as Play } from "../../../chunks/Button.js";
import { c as cn } from "../../../chunks/utils3.js";
import { X } from "../../../chunks/x.js";
import { E as Eye_off } from "../../../chunks/eye-off.js";
import { P as Plus } from "../../../chunks/plus.js";
import { B as Bot, K as Key } from "../../../chunks/key.js";
import { A as Activity } from "../../../chunks/activity.js";
import { S as Settings } from "../../../chunks/settings.js";
import { T as Trash_2 } from "../../../chunks/trash-2.js";
function Card($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { class: className = "", children } = $$props;
    $$renderer2.push(`<div${attr_class(clsx(cn("bg-zinc-900/50 border border-zinc-800 rounded-xl", className)))}>`);
    children?.($$renderer2);
    $$renderer2.push(`<!----></div>`);
  });
}
function Modal($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      open = false,
      title = "",
      description,
      size = "md",
      showClose = true,
      onClose,
      onOpenChange,
      children,
      footer
    } = $$props;
    const sizeClasses = {
      sm: "max-w-sm",
      md: "max-w-md",
      lg: "max-w-lg",
      xl: "max-w-xl"
    };
    if (open) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"><div${attr_class(clsx(cn("w-full bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl", sizeClasses[size])))}>`);
      if (title) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="flex items-start justify-between px-6 py-4 border-b border-zinc-800"><div><h3 class="text-lg font-semibold text-zinc-100">${escape_html(title)}</h3> `);
        if (description) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<p class="text-sm text-zinc-500 mt-1">${escape_html(description)}</p>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div> `);
        if (showClose) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<button class="p-1 text-zinc-500 hover:text-zinc-300 transition-colors">`);
          X($$renderer2, { size: 20 });
          $$renderer2.push(`<!----></button>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> <div class="px-6 py-4">`);
      children?.($$renderer2);
      $$renderer2.push(`<!----></div> `);
      if (footer) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800">`);
        footer($$renderer2);
        $$renderer2.push(`<!----></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></div></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, { open });
  });
}
function TokenDisplay($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex items-center gap-2 text-sm text-zinc-500">`);
      Eye_off($$renderer2, { size: 14 });
      $$renderer2.push(`<!----> <span>Token oculto por seguridad</span></div>`);
    }
    $$renderer2.push(`<!--]-->`);
  });
}
const API_BASE = "/api/v1";
async function listAgents() {
  const res = await fetch(`${API_BASE}/agents`);
  if (!res.ok)
    throw new Error(await res.text());
  return res.json();
}
async function deleteAgent(id) {
  const res = await fetch(`${API_BASE}/agents/${id}`, {
    method: "DELETE"
  });
  if (!res.ok)
    throw new Error(await res.text());
}
function AgentsView($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let agents = [];
    let loading = true;
    let error = null;
    let showCreateModal = false;
    let showDeleteModal = null;
    let creating = false;
    let deleting = false;
    let formData = {
      name: "",
      description: "",
      model: "gpt-4",
      enabled: true
    };
    async function loadAgents() {
      try {
        loading = true;
        error = null;
        agents = await listAgents();
      } catch (e) {
        error = e instanceof Error ? e.message : "Error cargando agentes";
      } finally {
        loading = false;
      }
    }
    async function handleDelete(id) {
      try {
        deleting = true;
        await deleteAgent(id);
        await loadAgents();
        showDeleteModal = null;
      } catch (e) {
        error = e instanceof Error ? e.message : "Error eliminando agente";
      } finally {
        deleting = false;
      }
    }
    function getStatusColor(status) {
      switch (status) {
        case "active":
          return "bg-emerald-500";
        case "paused":
          return "bg-amber-500";
        case "error":
          return "bg-red-500";
        default:
          return "bg-zinc-500";
      }
    }
    $$renderer2.push(`<div class="p-6 space-y-6"><div class="flex items-center justify-between"><div><h1 class="text-2xl font-bold text-zinc-100">Agentes</h1> <p class="text-zinc-500 mt-1">Gestiona tus agentes AI y monitorea su actividad</p></div> `);
    Button($$renderer2, {
      variant: "primary",
      onclick: () => showCreateModal = true,
      children: ($$renderer3) => {
        Plus($$renderer3, { size: 18, class: "mr-2" });
        $$renderer3.push(`<!----> Nuevo Agente`);
      }
    });
    $$renderer2.push(`<!----></div> `);
    if (error) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">${escape_html(error)}</div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (loading) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex items-center justify-center h-64"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div></div>`);
    } else if (agents.length === 0) {
      $$renderer2.push("<!--[1-->");
      Card($$renderer2, {
        class: "p-12 text-center",
        children: ($$renderer3) => {
          Bot($$renderer3, { size: 48, class: "mx-auto text-zinc-600 mb-4" });
          $$renderer3.push(`<!----> <h3 class="text-lg font-medium text-zinc-300">No hay agentes</h3> <p class="text-zinc-500 mt-2 mb-6">Crea tu primer agente para empezar</p> `);
          Button($$renderer3, {
            variant: "primary",
            onclick: () => showCreateModal = true,
            children: ($$renderer4) => {
              Plus($$renderer4, { size: 18, class: "mr-2" });
              $$renderer4.push(`<!----> Crear Agente`);
            }
          });
          $$renderer3.push(`<!---->`);
        }
      });
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"><!--[-->`);
      const each_array = ensure_array_like(agents);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let agent = each_array[$$index];
        Card($$renderer2, {
          class: "p-5 hover:border-indigo-500/30 transition-colors group",
          children: ($$renderer3) => {
            $$renderer3.push(`<div class="flex items-start justify-between"><div class="flex items-center gap-3"><div class="p-2 bg-indigo-500/10 rounded-lg">`);
            Bot($$renderer3, { size: 20, class: "text-indigo-400" });
            $$renderer3.push(`<!----></div> <div><h3 class="font-medium text-zinc-100">${escape_html(agent.name)}</h3> <p class="text-xs text-zinc-500">${escape_html(agent.model)}</p></div></div> <div class="flex items-center gap-2"><span${attr_class(`w-2 h-2 rounded-full ${stringify(getStatusColor(agent.status))}`)}></span></div></div> `);
            if (agent.description) {
              $$renderer3.push("<!--[-->");
              $$renderer3.push(`<p class="mt-3 text-sm text-zinc-400 line-clamp-2">${escape_html(agent.description)}</p>`);
            } else {
              $$renderer3.push("<!--[!-->");
            }
            $$renderer3.push(`<!--]--> <div class="mt-4 flex items-center gap-4 text-xs text-zinc-500"><span class="flex items-center gap-1">`);
            Activity($$renderer3, { size: 14 });
            $$renderer3.push(`<!----> ${escape_html(agent.totalTraces || 0)} traces</span> <span class="flex items-center gap-1">`);
            Key($$renderer3, { size: 14 });
            $$renderer3.push(`<!----> ${escape_html(agent.totalTokens?.toLocaleString() || 0)} tokens</span></div> <div class="mt-4 pt-4 border-t border-zinc-800 flex items-center gap-2">`);
            Button($$renderer3, {
              variant: "ghost",
              size: "sm",
              href: `/agents/${stringify(agent.id)}/playground`,
              children: ($$renderer4) => {
                Play($$renderer4, { size: 16, class: "mr-1" });
                $$renderer4.push(`<!----> Playground`);
              }
            });
            $$renderer3.push(`<!----> `);
            Button($$renderer3, {
              variant: "ghost",
              size: "sm",
              href: `/agents/${stringify(agent.id)}`,
              children: ($$renderer4) => {
                Settings($$renderer4, { size: 16, class: "mr-1" });
                $$renderer4.push(`<!----> Configurar`);
              }
            });
            $$renderer3.push(`<!----> <div class="flex-1"></div> `);
            Button($$renderer3, {
              variant: "ghost",
              size: "sm",
              class: "text-red-400 hover:text-red-300 hover:bg-red-500/10",
              onclick: () => showDeleteModal = agent.id,
              children: ($$renderer4) => {
                Trash_2($$renderer4, { size: 16 });
              }
            });
            $$renderer3.push(`<!----></div>`);
          }
        });
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]--></div> `);
    Modal($$renderer2, {
      open: showCreateModal,
      title: "Crear Nuevo Agente",
      description: "Configura un nuevo agente AI",
      onClose: () => showCreateModal = false,
      children: ($$renderer3) => {
        $$renderer3.push(`<form class="space-y-4"><div><label class="block text-sm font-medium text-zinc-300 mb-1.5">Nombre</label> <input type="text"${attr("value", formData.name)} placeholder="Mi Agente" required="" class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50"/></div> <div><label class="block text-sm font-medium text-zinc-300 mb-1.5">Descripción</label> <textarea placeholder="Describe el propósito de este agente..."${attr("rows", 3)} class="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 resize-none">`);
        const $$body = escape_html(formData.description);
        if ($$body) {
          $$renderer3.push(`${$$body}`);
        }
        $$renderer3.push(`</textarea></div> <div><label class="block text-sm font-medium text-zinc-300 mb-1.5">Modelo</label> `);
        $$renderer3.select(
          {
            value: formData.model,
            class: "w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50"
          },
          ($$renderer4) => {
            $$renderer4.option({ value: "gpt-4" }, ($$renderer5) => {
              $$renderer5.push(`GPT-4`);
            });
            $$renderer4.option({ value: "gpt-4-turbo" }, ($$renderer5) => {
              $$renderer5.push(`GPT-4 Turbo`);
            });
            $$renderer4.option({ value: "gpt-3.5-turbo" }, ($$renderer5) => {
              $$renderer5.push(`GPT-3.5 Turbo`);
            });
            $$renderer4.option({ value: "claude-3-opus" }, ($$renderer5) => {
              $$renderer5.push(`Claude 3 Opus`);
            });
            $$renderer4.option({ value: "claude-3-sonnet" }, ($$renderer5) => {
              $$renderer5.push(`Claude 3 Sonnet`);
            });
          }
        );
        $$renderer3.push(`</div> <div class="flex items-center gap-2 pt-2"><input type="checkbox" id="enabled"${attr("checked", formData.enabled, true)} class="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-indigo-500 focus:ring-indigo-500/50"/> <label for="enabled" class="text-sm text-zinc-300">Activar inmediatamente</label></div> <div class="flex justify-end gap-3 pt-4">`);
        Button($$renderer3, {
          type: "button",
          variant: "secondary",
          onclick: () => showCreateModal = false,
          children: ($$renderer4) => {
            $$renderer4.push(`<!---->Cancelar`);
          }
        });
        $$renderer3.push(`<!----> `);
        Button($$renderer3, {
          type: "submit",
          variant: "primary",
          loading: creating,
          children: ($$renderer4) => {
            $$renderer4.push(`<!---->Crear`);
          }
        });
        $$renderer3.push(`<!----></div></form>`);
      },
      $$slots: { default: true }
    });
    $$renderer2.push(`<!----> `);
    Modal($$renderer2, {
      open: !!showDeleteModal,
      title: "Eliminar Agente",
      description: "¿Estás seguro? Esta acción no se puede deshacer.",
      size: "sm",
      onClose: () => showDeleteModal = null,
      children: ($$renderer3) => {
        $$renderer3.push(`<div class="flex justify-end gap-3">`);
        Button($$renderer3, {
          variant: "secondary",
          onclick: () => showDeleteModal = null,
          children: ($$renderer4) => {
            $$renderer4.push(`<!---->Cancelar`);
          }
        });
        $$renderer3.push(`<!----> `);
        Button($$renderer3, {
          variant: "primary",
          class: "bg-red-600 hover:bg-red-500",
          loading: deleting,
          onclick: () => showDeleteModal && handleDelete(showDeleteModal),
          children: ($$renderer4) => {
            $$renderer4.push(`<!---->Eliminar`);
          }
        });
        $$renderer3.push(`<!----></div>`);
      },
      $$slots: { default: true }
    });
    $$renderer2.push(`<!----> `);
    TokenDisplay($$renderer2);
    $$renderer2.push(`<!---->`);
  });
}
function _page($$renderer) {
  AgentsView($$renderer);
}
export {
  _page as default
};
