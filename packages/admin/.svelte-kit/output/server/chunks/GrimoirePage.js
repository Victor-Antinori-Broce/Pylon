import { b as attr, e as escape_html, l as derived, c as attr_class, o as stringify } from "./index.js";
import "clsx";
/* empty css                                        */
import "@sveltejs/kit/internal";
import "./exports.js";
import "./utils2.js";
import "@sveltejs/kit/internal/server";
import "./root.js";
import "./state.svelte.js";
/* empty css                                        */
/* empty css                                       */
import "./SetupView.svelte_svelte_type_style_lang.js";
import { C as Check } from "./check.js";
import { X } from "./x.js";
import { C as Calendar } from "./calendar.js";
class FieldRegistry {
  components = /* @__PURE__ */ new Map();
  calculatedFields = /* @__PURE__ */ new Map();
  /**
   * Registrar un componente para un tipo de campo
   */
  register(type, component) {
    this.components.set(type, component);
  }
  /**
   * Obtener el componente para un tipo de campo
   */
  get(type) {
    return this.components.get(type);
  }
  /**
   * Verificar si existe un componente para el tipo
   */
  has(type) {
    return this.components.has(type);
  }
  /**
   * Registrar un campo calculado
   */
  registerCalculated(name, config) {
    this.calculatedFields.set(name, config);
  }
  /**
   * Obtener configuración de campo calculado
   */
  getCalculated(name) {
    return this.calculatedFields.get(name);
  }
  /**
   * Evaluar un campo calculado
   */
  evaluateCalculated(name, row, context) {
    const config = this.calculatedFields.get(name);
    if (!config)
      return void 0;
    try {
      return config.calculate(row, context);
    } catch (err) {
      console.error(`Error evaluating calculated field "${name}":`, err);
      return null;
    }
  }
  /**
   * Obtener todos los tipos registrados
   */
  getRegisteredTypes() {
    return Array.from(this.components.keys());
  }
  /**
   * Extender un tipo existente con opciones adicionales
   */
  extend(baseType, extendedType, _defaultOptions) {
    const baseComponent = this.components.get(baseType);
    if (!baseComponent) {
      throw new Error(`Cannot extend unregistered type: ${baseType}`);
    }
    const ExtendedComponent = baseComponent;
    this.register(extendedType, ExtendedComponent);
  }
}
const fieldRegistry = new FieldRegistry();
const calculatedHelpers = {
  // Contar elementos
  count: (arr) => arr?.length || 0,
  // Sumar valores
  sum: (arr, field) => arr?.reduce((acc, item) => acc + (Number(item[field]) || 0), 0) || 0,
  // Promedio
  avg: (arr, field) => {
    if (!arr?.length)
      return 0;
    return calculatedHelpers.sum(arr, field) / arr.length;
  },
  // Concatenar strings
  concat: (...parts) => parts.filter(Boolean).join(" "),
  // Formatear fecha
  dateFormat: (date, format) => {
    const d = new Date(date);
    if (isNaN(d.getTime()))
      return "—";
    const map = {
      "YYYY": d.getFullYear().toString(),
      "MM": String(d.getMonth() + 1).padStart(2, "0"),
      "DD": String(d.getDate()).padStart(2, "0"),
      "HH": String(d.getHours()).padStart(2, "0"),
      "mm": String(d.getMinutes()).padStart(2, "0")
    };
    return format.replace(/YYYY|MM|DD|HH|mm/g, (match) => map[match]);
  },
  // Tiempo relativo
  timeAgo: (date) => {
    const d = new Date(date);
    const now = /* @__PURE__ */ new Date();
    const diff = now.getTime() - d.getTime();
    const seconds = Math.floor(diff / 1e3);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0)
      return `${days}d ago`;
    if (hours > 0)
      return `${hours}h ago`;
    if (minutes > 0)
      return `${minutes}m ago`;
    return "just now";
  },
  // Formatear moneda
  currency: (value, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value),
  // Condicional
  if: (condition, trueValue, falseValue) => condition ? trueValue : falseValue,
  // Obtener valor anidado
  get: (obj, path, defaultValue) => {
    const keys = path.split(".");
    let result = obj;
    for (const key of keys) {
      result = result?.[key];
      if (result === void 0)
        return defaultValue;
    }
    return result;
  }
};
function TextField($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { value, config, mode, onChange } = $$props;
    let displayValue = derived(() => value ?? "—");
    if (mode === "view" || mode === "inline") {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<span class="text-gremius-text truncate"${attr("title", String(displayValue()))}>${escape_html(displayValue())}</span>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<input type="text"${attr("value", value ?? "")}${attr("placeholder", config.options?.placeholder)}${attr("maxlength", config.options?.maxLength)} class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-sm text-gremius-text placeholder:text-gremius-subtle focus:outline-none focus:border-gremius-cyan"/>`);
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function NumberField($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { value, config, mode, onChange } = $$props;
    let displayValue = derived(() => value !== null && value !== void 0 ? Number(value).toLocaleString() : "—");
    if (mode === "view" || mode === "inline") {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<span class="text-gremius-text tabular-nums">${escape_html(displayValue())}</span>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<input type="number"${attr("value", value ?? "")}${attr("min", config.options?.min)}${attr("max", config.options?.max)}${attr("step", config.options?.step)}${attr("placeholder", config.options?.placeholder)} class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-sm text-gremius-text focus:outline-none focus:border-gremius-cyan"/>`);
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function BooleanField($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { value, mode, onChange } = $$props;
    let isTrue = derived(() => !!value);
    if (mode === "view" || mode === "inline") {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<span class="inline-flex items-center gap-1.5">`);
      if (isTrue()) {
        $$renderer2.push("<!--[-->");
        Check($$renderer2, { class: "w-4 h-4 text-gremius-green" });
        $$renderer2.push(`<!----> <span class="text-gremius-green text-sm">Yes</span>`);
      } else {
        $$renderer2.push("<!--[!-->");
        X($$renderer2, { class: "w-4 h-4 text-gremius-subtle" });
        $$renderer2.push(`<!----> <span class="text-gremius-subtle text-sm">No</span>`);
      }
      $$renderer2.push(`<!--]--></span>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<label class="flex items-center gap-3 cursor-pointer"><input type="checkbox"${attr("checked", isTrue(), true)} class="w-5 h-5 rounded border-gremius-border bg-gremius-bg text-gremius-cyan focus:ring-gremius-cyan"/> <span class="text-sm text-gremius-text">${escape_html(isTrue() ? "Enabled" : "Disabled")}</span></label>`);
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function StatusBadgeField($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { value, config } = $$props;
    const defaultColors = {
      draft: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
      published: "bg-green-500/10 text-green-500 border-green-500/20",
      archived: "bg-gray-500/10 text-gray-400 border-gray-500/20",
      active: "bg-green-500/10 text-green-500 border-green-500/20",
      inactive: "bg-gray-500/10 text-gray-400 border-gray-500/20",
      pending: "bg-amber-500/10 text-amber-500 border-amber-500/20",
      approved: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
      rejected: "bg-red-500/10 text-red-500 border-red-500/20"
    };
    let statusColors = derived(() => ({ ...defaultColors, ...config.options?.colors }));
    let statusClass = derived(() => statusColors()[String(value)?.toLowerCase()] || "bg-gremius-surface text-gremius-text-dim border-gremius-border");
    $$renderer2.push(`<span${attr_class(`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${stringify(statusClass())}`)}>${escape_html(value ?? "—")}</span>`);
  });
}
function DateField($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { value, config, mode, onChange } = $$props;
    let formattedDate = derived(() => {
      if (!value) return "—";
      const date = new Date(value);
      if (isNaN(date.getTime())) return "—";
      const format = config.options?.format || "YYYY-MM-DD";
      const map = {
        "YYYY": date.getFullYear().toString(),
        "MM": String(date.getMonth() + 1).padStart(2, "0"),
        "DD": String(date.getDate()).padStart(2, "0")
      };
      return format.replace(/YYYY|MM|DD/g, (match) => map[match]);
    });
    let inputValue = derived(() => value ? new Date(value).toISOString().split("T")[0] : "");
    if (mode === "view" || mode === "inline") {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<span class="inline-flex items-center gap-1.5 text-gremius-text-dim">`);
      Calendar($$renderer2, { class: "w-3.5 h-3.5" });
      $$renderer2.push(`<!----> ${escape_html(formattedDate()())}</span>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<input type="date"${attr("value", inputValue())} class="w-full px-3 py-2 bg-gremius-bg border border-gremius-border rounded-lg text-sm text-gremius-text focus:outline-none focus:border-gremius-cyan"/>`);
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function CalculatedField($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { value, row, config } = $$props;
    let calculatedValue = derived(() => {
      if (config.options?.calculate && typeof config.options.calculate === "function") {
        try {
          return config.options.calculate(row);
        } catch (err) {
          console.error("Error calculating field:", err);
          return null;
        }
      }
      return value;
    });
    let displayValue = derived(() => {
      const val = calculatedValue()();
      if (val === null || val === void 0) return "—";
      const format = config.options?.format;
      switch (format) {
        case "currency":
          return calculatedHelpers.currency(Number(val));
        case "percentage":
          return `${Number(val).toFixed(1)}%`;
        case "datetime":
          return calculatedHelpers.dateFormat(val, "YYYY-MM-DD HH:mm");
        case "badge":
          return val;
        default:
          return String(val);
      }
    });
    let isBadge = derived(() => config.options?.format === "badge");
    if (isBadge()) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gremius-cyan/10 text-gremius-cyan">${escape_html(displayValue()())}</span>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<span class="text-gremius-text-dim tabular-nums">${escape_html(displayValue()())}</span>`);
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function registerDefaultFields() {
  fieldRegistry.register("text", TextField);
  fieldRegistry.register("textarea", TextField);
  fieldRegistry.register("email", TextField);
  fieldRegistry.register("url", TextField);
  fieldRegistry.register("slug", TextField);
  fieldRegistry.register("number", NumberField);
  fieldRegistry.register("boolean", BooleanField);
  fieldRegistry.register("date", DateField);
  fieldRegistry.register("datetime", DateField);
  fieldRegistry.register("status-badge", StatusBadgeField);
  fieldRegistry.register("select", StatusBadgeField);
  fieldRegistry.register("calculated", CalculatedField);
}
registerDefaultFields();
function GrimoirePage($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { grimoireId, initialViewId } = $$props;
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex items-center justify-center h-96"><div class="flex flex-col items-center gap-4"><div class="w-8 h-8 border-2 border-gremius-cyan/30 border-t-gremius-cyan rounded-full animate-spin"></div> <p class="text-gremius-subtle text-sm">Loading ${escape_html(grimoireId)}...</p></div></div>`);
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  GrimoirePage as G
};
