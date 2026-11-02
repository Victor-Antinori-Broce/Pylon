/**
 * ============================================================================
 * REGISTRO ÚNICO DE TIPOS DE CAMPO
 * ============================================================================
 *
 * Antes esta información vivía repartida en cuatro sitios que había que tocar
 * a la vez y que ya habían divergido:
 *
 *   - `FieldTypeSchema` (qué tipos existen)
 *   - el `switch` de `fieldTypeToZod` (cómo valida cada uno)
 *   - `FIELD_TYPE_OPTIONS` en el admin (cuáles se pueden crear)
 *   - `shouldIndexByDefault` / `shouldSearchByDefault` (cómo se indexan)
 *
 * La divergencia no era teórica: `multiselect`, `textarea`, `datetime` y
 * `media` se validaban correctamente en el backend pero no existían para el
 * usuario, porque nadie los añadió a la lista del admin. Cuatro tipos
 * funcionando que nadie podía crear.
 *
 * A partir de aquí, un tipo nuevo se declara UNA vez, en este fichero.
 *
 * NO define: cómo se pinta el widget concreto (eso es del admin) ni las reglas
 * de negocio de un kon. Solo lo que TODOS necesitan saber de un tipo.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Forma del valor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Familia de valor sobre la que se construye la validación.
 *
 * Es deliberadamente corta: si esto creciera hasta tener una entrada por tipo
 * habríamos vuelto al `switch` que veníamos a eliminar, solo que en otro sitio.
 */
export type FieldValueKind =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "uuid"
  /** Un medio: id de la mediateca O dirección http(s). Ver `image`. */
  | "mediaRef"
  | "json"
  | "stringArray"
  | "rows";

/** Refinamientos sobre `string` que aportan validación de formato. */
export type FieldStringFormat = "email" | "url";

export interface FieldTypeSpec {
  /** Familia de valor: de aquí sale el validador base. */
  kind: FieldValueKind;
  /** Refinamiento de formato, solo para `kind: "string"`. */
  format?: FieldStringFormat;

  // ── Metadatos de UI (los consume la paleta del admin) ──
  label: string;
  description: string;
  /** Nombre del icono de lucide. */
  icon: string;
  /** Color de acento en la paleta. */
  color: string;
  /**
   * `false` deja el tipo utilizable por API pero fuera de la paleta. Se usa
   * para los alias heredados, que siguen validando pero no se ofrecen como
   * opción nueva: tenerlos en la paleta sería ofrecer dos nombres para lo
   * mismo.
   */
  creatable: boolean;

  // ── Afordancias de configuración ──
  /** Admite `options[]` (listas de valores). */
  supportsOptions?: boolean;
  /** Admite `subFields[]` (repeater). */
  supportsSubFields?: boolean;
  /** Admite `relation{}`. */
  supportsRelation?: boolean;

