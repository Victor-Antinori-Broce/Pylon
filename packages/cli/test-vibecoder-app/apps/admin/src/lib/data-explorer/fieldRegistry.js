/**
 * DataExplorer Field Registry
 *
 * Sistema extensible de tipos de campo para el DataExplorer.
 * Permite registrar componentes personalizados por tipo de campo.
 */
// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════
class FieldRegistry {
    components = new Map();
    calculatedFields = new Map();
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
            return undefined;
        try {
            return config.calculate(row, context);
        }
        catch (err) {
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
        // Crear componente wrapper que mergea opciones
        const ExtendedComponent = baseComponent; // Svelte component
        this.register(extendedType, ExtendedComponent);
    }
}
// Singleton global
export const fieldRegistry = new FieldRegistry();
// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS DE CÁLCULO
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Helpers para expresiones de campos calculados
 */
export const calculatedHelpers = {
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
            "mm": String(d.getMinutes()).padStart(2, "0"),
        };
        return format.replace(/YYYY|MM|DD|HH|mm/g, match => map[match]);
    },
    // Tiempo relativo
    timeAgo: (date) => {
        const d = new Date(date);
        const now = new Date();
        const diff = now.getTime() - d.getTime();
        const seconds = Math.floor(diff / 1000);
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
            if (result === undefined)
                return defaultValue;
        }
        return result;
    },
};
// ═══════════════════════════════════════════════════════════════════════════════
// PRESETS COMUNES
// ═══════════════════════════════════════════════════════════════════════════════
export const fieldPresets = {
    // Campo de estado con colores automáticos
    status: (colors) => ({
        type: "status-badge",
        options: { colors }
    }),
    // Campo de relación simple
    relation: (table, displayField = "name", multiple = false) => ({
        type: "relation",
        options: { table, displayField, multiple }
    }),
    // Campo de media con preview
    media: (options) => ({
        type: "media",
        options
    }),
    // Campo calculado de conteo
    count: (arrayField, label) => ({
        type: "calculated",
        label,
        dependsOn: [arrayField],
        calculate: (row) => calculatedHelpers.count(row[arrayField]),
    }),
    // Campo de tiempo relativo
    timeAgo: (dateField, label) => ({
        type: "calculated",
        label,
        dependsOn: [dateField],
        calculate: (row) => calculatedHelpers.timeAgo(row[dateField]),
        format: "text"
    }),
};
//# sourceMappingURL=fieldRegistry.js.map