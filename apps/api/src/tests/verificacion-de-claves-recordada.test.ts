/**
 * Claves de agente: recordar el argon2 no abre nada que antes estuviera cerrado
 * ============================================================================
 *
 * Rendimiento, 2026-10-27: una verificación argon2 que salió bien se recuerda
 * (HMAC del secreto con una clave del proceso, atado al hash guardado). Contra
 * la base de pruebas de verdad, con argon2 de verdad:
 *   · la misma clave sigue entrando (y la segunda vez sin argon2);
 *   · un secreto equivocado para el MISMO id público sigue fuera, aunque el
 *     bueno esté recordado, y no borra lo recordado;
 *   · revocar, caducar o desactivar cortan en la petición siguiente;
 *   · un hash rotado en la fila no reutiliza lo recordado.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";

const { isDatabaseAvailable, clearTestData, generateTestId } = await import("./setup");

let dbAvailable = false;

describe("verificación de claves recordada", () => {
  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (dbAvailable) await clearTestData();
  });
  afterAll(async () => {
    if (dbAvailable) await clearTestData();
  });

  it("entra con la clave buena, y no con un secreto cambiado aunque la buena esté recordada", async () => {
    if (!dbAvailable) return;
    const { createAgent, authenticateAgent, olvidarVerificacionesDeClaves, parseAgentApiKey } = await import(
      "../services/agent-auth"
    );
    olvidarVerificacionesDeClaves();
    const { plainApiKey } = await createAgent({ name: `recordada-${generateTestId()}`, scopes: ["mcp:connect"] });

    const t0 = performance.now();
    expect((await authenticateAgent(plainApiKey)).success).toBe(true);
    const primera = performance.now() - t0;
    const t1 = performance.now();
    expect((await authenticateAgent(plainApiKey)).success).toBe(true);
    const segunda = performance.now() - t1;
    // La segunda no paga argon2 (~30 ms): no se mide el tiempo exacto, solo
    // que no es más lenta que la primera
    expect(segunda).toBeLessThanOrEqual(primera + 5);

    const p = parseAgentApiKey(plainApiKey)!;
    const ultima = p.secret.at(-1) === "A" ? "B" : "A";
    const cambiada = plainApiKey.slice(0, -1) + ultima;
    const mala = await authenticateAgent(cambiada);
    expect(mala.success).toBe(false);
    expect(mala.code).toBe("INVALID_KEY");

    // El intento malo no borró lo recordado ni lo estropeó
    expect((await authenticateAgent(plainApiKey)).success).toBe(true);
  });

  it("revocar, caducar y desactivar cortan en la petición siguiente aunque esté recordada", async () => {
    if (!dbAvailable) return;
    const { db } = await import("../db");
    const { agentApiKeys, agentIdentities } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");
    const { createAgent, authenticateAgent, revokeApiKey } = await import("../services/agent-auth");

    // Revocada
    const a = await createAgent({ name: `revocada-${generateTestId()}`, scopes: ["mcp:connect"] });
    const okA = await authenticateAgent(a.plainApiKey);
    expect(okA.success).toBe(true);
    await revokeApiKey(okA.context!.keyId);
    const trasRevocar = await authenticateAgent(a.plainApiKey);
    expect(trasRevocar.success).toBe(false);
    expect(trasRevocar.code).toBe("KEY_REVOKED");

    // Caducada
    const b = await createAgent({ name: `caducada-${generateTestId()}`, scopes: ["mcp:connect"] });
    const okB = await authenticateAgent(b.plainApiKey);
    expect(okB.success).toBe(true);
    await db.update(agentApiKeys).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(agentApiKeys.id, okB.context!.keyId));
    expect((await authenticateAgent(b.plainApiKey)).success).toBe(false);

    // Agente desactivado
    const c = await createAgent({ name: `desactivado-${generateTestId()}`, scopes: ["mcp:connect"] });
    expect((await authenticateAgent(c.plainApiKey)).success).toBe(true);
    await db.update(agentIdentities).set({ isActive: false }).where(eq(agentIdentities.id, c.agent.id));
    const trasDesactivar = await authenticateAgent(c.plainApiKey);
    expect(trasDesactivar.success).toBe(false);
    expect(trasDesactivar.code).toBe("AGENT_DEACTIVATED");
  });

  it("un hash rotado en la fila obliga a verificar otra vez (y el secreto viejo ya no entra)", async () => {
    if (!dbAvailable) return;
    const { db } = await import("../db");
    const { agentApiKeys } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");
    const { hash } = await import("@node-rs/argon2");
    const { createAgent, authenticateAgent } = await import("../services/agent-auth");

    const { plainApiKey } = await createAgent({ name: `rotada-${generateTestId()}`, scopes: ["mcp:connect"] });
    const ok = await authenticateAgent(plainApiKey);
    expect(ok.success).toBe(true);
    // Otro secreto en la misma fila (mismo keyId público)
    await db
      .update(agentApiKeys)
      .set({ keyHash: await hash("otro-secreto-distinto-del-recordado") })
      .where(eq(agentApiKeys.id, ok.context!.keyId));
    const tras = await authenticateAgent(plainApiKey);
    expect(tras.success).toBe(false);
    expect(tras.code).toBe("INVALID_KEY");
  });
});