  // ── Indexación ──
  /** Se filtra por valor exacto con frecuencia → índice por defecto. */
  indexByDefault: boolean;
  /** Contiene prosa → índice de búsqueda por defecto. */
  searchByDefault: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// El registro
// ─────────────────────────────────────────────────────────────────────────────

export const FIELD_TYPES = {
  text: {
    kind: "string",
    label: "Text",
    description: "Single or multi-line text",
    icon: "Type",
    color: "#00E5FF",
    creatable: true,
    indexByDefault: false,
    searchByDefault: true,
  },
  textarea: {
    kind: "string",
    label: "Long text",
    description: "Multi-line prose",
    // `AlignLeft` ya no existe en lucide 0.575; `Pilcrow` es además el signo
    // de párrafo, que dice mejor "prosa" que una alineación.
    icon: "Pilcrow",
    color: "#00B8D4",
    creatable: true,
    indexByDefault: false,
    searchByDefault: true,
  },
  number: {
    kind: "number",
    label: "Number",
    description: "Integer or decimal",
    icon: "Hash",
    color: "#76FF03",
    creatable: true,
    indexByDefault: false,
    searchByDefault: false,
  },
  boolean: {
    kind: "boolean",
    label: "Boolean",
    description: "True / False toggle",
    icon: "ToggleLeft",
    color: "#FFD600",
    creatable: true,
    indexByDefault: false,
    searchByDefault: false,
  },
  date: {
    kind: "date",
    label: "Date",
    description: "Date or datetime",
    icon: "Calendar",
    color: "#E040FB",
    creatable: true,
    indexByDefault: false,
    searchByDefault: false,
  },
  datetime: {
    kind: "date",
    label: "Date & time",
    description: "Timestamp with time of day",
    icon: "Clock",
    color: "#D500F9",
    creatable: true,
    indexByDefault: false,
    searchByDefault: false,
  },
  image: {
    /**
     * Id de la mediateca O URL http(s).
     *
     * Con `uuid` a secas, un dataset con imágenes externas no podía guardarse
     * (la URL no pasaba la validación), y los consumidores —tier lists,
     * catálogos, la rejilla pública— solo sabían pintar URLs: ningún campo de
     * imagen servía a la vez para validar y para pintar.
     */
    kind: "mediaRef",
    label: "Image",
    description: "Reference to a media item, or an absolute image URL",
    icon: "Image",
    color: "#FF9100",
    creatable: true,
    indexByDefault: false,
    searchByDefault: false,
  },
  media: {
    kind: "mediaRef",
    label: "File",
    description: "Any media item — PDF, video, document",
    icon: "Paperclip",
    color: "#FF6E40",
    creatable: true,
    indexByDefault: false,
    searchByDefault: false,
  },
  url: {
    kind: "string",
    format: "url",
    label: "URL",
    description: "Validated web address",
    icon: "Link",
    color: "#40C4FF",
    creatable: true,
    indexByDefault: true,
    searchByDefault: false,
  },
  email: {
    kind: "string",
    format: "email",
    label: "Email",
    description: "Validated email address",
    icon: "Mail",
    color: "#B388FF",
    creatable: true,
    indexByDefault: true,
    searchByDefault: false,
  },
  select: {
    kind: "string",
    label: "Select",
    description: "One value from a list",
    icon: "List",
    color: "#1DE9B6",
    creatable: true,
    supportsOptions: true,
    indexByDefault: true,
    searchByDefault: false,
  },
  multiselect: {
    kind: "stringArray",
    label: "Multi-select",
    description: "Several values from a list",
    icon: "ListChecks",
    color: "#00BFA5",
    creatable: true,
    supportsOptions: true,
    indexByDefault: false,
    searchByDefault: false,
  },
  json: {
    kind: "json",
    label: "JSON",
    description: "Free-form structured data",
    icon: "Braces",
    color: "#8D99AE",
    creatable: true,
    indexByDefault: false,
    searchByDefault: false,
  },
  richtext: {
    kind: "string",
    label: "Rich text",
    description: "Formatted content",
    icon: "FileText",
    color: "#FF4081",
    creatable: true,
    indexByDefault: false,
    // Es prosa y debería ser buscable, pero `shouldSearchByDefault` nunca lo
    // incluyó. Activarlo aquí crearía índices de búsqueda en datasets que ya
    // existen sin que nadie lo haya pedido; se deja como estaba y queda como
    // mejora consciente, no como efecto colateral de una refactorización.
    searchByDefault: false,
  },
  relation: {
    kind: "uuid",
    label: "Relation",
    description: "Link to another dataset",
    icon: "GitBranch",
    color: "#536DFE",
    creatable: true,
    supportsRelation: true,
    indexByDefault: true,
    searchByDefault: false,
  },
  kpi: {
    kind: "number",
    label: "KPI / Formula",
    description: "Calculated metric",
    icon: "Calculator",
    color: "#FF1493",
    creatable: true,
    indexByDefault: false,
    searchByDefault: false,
  },
  repeater: {
    kind: "rows",
    label: "Repeater",
    description: "Repeating group of subfields",
    icon: "Rows3",
    color: "#FF6D00",
    creatable: true,
    supportsSubFields: true,
    indexByDefault: false,
    searchByDefault: false,
  },
} as const satisfies Record<string, FieldTypeSpec>;

export type FieldTypeName = keyof typeof FIELD_TYPES;

/** Todos los nombres de tipo, para derivar el enum de Zod sin repetir la lista. */
export const FIELD_TYPE_NAMES = Object.keys(FIELD_TYPES) as [FieldTypeName, ...FieldTypeName[]];

/**
 * Alias heredados que aparecen en esquemas antiguos y en otros vocabularios
 * del repo (columnas SQL en `AutoFormModal`, el `CustomFieldType` de
 * kon-esports). Se resuelven al tipo canónico en vez de duplicar entradas.
 *
 * Mapear en lugar de ramificar: cuando aparezca un vocabulario nuevo, se añade
 * aquí y no se toca ningún validador.
 */
export const FIELD_TYPE_ALIASES = {
  // Vocabulario de columnas SQL (AutoFormModal)
  string: "text",
  integer: "number",
  float: "number",
  numeric: "number",
  jsonb: "json",
  object: "json",
  timestamp: "datetime",
  checkbox: "boolean",
  // Otros nombres vistos en esquemas antiguos
  file: "media",
  longtext: "textarea",
  bool: "boolean",
  // `as const` y no `Record<string, …>`: con la firma ancha, `keyof` daría
  // `string` y cualquier consumidor que se ate a esta lista con `satisfies`
  // pasaría la comprobación sin comprobar nada.
} as const satisfies Record<string, FieldTypeName>;

export type FieldTypeAlias = keyof typeof FIELD_TYPE_ALIASES;

/**
 * Resuelve cualquier nombre —canónico, alias o desconocido— a un tipo del
 * registro.
 *
 * Un tipo desconocido cae en `text` en vez de reventar: un esquema con un tipo
 * que este build no conoce todavía debe seguir guardando su dato como texto,
 * no tumbar el formulario entero. Es la misma razón por la que el validador de
 * entradas usa `passthrough()`.
 */
export function resolveFieldType(type: string | undefined | null): FieldTypeName {
  if (!type) return "text";
  if (type in FIELD_TYPES) return type as FieldTypeName;
  return (FIELD_TYPE_ALIASES as Record<string, FieldTypeName>)[type] ?? "text";
}

/** Spec de un tipo, resolviendo alias. Nunca devuelve `undefined`. */
export function fieldTypeSpec(type: string | undefined | null): FieldTypeSpec {
  return FIELD_TYPES[resolveFieldType(type)];
}

/** Tipos ofrecibles en la paleta del admin, en el orden de declaración. */
export function creatableFieldTypes(): Array<{ type: FieldTypeName } & FieldTypeSpec> {
  return (Object.entries(FIELD_TYPES) as Array<[FieldTypeName, FieldTypeSpec]>)
    .filter(([, spec]) => spec.creatable)
    .map(([type, spec]) => ({ type, ...spec }));
}

export function shouldIndexByDefault(type: string): boolean {
  return fieldTypeSpec(type).indexByDefault;
}

export function shouldSearchByDefault(type: string): boolean {
  return fieldTypeSpec(type).searchByDefault;
}

/**
 * Los campos de `data_sets.schema`, venga con la forma que venga.
 *
 * La columna se ha escrito con DOS formas: una lista de campos (rutas «lite»,
 * validación, catálogos de kons, la tabla de `/data`) y un objeto `{fields}`
 * (la rejilla pública, la importación masiva, el POST de kon-datasets, MCP).
 * Cada consumidor esperaba una sola, así que ningún dataset servía para todos:
 * la validación reventaba con `{fields}` y la rejilla pintaba 0 columnas con
 * una lista. Todos leen ahora por aquí.
 */
export function camposDelSchema(schema: unknown): Record<string, unknown>[] {
  const lista = Array.isArray(schema)
    ? schema
    : schema && typeof schema === "object" && Array.isArray((schema as { fields?: unknown }).fields)
      ? (schema as { fields: unknown[] }).fields
      : [];
  return lista.filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === "object");
}
