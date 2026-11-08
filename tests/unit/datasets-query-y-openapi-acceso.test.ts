/**
 * Consultas por dataset y por tabla, y el documento OpenAPI (auditoría 2026-11-04)
 * ============================================================================
 *
 * F70: `POST /api/datasets/:id/query` solo miraba `policyJson`; una clave con
 *      `["admin", "!datasets:secreto:*"]` leía lo que `/entries` le niega.
 * F71: `POST /api/datasets/query/:tabla` resolvía cualquier tabla del esquema
 *      (`authAccounts`…) y devolvía todas sus columnas; un `where` sobre una
 *      columna secreta era un oráculo.
 * F11: `/api/docs/openapi.json`, sin sesión, describía TODOS los datasets.
 *
 * Sin base: `db` es un doble que devuelve las filas que cada prueba pone, y el
 * motor de consultas un espía (lo que importa es si se le llama y qué sale).
 */
import { pgTable, text } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as esquemaReal from "../../apps/api/src/db/schema";

// ── Doble de `db`: cualquier cadena select/from/where/limit acaba en `filas` ──
const estado = vi.hoisted(() => ({ filas: [] as unknown[] }));
function cadena(): any {
  const c: any = {};
  for (const m of ["select", "from", "where", "limit", "orderBy", "offset"]) c[m] = () => c;
  c.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(estado.filas).then(ok, ko);
  return c;
}

const widgets = pgTable("kon_widgets", { id: text("id").primaryKey(), name: text("name"), apiToken: text("api_token") });
const ESQUEMA = {
  widgets,
  authAccounts: esquemaReal.authAccounts,
  agentIdentities: esquemaReal.agentIdentities,
};

