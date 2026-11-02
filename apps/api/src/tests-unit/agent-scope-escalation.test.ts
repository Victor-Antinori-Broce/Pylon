/**
 * Agent Scope-Escalation Adversarial Tests
 * ============================================================================
 *
 * ADR-002 promete que "los scopes del agente se traducen a permisos y ni una
 * query mal generada ni prompt injection pueden escalar privilegios". El punto
 * de control de esa promesa es `hasScope()` (services/agent-auth.ts).
 *
 * Esta suite ataca la lógica de scopes buscando ESCALADA DE PRIVILEGIOS:
 *   - Un agente con `read:*` no debe poder ESCRIBIR.
 *   - Un agente con `*:posts` no debe tocar otros recursos.
 *   - Prefijos colisionantes (`read:` vs `readonly:`) no deben abrir la puerta.
 *   - Scopes vacíos deniegan todo.
 *   - `admin` / `admin:*` son el único super-scope (escape hatch intencional).
 *
 * Son tests puros (sin DB): se ejecutan siempre, en cualquier entorno.
 */

import { describe, it, expect } from "bun:test";

import { hasScope, hasAllScopes, hasAnyScope } from "../services/agent-auth";
import type { AgentAuthContext } from "../services/agent-auth";

/** Construye un contexto de agente mínimo con los scopes dados. */
function agent(scopes: string[]): AgentAuthContext {
  return {
    agentId: "agent-test",
    agentName: "Test Agent",
    scopes,
    rateLimit: 1000,
    writesPerDay: null,
    budgetUnitsPerDay: null,
    keyId: "key-test",
    allowedTools: [],
  };
}

describe("Agent Scope Escalation — Zero Trust", () => {
  // ── Match exacto ──────────────────────────────────────────────────────────

  describe("Match exacto", () => {
    it("concede exactamente el scope otorgado", () => {
      expect(hasScope(agent(["read:posts"]), "read:posts")).toBe(true);
    });

    it("deniega una acción distinta sobre el mismo recurso (no escalada vertical)", () => {
      const a = agent(["read:posts"]);
      expect(hasScope(a, "write:posts")).toBe(false);
      expect(hasScope(a, "delete:posts")).toBe(false);
      expect(hasScope(a, "update:posts")).toBe(false);
    });

    it("deniega el mismo verbo sobre otro recurso (no escalada horizontal)", () => {
      const a = agent(["read:posts"]);
      expect(hasScope(a, "read:secrets")).toBe(false);
      expect(hasScope(a, "read:users")).toBe(false);
    });
  });

  // ── Wildcard de recurso (verbo:*) ─────────────────────────────────────────

  describe("Wildcard de recurso (read:*)", () => {
    const a = agent(["read:*"]);

    it("concede lectura de cualquier recurso", () => {
      expect(hasScope(a, "read:posts")).toBe(true);
      expect(hasScope(a, "read:users")).toBe(true);
      expect(hasScope(a, "read:secrets")).toBe(true);
    });

    it("NO concede escritura de ningún recurso (frontera de verbo intacta)", () => {
      expect(hasScope(a, "write:posts")).toBe(false);
      expect(hasScope(a, "delete:users")).toBe(false);
      expect(hasScope(a, "admin:system")).toBe(false);
    });

    it("NO sufre colisión de prefijo: 'read:*' no concede 'readonly:secrets'", () => {
      // El prefijo derivado es 'read:'. 'readonly:secrets' NO empieza con 'read:'
      // (el char en la posición del ':' es 'o'), así que debe denegarse.
      expect(hasScope(a, "readonly:secrets")).toBe(false);
      expect(hasScope(a, "readwrite:posts")).toBe(false);
    });

    it("NO concede un scope malformado sin recurso ('read' sin dos puntos)", () => {
      expect(hasScope(a, "read")).toBe(false);
    });
  });

  // ── Wildcard de acción (*:recurso) ────────────────────────────────────────

  describe("Wildcard de acción (*:database)", () => {
    const a = agent(["*:database"]);

    it("concede cualquier verbo sobre el recurso exacto", () => {
      expect(hasScope(a, "read:database")).toBe(true);
      expect(hasScope(a, "write:database")).toBe(true);
      expect(hasScope(a, "delete:database")).toBe(true);
    });

    it("NO concede acceso a otros recursos aunque el sufijo se parezca", () => {
      expect(hasScope(a, "read:mydatabase")).toBe(false);
      expect(hasScope(a, "read:database_admin")).toBe(false);
      expect(hasScope(a, "read:posts")).toBe(false);
    });
  });

  // ── Super-scope admin (escape hatch intencional) ──────────────────────────

  describe("Super-scope admin", () => {
    it("'admin:*' concede absolutamente todo", () => {
      const a = agent(["admin:*"]);
      expect(hasScope(a, "read:posts")).toBe(true);
      expect(hasScope(a, "write:secrets")).toBe(true);
      expect(hasScope(a, "delete:everything")).toBe(true);
    });

    it("'admin' (bare) también concede todo", () => {
      const a = agent(["admin"]);
      expect(hasScope(a, "write:anything")).toBe(true);
    });
  });

  // ── Denegación por defecto ────────────────────────────────────────────────

  describe("Denegación por defecto", () => {
    it("un agente sin scopes no puede hacer nada", () => {
      const a = agent([]);
      expect(hasScope(a, "read:posts")).toBe(false);
      expect(hasScope(a, "write:posts")).toBe(false);
    });

    it("scopes irrelevantes no conceden el scope requerido", () => {
      const a = agent(["mcp:connect", "read:games"]);
      expect(hasScope(a, "write:users")).toBe(false);
      expect(hasScope(a, "delete:database")).toBe(false);
    });

    it("un contexto con scopes = undefined se trata como sin permisos", () => {
      const a = { ...agent([]), scopes: undefined as unknown as string[] };
      expect(hasScope(a, "read:posts")).toBe(false);
    });
  });

  // ── Combinadores hasAllScopes / hasAnyScope ───────────────────────────────

  describe("hasAllScopes (AND)", () => {
    it("exige TODOS los scopes", () => {
      const a = agent(["read:posts", "write:posts"]);
      expect(hasAllScopes(a, ["read:posts", "write:posts"])).toBe(true);
      expect(hasAllScopes(a, ["read:posts", "delete:posts"])).toBe(false);
    });

    it("un wildcard cubre múltiples requeridos del mismo verbo", () => {
      const a = agent(["read:*"]);
      expect(hasAllScopes(a, ["read:posts", "read:users"])).toBe(true);
      expect(hasAllScopes(a, ["read:posts", "write:users"])).toBe(false);
    });
  });

  describe("hasAnyScope (OR)", () => {
    it("basta con uno", () => {
      const a = agent(["read:posts"]);
      expect(hasAnyScope(a, ["read:posts", "write:posts"])).toBe(true);
      expect(hasAnyScope(a, ["write:posts", "delete:posts"])).toBe(false);
    });

    it("un agente sin scopes falla cualquier OR", () => {
      expect(hasAnyScope(agent([]), ["read:posts", "write:posts"])).toBe(false);
    });
  });
});
