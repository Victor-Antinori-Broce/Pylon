/**
 * Sandbox: la API inyectada actúa con la identidad de quien ejecuta, y no más
 * ============================================================================
 *
 * Contra la app REAL (Postgres de pruebas). El código de una acción solo llega
 * a Kitsuden por `kitsuden.api.*`, y cada llamada vuelve a entrar por la app
 * como un agente (ver lib/sandbox/identidad.ts). Aquí se intenta, desde el
 * código, conseguir MÁS de lo concedido:
 *
 *   · sin scopes declarados no hay API;
 *   · con `datasets:<slug>:read` se lee ese dataset, pero no otro, ni se
 *     escribe, ni se llega a lo de admin (crear agentes, claves);
 *   · cabeceras y cookies que el código intente pasar no cambian quién es;
 *   · un agente que ejecuta la acción no gana scopes que no tiene y conserva
 *     sus denegaciones `!patrón`;
 *   · por cron/evento responde quien CREÓ la acción, con su rol de AHORA: si
 *     ya no es admin, el código se queda sin API.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq, sql } from "drizzle-orm";

import { db } from "../db";
import { actions, authUsers, dataEntries, dataSets } from "../db/schema";
import { app } from "../index";
import { executeActionById } from "../lib/actions";
import { createAgent } from "../services/agent-auth";

import { entrarComo, generateTestId, isDatabaseAvailable } from "./setup";

let dbAvailable = false;
const ORIGEN = "http://localhost:4321";
let cookie = "";
let adminId = "";
let propio: { id: string; slug: string };
let ajeno: { id: string; slug: string };
const creadas: string[] = [];

async function crearDataset(prefijo: string) {
  const slug = `${prefijo}-${generateTestId()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const [ds] = await db
    .insert(dataSets)
    .values({ name: slug, slug, schema: [{ key: "n", type: "text" }], policyJson: null } as never)
    .returning({ id: dataSets.id, slug: dataSets.slug });
  await db.insert(dataEntries).values({ dataSetId: ds!.id, title: "fila", data: { n: "1" } } as never);
  return ds!;
}

async function pedir(auth: { cookie?: string; token?: string }, metodo: string, camino: string, cuerpo?: unknown) {
  const headers: Record<string, string> = { origin: ORIGEN, "Content-Type": "application/json" };
  if (auth.cookie) headers.Cookie = auth.cookie;
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  return app.request(
    new Request(`http://localhost:3000${camino}`, {
      method: metodo,
      headers,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    })
  );
}

/** Crea una acción de código y la ejecuta; devuelve lo que devolvió el código. */
async function ejecutar(
  auth: { cookie?: string; token?: string },
  code: string,
  scopes?: string[]
): Promise<{ success: boolean; result: unknown; error?: string }> {
  const slug = `sbx-${generateTestId()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  // La crea siempre una persona: desde la fase I un agente no crea código fuera
  // de la promoción (docs/agents/promotion.md). La ejecuta `auth`.
  const alta = await pedir({ cookie }, "POST", "/api/actions", {
    name: slug,
    slug,
    type: "code",
    trigger: "manual",
    config: { code, scopes, timeoutMs: 30_000 },
  });
  expect(alta.status, await alta.clone().text()).toBe(201);
  const { id } = (await alta.json()) as { id: string };
  creadas.push(id);
  const r = await pedir(auth, "POST", `/api/actions/${id}/execute`, {});
  expect(r.status).toBe(200);
  return (await r.json()) as { success: boolean; result: unknown; error?: string };
}

const estados = (caminos: [string, string, unknown?][]) => `
  const salida = {};
  for (const [m, c, b] of ${JSON.stringify(caminos)}) salida[m + " " + c.split("?")[0]] = (await kitsuden.api.request(m, c, b)).status;
  return salida;
`;

describe("sandbox — identidad de kitsuden.api", () => {
  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (!dbAvailable) return;
    ({ cookie, userId: adminId } = await entrarComo(app, {
      email: `sbx-${generateTestId()}@example.com`,
      password: "TestPassword123!",
      name: "Sandbox Admin",
      role: "admin",
    }));
    propio = await crearDataset("sbx-propio");
    ajeno = await crearDataset("sbx-ajeno");
  }, 60_000);

  afterAll(async () => {
    if (!dbAvailable) return;
    for (const id of creadas) await db.delete(actions).where(eq(actions.id, id));
    for (const ds of [propio, ajeno]) if (ds) await db.delete(dataSets).where(eq(dataSets.id, ds.id));
  });

  it("sin scopes declarados, el código no tiene API", async () => {
    if (!dbAvailable) return;
    const r = await ejecutar({ cookie }, "return (await kitsuden.api.get('/api/data-sets')).status;");
    expect(r.success).toBe(false);
    expect(r.error).toContain("no Kitsuden API identity");
  }, 60_000);

  it("persona admin + datasets:<slug>:read: lee ESE dataset y nada más", async () => {
    if (!dbAvailable) return;
    const r = await ejecutar(
      { cookie },
      estados([
        ["GET", `/api/datasets/${propio.id}/entries`],
        ["GET", `/api/datasets/${ajeno.id}/entries`],
        ["POST", `/api/datasets/${propio.id}/entries`, { title: "x", data: { n: "2" } }],
        ["GET", "/api/admin/agents"],
        ["POST", "/api/admin/agents", { name: "creado-desde-el-sandbox", scopes: ["admin"] }],
        ["GET", "/api/keys"],
        ["PATCH", "/api/settings", { siteName: "pwned" }],
      ]),
      [`datasets:${propio.slug}:read`]
    );
    expect(r.error ?? null).toBeNull();
    const s = r.result as Record<string, number>;
    expect(s[`GET /api/datasets/${propio.id}/entries`]).toBe(200);
    expect([403, 404]).toContain(s[`GET /api/datasets/${ajeno.id}/entries`]);
    expect([401, 403, 404]).toContain(s[`POST /api/datasets/${propio.id}/entries`]);
    for (const k of ["GET /api/admin/agents", "POST /api/admin/agents", "GET /api/keys", "PATCH /api/settings"]) {
      // 401/403, no 404: la ruta existe y la puerta la cierra.
      expect([401, 403]).toContain(s[k]);
    }
    // Y no se creó ningún agente desde el código.
    const [creado] = await db.execute(
      sql`SELECT count(*)::int AS n FROM agent_identities WHERE name = 'creado-desde-el-sandbox'`
    ).then((x) => (Array.isArray(x) ? x : ((x as { rows: unknown[] }).rows ?? [])) as { n: number }[]);
    expect(creado?.n ?? 0).toBe(0);
  }, 60_000);

  it("cabeceras y cookies pasadas por el código no cambian la identidad", async () => {
    if (!dbAvailable) return;
    // La API inyectada no acepta cabeceras; aunque el código las meta en el
    // cuerpo o en la consulta, quien llega es el agente sintético.
    const r = await ejecutar(
      { cookie },
      `
      const a = await kitsuden.api.request("GET", "/api/admin/agents", { headers: { Cookie: env.C, Authorization: "Bearer x" } });
      const b = await kitsuden.api.request("GET", "/api/admin/agents?Authorization=Bearer%20x");
      const c = await fetch("http://localhost:3000/api/admin/agents").then((r) => r.status, (e) => "fetch-rechazado");
      return [a.status, b.status, c];
      `,
      [`datasets:${propio.slug}:read`]
    );
    const [a, b, c] = r.result as [number, number, string];
    expect([401, 403]).toContain(a);
    expect([401, 403]).toContain(b);
    expect(c).toBe("fetch-rechazado");
  }, 60_000);

  it("un agente que ejecuta no gana scopes que no tiene y conserva sus denegaciones", async () => {
    if (!dbAvailable) return;
    const { plainApiKey } = await createAgent({
      name: `sbx-agente-${generateTestId()}`,
      scopes: ["admin", `!datasets:${ajeno.slug}:*`],
      rateLimit: 100_000,
    });
    const r = await ejecutar(
      { token: plainApiKey },
      estados([
        ["GET", `/api/datasets/${propio.id}/entries`],
        ["GET", `/api/datasets/${ajeno.id}/entries`],
        ["GET", "/api/admin/agents"],
      ]),
      ["admin", "superpoder:inventado"]
    );
    expect(r.error ?? null).toBeNull();
    const s = r.result as Record<string, number>;
    expect(s[`GET /api/datasets/${propio.id}/entries`]).toBe(200);
    // Control: ES el agente (admin), no una identidad recortada por error.
    expect(s["GET /api/admin/agents"]).toBe(200);
    // La denegación del agente viaja con él al sandbox.
    expect([403, 404]).toContain(s[`GET /api/datasets/${ajeno.id}/entries`]);
  }, 60_000);

  it("por cron/evento responde quien creó la acción, con su rol de AHORA", async () => {
    if (!dbAvailable) return;
    const slug = `sbx-cron-${generateTestId()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const alta = await pedir({ cookie }, "POST", "/api/actions", {
      name: slug,
      slug,
      type: "code",
      trigger: "manual",
      config: { code: `return (await kitsuden.api.get("/api/datasets/${propio.id}/entries")).status;`, scopes: [`datasets:${propio.slug}:read`] },
    });
    const { id, createdById } = (await alta.json()) as { id: string; createdById: string };
    creadas.push(id);
    expect(createdById).toBe(adminId);

    const comoAdmin = await executeActionById(id, { trigger: "cron", triggerEvent: "cron" });
    expect(comoAdmin.result).toBe(200);

    await db.update(authUsers).set({ role: "user" }).where(eq(authUsers.id, adminId));
    try {
      const degradado = await executeActionById(id, { trigger: "cron", triggerEvent: "cron" });
      expect(degradado.success).toBe(false);
      expect(degradado.error).toContain("no Kitsuden API identity");
    } finally {
      await db.update(authUsers).set({ role: "admin" }).where(eq(authUsers.id, adminId));
    }
  }, 60_000);
});
