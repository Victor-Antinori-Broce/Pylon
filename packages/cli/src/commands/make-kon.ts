/**
 * kitsuden make kon <name> — un kon mínimo con la forma de los kons reales
 * ============================================================================
 *
 * Genera, dentro de un monorepo de Kitsuden:
 *
 *   packages/kons/kon-<slug>/
 *     kon.json                 manifiesto ($schema, tier, icono, tablas, vistas)
 *     package.json             files[], typecheck, peerDependencies
 *     tsconfig.json            el mismo que kon-analytics / kon-directory
 *     index.ts                 defineKonSdk(...) — lo que busca el module-loader
 *     <slug>.schema.ts         tabla Drizzle (para tipar las consultas)
 *     <slug>.policy.ts         register<Pascal>Policy() — deny-by-default
 *     <slug>.routes.ts         CRUD como OPERACIONES del SDK de kons (defineOperacion):
 *                              REST + OpenAPI 3.1 + herramientas MCP de una vez
 *     migrations/0000_inicial.sql
 *     README.md
 *   tests/unit/kon-<slug>.test.ts   rutas reales sobre PGlite, rol sin superusuario
 *
 * ── POR QUÉ ESTE GENERADOR Y NO EL DE `create-kon` ─────────────────────────
 *
 * El anterior (`create-kon`) escribía un manifiesto que no pasaba las
 * guardias del repo: tabla en camelCase (`fooItems`, el nombre de la CLAVE de
 * Drizzle y no el de la tabla), sin migración SQL, sin `$schema` ni `tier`,
 * sin script `typecheck` ni `tsconfig.json`, y un import de
 * `@paralleldrive/cuid2` que el kon no declaraba. `create-kon` y `kon:create`
 * son ahora alias de este.
 *
 * Las guardias que el kon generado tiene que pasar (tests/unit): kon-manifest,
 * kon-loadable, tablas-de-kons, kons-no-crean-tablas, iconos-de-kons,
 * paquete-publicado-completo, kon-typecheck-coverage, kon-registry-completo.
 * `packages/cli/tests/make-kon.test.mjs` lo comprueba en una copia del repo.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import chalk from "chalk";

import { escribirFichero, leerFichero } from "../kons/instalacion.js";

export interface MakeKonOptions {
  force?: boolean;
  root?: string;
  icon?: string;
  title?: string;
  description?: string;
}

export const ICONO_POR_DEFECTO = "Package";

const SLUG = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function slugDeKon(nombre: string): string {
  return nombre
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase()
    .replace(/^kon-/, "");
}

const pascal = (slug: string) =>
  slug
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
const camel = (slug: string) => {
  const p = pascal(slug);
  return p.charAt(0).toLowerCase() + p.slice(1);
};
const titulo = (slug: string) =>
  slug
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
const snake = (slug: string) => slug.replace(/-/g, "_");

/** Sube desde `desde` hasta la raíz del monorepo de Kitsuden. */
export function encontrarRaizDelRepo(desde: string): string | null {
  let dir = resolve(desde);
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml")) && existsSync(join(dir, "packages", "kons"))) {
      return dir;
    }
    const padre = dirname(dir);
    if (padre === dir) return null;
    dir = padre;
  }
}