vi.mock("../../apps/api/src/db", () => ({ db: { select: () => cadena() }, mergedSchema: ESQUEMA }));
vi.mock("../../apps/api/src/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));
const pasa = async (_c: unknown, next: () => Promise<void>) => next();
vi.mock("../../apps/api/src/middleware/auth", () => ({ requireAuth: pasa }));

const permisos = vi.hoisted(() => ({ lee: true, escribe: true }));
vi.mock("../../apps/api/src/middleware/permissions", () => ({
  checkDatasetReadAccess: async () => permisos.lee,
  checkDatasetWriteAccess: async () => permisos.escribe,
}));

const motor = vi.hoisted(() => ({
  parseKitsudenQuery: vi.fn(async () => ({
    data: [{ id: "w1", name: "uno", apiToken: "TOKEN-VIVO" }],
    meta: { total: 1 },
  })),
}));
vi.mock("@kitsuden/engine", () => {
  class KitsudenQLError extends Error {
    code = "X";
    details = {};
  }
  class BatchProcessorError extends Error {}
  class BatchProcessor {
    async execute() {
      return { success: true, results: [] };
    }
  }
  return {
    parseKitsudenQuery: motor.parseKitsudenQuery,
    KitsudenQLError,
    BatchProcessorError,
    BatchProcessor,
    getAvailableRelations: () => [],
    validateKitsudenQuery: () => ({ valid: true }),
    debugQuery: () => ({ sql: "", params: [] }),
    resolveExecutor: (f: unknown) => f,
    esUuid: (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v),
  };
});

const { datasetsQueryRoutes, accesoPorScopesDelAgente, problemaDeConsultaNativa } = await import(
  "../../apps/api/src/routes/datasets-query"
);
const { generateOpenAPISpec, datasetVisibleEnDocs } = await import("../../apps/api/src/lib/openapi-aggregator");

const ID = "11111111-2222-3333-4444-555555555555";
const SECRETO = { id: ID, slug: "secreto", policyJson: { readAccess: "authenticated", writeAccess: "authenticated" } };

type Quien = { user?: Record<string, unknown>; agent?: Record<string, unknown> };
const AGENTE_DENEGADO: Quien = {
  agent: { agentId: "ag", scopes: ["admin", "!datasets:secreto:*"] },
  user: { id: "ag", role: "agent", scopes: ["admin", "!datasets:secreto:*"] },
};
const ADMIN: Quien = { user: { id: "u1", role: "admin" } };

function app(quien: Quien) {
  const a = new Hono();
  a.use("*", async (c, next) => {
    if (quien.user) c.set("user" as never, quien.user as never);
    if (quien.agent) c.set("agent" as never, quien.agent as never);
    await next();
  });
  a.route("/api/datasets", datasetsQueryRoutes as never);
  return a;
}
const post = (quien: Quien, ruta: string, cuerpo: unknown) =>
  app(quien).request(`/api/datasets${ruta}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  });

beforeEach(() => {
  estado.filas = [SECRETO];
  permisos.lee = true;
  permisos.escribe = true;
  motor.parseKitsudenQuery.mockClear();
});

// ═══════════════════════════════════════════════════════════════════════════
describe("F70: scopes por dataset en /api/datasets/:id/query y vecinas", () => {
  it("la regla: denegación, concesión o nada", () => {
    const ctx = (q: Quien) => ({ get: (k: string) => (q as Record<string, unknown>)[k] });
    expect(accesoPorScopesDelAgente(ctx(AGENTE_DENEGADO), "secreto", "read")).toBe("denegado");
    expect(
      accesoPorScopesDelAgente(ctx({ agent: { scopes: ["usuario:actuar", "datasets:secreto:read"] } }), "secreto", "read")
    ).toBe("concedido");
    expect(accesoPorScopesDelAgente(ctx(ADMIN), "secreto", "read")).toBeNull();
  });

  it("una denegación del agente gana a la política (403, sin consultar)", async () => {
    const r = await post(AGENTE_DENEGADO, `/${ID}/query`, {});
    expect(r.status).toBe(403);
    expect(motor.parseKitsudenQuery).not.toHaveBeenCalled();
  });

  it("una concesión del agente abre aunque la política no", async () => {
    permisos.lee = false;
    const agente = { agent: { scopes: ["usuario:actuar", "datasets:secreto:read"] }, user: { id: "ag", role: "agent" } };
    expect((await post(agente, `/${ID}/query`, {})).status).toBe(200);
  });

  it("sin scopes que digan nada, decide la política como antes", async () => {
    const persona = { user: { id: "u2", role: "user" } };
    expect((await post(persona, `/${ID}/query`, {})).status).toBe(200);
    permisos.lee = false;
    expect((await post(persona, `/${ID}/query`, {})).status).toBe(403);
  });

  it("GET /:id/relations: el dataset denegado no existe para él", async () => {
    const r = await app(AGENTE_DENEGADO).request(`/api/datasets/${ID}/relations`);
    expect(r.status).toBe(404);
    expect((await app(ADMIN).request(`/api/datasets/${ID}/relations`)).status).toBe(200);
  });

  it("batch: la denegación del agente gana a su scope `admin`", async () => {
    const cuerpo = { operations: [{ op: "create", table: "dataEntries", data: { dataSetId: ID, data: {} } }] };
    expect((await post(AGENTE_DENEGADO, "/batch", cuerpo)).status).toBe(403);
    expect((await post(ADMIN, "/batch", cuerpo)).status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("F71: /api/datasets/query/:tabla", () => {
  it("una tabla prohibida no existe, ni en la lista de disponibles", async () => {
    const r = await post(ADMIN, "/query/authAccounts", {});
    expect(r.status).toBe(400);
    const cuerpo = (await r.json()) as { availableTables: string[] };
    expect(cuerpo.availableTables).toContain("widgets");
    expect(cuerpo.availableTables).not.toContain("authAccounts");
    expect(motor.parseKitsudenQuery).not.toHaveBeenCalled();
  });

  it("las columnas secretas no salen", async () => {
    const r = await post(ADMIN, "/query/widgets", {});
    expect(r.status).toBe(200);
    const texto = await r.text();
    expect(texto).toContain("uno");
    expect(texto).not.toContain("TOKEN-VIVO");
  });

  it("ni se filtra, ni se ordena, ni se selecciona por una columna secreta", async () => {
    for (const cuerpo of [
      { where: { apiToken: { eq: "x" } } },
      { where: { OR: [{ name: { eq: "a" } }, { NOT: { apiToken: { startsWith: "T" } } }] } },
      { orderBy: [{ field: "apiToken" }] },
      { select: ["id", "apiToken"] },
    ]) {
      const r = await post(ADMIN, "/query/widgets", cuerpo);
      expect(r.status, JSON.stringify(cuerpo)).toBe(400);
    }
    expect(motor.parseKitsudenQuery).not.toHaveBeenCalled();
  });

  it("un expand hacia una tabla prohibida se rechaza", () => {
    expect(problemaDeConsultaNativa(esquemaReal.agentIdentities as never, { expand: ["apiKeys"] })).toMatch(/expanded/);
    expect(problemaDeConsultaNativa(esquemaReal.agentIdentities as never, { expand: ["traces"] })).toBeNull();
  });

  it("validate-query tampoco resuelve tablas prohibidas", async () => {
    expect((await post(ADMIN, "/validate-query/authAccounts", {})).status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("F11: el documento OpenAPI solo describe lo que quien pregunta puede leer", () => {
  const DATASETS = [
    { id: "a", name: "Público", slug: "publico", description: null, schema: [], policyJson: { readAccess: "public" } },
    { id: "b", name: "Con sesión", slug: "consesion", description: null, schema: [], policyJson: { readAccess: "authenticated" } },
    { id: "c", name: "Interno", slug: "interno", description: null, schema: [], policyJson: { readAccess: "admin" } },
    { id: "d", name: "Sin política", slug: "sinpolitica", description: null, schema: [], policyJson: null },
  ];
  const slugs = async (usuario?: Record<string, unknown> | null) => {
    estado.filas = DATASETS;
    const spec = await generateOpenAPISpec([], usuario === undefined ? {} : { usuario: usuario as never });
    return Object.keys(spec.components!.schemas!)
      .filter((k) => k.startsWith("Dataset_"))
      .map((k) => k.slice("Dataset_".length))
      .sort();
  };

  it("anónimo: solo los públicos (también sin pasar identidad)", async () => {
    expect(await slugs()).toEqual(["publico"]);
    expect(await slugs(null)).toEqual(["publico"]);
  });

  it("con sesión: públicos y `authenticated`", async () => {
    expect(await slugs({ id: "u", role: "user" })).toEqual(["consesion", "publico"]);
  });

  it("el equipo los ve todos", async () => {
    expect(await slugs({ id: "u", role: "admin" })).toEqual(["consesion", "interno", "publico", "sinpolitica"]);
  });

  it("las rutas /items/<slug> siguen el mismo filtro", async () => {
    estado.filas = DATASETS;
    const spec = await generateOpenAPISpec([], {});
    expect(spec.paths!["/items/publico"]).toBeDefined();
    expect(spec.paths!["/items/interno"]).toBeUndefined();
  });

  it("los scopes por dataset de un agente deciden primero", () => {
    const agente = { id: "ag", role: "agent", scopes: ["admin", "!datasets:interno:*"] };
    expect(datasetVisibleEnDocs({ slug: "interno", policyJson: { readAccess: "public" } }, agente as never)).toBe(false);
    const concedido = { id: "ag", role: "agent", scopes: ["datasets:interno:read"] };
    expect(datasetVisibleEnDocs({ slug: "interno", policyJson: { readAccess: "admin" } }, concedido as never)).toBe(true);
  });
});
