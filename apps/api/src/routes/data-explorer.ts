/**
 * Data Explorer API — "Data Studio" (Pilar 1)
 *
 * Universal table explorer with:
 *   ✅ Whitelist-based table access (security)
 *   ✅ Server-side pagination (limit/offset)
 *   ✅ Server-side sorting (any column, asc/desc)
 *   ✅ Server-side filtering (field, operator, value)
 *   ✅ Inline edit via PATCH (single cell updates)
 *   ✅ Column metadata (types, editability)
 *   ✅ Smart Views (saved filter presets)
 */

import { TABLAS_SOLO_POR_SU_RUTA } from "../lib/codigo-de-acciones";
import { messageOf } from "@kitsuden/engine";
import { count, eq, sql, asc, desc, ilike, gt, lt, gte, lte } from "drizzle-orm";
import { Hono } from "hono";

import { db } from "../db";
import {
  authUsers as user,
  media,
  dataSets,
  dataEntries,
  siteSettings,
  modules,
} from "../db/schema";
import {
  escrituraExigeAdmin,
  sinColumnasSecretas,
  tablaEsExplorable,
} from "../lib/tablas-explorables";
import { requireAuth } from "../middleware/auth";
import {
  introspectTable,
  getAllTables,
  type IntrospectedColumn,
} from "../services/schema-introspector";

export const explorerRoutes = new Hono();

// Apply authentication to all routes
explorerRoutes.use("/*", requireAuth);

// Ninguna respuesta del explorador lleva un secreto vivo (tokens, contraseñas,
// hashes de claves), ni siquiera a un admin. Ver `sinColumnasSecretas`.
explorerRoutes.use("/*", async (c, next) => {
  await next();
  if (!(c.res.headers.get("content-type") ?? "").includes("application/json")) return;
  const cuerpo = await c.res
    .clone()
    .json()
    .catch(() => undefined);
  if (cuerpo === undefined) return;
  const cabeceras = new Headers(c.res.headers);
  cabeceras.delete("content-length");
  c.res = new Response(JSON.stringify(sinColumnasSecretas(cuerpo)), {
    status: c.res.status,
    headers: cabeceras,
  });
});

/**
 * Operadores de `?filter_op=`.
 *
 * La lista se declara una vez y se usa para RECHAZAR lo que no esté en ella.
 * Los dos caminos de este archivo —el tipado y el de SQL dinámico— trataban un
 * operador desconocido como "sin filtro": quien pidiera `filter_op=starts_with`
 * recibía la tabla entera creyendo que la había filtrado. Devolver de más en
 * silencio es peor que devolver un error.
 *
 * El camino dinámico solo entiende los dos primeros; lo dice en su propia
 * comprobación.
 */
const FILTER_OPS = ["contains", "equals", "gt", "lt", "gte", "lte"] as const;
const FILTER_OPS_DINAMICO = ["contains", "equals"] as const;

// ═══════════════════════════════════════════════
// DYNAMIC TABLE RESOLUTION (fallback for tables not in static registry)
// ═══════════════════════════════════════════════

/**
 * Resolve a table — check static registry first, then fall back to
 * dynamic introspection of any real DB table via information_schema.
 * This allows ALL tables to be explored without manual registration.
 */
/**
 * Deniega la escritura de tablas sensibles a quien no sea `admin`.
 *
 * `auth_users` y `modules` se pueden MIRAR con sesión —son datos que el panel
 * enseña— pero modificarlas es otra cosa: cambiar `role` en `auth_users` es
 * escalar privilegios, y `modules` es el interruptor que instala kons.
 *
 * Devuelve la respuesta a enviar, o `null` si puede seguir.
 */
function denegarEscrituraSensible(
  c: { get(k: "user"): { role?: string } | undefined; json: (b: unknown, s: 403) => Response },
  tabla: string
): Response | null {
  // Fase I (decisión 2): las tablas con ruta propia no se escriben por aquí.
  if (TABLAS_SOLO_POR_SU_RUTA.has(tabla)) {
    return c.json(
      {
        error: "Forbidden",
        code: "KITSUDEN_E_FORBIDDEN",
        message: `'${tabla}' is not written through the explorer: use its own route (/api/actions or promotion_propose for actions, /api/approvals for approvals and proposals, /api/admin/agents for agents).`,
      },
      403
    );
  }
  if (!escrituraExigeAdmin(tabla)) return null;

  const rol = c.get("user")?.role;
  if (rol === "admin") return null;

  return c.json(
    {
      error: "Forbidden",
      message: `Modificar '${tabla}' requiere rol administrador.`,
    },
    403
  );
}

