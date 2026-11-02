/**
 * El engine y la API leen los scopes con las mismas reglas
 * ============================================================================
 *
 * `hasScope` vive en la API (`services/agent-auth.ts`) y decide si un agente
 * puede usar una herramienta. `scopeConcede` vive en el engine y decide si un
 * scope concede una acción de una policy. Tienen que estar escritas dos veces
 * porque el engine no puede importar de la app.
 *
 * Dos copias de una regla de seguridad son la receta para que una se quede
 * atrás: el día que alguien añada un comodín a una y no a la otra, un agente
 * podrá hacer desde una puerta lo que la otra le niega. Esta prueba pasa la
 * misma tabla de casos por las dos.
 */

import { describe, expect, it, vi } from "vitest";

import { scopeConcede } from "@kitsuden/engine";

// `agent-auth.ts` importa la base de datos y la auditoría al cargar. Aquí solo
// interesa la función pura, así que se sustituyen por módulos vacíos.
vi.mock("../../apps/api/src/db", () => ({ db: {} }));
vi.mock("../../apps/api/src/services/agent-audit", () => ({
  logAuthSuccess: () => undefined,
  logAuthFailure: () => undefined,
  logRateLimited: () => undefined,
  logAgentAction: () => undefined,
}));

import { hasScope } from "../../apps/api/src/services/agent-auth";

const CASOS: [scopes: string[], requerido: string][] = [
  [["esports:manage"], "esports:manage"],
  [["esports:manage"], "esports:view"],
  [["esports:*"], "esports:view"],
  [["esports:*"], "tierlist:view"],
  [["*:view"], "esports:view"],
  [["*:view"], "esports:manage"],
  [["admin:*"], "lo:que-sea"],
  [["admin"], "lo:que-sea"],
  [[], "esports:manage"],
  [["read:*"], "read:users"],
  [["read:*"], "write:users"],
  [["esports"], "esports:manage"],
  [["esports:man"], "esports:manage"],
  [["gate:access-admin"], "gate:access-admin"],
  // Fase E: comodín en medio y denegaciones (las dos leen la regla de shared)
  [["datasets:*:read"], "datasets:clientes:read"],
  [["datasets:*:read"], "datasets:clientes:write"],
  [["admin", "!esports:manage"], "esports:manage"],
  [["esports:*", "!esports:manage"], "esports:view"],
  [["*:*"], "lo:que-sea"],
];

describe("mismas respuestas en el engine y en la API", () => {
  for (const [scopes, requerido] of CASOS) {
    it(`[${scopes.join(", ") || "sin scopes"}] → ${requerido}`, () => {
      const api = hasScope({ scopes } as never, requerido);
      expect(scopeConcede(scopes, requerido), "el engine y la API discrepan").toBe(api);
    });
  }
});