/** Claves del mapa ICONOS del admin, leídas igual que tests/unit/iconos-de-kons. */
export function iconosDelAdmin(raiz: string): Set<string> | null {
  const mapa = join(raiz, "packages", "admin", "src", "lib", "iconos.ts");
  if (!existsSync(mapa)) return null;
  const bloque = readFileSync(mapa, "utf8").match(/const ICONOS[^{]*\{([\s\S]*?)\n\s*\};/);
  if (!bloque) return null;
  const claves = new Set<string>();
  for (const linea of bloque[1]!.split("\n")) {
    const m = linea.match(/^\s*([A-Z][A-Za-z0-9]*)\s*[,:]/);
    if (m) claves.add(m[1]!);
  }
  return claves;
}

/** Rutas de montaje y tablas ya usadas por otros kons (para no chocar). */
function ocupadoPorOtros(raiz: string): {
  rutas: Map<string, string>;
  tablas: Map<string, string>;
} {
  const rutas = new Map<string, string>();
  const tablas = new Map<string, string>();
  const kons = join(raiz, "packages", "kons");
  for (const e of readdirSync(kons, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const manifiesto = join(kons, e.name, "kon.json");
    if (existsSync(manifiesto)) {
      try {
        const json = JSON.parse(readFileSync(manifiesto, "utf8"));
        if (json.mount?.path) rutas.set(json.mount.path, e.name);
        for (const t of json.tables ?? []) {
          const n = typeof t === "string" ? t : t?.name;
          if (n) tablas.set(n, e.name);
        }
      } catch {
        // un manifiesto roto lo denuncia kon-manifest; aquí no se decide nada
      }
    }
    // Muchos kons fijan la ruta en el código (`mountPath`), no en kon.json.
    const index = join(kons, e.name, "index.ts");
    if (existsSync(index)) {
      for (const m of readFileSync(index, "utf8").matchAll(/mountPath:\s*"([^"]+)"/g)) {
        rutas.set(m[1]!, e.name);
      }
    }
  }
  return { rutas, tablas };
}

export interface FicheroGenerado {
  ruta: string;
  contenido: string;
}

export interface PlanDeKon {
  raiz: string;
  slug: string;
  id: string;
  tabla: string;
  ruta: string;
  ficheros: FicheroGenerado[];
}

/** Calcula todo lo que se va a escribir, sin escribir nada. */
export function planearKon(nombre: string, opciones: MakeKonOptions = {}): PlanDeKon {
  const raiz = opciones.root ? resolve(opciones.root) : encontrarRaizDelRepo(process.cwd());
  if (!raiz || !existsSync(join(raiz, "packages", "kons"))) {
    throw new Error(
      "Not inside a Kitsuden monorepo (no pnpm-workspace.yaml with packages/kons above this folder). " +
        "Run it from the Kitsuden repository or pass --root <repo>."
    );
  }

  const slug = slugDeKon(nombre);
  if (!SLUG.test(slug)) {
    throw new Error(
      `Invalid kon name "${nombre}". Use lowercase letters, digits and dashes, starting with a letter (e.g. "recipes", "event-log").`
    );
  }
  const id = `kon-${slug}`;
  const dirKon = join(raiz, "packages", "kons", id);
  if (existsSync(dirKon) && !opciones.force) {
    throw new Error(
      `packages/kons/${id} already exists (use --force to overwrite its generated files)`
    );
  }

  const icono = opciones.icon ?? ICONO_POR_DEFECTO;
  const iconos = iconosDelAdmin(raiz);
  if (iconos && !iconos.has(icono)) {
    throw new Error(
      `Icon "${icono}" is not in the admin icon map (packages/admin/src/lib/iconos.ts). ` +
        `Pick one that is (e.g. ${ICONO_POR_DEFECTO}) or add it there first.`
    );
  }

  const tabla = `${snake(slug)}_items`;
  const ruta = `/api/${slug}`;
  const ocupado = ocupadoPorOtros(raiz);
  const rutaDe = ocupado.rutas.get(ruta);
  if (rutaDe && rutaDe !== id) throw new Error(`Mount path ${ruta} is already used by ${rutaDe}`);
  const tablaDe = ocupado.tablas.get(tabla);
  if (tablaDe && tablaDe !== id)
    throw new Error(`Table ${tabla} is already declared by ${tablaDe}`);

  const P = pascal(slug);
  const c = camel(slug);
  const nombreVisible = opciones.title ?? titulo(slug);
  const descripcion =
    opciones.description ??
    `${nombreVisible}: items with a title, a body and a draft/published status.`;
  const recurso = `${slug}-item`;

  const ficheros: FicheroGenerado[] = [];
  const add = (rel: string, contenido: string) =>
    ficheros.push({ ruta: join(raiz, rel), contenido });
  const k = `packages/kons/${id}`;

  add(
    `${k}/kon.json`,
    `${JSON.stringify(
      {
        $schema: "../../schemas/kon-schema.json",
        id,
        name: nombreVisible,
        description: descripcion,
        version: "0.1.0",
        // El contrato del SDK de kons para el que está escrito (GET /api/version
        // → sdk.kons): el cargador se niega a montar uno más nuevo.
        sdk: 1,
        // Un kon recién generado no lo ha probado nadie todavía (kon-madurez).
        madurez: "experimental",
        type: "kon",
        tier: "specialized",
        icon: icono,
        kitsuden: ">=0.9.0",
        mount: { path: ruta },
        tables: [
          {
            name: tabla,
            label: nombreVisible,
            icon: icono,
            searchableFields: ["title"],
            filterableFields: ["status"],
          },
        ],
        admin: {
          category: "content",
          views: [{ id: `grid-${slug}`, type: "grid", title: nombreVisible, table: tabla }],
        },
        dependencies: { kons: [], core: ["auth"] },
        schema: { entry: null, strategy: "sql" },
      },
      null,
      2
    )}\n`
  );

  add(
    `${k}/package.json`,
    `${JSON.stringify(
      {
        name: `@kitsuden/${id}`,
        version: "0.1.0",
        description: descripcion,
        type: "module",
        main: "./index.ts",
        types: "./index.ts",
        files: [
          "README.md",
          "index.ts",
          "kon.json",
          "migrations",
          `${slug}.policy.ts`,
          `${slug}.routes.ts`,
          `${slug}.schema.ts`,
        ],
        scripts: {
          typecheck: "tsc --noEmit",
          build: "pnpm exec tsc",
          dev: "pnpm exec tsc --watch",
        },
        keywords: ["kitsuden", "kon", slug],
        license: "MIT",
        devDependencies: { typescript: "^5.9.3" },
        peerDependencies: {
          "@kitsuden/engine": "workspace:*",
          "@kitsuden/shared": "workspace:*",
          "drizzle-orm": "^0.45.0",
          hono: "^4.7.0",
          // Sin `zod`: los kons lo importan del engine (@kitsuden/engine/zod).
        },
        kitsuden: {
          type: "kon",
          id,
          category: "content",
          core: false,
          defaultEnabled: false,
          minVersion: "0.9.0",
        },
      },
      null,
      2
    )}\n`
  );

  add(
    `${k}/tsconfig.json`,
    `${JSON.stringify(
      {
        extends: "../../../tsconfig.json",
        compilerOptions: {
          noEmit: true,
          baseUrl: ".",
          paths: {
            "@kitsuden/shared": ["../../../packages/shared/src/index.ts"],
            "@kitsuden/shared/*": ["../../../packages/shared/src/*"],
            "@kitsuden/engine": ["../../../packages/engine/index.ts"],
            "@/*": ["../../../apps/api/src/*"],
          },
        },
        include: ["*.ts", "src/**/*.ts"],
        exclude: ["node_modules", "dist", "tests", "**/*.test.ts"],
      },
      null,
      2
    )}\n`
  );

  add(
    `${k}/migrations/0000_inicial.sql`,
    `-- ${id} — esquema inicial
--
-- Las tablas de un kon se crean AQUÍ y no desde el código: la API se conecta
-- con un rol sin privilegio CREATE (es lo que hace efectiva la RLS). Lo aplica
-- \`pnpm db:migrate\` con el rol de administración, o el panel al
-- activar el kon si la API tiene DATABASE_ADMIN_URL.
--
-- Sin datos personales: es contenido editorial (lo escriben admin y editor).
-- Si añades columnas con datos de usuarios, añade también RLS (ver
-- kon-booking/migrations/0002_seguridad_reservas.sql).

CREATE TABLE IF NOT EXISTS ${tabla} (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       varchar(200) NOT NULL,
  body        text,
  status      varchar(20) NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft', 'published')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ${tabla}_status_idx ON ${tabla} (status, created_at DESC);
`
  );

  add(
    `${k}/${slug}.schema.ts`,
    `/**
 * ${nombreVisible} — esquema Drizzle
 * ============================================================================
 *
 * Solo para TIPAR las consultas. La tabla la crea
 * \`migrations/0000_inicial.sql\` (kon.json: \`schema.strategy = "sql"\`), así
 * que este fichero y la migración tienen que cambiar juntos.
 */

import { pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const ESTADOS = ["draft", "published"] as const;
export type Estado = (typeof ESTADOS)[number];

export const ${c}Items = pgTable("${tabla}", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body"),
  status: varchar("status", { length: 20 }).$type<Estado>().notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ${P}Item = typeof ${c}Items.$inferSelect;
export type New${P}Item = typeof ${c}Items.$inferInsert;
`
  );

  add(
    `${k}/${slug}.policy.ts`,
    `/**
 * ${nombreVisible} — Política de autorización
 * ============================================================================
 * Deny-by-default: una acción sin regla se deniega. Importar este módulo
 * registra la policy "${recurso}". \`register${P}Policy()\` existe porque las
 * pruebas llaman a \`resetAuthz()\` y hay que volver a registrarla.
 *
 *   · cualquiera (también anónimo) → ve lo PUBLICADO;
 *   · staff (admin o editor)        → ve los borradores y crea, edita y borra.
 *
 * El alta de cuentas es pública: «tener sesión» no da nada por sí solo.
 */
import { definePolicy, type AuthzUser } from "@kitsuden/engine";

const STAFF = new Set(["admin", "editor"]);

export function esStaff(user: AuthzUser | null): boolean {
  return !!user && typeof user.role === "string" && STAFF.has(user.role);
}

export interface ${P}Recurso {
  status: string;
}

export function register${P}Policy(): void {
  definePolicy<${P}Recurso | null>("${recurso}", {
    view: (user, item) => esStaff(user) || item?.status === "published",
    create: (user) => esStaff(user),
    update: (user) => esStaff(user),
    delete: (user) => esStaff(user),
  });
}

register${P}Policy();
`
  );

  add(
    `${k}/${slug}.routes.ts`,
    `/**
 * ${nombreVisible} — operaciones (SDK de kons, docs/kons/README.md)
 * ============================================================================
 *
 *   GET    ${ruta}          listar    (anónimo: solo publicados; staff: todo)
 *   GET    ${ruta}/:id      obtener
 *   POST   ${ruta}          crear     (staff)
 *   PATCH  ${ruta}/:id      editar    (staff)
 *   DELETE ${ruta}/:id      borrar    (staff)
 *
 * Cada operación se declara UNA vez con \`defineOperacion\`: de la declaración
 * salen la ruta REST (validación 422, permiso, idempotencia y RLS heredadas),
 * su operación OpenAPI 3.1 y su herramienta MCP (\`${slug}__<id>\`).
 *
 * Reglas del SDK para los handlers: consultas EN SERIE (nada de \`Promise.all\`
 * sobre la transacción de la petición); un error de SQL que se quiera
 * tolerar, dentro de \`conSavepoint\`; llamadas externas largas, fuera de la
 * transacción (antes de la primera consulta o con \`ctx.db.segundoPlano\`).
 */

import {
  AppError,
  defineOperacion,
  esUuid,
  routerDeOperaciones,
  type OperacionCualquiera,
} from "@kitsuden/engine";
import { z } from "@kitsuden/engine/zod";
import type { KonContext } from "@kitsuden/shared";
import { desc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { Hono } from "hono";

import { esStaff, register${P}Policy } from "./${slug}.policy";
import * as schema from "./${slug}.schema";
import { ${c}Items, ESTADOS } from "./${slug}.schema";

register${P}Policy();

export type ${P}Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** El id del kon: parte del scope fino de cada operación (\`kon:${slug}:<op>\`). */
export const KON_ID = "${id}";

const RECURSO = "${recurso}";

// ── Esquemas: los de la ruta, el OpenAPI y la herramienta MCP ─────────────────

/** Estricto: un campo que no está aquí es un 422 con \`didYouMean\`. */
const Crear = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(100_000).nullable().optional(),
  status: z.enum(ESTADOS).optional(),
});
const Editar = Crear.partial();
const ParamId = z.object({ id: z.string().describe("Item id (uuid; anything else is a 404)") });
const QueryLista = z.object({ limit: z.coerce.number().int().min(1).max(100).optional() });

const Item = z.object({
  id: z.guid(),
  title: z.string(),
  body: z.string().nullable(),
  status: z.enum(ESTADOS),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

/** Las operaciones del kon, con su contexto inyectado. */
export function operacionesDe${P}(ctx: KonContext): OperacionCualquiera[] {
  const db = ctx.db.instance as ${P}Db;

  async function cargar(id: string) {
    if (!esUuid(id)) return null;
    const [fila] = await db.select().from(${c}Items).where(eq(${c}Items.id, id)).limit(1);
    return fila ?? null;
  }

  return [
    defineOperacion({
      id: "listar",
      metodo: "GET",
      ruta: "/",
      resumen: ${JSON.stringify(`List ${nombreVisible.toLowerCase()}`)},
      descripcion:
        "Newest first. The public sees published items only; admin and editor also see drafts.",
      acceso: "opcional",
      entrada: { query: QueryLista },
      salida: { esquema: z.object({ docs: z.array(Item) }) },
      manejar: async ({ query }, { usuario }) => {
        const limite = query.limit ?? 50;
        const consulta = db.select().from(${c}Items);
        const docs = esStaff(usuario)
          ? await consulta.orderBy(desc(${c}Items.createdAt)).limit(limite)
          : await consulta
              .where(eq(${c}Items.status, "published"))
              .orderBy(desc(${c}Items.createdAt))
              .limit(limite);
        return { docs };
      },
    }),

    defineOperacion({
      id: "obtener",
      metodo: "GET",
      ruta: "/:id",
      resumen: "Get one item",
      descripcion: "One item by id. A draft you cannot see answers like one that does not exist (404).",
      acceso: "opcional",
      permiso: { politica: { recurso: RECURSO, accion: "view", enHandler: true } },
      entrada: { params: ParamId },
      salida: { esquema: Item },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async ({ params }, { puede }) => {
        const fila = await cargar(params.id);
        if (!fila || !(await puede(fila))) throw AppError.notFound("Not found");
        return fila;
      },
    }),

    defineOperacion({
      id: "crear",
      metodo: "POST",
      ruta: "/",
      resumen: "Create an item",
      descripcion: "Creates an item (draft unless status is given). Staff only.",
      acceso: "sesion",
      permiso: { politica: { recurso: RECURSO, accion: "create" } },
      entrada: { cuerpo: Crear },
      salida: { estado: 201, esquema: Item },
      manejar: async ({ cuerpo }) => {
        const [fila] = await db
          .insert(${c}Items)
          .values({ title: cuerpo.title, body: cuerpo.body ?? null, status: cuerpo.status ?? "draft" })
          .returning();
        return fila;
      },
    }),

    defineOperacion({
      id: "editar",
      metodo: "PATCH",
      ruta: "/:id",
      resumen: "Update an item",
      descripcion: "Changes the given fields. Staff only.",
      acceso: "sesion",
      permiso: { politica: { recurso: RECURSO, accion: "update", enHandler: true } },
      entrada: { params: ParamId, cuerpo: Editar },
      salida: { esquema: Item },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async ({ params, cuerpo }, { autorizar }) => {
        const fila = await cargar(params.id);
        if (!fila) throw AppError.notFound("Not found");
        await autorizar(fila);
        const [nueva] = await db
          .update(${c}Items)
          .set({ ...cuerpo, updatedAt: new Date() })
          .where(eq(${c}Items.id, fila.id))
          .returning();
        return nueva;
      },
    }),

    defineOperacion({
      id: "borrar",
      metodo: "DELETE",
      ruta: "/:id",
      resumen: "Delete an item",
      descripcion: "Deletes an item. Cannot be undone. Staff only.",
      acceso: "sesion",
      permiso: { politica: { recurso: RECURSO, accion: "delete", enHandler: true } },
      entrada: { params: ParamId },
      salida: { estado: 204 },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async ({ params }, { autorizar }) => {
        const fila = await cargar(params.id);
        if (!fila) throw AppError.notFound("Not found");
        await autorizar(fila);
        await db.delete(${c}Items).where(eq(${c}Items.id, fila.id));
        return null;
      },
    }),
  ];
}

/** El router REST, generado de las operaciones. */
export function create${P}Router(ctx: KonContext): Hono {
  return routerDeOperaciones(KON_ID, operacionesDe${P}(ctx), ctx);
}
`
  );

  add(
    `${k}/index.ts`,
    `/**
 * @kitsuden/${id} — ${nombreVisible}
 *
 * Layer: Kon (Nivel 3 — se carga con el module-loader)
 * Mount: ${ruta}
 *
 * Generado por \`kitsuden make kon ${slug}\` con el SDK de kons: el router, el
 * OpenAPI y las herramientas MCP salen de las operaciones de ${slug}.routes.ts.
 */

import { defineKonSdk } from "@kitsuden/engine";
import type { KonContext, KonDefinition } from "@kitsuden/shared";

import { create${P}Router, operacionesDe${P} } from "./${slug}.routes";

export * from "./${slug}.schema";
export { register${P}Policy, esStaff } from "./${slug}.policy";
export { create${P}Router, operacionesDe${P} };

const tables = ["${tabla}"];

export const kon: KonDefinition = defineKonSdk({
  id: "${id}",
  name: ${JSON.stringify(nombreVisible)},
  version: "0.1.0",
  description: ${JSON.stringify(descripcion)},
  icon: "${icono}",
  mountPath: "${ruta}",
  operaciones: (ctx: KonContext) => operacionesDe${P}(ctx),
  tables,
  admin: {
    category: "content",
    views: [{ id: "grid-${slug}", type: "grid", title: ${JSON.stringify(nombreVisible)}, table: "${tabla}" }],
  },
  dependencies: {
    kons: [],
    core: ["auth"],
  },
  hooks: {
    onStartup: async (ctx) => {
      if (!(await ctx.db.tableExists("${tabla}"))) {
        ctx.logger.warn("${id}: missing table ${tabla}; run pnpm db:migrate");
      }
    },
  },
});

export default kon;
`
  );

  add(
    `${k}/README.md`,
    `# ${id}

${descripcion}

Generated by \`kitsuden make kon ${slug}\` with the kon SDK (see Kitsuden's
docs/kons/README.md): each route is an operation declared once in
\`${slug}.routes.ts\`, which also gives it its OpenAPI 3.1 entry and its MCP
tool (\`${slug}__<operation>\`).

| Route | Who |
| --- | --- |
| \`GET ${ruta}\` | anyone (published items; admin/editor see drafts too) |
| \`GET ${ruta}/:id\` | anyone for published items |
| \`POST ${ruta}\` | admin, editor |
| \`PATCH ${ruta}/:id\` | admin, editor |
| \`DELETE ${ruta}/:id\` | admin, editor |

Table \`${tabla}\` is created by \`migrations/0000_inicial.sql\`. Change
\`${slug}.schema.ts\` and add a new numbered migration together.

Tests: \`tests/unit/kon-${slug}.test.ts\` (run \`pnpm test:unit -- kon-${slug}\`).
`
  );

  add(
    `tests/unit/kon-${slug}.test.ts`,
    `/**
 * ${id} — rutas REALES sobre PGlite con un rol sin superusuario
 * ============================================================================
 *
 * Generado por \`kitsuden make kon ${slug}\`. Monta \`create${P}Router\` con la
 * migración del kon y comprueba la policy: anónimo y usuario leen lo publicado,
 * solo el staff escribe, y un campo fuera de la lista blanca da 422.
 */

import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestKonContext } from "../../apps/api/src/lib/test-kon-context";
import { register${P}Policy } from "../../packages/kons/${id}/${slug}.policy";
import { create${P}Router } from "../../packages/kons/${id}/${slug}.routes";

import { authDePrueba, baseConRls, comoRolDeApp, pedirComo } from "./helpers/kon-con-usuarios";

let cliente: PGlite;
let pedir: ReturnType<typeof pedirComo>;

beforeAll(async () => {
  cliente = await baseConRls("${id}", ["0000_inicial.sql"]);
  const db = await comoRolDeApp(cliente);
  const ctx = createTestKonContext({
    db: { instance: db, execute: async () => undefined, tableExists: async () => true } as never,
    auth: authDePrueba() as never,
  });
  pedir = pedirComo(create${P}Router(ctx));
});

afterAll(async () => {
  await cliente?.close();
});

beforeEach(() => {
  register${P}Policy();
});

describe("${id}", () => {
  let publicado: string;
  let borrador: string;

  it("solo el staff crea", async () => {
    expect((await pedir("anon", "POST", "/", { title: "x" })).status).toBe(401);
    expect((await pedir("a", "POST", "/", { title: "x" })).status).toBe(403);

    const r1 = await pedir("staff", "POST", "/", { title: "Publicado", status: "published" });
    expect(r1.status).toBe(201);
    publicado = (await r1.json()).id;

    const r2 = await pedir("admin", "POST", "/", { title: "Borrador" });
    expect(r2.status).toBe(201);
    borrador = (await r2.json()).id;
  });

  // (createdAt/updatedAt no sirven para esto: el motor los IGNORA como campos
  // de servidor y lo dice en X-Kitsuden-Ignored-Fields.)
  it("un campo fuera de la lista blanca se rechaza (422)", async () => {
    const r = await pedir("staff", "POST", "/", { title: "x", isAdmin: true });
    expect(r.status).toBe(422);
  });

  it("el anónimo ve lo publicado y no los borradores", async () => {
    const lista = await (await pedir("anon", "GET", "/")).json();
    const ids = lista.docs.map((d: { id: string }) => d.id);
    expect(ids).toContain(publicado);
    expect(ids).not.toContain(borrador);

    expect((await pedir("anon", "GET", \`/\${publicado}\`)).status).toBe(200);
    expect((await pedir("anon", "GET", \`/\${borrador}\`)).status).toBe(404);
  });

  it("el staff ve los borradores", async () => {
    const lista = await (await pedir("staff", "GET", "/")).json();
    expect(lista.docs.map((d: { id: string }) => d.id)).toContain(borrador);
  });

  it("un id que no es UUID da 404, no un 500", async () => {
    expect((await pedir("anon", "GET", "/no-existe")).status).toBe(404);
  });

  it("editar y borrar exigen staff", async () => {
    expect((await pedir("a", "PATCH", \`/\${borrador}\`, { status: "published" })).status).toBe(403);
    const r = await pedir("staff", "PATCH", \`/\${borrador}\`, { status: "published" });
    expect(r.status).toBe(200);
    expect((await r.json()).status).toBe("published");

    expect((await pedir("a", "DELETE", \`/\${borrador}\`)).status).toBe(403);
    expect((await pedir("admin", "DELETE", \`/\${borrador}\`)).status).toBe(204);
    expect((await pedir("anon", "GET", \`/\${borrador}\`)).status).toBe(404);
  });
});
`
  );

  return { raiz, slug, id, tabla, ruta, ficheros };
}

export async function escribirPlan(plan: PlanDeKon): Promise<void> {
  for (const f of plan.ficheros) {
    await mkdir(dirname(f.ruta), { recursive: true });
    await writeFile(f.ruta, f.contenido, "utf8");
  }
}

/**
 * Un kon generado en el proyecto queda INSTALADO: declarado en
 * kitsuden.kons.json en modo `link` (se usa en su sitio, packages/kons/<id>;
 * `kitsuden kon remove` no borra sus ficheros). Desde la fase C la API solo
 * carga lo declarado: sin esto, el kon recién hecho no existiría para ella.
 */
function declararKonGenerado(plan: PlanDeKon): void {
  const fichero = leerFichero(plan.raiz);
  fichero.kons[plan.id] = {
    source: "kitsuden make kon",
    version: "0.1.0",
    sdk: 1,
    mode: "link",
    path: `./packages/kons/${plan.id}`,
    installedAt: new Date().toISOString(),
  };
  escribirFichero(plan.raiz, fichero);
}

export async function makeKonCommand(nombre: string, opciones: MakeKonOptions = {}): Promise<void> {
  let plan: PlanDeKon;
  try {
    plan = planearKon(nombre, opciones);
  } catch (e) {
    console.error(chalk.red(`✖ ${(e as Error).message}`));
    process.exit(1);
  }
  await escribirPlan(plan);
  declararKonGenerado(plan);

  const rel = (p: string) => relative(process.cwd(), p).split("\\").join("/") || ".";
  console.log(chalk.green(`✔ Created ${plan.id}`));
  for (const f of plan.ficheros) console.log(chalk.gray(`  ${rel(f.ruta)}`));
  console.log(`
${chalk.bold("Next steps")}

  pnpm install                                   # registers the new workspace package
  pnpm test:unit -- kon-${plan.slug}                  # its route tests
  pnpm --filter @kitsuden/${plan.id} typecheck
  pnpm db:migrate                                # creates ${plan.tabla}

  Then enable ${plan.id} in the admin (Modules). Routes: ${plan.ruta}
`);
}
