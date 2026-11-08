/**
 * Las vías genéricas no llegan a las credenciales (auditoría 2026-11-04)
 * ============================================================================
 *
 * F10/F69: `GET/POST /api/relations/<padre>/inlines/<id>?inline=<hija>` leía y
 * escribía cualquier tabla con FK al padre —con `auth_users` de padre,
 * `auth_accounts` (hashes y tokens OAuth) y `auth_sessions`—, con nombres de
 * columna elegidos por quien llama.
 *
 * F12/F13: GraphQL generaba tipo, consulta y mutaciones para TODA tabla del
 * esquema fusionado, sin lista negra ni columnas secretas, y una clave de
 * agente con `admin` modificaba `auth_users`/`modules`.
 *
 * Se prueba con Postgres de verdad (PGlite) y las rutas reales; se sustituyen
 * solo la base, la autenticación (cada petición dice quién es por cabecera),
 * el escáner de kons y Valkey.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const pg = new PGlite();
const baseDePrueba = drizzle(pg);

// ── El esquema fusionado que ve GraphQL ──
const authUsers = pgTable("auth_users", { id: text("id").primaryKey(), role: text("role"), name: text("name") });
const authAccounts = pgTable("auth_accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  providerId: text("provider_id"),
  password: text("password"),
  accessToken: text("access_token"),
});
const media = pgTable("media", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id"),
  title: text("title"),
  uploadToken: text("upload_token"),
  createdAt: timestamp("created_at"),
});
const modules = pgTable("modules", { id: text("id").primaryKey(), ownerId: text("owner_id"), name: text("name") });
const actions = pgTable("actions", { id: text("id").primaryKey(), name: text("name") });
const dataSets = pgTable("data_sets", { id: text("id").primaryKey(), slug: text("slug"), name: text("name") });
const dataEntries = pgTable("data_entries", { id: text("id").primaryKey(), dataSetId: text("data_set_id") });

const ESQUEMA = { authUsers, authAccounts, media, modules, actions };

vi.mock("../../apps/api/src/db", () => ({ db: baseDePrueba, mergedSchema: ESQUEMA }));
vi.mock("../../apps/api/src/db/schema-core", () => ({ dataSets, dataEntries }));
vi.mock("../../apps/api/src/lib/schema-merger", () => ({ buildMergedSchema: async () => ESQUEMA }));
vi.mock("../../apps/api/src/lib/valkey", () => ({
  getValkeyClient: async () => {
    throw new Error("sin valkey en pruebas");
  },
}));
vi.mock("../../apps/api/src/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));
vi.mock("../../apps/api/src/services/scanner", () => ({ scanPackages: async () => [] }));
vi.mock("@kitsuden/engine", () => ({
  resolveExecutor: (f: unknown) => f,
  messageOf: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));
// `graphql-type-json` es CommonJS y hace `require("graphql")` (la copia .js);
// vitest resuelve el `import "graphql"` de graphql.ts a la .mjs: dos copias,
// "Cannot use GraphQLScalarType from another realm". En Bun no pasa. Aquí el
// mismo escalar, con el `graphql` que resuelve graphql.ts. Por ruta: en la raíz
// del repo no hay ni `graphql` ni `graphql-type-json`.
vi.mock("../../apps/api/node_modules/graphql-type-json", async () => {
  const { GraphQLScalarType, valueFromASTUntyped } = await import("../../apps/api/node_modules/graphql");
  return {
    default: new GraphQLScalarType({
      name: "JSON",
      serialize: (v) => v,
      parseValue: (v) => v,
      parseLiteral: (ast, variables) => valueFromASTUntyped(ast, variables),
    }),
  };
});
const pasa = async (_c: unknown, next: () => Promise<void>) => next();
vi.mock("../../apps/api/src/middleware/auth", () => ({ requireAuth: pasa }));
vi.mock("../../apps/api/src/middleware/auth-guard", () => ({ protectRoute: pasa, requireAdmin: pasa }));
vi.mock("../../apps/api/src/middleware/transactional-rls", () => ({ withTransactionalRLS: () => pasa }));

const tablas = await import("../../apps/api/src/lib/tablas-explorables");
const { inlineRelationsRoutes } = await import("../../apps/api/src/routes/inline-relations");
const { problemaDeRegistrosInline } = await import("../../apps/api/src/services/inline-relations");
const { graphqlRoutes } = await import("../../apps/api/src/routes/graphql");

type Quien = "admin" | "agente-admin" | "editor";

/** La app con la identidad que pone el middleware global, elegida por cabecera. */
function app(montaje: string, rutas: Hono<any>): Hono {
  const a = new Hono();
  a.use("*", async (c, next) => {
    const quien = c.req.header("x-quien") as Quien | undefined;
    if (quien === "admin") c.set("user" as never, { id: "u1", role: "admin" } as never);
    if (quien === "editor") c.set("user" as never, { id: "u2", role: "editor" } as never);
    if (quien === "agente-admin") {
      c.set("agent" as never, { agentId: "ag1", scopes: ["admin"] } as never);
      c.set("user" as never, { id: "ag1", role: "agent", scopes: ["admin"] } as never);
    }
    await next();
  });
  a.route(montaje, rutas);
  return a;
}