async function resolveTable(name: string): Promise<TableMeta | null> {
  /**
   * La política de acceso vive AQUÍ porque aquí pasan todas las rutas de datos
   * —listar, crear, modificar, borrar y opciones—. Ponerla en cada handler
   * habría dejado el hueco en el que se olvidara.
   *
   * Antes esto resolvía cualquier tabla de la base por introspección, y el
   * router entero estaba protegido solo con `requireAuth`, que no mira el rol.
   * Un `editor` llegaba a `kitsuden_secrets`, `auth_accounts` y
   * `kitsuden_migrations`, con escritura. Ver `lib/tablas-explorables.ts`.
   *
   * Se devuelve `null` —lo mismo que una tabla inexistente— a propósito: un 403
   * confirmaría que la tabla existe.
   */
  const veredicto = await tablaEsExplorable(name, Object.keys(tableRegistry));
  if (!veredicto.permitida) {
    if (veredicto.motivo === "prohibida") {
      console.warn(`[Explorer] Acceso denegado a tabla protegida: ${name}`);
    }
    return null;
  }

  // 1. Static registry (fast, typed Drizzle references)
  if (tableRegistry[name]) return tableRegistry[name];

  // 2. Dynamic introspection (any DB table)
  const introspected = await introspectTable(name);
  if (!introspected) return null;

  // Build a dynamic TableMeta using raw SQL
  const pk = introspected.primaryKey[0] || "id";
  const readonlyFields = [
    pk,
    ...introspected.columns
      .filter((c) => c.name.endsWith("_at") || c.name === "createdAt" || c.name === "updatedAt")
      .map((c) => c.name),
  ];

  return {
    table: name as any, // Will use raw SQL, not Drizzle reference
    label: humanizeTableNameLocal(name),
    icon: "📋",
    readonlyFields,
    pk,
    _dynamic: true, // Flag: use raw SQL instead of Drizzle ORM
  } as TableMeta;
}

function humanizeTableNameLocal(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

// ═══════════════════════════════════════════════
// SCHEMA INTROSPECTION — For Admin UI generation
// ═══════════════════════════════════════════════

/**
 * GET /schema/json/:table — JSON Schema de una tabla
 * ----------------------------------------------------------------------------
 *
 * Es el endpoint que el panel pide PRIMERO para saber qué campos tiene un
 * formulario. Tenía dos fallos que se sumaban, y los dos se veían igual desde
 * el navegador: «No fields available».
 *
 * ── 1. NUNCA SE EJECUTABA ──────────────────────────────────────────────────
 *
 * Estaba registrado DESPUÉS de `/schema/:kon/:table`. Hono resuelve por orden
 * de registro entre patrones de la misma forma, así que `/schema/json/cursos`
 * entraba por el otro con `kon="json"` y `table="cursos"`. Por eso ahora va
 * antes: una ruta literal tiene que registrarse antes que el comodín que la
 * cubre. Lo vigila `tests/unit/rutas-ensombrecidas.test.ts`.
 *
 * ── 2. DEDUCÍA LAS COLUMNAS DE UNA FILA DE EJEMPLO ─────────────────────────
 *
 * Hacía `SELECT … LIMIT 1` y sacaba los campos del objeto devuelto. En una
 * tabla VACÍA no hay fila, así que devolvía `properties: {}` — cero campos.
 *
 * Es decir: el formulario de «crear el primer registro» no tenía campos
 * precisamente cuando no había ningún registro. Y el diagnóstico que enseñaba
 * el panel —«Total columns received: 0»— describía el síntoma sin delatar la
 * causa.
 *
 * Ahora se lee `information_schema`, que responde igual con la tabla vacía y
 * además trae el tipo real, si acepta nulos y las claves ajenas de verdad en
 * vez de adivinarlas por el nombre de la columna.
 */
explorerRoutes.get("/schema/json/:table", async (c) => {
  const tableName = c.req.param("table");

  // La misma puerta que `resolveTable`: este endpoint introspecta por su cuenta
  // y sin esto seguiría entregando el ESQUEMA de `kitsuden_secrets` o
  // `auth_accounts` —nombres de columna incluidos— a cualquiera con sesión.
  const veredicto = await tablaEsExplorable(tableName, Object.keys(tableRegistry));
  const introspected = veredicto.permitida ? await introspectTable(tableName) : null;
  if (!introspected) {
    return c.json(
      {
        error: `Table '${tableName}' not found`,
        /**
         * Solo lo EXPLORABLE.
         *
         * Antes esto listaba `getAllTables()` entero, así que la respuesta 404
         * de una tabla cualquiera enumeraba `kitsuden_secrets`, `auth_accounts`
         * y las demás. Un mensaje de "no encontrada" no puede ser un índice de
         * lo que hay.
         */
        available: (
          await Promise.all(
            [...new Set([...Object.keys(tableRegistry), ...(await getAllTables())])].map(
              async (t) =>
                (await tablaEsExplorable(t, Object.keys(tableRegistry))).permitida ? t : null
            )
          )
        )
          .filter((t): t is string => t !== null)
          .sort(),
      },
      404
    );
  }

  const meta = tableRegistry[tableName];
  const pk = introspected.primaryKey[0] || meta?.pk || "id";
  const soloLectura = new Set(
    meta?.readonlyFields ?? [
      pk,
      ...introspected.columns
        .filter(
          (col) => col.name.endsWith("_at") || col.name === "createdAt" || col.name === "updatedAt"
        )
        .map((col) => col.name),
    ]
  );

  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const col of introspected.columns) {
    const colType = tipoDeColumna(col);
    // La clave ajena declarada en la base manda sobre el nombre: `author_id`
    // puede apuntar a cualquier tabla, y el mapa de nombres solo acierta con
    // las convenciones que alguien recordó escribir.
    const relatedTable = col.foreignTable ?? getRelatedTable(col.name);

    const prop: Record<string, unknown> = { type: tipoJsonSchema(colType, col.type) };

    if (colType === "date") prop.format = "date-time";
    if (colType === "email") prop.format = "email";
    if (colType === "url") prop.format = "uri";
    if (colType === "id") prop.format = "uuid";

    if (colType === "relation" && relatedTable) {
      prop.format = "uuid";
      prop["x-relation"] = {
        table: relatedTable,
        optionsEndpoint: `/api/explorer/${relatedTable}/options`,
      };
    }

    if (soloLectura.has(col.name)) prop.readOnly = true;
    if (col.maxLength) prop.maxLength = col.maxLength;
    prop.description = generateFieldDescription(col.name, colType, relatedTable);

    properties[col.name] = prop;

    // Obligatorio = la base lo exige y no tiene valor por defecto. Antes se
    // marcaba obligatorio "todo lo que traía valor en la fila de ejemplo", que
    // no tiene ninguna relación con lo que la tabla permite.
    if (!col.nullable && col.defaultValue === null && !soloLectura.has(col.name)) {
      required.push(col.name);
    }
  }

  return c.json({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `kitsuden://tables/${tableName}`,
    title: meta?.label ?? humanizeTableNameLocal(tableName),
    description: `Schema for the ${meta?.label ?? tableName} table in Kitsuden`,
    type: "object",
    properties,
    required,
    "x-kitsuden": {
      table: tableName,
      primaryKey: pk,
      icon: meta?.icon ?? "📋",
      readonlyFields: [...soloLectura],
      rowCount: introspected.estimatedRowCount,
      endpoints: {
        list: `/api/explorer/${tableName}`,
        create: `/api/explorer/${tableName}`,
        update: `/api/explorer/${tableName}/{id}`,
        delete: `/api/explorer/${tableName}/{id}`,
        options: `/api/explorer/${tableName}/options`,
      },
    },
  });
});

