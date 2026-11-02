/**
 * Los intentos fallidos de autenticación de agentes SE AUDITAN (auditoría
 * 2026-10-18).
 *
 * Con una clave inexistente o mal formada, `authenticateAgent` escribía en
 * `agent_audit_logs` con `agent_id = 'unknown'`: violación de FK (23503), el
 * INSERT fallaba, el log decía "Failed to write agent audit log" y el intento
 * no quedaba registrado. Aquí se usa SQL real (PGlite) con la DDL real de la
 * tabla (migración 0037) más la 0044, y el código real de auditoría.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const MIGRACIONES = resolve(__dirname, "../../apps/api/src/db/migrations");

const pg = new PGlite();
const baseDePrueba = drizzle(pg);
const errores: unknown[] = [];

vi.mock("../../apps/api/src/db", () => ({ db: baseDePrueba }));
vi.mock("../../apps/api/src/lib/logger", () => ({
  logger: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (...args: unknown[]) => errores.push(args),
  },
}));
vi.mock("../../apps/api/src/services/agent-webhooks", () => ({
  notifyAuthSuccess: () => {},
  notifyAuthFailure: () => {},
  notifyRateLimited: () => {},
  notifyPermissionDenied: () => {},
}));

const { logAuthFailure } = await import("../../apps/api/src/services/agent-audit");
const { authenticateAgent } = await import("../../apps/api/src/services/agent-auth");

/** El CREATE TABLE de agent_audit_logs tal cual está en la 0037. */
function ddlDeLaAuditoria(): string {
  const sql = readFileSync(
    resolve(MIGRACIONES, "0037_tablas_declaradas_sin_migracion.sql"),
    "utf8"
  );
  const bloque = sql.match(/CREATE TABLE IF NOT EXISTS agent_audit_logs \([\s\S]*?\n\);/)?.[0];
  if (!bloque) throw new Error("No encuentro la DDL de agent_audit_logs en la 0037");
  return bloque;
}

type Fila = {
  agent_id: string | null;
  action: string;
  success: boolean;
  error_message: string;
  details: unknown;
};

async function filas(): Promise<Fila[]> {
  const r = await pg.query<Fila>(
    "SELECT agent_id, action, success, error_message, details FROM agent_audit_logs ORDER BY created_at"
  );
  return r.rows;
}

/** La escritura es en segundo plano: esperar a que aparezca (o a que falle). */
async function esperarFilas(n: number): Promise<Fila[]> {
  for (let i = 0; i < 100; i++) {
    const f = await filas();
    if (f.length >= n || errores.length > 0) return f;
    await new Promise((r) => setTimeout(r, 10));
  }
  return filas();
}

beforeAll(async () => {
  // Lo mínimo de agent_identities para la FK, y la tabla real.
  await pg.exec(`CREATE TABLE agent_identities (id text PRIMARY KEY);`);
  await pg.exec(ddlDeLaAuditoria());
  await pg.exec(
    readFileSync(resolve(MIGRACIONES, "0044_auditoria_de_agentes_sin_agente.sql"), "utf8")
  );
  await pg.exec(`INSERT INTO agent_identities (id) VALUES ('agente-real');`);
});

afterAll(async () => {
  await pg.close();
});

beforeEach(async () => {
  errores.length = 0;
  await pg.exec("DELETE FROM agent_audit_logs");
});

describe("fallos de autenticación sin agente conocido", () => {
  it("una clave mal formada queda auditada con agent_id NULL", async () => {
    const r = await authenticateAgent("esto-no-es-una-clave", { ipAddress: "203.0.113.5" });
    expect(r.success).toBe(false);

    const f = await esperarFilas(1);
    expect(errores).toEqual([]);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({
      agent_id: null,
      action: "auth_failure",
      success: false,
      error_message: "Invalid API key format",
    });
  });

  it("logAuthFailure(null, …) escribe; guarda el id público de la clave, no el secreto", async () => {
    logAuthFailure(null, "Invalid or expired API key", "198.51.100.7", "curl", {
      attemptedKeyId: "0123456789abcdef",
    });
    const f = await esperarFilas(1);
    expect(errores).toEqual([]);
    expect(f[0]?.agent_id).toBeNull();
    expect(f[0]?.details).toEqual({ attemptedKeyId: "0123456789abcdef" });
  });

  it("un fallo de un agente que SÍ existe sigue a su nombre", async () => {
    logAuthFailure("agente-real", "Agent is deactivated");
    const f = await esperarFilas(1);
    expect(errores).toEqual([]);
    expect(f[0]?.agent_id).toBe("agente-real");
  });

  it("la FK sigue en pie: un id inexistente no se cuela", async () => {
    await expect(
      pg.query(
        "INSERT INTO agent_audit_logs (agent_id, action, success) VALUES ('unknown', 'auth_failure', false)"
      )
    ).rejects.toMatchObject({ code: "23503" });
  });
});

describe("el código ya no escribe 'unknown'", () => {
  it("authenticateAgent no pasa la cadena 'unknown' a logAuthFailure", () => {
    const fuente = readFileSync(
      resolve(__dirname, "../../apps/api/src/services/agent-auth.ts"),
      "utf8"
    );
    expect(fuente).not.toMatch(/logAuthFailure\(\s*"unknown"/);
  });
});