const relaciones = app("/api/relations", inlineRelationsRoutes as never);
const grafo = app("/api/graphql", graphqlRoutes as never);

async function gql(quien: Quien, query: string) {
  const r = await grafo.request("/api/graphql", {
    method: "POST",
    headers: { "content-type": "application/json", "x-quien": quien },
    body: JSON.stringify({ query }),
  });
  return (await r.json()) as { data?: any; errors?: { message: string }[] };
}

beforeAll(async () => {
  await pg.exec(`
    create table auth_users (id text primary key, role text, name text);
    create table auth_accounts (id text primary key, user_id text references auth_users(id),
      provider_id text, password text, access_token text);
    create table auth_sessions (id text primary key, user_id text references auth_users(id), token text);
    create table media (id text primary key, owner_id text references auth_users(id), title text,
      upload_token text, created_at timestamp default now());
    create table modules (id text primary key, owner_id text references auth_users(id), name text);
    create table actions (id text primary key, name text);
    create table data_sets (id text primary key, slug text, name text);
    create table data_entries (id text primary key, data_set_id text);

    insert into auth_users values ('u1', 'admin', 'Ana');
    insert into auth_accounts values ('ac1', 'u1', 'credential', 'HASH-SECRETO', 'TOKEN-OAUTH');
    insert into auth_sessions values ('s1', 'u1', 'TOKEN-SESION');
    insert into media (id, owner_id, title, upload_token) values ('md1', 'u1', 'Portada', 'TOKEN-SUBIDA');
    insert into modules values ('m1', 'u1', 'kon-blog');
    insert into actions values ('a1', 'accion');
  `);
});
afterAll(async () => pg.close());