// ── GET /schema/:kon — Get schema for a kon's tables ──
explorerRoutes.get("/schema/:kon", async (c) => {
  const konId = c.req.param("kon");

  // Map kon IDs to their tables
  const konTables: Record<string, string[]> = {
    academy: ["courses", "lessons", "enrollments"],
    booking: ["bookings", "services", "availability"],
    directory: ["listings", "categories", "reviews"],
    dms: ["documents", "folders", "tags"],
    esports: ["tournaments", "matches", "teams", "players"],
    "kitsuden-crm": ["contacts", "deals", "activities"],
    games: ["games", "game_collections"],
    media: ["media"],
    posts: ["posts"],
    streamers: ["streamers"],
    webhooks: ["webhooks"],
    workers: ["workers"],
  };

  const tables = konTables[konId] || [konId];

  // Return schema info for each table
  const schema = tables.map((tableName) => {
    const meta = tableRegistry[tableName];
    return {
      name: tableName,
      label: meta?.label || tableName,
      icon: meta?.icon || "📄",
      exists: !!meta,
    };
  });

  return c.json({ kon: konId, tables: schema });
});

// ── GET /schema/:kon/:table — Get detailed column info ──
explorerRoutes.get("/schema/:kon/:table", async (c) => {
  const tableName = c.req.param("table");
  const meta = tableRegistry[tableName];

  if (!meta) {
    return c.json(
      {
        error: `Table '${tableName}' not found`,
        available: Object.keys(tableRegistry),
      },
      404
    );
  }

  // Get sample row to infer columns
  try {
    const [sample] = await db.select().from(meta.table).limit(1);

    const columns = sample
      ? Object.entries(sample).map(([key, value]) => ({
          name: key,
          type: inferColumnType(key, value),
          editable: !meta.readonlyFields.includes(key),
          nullable: value === null,
        }))
      : [];

    return c.json({
      table: tableName,
      label: meta.label,
      icon: meta.icon,
      primaryKey: meta.pk,
      columns,
    });
  } catch (error: unknown) {
    return c.json({ error: messageOf(error) }, 500);
  }
});

// ═══════════════════════════════════════════════
// TABLE REGISTRY (Security whitelist + metadata)
// ═══════════════════════════════════════════════

interface TableMeta {
  table: any;
  label: string;
  icon: string;
  /** Columns that cannot be edited inline */
  readonlyFields: string[];
  /** Primary key column name */
  pk: string;
  /** If true, use raw SQL queries instead of Drizzle ORM (dynamically discovered table) */
  _dynamic?: boolean;
}

const tableRegistry: Record<string, TableMeta> = {
  auth_users: {
    table: user,
    label: "Auth Users",
    icon: "🔐",
    readonlyFields: ["id", "created_at", "updated_at"],
    pk: "id",
  },
  media: {
    table: media,
    label: "Media",
    icon: "🖼️",
    readonlyFields: ["id", "created_at", "s3_key"],
    pk: "id",
  },
  datasets: {
    table: dataSets,
    label: "Data Sets",
    icon: "📊",
    readonlyFields: ["id", "created_at"],
    pk: "id",
  },
  entries: {
    table: dataEntries,
    label: "Data Entries",
    icon: "📋",
    readonlyFields: ["id", "created_at", "updated_at"],
    pk: "id",
  },
  settings: {
    table: siteSettings,
    label: "Site Settings",
    icon: "⚙️",
    readonlyFields: ["id"],
    pk: "id",
  },
  modules: {
    table: modules,
    label: "Modules",
    icon: "🧩",
    readonlyFields: ["created_at"],
    pk: "key",
  },
};

