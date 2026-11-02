/**
 * Agent NHI — Prefijo canónico `kitsuden_agent_` + sunset del legacy `grm_agent_`
 * ============================================================================
 * El rebrand (vek → varco → kitsuden) unificó el prefijo de identidades y keys
 * de agente.
 * Estos tests fijan el contrato:
 *   1. TODO lo que se GENERA usa `kitsuden_agent_` (homogeneidad).
 *   2. Lo ya EMITIDO con `grm_agent_` sigue parseando hasta el sunset
 *      2026-08-01 (no invalidamos tokens vivos de golpe).
 */

import { describe, expect, test } from "bun:test";

import {
  generateAgentId,
  parseAgentId,
  isValidAgentId,
  getAgentTypeFromId,
} from "../utils/id-generator";

describe("Agent IDs — generación canónica", () => {
  test("generateAgentId emite SIEMPRE kitsuden_agent_", () => {
    const { id, prefix } = generateAgentId({ type: "claude-desktop" });
    expect(id.startsWith("kitsuden_agent_claude-desktop_")).toBe(true);
    expect(prefix).toBe("kitsuden_agent");
    expect(id).not.toContain("grm_");
  });

  test("round-trip: lo generado se parsea a sus componentes", () => {
    const { id, hash } = generateAgentId({ type: "scraper" });
    const parsed = parseAgentId(id);
    expect(parsed).not.toBeNull();
    expect(parsed!.prefix).toBe("kitsuden_agent");
    expect(parsed!.type).toBe("scraper");
    expect(parsed!.hash).toBe(hash);
  });
});

describe("Agent IDs — compatibilidad legacy (sunset 2026-08-01)", () => {
  test("parsea IDs legacy grm_agent_ ya emitidos", () => {
    const parsed = parseAgentId("grm_agent_claude-desktop_a1b2c3d4e5f67890");
    expect(parsed).not.toBeNull();
    expect(parsed!.prefix).toBe("grm_agent");
    expect(parsed!.type).toBe("claude-desktop");
    expect(parsed!.hash).toBe("a1b2c3d4e5f67890");
  });

  test("isValidAgentId acepta ambos prefijos", () => {
    expect(isValidAgentId("kitsuden_agent_worker_abc123")).toBe(true);
    expect(isValidAgentId("grm_agent_worker_abc123")).toBe(true);
  });

  test("getAgentTypeFromId funciona con ambos prefijos", () => {
    expect(getAgentTypeFromId("kitsuden_agent_mcp-server_deadbeef")).toBe("mcp-server");
    expect(getAgentTypeFromId("grm_agent_mcp-server_deadbeef")).toBe("mcp-server");
  });

  // NOTA: `getAgentTypeFromApiKey` no se asierta aquí. `agent-auth.test.ts` la
  // estubea vía `mock.module("../utils/id-generator")`, que en bun parchea el
  // registro de módulos de forma GLOBAL e irreversible (`mock.restore()` no lo
  // deshace) y hace merge sobre el módulo real. Cualquier aserción sobre ella
  // dependería del orden de ejecución de archivos. Su contrato de prefijos es
  // idéntico al de `getAgentTypeFromId`, cubierto arriba.
});

describe("Agent IDs — rechazo de basura", () => {
  test("prefijos ajenos no parsean", () => {
    // Marcas anteriores (vek/varco): NUNCA se aceptaron como prefijo de agente;
    // el único legacy en sunset es `grm_agent_`.
    expect(parseAgentId("vek_agent_claude_abc123")).toBeNull();
    expect(parseAgentId("varco_agent_claude_abc123")).toBeNull();
    expect(parseAgentId("random_token_here")).toBeNull();
    expect(parseAgentId("kitsuden_agent_")).toBeNull();
    expect(isValidAgentId("bearer kitsuden_agent_x_y")).toBe(false);
  });

  test("el tipo esperado se valida", () => {
    const { id } = generateAgentId({ type: "worker" });
    expect(isValidAgentId(id, "worker")).toBe(true);
    expect(isValidAgentId(id, "scraper")).toBe(false);
  });
});

describe("Homogeneidad de marca", () => {
  test("ningún prefijo generado contiene marcas antiguas (vek/varco/vroce/grm)", () => {
    for (const type of ["claude-desktop", "worker", "scraper", "mcp-server"]) {
      const { id } = generateAgentId({ type });
      expect(id).not.toMatch(/vek|varco|vroce|grm_/);
      expect(id.startsWith("kitsuden_")).toBe(true);
    }
  });
});