// ═══════════════════════════════════════════════════════════════════════════
describe("la regla compartida (tablas-explorables)", () => {
  it("prohíbe la lista negra y todo auth_* salvo auth_users", () => {
    for (const t of ["auth_accounts", "auth_sessions", "auth_verifications", "api_keys", "kitsuden_secrets", "auth_lo_que_sea"]) {
      expect(tablas.tablaNativaProhibida(t), t).toBe(true);
    }
    for (const t of ["auth_users", "media", "modules"]) expect(tablas.tablaNativaProhibida(t), t).toBe(false);
  });

  it("escritura: prohibidas y con ruta propia nunca; las de admin solo con persona admin", () => {
    expect(tablas.motivoParaNoEscribirTablaNativa("auth_accounts", true)).toBe("prohibida");
    expect(tablas.motivoParaNoEscribirTablaNativa("actions", true)).toBe("solo-por-su-ruta");
    expect(tablas.motivoParaNoEscribirTablaNativa("modules", false)).toBe("exige-admin-humano");
    expect(tablas.motivoParaNoEscribirTablaNativa("auth_users", false)).toBe("exige-admin-humano");
    expect(tablas.motivoParaNoEscribirTablaNativa("modules", true)).toBeNull();
    expect(tablas.motivoParaNoEscribirTablaNativa("media", false)).toBeNull();
  });

  it("una clave de agente con `admin` no es un admin humano", () => {
    const ctx = (vars: Record<string, unknown>) => ({ get: (k: string) => vars[k] });
    expect(tablas.esAdminHumano(ctx({ user: { role: "admin" } }))).toBe(true);
    expect(tablas.esAdminHumano(ctx({ user: { role: "editor" } }))).toBe(false);
    expect(tablas.esAdminHumano(ctx({ agent: { scopes: ["admin"] }, user: { role: "admin" } }))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("relaciones en línea (F10/F69)", () => {
  const get = (ruta: string, quien: Quien = "admin") =>
    relaciones.request(`/api/relations${ruta}`, { headers: { "x-quien": quien } });
  const post = (ruta: string, cuerpo: unknown, quien: Quien = "admin") =>
    relaciones.request(`/api/relations${ruta}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-quien": quien },
      body: JSON.stringify(cuerpo),
    });

  it("las tablas de credenciales no son hijas de nadie", async () => {
    const r = await get("/auth_users/inlines/config");
    expect(r.status).toBe(200);
    const { inlines } = (await r.json()) as { inlines: { table: string; fields: string[] }[] };
    const nombres = inlines.map((i) => i.table);
    expect(nombres).toContain("media");
    expect(nombres).not.toContain("auth_accounts");
    expect(nombres).not.toContain("auth_sessions");
    // Ni una columna secreta entre los campos propuestos.
    expect(inlines.find((i) => i.table === "media")!.fields).not.toContain("upload_token");

    const rel = (await (await get("/auth_users")).json()) as { relations: { relatedTable: string }[] };
    expect(rel.relations.map((x) => x.relatedTable)).not.toContain("auth_accounts");
  });

  it("GET ?inline=auth_accounts no devuelve hashes: no existe", async () => {
    for (const hija of ["auth_accounts", "auth_sessions"]) {
      const r = await get(`/auth_users/inlines/u1?inline=${hija}`);
      expect(r.status).toBe(404);
      expect(await r.text()).not.toContain("SECRETO");
    }
  });

  it("una tabla prohibida tampoco sirve de padre", async () => {
    expect((await get("/auth_accounts")).status).toBe(404);
    const r = await get("/auth_accounts/inlines/config");
    expect(((await r.json()) as { inlines: unknown[] }).inlines).toEqual([]);
  });

  it("las filas salen sin columnas secretas", async () => {
    const r = await get("/auth_users/inlines/u1?inline=media");
    expect(r.status).toBe(200);
    const cuerpo = await r.text();
    expect(cuerpo).toContain("Portada");
    expect(cuerpo).not.toContain("TOKEN-SUBIDA");
    expect(cuerpo).not.toContain("upload_token");
  });

  it("POST no reescribe credenciales: hija prohibida, columna secreta o desconocida", async () => {
    expect((await post("/auth_users/inlines/u1?inline=auth_accounts", { records: [{ id: "ac1", password: "x" }] })).status).toBe(404);
    expect((await post("/auth_users/inlines/u1?inline=media", { records: [{ id: "md1", upload_token: "x" }] })).status).toBe(400);
    expect((await post("/auth_users/inlines/u1?inline=media", { records: [{ id: "md1", no_existe: "x" }] })).status).toBe(400);
    const { rows } = await pg.query<{ password: string }>("select password from auth_accounts where id = 'ac1'");
    expect(rows[0]!.password).toBe("HASH-SECRETO");
    const { rows: m } = await pg.query<{ upload_token: string }>("select upload_token from media where id = 'md1'");
    expect(m[0]!.upload_token).toBe("TOKEN-SUBIDA");
  });

  it("POST con columnas reales funciona", async () => {
    const r = await post("/auth_users/inlines/u1?inline=media", { records: [{ id: "md1", title: "Nueva" }] });
    expect(r.status).toBe(200);
    const { rows } = await pg.query<{ title: string }>("select title from media where id = 'md1'");
    expect(rows[0]!.title).toBe("Nueva");
  });

  it("`modules` (escritura de admin) solo la escribe una persona admin", async () => {
    const cuerpo = { records: [{ id: "m1", name: "kon-x" }] };
    expect((await post("/auth_users/inlines/u1?inline=modules", cuerpo, "agente-admin")).status).toBe(403);
    expect((await post("/auth_users/inlines/u1?inline=modules", cuerpo, "editor")).status).toBe(403);
    expect((await post("/auth_users/inlines/u1?inline=modules", cuerpo, "admin")).status).toBe(200);
  });

  it("problemaDeRegistrosInline valida la forma", () => {
    const cols = new Set(["id", "title"]);
    expect(problemaDeRegistrosInline([{ title: "a" }], [], cols)).toBeNull();
    expect(problemaDeRegistrosInline("x", [], cols)).toMatch(/array/);
    expect(problemaDeRegistrosInline([], [1], cols)).toMatch(/deletedIds/);
    expect(problemaDeRegistrosInline([{ password: "a" }], [], new Set(["password"]))).toMatch(/cannot be written/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("GraphQL (F12/F13)", () => {
  it("las tablas prohibidas no tienen consulta", async () => {
    const r = await gql("admin", "{ authaccounts { docs { id password } } }");
    expect(r.errors?.[0]?.message).toMatch(/Cannot query field/);
    expect(JSON.stringify(r)).not.toContain("HASH-SECRETO");
  });

  it("las columnas secretas no son campos del tipo", async () => {
    const ok = await gql("admin", "{ medias { docs { id title } } }");
    expect(ok.errors).toBeUndefined();
    expect(ok.data.medias.docs[0].id).toBe("md1");
    const r = await gql("admin", "{ medias { docs { uploadToken } } }");
    expect(r.errors?.[0]?.message).toMatch(/Cannot query field/);
  });

  it("`items` y `collections` no llegan a las prohibidas ni enseñan secretos", async () => {
    const r = await gql("admin", '{ a: items(collection: "authAccounts") b: items(collection: "media") collections }');
    expect(r.errors).toBeUndefined();
    expect(r.data.a).toBeNull();
    expect(JSON.stringify(r.data.b)).not.toContain("TOKEN-SUBIDA");
    expect(JSON.stringify(r.data.b)).toContain("md1");
    const nombres = r.data.collections.tables.map((t: { dbName: string }) => t.dbName);
    expect(nombres).toContain("media");
    expect(nombres).not.toContain("auth_accounts");
  });

  it("sin mutaciones para prohibidas ni tablas con ruta propia", async () => {
    const r = await gql("admin", '{ __type(name: "Mutation") { fields { name } } }');
    const nombres = r.data.__type.fields.map((f: { name: string }) => f.name);
    expect(nombres).toContain("updateMedia");
    expect(nombres.some((n: string) => /authaccounts/i.test(n))).toBe(false);
    expect(nombres).not.toContain("updateActions");
  });

  it("`modules` y `auth_users` solo los modifica una persona admin", async () => {
    const agente = await gql("agente-admin", 'mutation { updateModules(id: "m1", input: { name: "kon-mal" }) { id } }');
    expect(agente.errors?.[0]?.message).toMatch(/human admin/);
    const rol = await gql("agente-admin", 'mutation { updateAuthusers(id: "u1", input: { role: "admin" }) { id } }');
    expect(rol.errors?.[0]?.message).toMatch(/human admin/);
    const { rows } = await pg.query<{ name: string }>("select name from modules where id = 'm1'");
    expect(rows[0]!.name).not.toBe("kon-mal");

    const humano = await gql("admin", 'mutation { updateModules(id: "m1", input: { name: "kon-bien" }) { id } }');
    expect(humano.errors).toBeUndefined();
    expect(humano.data.updateModules.id).toBe("m1");
  });

  it("una mutación no escribe una columna secreta", async () => {
    const r = await gql("admin", 'mutation { updateMedia(id: "md1", input: { uploadToken: "x" }) { id } }');
    expect(r.errors?.[0]?.message).toMatch(/cannot be written/);
    const { rows } = await pg.query<{ upload_token: string }>("select upload_token from media where id = 'md1'");
    expect(rows[0]!.upload_token).toBe("TOKEN-SUBIDA");
  });
});