// ── GET /tables — List ALL available tables (static + dynamic from DB) ──
explorerRoutes.get("/tables", async (c) => {
  // Start with static registry
  const staticTables = await Promise.all(
    Object.entries(tableRegistry).map(async ([key, meta]) => {
      try {
        const [result] = await db.select({ value: count() }).from(meta.table);
        return {
          key,
          label: meta.label,
          icon: meta.icon,
          rowCount: Number(result?.value ?? 0),
          source: "static" as const,
        };
      } catch {
        return { key, label: meta.label, icon: meta.icon, rowCount: 0, source: "static" as const };
      }
    })
  );

  // Discover additional tables from DB that aren't in static registry
  const allDbTables = await getAllTables();
  const staticKeys = new Set(Object.keys(tableRegistry));
  /**
   * Filtrado por la MISMA política que el resto del explorador.
   *
   * Aquí había un filtro a mano —`!t.startsWith("auth_") && !t.startsWith("_")`—
   * que tapaba las de auth y nada más: `kitsuden_secrets`, `api_keys` y
   * `kitsuden_migrations` salían en la lista. Un filtro por prefijo escrito en
   * un sitio no sabe nada de lo que se decide en otro.
   */
  const explorables = await Promise.all(
    allDbTables.map(async (t) => ((await tablaEsExplorable(t, staticKeys)).permitida ? t : null))
  );
  const dynamicTables = explorables
    .filter((t): t is string => t !== null)
    .filter((t) => !staticKeys.has(t))
    .map((t) => ({
      key: t,
      label: humanizeTableNameLocal(t),
      icon: "📋",
      rowCount: 0, // Avoid N queries — count on demand
      source: "dynamic" as const,
    }));

  return c.json({ tables: [...staticTables, ...dynamicTables] });
});

// ── GET /discover/:konId — Discover tables owned by a kon ──
// Reads kon.json tables[] AND cross-refs with real DB tables
explorerRoutes.get("/discover/:konId", async (c) => {
  const konId = c.req.param("konId");
  const allDbTables = await getAllTables();

  // Strategy 1: Check kon.json for declared tables
  const { scanPackages } = await import("../services/scanner");
  const kons = await scanPackages("kons");
  const manifest = kons.find((g) => g.id === konId || g.id === `kon-${konId}`);

  let declaredTables: string[] = [];
  if (manifest?.tables) {
    declaredTables = (manifest.tables as any[])
      .map((t) => (typeof t === "string" ? t : t.name))
      .filter(Boolean);
  }

  // Strategy 2: Pattern-match DB tables by kon name prefix
  const shortId = konId.replace(/^kon-/, "").replace(/-/g, "_");
  const patternMatches = allDbTables.filter(
    (t) => t.startsWith(shortId + "_") || t === shortId || t === shortId + "s"
  );

  // Strategy 3: Check for well-known table name patterns
  const knownPatterns: Record<string, string[]> = {
    booking: ["reservations", "rooms", "amenities", "room_amenities"],
    academy: [
      "academy_courses",
      "academy_enrollments",
      "academy_topics",
      "academy_quizzes",
      "academy_questions",
      "academy_quiz_attempts",
      "academy_satisfaction_surveys",
      "academy_user_progress",
    ],
    dms: ["documents", "document_versions"],
    directory: ["employee_profile"],
    blog: ["blog_posts", "blog_posts_to_tags", "blog_posts_to_games"],
    webhooks: ["webhooks_config", "webhooks_log"],
    connectors: ["data_connectors"],
    "media-library": ["media"],
    games: ["games", "games_to_platforms", "games_to_streamers", "games_to_tags"],
    streamers: ["streamers"],
    platforms: ["platforms"],
    tags: ["tags"],
    collections: ["game_collections", "game_collection_entries"],
    "ai-memories": ["ai_memories", "ai_memory_chunks"],
    workers: ["kitsuden_functions", "function_executions"],
    "kitsuden-crm": [], // No tables in migration yet
  };
  const knownTables = knownPatterns[shortId] || knownPatterns[konId] || [];

  /**
   * Se juntan las tres fuentes y se filtra por la MISMA política.
   *
   * Las estrategias 2 y 3 adivinan por prefijo y por una lista escrita a mano,
   * asi que un kon llamado `kitsuden` habria hecho coincidir `kitsuden_secrets`
   * y `kitsuden_migrations` por «empieza igual». Descubrir tablas por parecido
   * de nombre no puede saltarse lo que se decide en un solo sitio.
   */
  const candidatasSinFiltrar = new Set([...declaredTables, ...patternMatches, ...knownTables]);
  const permitidas = await Promise.all(
    [...candidatasSinFiltrar].map(async (t) =>
      (await tablaEsExplorable(t, Object.keys(tableRegistry))).permitida ? t : null
    )
  );
  const allCandidates = new Set(permitidas.filter((t): t is string => t !== null));
  const verified: Array<{ name: string; exists: boolean; rowCount: number; source: string }> = [];

  for (const tableName of allCandidates) {
    const exists = allDbTables.includes(tableName);
    let rowCount = 0;
    if (exists) {
      try {
        const result = await db.execute(sql`SELECT count(*) as c FROM "${sql.raw(tableName)}"`);
        rowCount = Number((result.rows[0] as any)?.c ?? 0);
      } catch {}
    }
    const source = declaredTables.includes(tableName)
      ? "kon.json"
      : knownTables.includes(tableName)
        ? "known-pattern"
        : "prefix-match";
    verified.push({ name: tableName, exists, rowCount, source });
  }

  return c.json({
    konId,
    tables: verified.filter((t) => t.exists),
    missing: verified.filter((t) => !t.exists).map((t) => t.name),
    manifestFound: !!manifest,
  });
});

