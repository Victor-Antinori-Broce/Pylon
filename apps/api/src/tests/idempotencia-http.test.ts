/**
 * Idempotency-Key y problem+json contra la app REAL (index.ts)
 * ============================================================================
 *
 * Las reglas finas (concurrencia, caducidad, Valkey caído, secretos) se
 * prueban en tests/unit/idempotencia.test.ts con almacenes controlados. Aquí
 * se comprueba que el montaje de verdad —orden de middlewares, autenticación,
 * Valkey o la tabla de respaldo— hace lo mismo con rutas reales:
 *
 *   - POST /api/data-sets con la misma clave dos veces → un solo dataset;
 *   - POST /api/keys (devuelve el token en claro) → el reintento NO repite el
 *     secreto: 409 NOT_REPLAYABLE, y se creó una sola clave;
 *   - errores reales (404 de ruta, 401 del panel) en problem+json con `error`.
 *
 * Si no hay almacén (Valkey caído y el rol sin permiso para crear la tabla),
 * la API responde 503 sin ejecutar: se comprueba también ese camino.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { sql } from "drizzle-orm";

import { db } from "../db";
import { app } from "../index";

import { isDatabaseAvailable, generateTestId, entrarComo } from "./setup";

let dbAvailable = false;
let cookie = "";

function req(ruta: string, init: RequestInit = {}, extra: Record<string, string> = {}): Request {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("Cookie", cookie);
  if (init.body) headers.set("Content-Type", "application/json");
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Request(`http://localhost:3000${ruta}`, { ...init, headers });
}

/** Número de la primera fila de un `count(*)::int AS n` (node-postgres o PGlite). */
async function contar(consulta: ReturnType<typeof sql>): Promise<number> {
  const res = (await db.execute(consulta)) as unknown as { rows?: Array<{ n: number }> };
  return (res.rows ?? (res as unknown as Array<{ n: number }>))[0]!.n;
}

/** Con almacén, se ejecuta una vez; sin almacén (503 fail-closed), ninguna. */
async function almacenDisponible(res: Response): Promise<boolean> {
  if (res.status !== 503) return true;
  const p = (await res.clone().json()) as { code?: string };
  expect(p.code).toBe("KITSUDEN_E_IDEMPOTENCY_UNAVAILABLE");
  return false;
}

describe("Idempotency-Key en la app real", () => {
  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (!dbAvailable) return;
    ({ cookie } = await entrarComo(app, {
      email: `idem-admin-${generateTestId()}@example.com`,
      password: "TestPassword123!",
      name: "Idem Admin",
      role: "admin",
    }));
  });

  it("POST /api/data-sets repetido: un solo dataset y la misma respuesta", async () => {
    if (!dbAvailable) return;
    const slug = `idem-${generateTestId()}`;
    const cuerpo = JSON.stringify({
      name: `Idem ${slug}`,
      slug,
      schema: { fields: [{ id: "f1", key: "title", type: "text", label: "Title" }], version: "2.0" },
    });
    const clave = { "Idempotency-Key": `crear-${slug}` };

    const r1 = await app.request(req("/api/data-sets", { method: "POST", body: cuerpo }, clave));
    if (!(await almacenDisponible(r1))) {
      expect(await contar(sql`SELECT count(*)::int AS n FROM data_sets WHERE slug = ${slug}`)).toBe(0);
      return;
    }
    const r2 = await app.request(req("/api/data-sets", { method: "POST", body: cuerpo }, clave));

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r2.headers.get("idempotent-replayed")).toBe("true");
    expect(await r2.json()).toEqual(await r1.json());

    expect(await contar(sql`SELECT count(*)::int AS n FROM data_sets WHERE slug = ${slug}`)).toBe(1);

    // Misma clave, otro cuerpo → 422 en problem+json
    const r3 = await app.request(
      req("/api/data-sets", { method: "POST", body: cuerpo.replace("Idem", "Otro") }, clave)
    );
    expect(r3.status).toBe(422);
    expect(r3.headers.get("content-type")).toContain("application/problem+json");
    expect(((await r3.json()) as { code: string }).code).toBe("KITSUDEN_E_IDEMPOTENCY_KEY_REUSED");
  });

  it("POST /api/keys: el token no se guarda ni se repite; una sola clave creada", async () => {
    if (!dbAvailable) return;
    const nombre = `Idem key ${generateTestId()}`;
    const clave = { "Idempotency-Key": `clave-${generateTestId()}` };
    const cuerpo = JSON.stringify({ name: nombre });

    const r1 = await app.request(req("/api/keys", { method: "POST", body: cuerpo }, clave));
    if (!(await almacenDisponible(r1))) return;
    expect(r1.status).toBe(201);
    expect(((await r1.json()) as { token: string }).token).toMatch(/^kitsuden_agent_/);

    const r2 = await app.request(req("/api/keys", { method: "POST", body: cuerpo }, clave));
    expect(r2.status).toBe(409);
    const p = (await r2.json()) as { code: string; token?: string };
    expect(p.code).toBe("KITSUDEN_E_IDEMPOTENCY_NOT_REPLAYABLE");
    expect(JSON.stringify(p)).not.toContain("kitsuden_agent_");

    expect(
      await contar(sql`SELECT count(*)::int AS n FROM agent_identities WHERE name = ${nombre}`)
    ).toBe(1);
  });

  it("clave mal formada → 422 KITSUDEN_E_IDEMPOTENCY_KEY_INVALID", async () => {
    if (!dbAvailable) return;
    const r = await app.request(
      req("/api/data-sets", { method: "POST", body: "{}" }, { "Idempotency-Key": "corta" })
    );
    expect(r.status).toBe(422);
    expect(((await r.json()) as { code: string }).code).toBe("KITSUDEN_E_IDEMPOTENCY_KEY_INVALID");
  });
});

describe("problem+json en rutas reales", () => {
  it("ruta inexistente → 404 con didYouMean, code y `error`", async () => {
    const res = await app.request(new Request("http://localhost:3000/api/data-setz"));
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    const p = (await res.json()) as Record<string, unknown>;
    expect(p).toMatchObject({ error: "Not found", code: "KITSUDEN_E_NOT_FOUND", status: 404, retryable: false });
    expect(Array.isArray(p.didYouMean)).toBe(true);
    expect(String(p.docs)).toContain("errors-and-retries.md#kitsuden_e_not_found");
  });

  it("panel sin sesión → 401 UNAUTHENTICATED", async () => {
    const res = await app.request(new Request("http://localhost:3000/api/admin/agents"));
    expect(res.status).toBe(401);
    const p = (await res.json()) as Record<string, unknown>;
    expect(p.code).toBe("KITSUDEN_E_UNAUTHENTICATED");
    expect(p.error).toBeDefined();
  });

  it("clave de agente inválida → 401 con el motivo antiguo en legacy_code", async () => {
    const res = await app.request(
      new Request("http://localhost:3000/api/data-sets", {
        headers: { Authorization: "Bearer kitsuden_agent_noexiste0000000000000000" },
      })
    );
    expect(res.status).toBe(401);
    const p = (await res.json()) as Record<string, unknown>;
    expect(p.code).toBe("KITSUDEN_E_UNAUTHENTICATED");
    expect(typeof p.legacy_code).toBe("string");
  });
});
