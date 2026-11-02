/**
 * Generador de tipos TypeScript desde el esquema
 * ============================================================================
 *
 * El equivalente a `supabase gen types typescript`, y probablemente la pieza
 * con más impacto en adopción de todo el SDK: es la diferencia entre
 * autocompletado en cada consulta y `Record<string, any>` en todas.
 *
 * Es **puro**: entra la introspección, sale una cadena. Sin base de datos, sin
 * red, sin sistema de ficheros. Así se prueba exhaustivamente, que importa
 * porque un tipo mal generado se propaga silenciosamente a todo el código del
 * usuario.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Tres tipos por tabla, y por qué no basta con uno
 *
 *   Row     — lo que DEVUELVE la API. Todo presente; los nullable llevan `| null`.
 *   Insert  — lo que MANDAS al crear. Lo que tiene default o es nullable se
 *             vuelve opcional: exigir un `id` que genera la base de datos sería
 *             mentir sobre el contrato.
 *   Update  — parcial de Insert, **sin la clave primaria**: cambiarla no es una
 *             actualización, es otra fila.
 *
 * Un único tipo obligaría a `as any` en cada create, que es exactamente el
 * problema que esto viene a resolver.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface IntrospectedColumn {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isForeignKey?: boolean;
  foreignTable?: string | null;
  foreignColumn?: string | null;
  maxLength?: number | null;
  isUnique?: boolean;
  isIndexed?: boolean;
}

export interface IntrospectedTable {
  name: string;
  schema?: string;
  columns: IntrospectedColumn[];
  primaryKey?: string[];
}

export interface GenerateTypesOptions {
  /** Cabecera del fichero. */
  header?: string;
  /** Nombre del mapa de tablas. */
  databaseTypeName?: string;
  /** Tablas a excluir (internas de auth, migraciones…). */
  exclude?: string[];
}

// ── Mapeo de tipos ───────────────────────────────────────────────────────────

/**
 * Postgres → TypeScript.
 *
 * `jsonb` se mapea a `unknown` y NO a `any`: `any` desactivaría la comprobación
 * de todo lo que toque ese campo, que es justo lo contrario de generar tipos.
 * `unknown` obliga a estrechar, que es incómodo a propósito.
 *
 * Los enteros grandes (`bigint`, `int8`) van a `string`: los devuelve así el
 * driver de Postgres porque no caben en un `number` de JS sin perder precisión.
 * Tiparlos como `number` sería un bug silencioso en cuanto los ids crecen.
 */
const TYPE_MAP: Record<string, string> = {
  // Texto
  text: "string",
  varchar: "string",
  "character varying": "string",
  char: "string",
  character: "string",
  uuid: "string",
  citext: "string",
  name: "string",

  // Números que sí caben
  int2: "number",
  smallint: "number",
  int4: "number",
  integer: "number",
  int: "number",
  real: "number",
  float4: "number",
  float8: "number",
  "double precision": "number",

  // Números que NO caben en un number de JS
  int8: "string",
  bigint: "string",
  numeric: "string",
  decimal: "string",
  money: "string",

  // Booleanos
  bool: "boolean",
  boolean: "boolean",

  // Fechas: se serializan como ISO 8601 al viajar por JSON.
  timestamp: "string",
  timestamptz: "string",
  "timestamp with time zone": "string",
  "timestamp without time zone": "string",
  date: "string",
  time: "string",
  timetz: "string",
  interval: "string",

  // Estructurados
  json: "unknown",
  jsonb: "unknown",
  bytea: "string",
};

/** Tipo TS de una columna, sin contar nullabilidad. */
export function mapColumnType(pgType: string): string {
  const normalized = pgType.toLowerCase().trim();

  // Arrays de Postgres: `_text` o `text[]`.
  if (normalized.startsWith("_")) {
    return `${mapColumnType(normalized.slice(1))}[]`;
  }
  if (normalized.endsWith("[]")) {
    return `${mapColumnType(normalized.slice(0, -2))}[]`;
  }

  return TYPE_MAP[normalized] ?? "unknown";
}

// ── Identificadores ──────────────────────────────────────────────────────────

