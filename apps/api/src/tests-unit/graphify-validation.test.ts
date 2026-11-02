/**
 * Tests unitarios del Engine Graphify (validaciones puras — NO requiere PostgreSQL).
 * resolveRelation/listRows/getRelatedRows se validan en integración (test:all).
 */
import { describe, it, expect } from "bun:test";

import { isTableExposed, GraphifyError } from "../services/graphify";

describe("Graphify — deny-list de tablas sensibles", () => {
  it("expone tablas de negocio", () => {
    expect(isTableExposed("modules")).toBe(true);
    expect(isTableExposed("data_entries")).toBe(true);
    expect(isTableExposed("games")).toBe(true);
    expect(isTableExposed("vault_proyectos")).toBe(true); // colecciones Vault sí
  });

  it("bloquea tablas de autenticación", () => {
    expect(isTableExposed("auth_users")).toBe(false);
    expect(isTableExposed("auth_sessions")).toBe(false);
    expect(isTableExposed("auth_accounts")).toBe(false);
    expect(isTableExposed("auth_verifications")).toBe(false);
  });

  it("bloquea credenciales y secrets", () => {
    expect(isTableExposed("api_keys")).toBe(false);
    expect(isTableExposed("kitsuden_secrets")).toBe(false);
    expect(isTableExposed("agent_tokens")).toBe(false);
    expect(isTableExposed("agent_api_keys")).toBe(false);
  });

  it("bloquea prefijos de sistema", () => {
    expect(isTableExposed("pg_stat_activity")).toBe(false);
    expect(isTableExposed("drizzle_migrations")).toBe(false);
    expect(isTableExposed("_internal")).toBe(false);
    expect(isTableExposed("auth_anything_new")).toBe(false); // prefijo cubre futuras
  });
});

describe("Graphify — GraphifyError", () => {
  it("transporta status HTTP", () => {
    const err = new GraphifyError(403, "not exposed");
    expect(err.status).toBe(403);
    expect(err.message).toBe("not exposed");
    expect(err.name).toBe("GraphifyError");
    expect(err).toBeInstanceOf(Error);
  });
});