// ── GET /:collection — Paginated, sorted, filtered list ──
explorerRoutes.get("/:collection", async (c) => {
  const collectionName = c.req.param("collection");
  const meta = await resolveTable(collectionName);

  if (!meta) {
    return c.json(
      { error: `Collection '${collectionName}' not found.`, available: Object.keys(tableRegistry) },
      404
    );
  }

  // Dynamic tables use raw SQL
  if (meta._dynamic) {
    return handleDynamicQuery(c, collectionName, meta);
  }

  // Parse query params
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 50, 1), 500);
  const page = Math.max(Number(c.req.query("page")) || 1, 1);
  const offset = (page - 1) * limit;
  const sortField = c.req.query("sort") || null;
  const sortDir = c.req.query("dir") === "asc" ? "asc" : "desc";

  // Filters: ?filter_field=email&filter_op=contains&filter_value=@gmail.com
  const filterField = c.req.query("filter_field");
  const filterOp = c.req.query("filter_op") || "contains";
  const filterValue = c.req.query("filter_value");

  try {
    /**
     * El filtro se construye UNA vez y lo usan las dos consultas.
     *
     * Antes el mismo `switch` de seis operadores estaba escrito dos veces, una
     * por consulta. Funcionaba, pero es la forma exacta de acabar con el total
     * y la página en desacuerdo: basta con añadir un operador en un sitio y
     * olvidarlo en el otro para que el contador diga 400 y la tabla muestre
     * 12, sin que nada falle.
     */
    const filtro = (() => {
      if (!filterField || !filterValue) return undefined;
      const col = meta.table[filterField];
      if (!col) return undefined;

      switch (filterOp) {
        case "contains":
          return ilike(col, `%${filterValue}%`);
        case "equals":
          return eq(col, filterValue);
        case "gt":
          return gt(col, filterValue);
        case "lt":
          return lt(col, filterValue);
        case "gte":
          return gte(col, filterValue);
        case "lte":
          return lte(col, filterValue);
        default:
          // Un operador desconocido NO puede caer en "sin filtro": quien pidió
          // `filter_op=starts_with` recibiría la tabla entera creyendo que
          // está filtrada.
          return null;
      }
    })();

    if (filtro === null) {
      return c.json(
        { error: `Operador de filtro no soportado: "${filterOp}"`, soportados: FILTER_OPS },
        400
      );
    }

    let query = db.select().from(meta.table).where(filtro).$dynamic();

    const [countResult] = await db
      .select({ value: count() })
      .from(meta.table)
      .where(filtro)
      .$dynamic();
    const total = Number(countResult?.value ?? 0);

    // Apply sort
    if (sortField && meta.table[sortField]) {
      query = query.orderBy(
        sortDir === "asc" ? asc(meta.table[sortField]) : desc(meta.table[sortField])
      );
    }

    // Apply pagination
    query = query.limit(limit).offset(offset);

    const data = await query;

    // Column metadata (derived from first row or table definition)
    const columns =
      data.length > 0
        ? Object.keys(data[0]).map((key) => ({
            field: key,
            editable: !meta.readonlyFields.includes(key),
            type: inferColumnType(key, data[0][key]),
          }))
        : [];

    const totalPages = Math.ceil(total / limit);

    return c.json({
      data,
      columns,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error: unknown) {
    console.error(`Explorer Error [${collectionName}]:`, error);
    return c.json({ error: messageOf(error) }, 500);
  }
});

// ── PATCH /:collection/:id — Inline cell update ──
explorerRoutes.patch("/:collection/:id", async (c) => {
  const collectionName = c.req.param("collection");
  const id = c.req.param("id");
  const meta = await resolveTable(collectionName);

  if (!meta) {
    return c.json({ error: `Collection '${collectionName}' not found.` }, 404);
  }

  // Escritura sobre una tabla sensible: solo `admin`. Ver el helper.
  const denegado = denegarEscrituraSensible(c, collectionName);
  if (denegado) return denegado;

  if (meta._dynamic) {
    return handleDynamicUpdate(c, collectionName, meta, id);
  }

  try {
    const body = await c.req.json();

    // Security: strip readonly fields
    for (const field of meta.readonlyFields) {
      delete body[field];
    }

    if (Object.keys(body).length === 0) {
      return c.json({ error: "No editable fields provided" }, 400);
    }

    // Add updated_at if the table has it
    if (meta.table.updated_at || meta.table.updatedAt) {
      body.updated_at = new Date();
    }

    const pkCol = meta.table[meta.pk];
    const [updated] = await db.update(meta.table).set(body).where(eq(pkCol, id)).returning();

    if (!updated) {
      return c.json({ error: "Record not found" }, 404);
    }

    return c.json(updated);
  } catch (error: unknown) {
    console.error(`Explorer Update [${collectionName}]:`, error);
    return c.json({ error: messageOf(error) }, 500);
  }
});

// ── POST /:collection — Create a new record ──
explorerRoutes.post("/:collection", async (c) => {
  const collectionName = c.req.param("collection");
  const meta = await resolveTable(collectionName);

  if (!meta) {
    return c.json({ error: `Collection '${collectionName}' not found.` }, 404);
  }

  // Escritura sobre una tabla sensible: solo `admin`. Ver el helper.
  const denegado = denegarEscrituraSensible(c, collectionName);
  if (denegado) return denegado;

  if (meta._dynamic) {
    return handleDynamicCreate(c, collectionName, meta);
  }

  try {
    const body = await c.req.json();

    // Security: strip readonly fields
    for (const field of meta.readonlyFields) {
      delete body[field];
    }

    if (Object.keys(body).length === 0) {
      return c.json({ error: "No fields provided" }, 400);
    }

    const result = await db.insert(meta.table).values(body).returning();

    const created = Array.isArray(result) ? result[0] : result;

    return c.json(created, 201);
  } catch (error: unknown) {
    console.error(`Explorer Create [${collectionName}]:`, error);
    return c.json({ error: messageOf(error) }, 500);
  }
});

