/**
 * Las acciones-herramienta (`agent.tool:*`) exigen sus `meta.requiredScopes`
 * ============================================================================
 *
 * Estaba declarado en ActionDefinition, pero el adaptador MCP del engine no lo
 * miraba: cualquier agente conectado ejecutaba cualquier acción-herramienta.
 */

import { describe, expect, it } from "vitest";

import {
  defineAction,
  executeMCPTool,
  scopesQueFaltan,
} from "../../packages/engine/src/actions";

describe("scopesQueFaltan", () => {
  it("misma semántica que hasScope de la API", () => {
    expect(scopesQueFaltan(["crm:write"], ["crm:write"])).toEqual([]);
    expect(scopesQueFaltan(["crm:write"], ["crm:*"])).toEqual([]);
    expect(scopesQueFaltan(["crm:write"], ["*:write"])).toEqual([]);
    expect(scopesQueFaltan(["crm:write", "conta:read"], ["admin"])).toEqual([]);
    expect(scopesQueFaltan(["crm:write"], ["admin:*"])).toEqual([]);
    expect(scopesQueFaltan(["crm:write", "crm:read"], ["crm:read"])).toEqual(["crm:write"]);
    expect(scopesQueFaltan(["crm:write"], [])).toEqual(["crm:write"]);
    expect(scopesQueFaltan([], [])).toEqual([]);
  });

  it("una denegación `!scope` gana, también sobre admin y comodines (auditoría 2026-11-18)", () => {
    expect(scopesQueFaltan(["mail:send"], ["admin", "!mail:send"])).toEqual(["mail:send"]);
    expect(scopesQueFaltan(["mail:send"], ["admin:*", "!mail:*"])).toEqual(["mail:send"]);
    expect(scopesQueFaltan(["crm:write"], ["crm:*", "!crm:write"])).toEqual(["crm:write"]);
    expect(scopesQueFaltan(["crm:read"], ["crm:*", "!crm:write"])).toEqual([]);
  });
});

describe("executeMCPTool con requiredScopes", () => {
  const nombre = `prueba_scopes_${Date.now()}`;
  defineAction({
    trigger: `agent.tool:${nombre}`,
    description: "prueba de scopes",
    meta: { requiredScopes: ["crm:write"] },
    run: async () => ({ success: true, data: { hecho: true } }),
  });

  it("sin el scope: isError con KITSUDEN_E_FORBIDDEN y no se ejecuta", async () => {
    const r = await executeMCPTool(nombre, {}, { agentId: "a", agentName: "a", scopes: ["mcp:read"] });
    expect(r.isError).toBe(true);
    expect(r.code).toBe("KITSUDEN_E_FORBIDDEN");
    expect(r.content[0].text).toContain("crm:write");
  });

  it("sin scopes en absoluto: se niega (falla cerrado)", async () => {
    const r = await executeMCPTool(nombre, {}, {});
    expect(r.isError).toBe(true);
  });

  it("con el scope (o un comodín que lo cubre): se ejecuta", async () => {
    for (const scopes of [["crm:write"], ["crm:*"], ["admin"]]) {
      const r = await executeMCPTool(nombre, {}, { agentId: "a", agentName: "a", scopes });
      expect(r.isError).toBe(false);
      expect(JSON.parse(r.content[0].text)).toEqual({ hecho: true });
    }
  });
});