/** `blog_posts` → `BlogPosts`. */
export function toPascalCase(name: string): string {
  return name
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

const VALID_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Clave de propiedad, entrecomillada si hace falta.
 *
 * Una columna puede llamarse `order` o `2fa_enabled`; emitirla cruda daría un
 * fichero que no compila, y el usuario no sabría por qué.
 */
export function propertyKey(name: string): string {
  return VALID_IDENTIFIER.test(name) ? name : JSON.stringify(name);
}

// ── Reglas de opcionalidad ───────────────────────────────────────────────────

/**
 * ¿Es opcional al INSERTAR?
 *
 * Sí cuando la base de datos puede rellenarla: tiene default, es nullable, o es
 * una clave primaria autogenerada. Exigir un `id` que genera Postgres obligaría
 * a inventárselo o a castear, que es el fallo típico de los tipos generados a
 * mano.
 */
export function isOptionalOnInsert(column: IntrospectedColumn): boolean {
  if (column.defaultValue !== null && column.defaultValue !== undefined) return true;
  if (column.nullable) return true;
  // PK sin default explícito pero de tipo autogenerable.
  if (column.isPrimaryKey && /^(uuid|serial|bigserial|int8|int4)$/i.test(column.type)) return true;
  return false;
}

// ── Emisión ──────────────────────────────────────────────────────────────────

function emitInterface(
  name: string,
  columns: IntrospectedColumn[],
  mode: "row" | "insert"
): string {
  const lines = columns.map((col) => {
    const base = mapColumnType(col.type);
    const optional = mode === "insert" && isOptionalOnInsert(col);
    // En Row, nullable significa "puede venir null".
    // En Insert, nullable significa "puedes mandar null" — y además es opcional.
    const type = col.nullable ? `${base} | null` : base;

    const notes: string[] = [];
    if (col.isPrimaryKey) notes.push("clave primaria");
    if (col.isForeignKey && col.foreignTable) {
      notes.push(`→ ${col.foreignTable}.${col.foreignColumn ?? "id"}`);
    }
    const comment = notes.length ? `  /** ${notes.join(" · ")} */\n` : "";

    return `${comment}  ${propertyKey(col.name)}${optional ? "?" : ""}: ${type};`;
  });

  return `export interface ${name} {\n${lines.join("\n")}\n}`;
}

/**
 * Genera el fichero de tipos completo.
 *
 * Determinista: las tablas y columnas se emiten en orden estable, así que
 * regenerar sin cambios en el esquema produce un diff vacío. Sin eso, el
 * fichero generado ensuciaría cada commit.
 */
export function generateTypes(
  tables: IntrospectedTable[],
  options: GenerateTypesOptions = {}
): string {
  const dbName = options.databaseTypeName ?? "Database";
  const exclude = new Set(options.exclude ?? []);

  const usable = tables
    .filter((t) => !exclude.has(t.name) && t.columns.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  const header =
    options.header ??
    `/**
 * GENERADO POR \`kitsuden gen types\` — NO EDITAR A MANO.
 *
 * Regenera tras cada migración:
 *   kitsuden gen types --out src/kitsuden.types.ts
 *
 * Uso con el SDK:
 *   const client = createClient<${dbName}>({ baseUrl });
 *   const posts = await client.from("blog_posts").list();  // tipado
 */`;

  if (usable.length === 0) {
    return `${header}\n\nexport interface ${dbName} {}\n`;
  }

  const blocks: string[] = [];
  const mapEntries: string[] = [];

  for (const table of usable) {
    const base = toPascalCase(table.name);
    const columns = [...table.columns].sort((a, b) => a.name.localeCompare(b.name));

    const pk = new Set(
      table.primaryKey ?? columns.filter((c) => c.isPrimaryKey).map((c) => c.name)
    );

    blocks.push(
      `// ── ${table.name} ${"─".repeat(Math.max(0, 60 - table.name.length))}\n` +
        emitInterface(`${base}Row`, columns, "row") +
        "\n\n" +
        emitInterface(`${base}Insert`, columns, "insert") +
        "\n\n" +
        `/** Parcial de Insert SIN la clave primaria: cambiarla no es actualizar, es otra fila. */\n` +
        `export type ${base}Update = Partial<Omit<${base}Insert, ${
          pk.size ? [...pk].map((k) => JSON.stringify(k)).join(" | ") : "never"
        }>>;`
    );

    mapEntries.push(
      `  ${propertyKey(table.name)}: {\n` +
        `    Row: ${base}Row;\n` +
        `    Insert: ${base}Insert;\n` +
        `    Update: ${base}Update;\n` +
        `  };`
    );
  }

  const map =
    `/**\n` +
    ` * Mapa de tablas. Pásalo al cliente para que \`from()\` sepa de qué habla:\n` +
    ` *   createClient<${dbName}>({ baseUrl })\n` +
    ` */\n` +
    `export interface ${dbName} {\n${mapEntries.join("\n")}\n}`;

  const helpers =
    `/** Nombre de tabla válido. */\n` +
    `export type TableName = keyof ${dbName};\n\n` +
    `/** Fila de una tabla: \`Row<"blog_posts">\`. */\n` +
    `export type Row<T extends TableName> = ${dbName}[T]["Row"];\n` +
    `export type Insert<T extends TableName> = ${dbName}[T]["Insert"];\n` +
    `export type Update<T extends TableName> = ${dbName}[T]["Update"];`;

  return `${header}\n\n${blocks.join("\n\n")}\n\n${map}\n\n${helpers}\n`;
}
