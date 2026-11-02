/**
 * RLS por petición: BEGIN + contexto en una sola ida y vuelta, sin inyección
 * ============================================================================
 *
 * Rendimiento, 2026-10-27: la transacción perezosa guardaba `begin` y los
 * `set_config` del contexto y los mandaba uno a uno (2–3 viajes a Postgres
 * antes de la primera consulta). Ahora van juntos en una consulta simple con
 * los valores como literales escapados por el driver. Esto comprueba:
 *   · que solo se juntan las formas conocidas (otra sentencia → una a una);
 *   · que un valor con comillas, barras o `;` queda DENTRO del literal;
 *   · que sin `escapeLiteral` (otro driver) no se junta nada.
 */

import pg from "pg";
import { describe, expect, it } from "vitest";

import { diferidasEnUnaSentencia } from "../../packages/engine/src/rls-peticion";

// El `escapeLiteral` de verdad de node-postgres (no necesita conexión)
const cliente = { escapeLiteral: pg.Client.prototype.escapeLiteral };

const CONTEXTO = "SELECT set_config('app.current_user_id', $1, true), set_config('app.current_user_role', $2, true)";
const SCOPES = "SELECT set_config('app.agent_scopes', $1, true)";

describe("diferidasEnUnaSentencia", () => {
  it("junta begin + contexto (forma de Drizzle: objeto con text y values)", () => {
    const juntas = diferidasEnUnaSentencia(
      [[{ text: "begin", values: [] }], [{ text: CONTEXTO, values: ["u-1", "admin"] }]],
      cliente
    );
    expect(juntas).toBe(
      "begin; SELECT set_config('app.current_user_id', 'u-1', true), set_config('app.current_user_role', 'admin', true)"
    );
  });

  it("forma real de Drizzle node-postgres: query({ name, text, types }, params)", () => {
    const tipos = { getTypeParser: () => (v: unknown) => v };
    const juntas = diferidasEnUnaSentencia(
      [
        [{ name: undefined, text: "begin", types: tipos }, []],
        [{ name: undefined, text: CONTEXTO, types: tipos }, ["", "anonymous"]],
      ],
      cliente
    );
    expect(juntas).toBe(
      "begin; SELECT set_config('app.current_user_id', '', true), set_config('app.current_user_role', 'anonymous', true)"
    );
  });

  it("junta también los scopes del agente", () => {
    const juntas = diferidasEnUnaSentencia(
      [["begin"], [CONTEXTO, ["a-1", "agent"]], [SCOPES, ["mcp:read,datasets:*:read"]]],
      cliente
    );
    expect(juntas).toContain("set_config('app.agent_scopes', 'mcp:read,datasets:*:read', true)");
    expect(juntas?.split("; ")).toHaveLength(3);
  });

  it("un valor hostil se queda dentro del literal", () => {
    const hostil = "x', true); DROP TABLE data_entries; --\\";
    const juntas = diferidasEnUnaSentencia([["begin"], [CONTEXTO, [hostil, "user"]]], cliente);
    // escapeLiteral dobla la comilla y, con barra, usa E'...' con la barra doblada
    expect(juntas).toContain(`E'x'', true); DROP TABLE data_entries; --\\\\'`);
    // Fuera de los literales solo quedan las dos sentencias esperadas
    // (escapeLiteral pone « E'…'» con un espacio delante cuando hay barras)
    const sinLiterales = juntas!.replace(/E?'(?:[^']|'')*'/g, "''").replace(/\s+/g, " ");
    expect(sinLiterales).toBe(
      "begin; SELECT set_config('', '', true), set_config('', '', true)"
    );
  });

  it("cualquier otra sentencia, valores que no son texto u otro driver → una a una (null)", () => {
    expect(diferidasEnUnaSentencia([["begin"], ["select * from users where id = $1", ["x"]]], cliente)).toBeNull();
    expect(diferidasEnUnaSentencia([["begin isolation level serializable"], [CONTEXTO, ["a", "b"]]], cliente)).toBeNull();
    expect(diferidasEnUnaSentencia([["begin"], [CONTEXTO, ["a", 7]]], cliente)).toBeNull();
    expect(diferidasEnUnaSentencia([["begin"], [CONTEXTO, ["a"]]], cliente)).toBeNull();
    expect(diferidasEnUnaSentencia([["begin"], [CONTEXTO, ["a", "b"]]], {})).toBeNull();
    expect(diferidasEnUnaSentencia([[{ text: "begin", rowMode: "array" }], [CONTEXTO, ["a", "b"]]], cliente)).toBeNull();
    expect(diferidasEnUnaSentencia([["begin"]], cliente)).toBeNull();
  });
});