// ── DELETE /:collection/:id — Delete a record ──
explorerRoutes.delete("/:collection/:id", async (c) => {
  const collectionName = c.req.param("collection");
  const id = c.req.param("id");
  const meta = await resolveTable(collectionName);

  if (!meta) {
    return c.json({ error: `Collection '${collectionName}' not found.` }, 404);
  }

  // Escritura sobre una tabla sensible: solo `admin`. Ver el helper.
  const denegado = denegarEscrituraSensible(c, collectionName);
  if (denegado) return denegado;

  if (meta._dynamic) {
    return handleDynamicDelete(c, collectionName, meta, id);
  }

  try {
    const pkCol = meta.table[meta.pk];
    const [deleted] = (await db.delete(meta.table).where(eq(pkCol, id)).returning()) as any[];

    if (!deleted) {
      return c.json({ error: "Record not found" }, 404);
    }

    return c.json({ deleted: true, id });
  } catch (error: unknown) {
    console.error(`Explorer Delete [${collectionName}]:`, error);
    return c.json({ error: messageOf(error) }, 500);
  }
});

// ── GET /:collection/options — FK dropdown options ──
// Returns { value, label } pairs for populating relation dropdowns
explorerRoutes.get("/:collection/options", async (c) => {
  const collectionName = c.req.param("collection");
  const meta = await resolveTable(collectionName);

  if (!meta) {
    return c.json({ error: `Collection '${collectionName}' not found.` }, 404);
  }

  if (meta._dynamic) {
    return handleDynamicOptions(c, collectionName, meta);
  }

  try {
    const rows = await db.select().from(meta.table).limit(200);

    // Find the best display field: name > title > label > email > slug > first text column
    const displayPriority = ["name", "title", "label", "email", "slug", "siteName"];
    let displayField = "id";

    if (rows.length > 0) {
      const keys = Object.keys(rows[0]);
      for (const prio of displayPriority) {
        if (keys.includes(prio)) {
          displayField = prio;
          break;
        }
      }
      // Fallback: first string column that isn't the PK
      if (displayField === "id") {
        const textCol = keys.find((k) => k !== meta.pk && typeof rows[0][k] === "string");
        if (textCol) displayField = textCol;
      }
    }

    const options = rows.map((row) => ({
      value: (row as any)[meta.pk],
      label: String((row as any)[displayField] || (row as any)[meta.pk]),
    }));

    return c.json({ options, displayField, collection: collectionName });
  } catch (error: unknown) {
    return c.json({ error: messageOf(error) }, 500);
  }
});

// ═══════════════════════════════════════════════
// DYNAMIC TABLE HANDLERS (raw SQL for auto-discovered tables)
// ═══════════════════════════════════════════════

async function handleDynamicQuery(c: any, tableName: string, meta: TableMeta) {
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 50, 1), 500);
  const page = Math.max(Number(c.req.query("page")) || 1, 1);
  const offset = (page - 1) * limit;
  const sortField = c.req.query("sort") || meta.pk;
  const sortDir = c.req.query("dir") === "asc" ? "ASC" : "DESC";
  const filterField = c.req.query("filter_field");
  const filterOp = c.req.query("filter_op") || "contains";
  const filterValue = c.req.query("filter_value");

  try {
    const safeSort = sortField.replace(/[^a-zA-Z0-9_]/g, "");
    let countSql;
    let dataSql;

    if (filterField && filterValue) {
      const safeField = filterField.replace(/[^a-zA-Z0-9_]/g, "");
      if (filterOp === "contains") {
        countSql = sql`SELECT count(*) as total FROM ${sql.raw(`"${tableName}"`)} WHERE "${sql.raw(safeField)}"::text ILIKE '%' || ${filterValue} || '%'`;
        dataSql = sql`SELECT * FROM ${sql.raw(`"${tableName}"`)} WHERE "${sql.raw(safeField)}"::text ILIKE '%' || ${filterValue} || '%' ORDER BY "${sql.raw(safeSort)}" ${sql.raw(sortDir)} LIMIT ${sql.raw(String(limit))} OFFSET ${sql.raw(String(offset))}`;
      } else if (filterOp === "equals") {
        countSql = sql`SELECT count(*) as total FROM ${sql.raw(`"${tableName}"`)} WHERE "${sql.raw(safeField)}"::text = ${filterValue}`;
        dataSql = sql`SELECT * FROM ${sql.raw(`"${tableName}"`)} WHERE "${sql.raw(safeField)}"::text = ${filterValue} ORDER BY "${sql.raw(safeSort)}" ${sql.raw(sortDir)} LIMIT ${sql.raw(String(limit))} OFFSET ${sql.raw(String(offset))}`;
      } else {
        // Antes esta rama devolvía la tabla SIN filtrar. Quien pidiera un
        // operador que este camino no implementa —`gt`, por ejemplo, que sí
        // existe en el otro— se llevaba todas las filas dando por hecho que
        // estaban filtradas.
        return c.json(
          {
            error: `Operador de filtro no soportado para esta tabla: "${filterOp}"`,
            soportados: FILTER_OPS_DINAMICO,
          },
          400
        );
      }
    } else {
      countSql = sql`SELECT count(*) as total FROM ${sql.raw(`"${tableName}"`)}`;
      dataSql = sql`SELECT * FROM ${sql.raw(`"${tableName}"`)} ORDER BY "${sql.raw(safeSort)}" ${sql.raw(sortDir)} LIMIT ${sql.raw(String(limit))} OFFSET ${sql.raw(String(offset))}`;
    }

    const countResult = await db.execute(countSql);
    const total = Number((countResult.rows[0] as any)?.total ?? 0);

    const dataResult = await db.execute(dataSql);
    const data = dataResult.rows;
    const columns =
      data.length > 0
        ? Object.keys(data[0]).map((key) => ({
            field: key,
            editable: !meta.readonlyFields.includes(key),
            type: inferColumnType(key, (data[0] as any)[key]),
          }))
        : [];

    const totalPages = Math.ceil(total / limit);
    return c.json({
      data,
      columns,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error: unknown) {
    console.error(`Explorer Dynamic Query [${tableName}]:`, error);
    return c.json({ error: messageOf(error) }, 500);
  }
}

async function handleDynamicCreate(c: any, tableName: string, meta: TableMeta) {
  try {
    const body = await c.req.json();
    for (const field of meta.readonlyFields) delete body[field];
    if (Object.keys(body).length === 0) return c.json({ error: "No fields provided" }, 400);

    const keys = Object.keys(body);
    const safeKeys = keys.map((k) => `"${k.replace(/[^a-zA-Z0-9_]/g, "")}"`);
    const values = keys.map((k) => pgLiteral(body[k]));

    const result = await db.execute(
      sql.raw(
        `INSERT INTO "${tableName}" (${safeKeys.join(", ")}) VALUES (${values.join(", ")}) RETURNING *`
      )
    );
    return c.json(result.rows[0], 201);
  } catch (error: unknown) {
    console.error(`Explorer Dynamic Create [${tableName}]:`, error);
    return c.json({ error: messageOf(error) }, 500);
  }
}

async function handleDynamicUpdate(c: any, tableName: string, meta: TableMeta, id: string) {
  try {
    const body = await c.req.json();
    for (const field of meta.readonlyFields) delete body[field];
    if (Object.keys(body).length === 0)
      return c.json({ error: "No editable fields provided" }, 400);

    const keys = Object.keys(body);
    const setClauses = keys.map(
      (k) => `"${k.replace(/[^a-zA-Z0-9_]/g, "")}" = ${pgLiteral(body[k])}`
    );
    const safePk = meta.pk.replace(/[^a-zA-Z0-9_]/g, "");

    const result = await db.execute(
      sql.raw(
        `UPDATE "${tableName}" SET ${setClauses.join(", ")} WHERE "${safePk}" = ${pgLiteral(id)} RETURNING *`
      )
    );
    if (result.rows.length === 0) return c.json({ error: "Record not found" }, 404);
    return c.json(result.rows[0]);
  } catch (error: unknown) {
    console.error(`Explorer Dynamic Update [${tableName}]:`, error);
    return c.json({ error: messageOf(error) }, 500);
  }
}

async function handleDynamicDelete(c: any, tableName: string, meta: TableMeta, id: string) {
  try {
    const safePk = meta.pk.replace(/[^a-zA-Z0-9_]/g, "");
    const result = await db.execute(
      sql.raw(`DELETE FROM "${tableName}" WHERE "${safePk}" = ${pgLiteral(id)} RETURNING *`)
    );
    if (result.rows.length === 0) return c.json({ error: "Record not found" }, 404);
    return c.json({ deleted: true, id });
  } catch (error: unknown) {
    console.error(`Explorer Dynamic Delete [${tableName}]:`, error);
    return c.json({ error: messageOf(error) }, 500);
  }
}

async function handleDynamicOptions(c: any, tableName: string, meta: TableMeta) {
  try {
    const result = await db.execute(sql.raw(`SELECT * FROM "${tableName}" LIMIT 200`));
    const rows = result.rows as any[];
    const displayPriority = ["name", "title", "label", "email", "slug", "display_name"];
    let displayField = meta.pk;
    if (rows.length > 0) {
      const keys = Object.keys(rows[0]);
      for (const prio of displayPriority) {
        if (keys.includes(prio)) {
          displayField = prio;
          break;
        }
      }
      if (displayField === meta.pk) {
        const textCol = keys.find((k) => k !== meta.pk && typeof rows[0][k] === "string");
        if (textCol) displayField = textCol;
      }
    }
    const options = rows.map((row) => ({
      value: row[meta.pk],
      label: String(row[displayField] || row[meta.pk]),
    }));
    return c.json({ options, displayField, collection: tableName });
  } catch (error: unknown) {
    return c.json({ error: messageOf(error) }, 500);
  }
}

// ═══════════════════════════════════════════════
// SMART VIEWS (Saved filter presets)
// ═══════════════════════════════════════════════

// In-memory store (upgrade to DB table later for persistence)
// For now this is per-server-restart. The frontend will also
// persist to localStorage as backup.
const smartViews = new Map<string, SmartView[]>();

interface SmartView {
  id: string;
  name: string;
  collection: string;
  filters: { field: string; op: string; value: string }[];
  sort?: { field: string; dir: string };
  createdAt: string;
}

// ── GET /:collection/views — List saved views ──
explorerRoutes.get("/:collection/views", async (c) => {
  const collection = c.req.param("collection");
  const views = smartViews.get(collection) || [];
  return c.json({ views });
});

// ── POST /:collection/views — Save a new view ──
explorerRoutes.post("/:collection/views", async (c) => {
  const collection = c.req.param("collection");
  const body = await c.req.json();

  const view: SmartView = {
    id: `sv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: body.name || "Untitled View",
    collection,
    filters: body.filters || [],
    sort: body.sort,
    createdAt: new Date().toISOString(),
  };

  const existing = smartViews.get(collection) || [];
  existing.push(view);
  smartViews.set(collection, existing);

  return c.json(view, 201);
});

// ── DELETE /:collection/views/:viewId — Delete a view ──
explorerRoutes.delete("/:collection/views/:viewId", async (c) => {
  const collection = c.req.param("collection");
  const viewId = c.req.param("viewId");

  const existing = smartViews.get(collection) || [];
  const filtered = existing.filter((v) => v.id !== viewId);
  smartViews.set(collection, filtered);

  return c.json({ deleted: true });
});

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════

/**
 * Safely format a JS value for use as a PostgreSQL literal in raw SQL.
 */
function pgLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return String(value);
  if (value instanceof Date) return `'${value.toISOString()}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Map of known FK column → table name patterns */
const FK_TABLE_MAP: Record<string, string> = {
  game_id: "games",
  gameId: "games",
  platform_id: "platforms",
  platformId: "platforms",
  tag_id: "tags",
  tagId: "tags",
  streamer_id: "streamers",
  streamerId: "streamers",
  collection_id: "collections",
  collectionId: "collections",
  user_id: "auth_users",
  userId: "auth_users",
  author_id: "auth_users",
  authorId: "auth_users",
  assigned_to_id: "auth_users",
  assignedToId: "auth_users",
  contact_id: "contacts",
  contactId: "contacts",
  dataset_id: "datasets",
  datasetId: "datasets",
};

function inferColumnType(key: string, value: any): string {
  if (key === "id") return "id";
  if (key.endsWith("_id") || (key.endsWith("Id") && key !== "id")) return "relation";
  if (key.includes("at") || key.includes("At") || key.includes("date") || key.includes("Date")) {
    if (value instanceof Date || (typeof value === "string" && !isNaN(Date.parse(value))))
      return "date";
  }
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "object" && value !== null) return "json";
  if (key.includes("url") || key.includes("Url")) return "url";
  if (key.includes("email")) return "email";
  if (key.includes("color") || key.includes("Color")) return "color";
  return "text";
}

/**
 * Tipo de campo a partir de la columna REAL, no de un valor de ejemplo.
 *
 * `inferColumnType` (más abajo, todavía en uso por los endpoints que sí tienen
 * una fila delante) mira el valor: `typeof value === "boolean"`. Con la tabla
 * vacía no hay valor, y con una columna nula tampoco — un `timestamp` a NULL
 * se clasificaba como texto y el formulario pintaba una caja de texto donde
 * hacía falta un selector de fecha.
 *
 * Aquí manda el catálogo: `information_schema.columns.data_type` más la clave
 * ajena declarada.
 */
function tipoDeColumna(col: IntrospectedColumn): string {
  if (col.isPrimaryKey && col.name === "id") return "id";
  if (col.isForeignKey) return "relation";

  const t = (col.type || "").toLowerCase();
  if (t.includes("bool")) return "boolean";
  if (
    t.includes("int") ||
    t.includes("numeric") ||
    t.includes("decimal") ||
    t.includes("real") ||
    t.includes("double")
  ) {
    return "number";
  }
  if (t.includes("timestamp") || t === "date" || t.includes("time")) return "date";
  if (t.includes("json")) return "json";
  if (t === "uuid") return col.name.endsWith("_id") ? "relation" : "id";

  // Solo cuando el tipo no lo decide se recurre al nombre.
  if (col.name.includes("email")) return "email";
  if (/url$/i.test(col.name) || col.name.includes("Url")) return "url";
  if (col.name.includes("color") || col.name.includes("Color")) return "color";
  return "text";
}

/** Igual que `mapToJsonSchemaType`, pero decidiendo entero/decimal por el tipo de la base. */
function tipoJsonSchema(colType: string, tipoPg: string): string {
  if (colType === "number") {
    return /int/i.test(tipoPg) ? "integer" : "number";
  }
  if (colType === "boolean") return "boolean";
  if (colType === "json") return "object";
  return "string";
}

/** Get the related table for a FK column name */
function getRelatedTable(columnName: string): string | undefined {
  if (FK_TABLE_MAP[columnName]) return FK_TABLE_MAP[columnName];
  // Infer from column name: strip _id suffix → pluralize
  const base = columnName.replace(/_id$/, "").replace(/Id$/, "");
  const plural = base.endsWith("s") ? base : base + "s";
  if (tableRegistry[plural]) return plural;
  if (tableRegistry[base]) return base;
  return undefined;
}

/** Map internal column types to JSON Schema types */
function mapToJsonSchemaType(colType: string, value: any): string {
  switch (colType) {
    case "id":
    case "text":
    case "email":
    case "url":
    case "color":
    case "date":
    case "relation":
      return "string";
    case "number":
      return Number.isInteger(value) ? "integer" : "number";
    case "boolean":
      return "boolean";
    case "json":
      return "object";
    default:
      return "string";
  }
}

/** Generate a human-readable field description */
function generateFieldDescription(key: string, colType: string, relatedTable?: string): string {
  if (colType === "relation" && relatedTable) {
    return `Foreign key to ${relatedTable} table`;
  }
  if (colType === "id") return "Unique identifier (UUID)";
  if (colType === "date") return `Timestamp field`;
  if (key === "createdAt") return "Record creation timestamp";
  if (key === "updatedAt") return "Last modification timestamp";
  // Convert camelCase to human-readable
  const readable = key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
  return readable;
}
