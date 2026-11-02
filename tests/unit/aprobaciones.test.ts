/**
 * Fase F — el contrato puro de la aprobación humana (@kitsuden/shared)
 *
 * La tabla de decisión (operación → agente → global), los patrones de rutas
 * legadas, la validación de la configuración y lo de fábrica (APAGADO).
 */
import { describe, expect, it } from "vitest";

import {
  CONFIG_DE_APROBACIONES_POR_DEFECTO,
  KITSUDEN_ERRORS,
  buildProblem,
  claveDeHerramientaMcp,
  decidirAprobacion,
  esMetodoDeEscritura,
  esModoDeAprobacion,
  esSoloLectura,
  firmaDeAgente,
  puedeFirmar,
  fusionarConfigDeAprobaciones,
  herramientaMcpSensiblePorDefecto,
  leerConfigDeAprobaciones,
  regexDePatron,
  reglaLegadaCasa,
  type ModoDeAprobacion,
} from "../../packages/shared/src/index";

describe("la tabla de decisión", () => {
  const casos: [ModoDeAprobacion, boolean, boolean, boolean, string | null][] = [
    // modo, global, sensible, escritura → motivo
    ["direct", true, true, true, null],
    ["direct", false, true, true, null],
    ["propose", true, false, true, "propose_only"],
    ["propose", true, true, true, "sensitive"],
    ["propose", true, false, false, null],
    ["propose", true, true, false, "sensitive"],
    // El global es el interruptor MAESTRO: apagado, tampoco propose retiene.
    ["propose", false, false, true, null],
    ["propose", false, true, true, null],
    ["inherit", true, true, true, "sensitive"],
    ["inherit", true, false, true, null],
    ["inherit", true, true, false, "sensitive"],
    ["inherit", false, true, true, null],
    ["inherit", false, false, true, null],
  ];
  for (const [modo, globalActivo, sensible, escritura, esperado] of casos) {
    it(`${modo}, global ${globalActivo ? "on" : "off"}, ${sensible ? "sensible" : "normal"} ${escritura ? "escritura" : "lectura"} → ${esperado ?? "directo"}`, () => {
      expect(decidirAprobacion({ modo, globalActivo, sensible, escritura })).toBe(esperado);
    });
  }

  it("retención de propose: selectiva (de fábrica) deja pasar los POST soloLectura; estricta, no", () => {
    expect(CONFIG_DE_APROBACIONES_POR_DEFECTO.proposeRetention).toBe("selective");
    const base = { modo: "propose" as const, globalActivo: true, sensible: false, escritura: true, soloLectura: true };
    expect(decidirAprobacion(base)).toBeNull();
    expect(decidirAprobacion({ ...base, retencion: "selective" })).toBeNull();
    expect(decidirAprobacion({ ...base, retencion: "strict" })).toBe("propose_only");
    // soloLectura no rebaja lo sensible ni importa fuera de propose
    expect(decidirAprobacion({ ...base, sensible: true })).toBe("sensitive");
    expect(decidirAprobacion({ ...base, modo: "inherit", retencion: "strict" })).toBeNull();
  });

  it("esSoloLectura: GET siempre; POST solo si lo declara", () => {
    expect(esSoloLectura({ metodo: "GET" })).toBe(true);
    expect(esSoloLectura({ metodo: "POST" })).toBe(false);
    expect(esSoloLectura({ metodo: "POST", soloLectura: true })).toBe(true);
    expect(esSoloLectura({ metodo: "PATCH", soloLectura: true })).toBe(false);
  });

  it("de fábrica está APAGADO y todo agente en inherit: nada se retiene", () => {
    expect(CONFIG_DE_APROBACIONES_POR_DEFECTO.enabled).toBe(false);
    for (const sensible of [true, false]) {
      for (const escritura of [true, false]) {
        expect(
          decidirAprobacion({ modo: "inherit", globalActivo: CONFIG_DE_APROBACIONES_POR_DEFECTO.enabled, sensible, escritura })
        ).toBeNull();
      }
    }
  });

  it("escritura = POST/PUT/PATCH/DELETE", () => {
    expect(["POST", "put", "PATCH", "delete"].every(esMetodoDeEscritura)).toBe(true);
    expect(["GET", "HEAD", "OPTIONS"].some(esMetodoDeEscritura)).toBe(false);
    expect(esModoDeAprobacion("propose")).toBe(true);
    expect(esModoDeAprobacion("admin")).toBe(false);
  });
});

describe("reglas de rutas legadas", () => {
  it("* es un segmento y ** el resto", () => {
    expect(regexDePatron("/api/**").test("/api/items/clientes/1")).toBe(true);
    expect(regexDePatron("/api/games/*").test("/api/games/zelda")).toBe(true);
    expect(regexDePatron("/api/games/*").test("/api/games/zelda/bloques")).toBe(false);
    expect(regexDePatron("/api/games/*/bloques/**").test("/api/games/z/bloques/1/editorial")).toBe(true);
    // Nada de expresiones colándose por el patrón
    expect(regexDePatron("/api/a.b").test("/api/axb")).toBe(false);
  });

  it("método exacto o *, y la barra final no cuenta", () => {
    const r = { method: "DELETE", path: "/api/**" };
    expect(reglaLegadaCasa(r, "delete", "/api/items/x/1")).toBe(true);
    expect(reglaLegadaCasa(r, "PATCH", "/api/items/x/1")).toBe(false);
    expect(reglaLegadaCasa({ method: "*", path: "/api/crm/*" }, "POST", "/api/crm/contacts/")).toBe(true);
  });

  it("de fábrica: todo DELETE de /api es sensible también fuera del SDK", () => {
    expect(CONFIG_DE_APROBACIONES_POR_DEFECTO.legacyRules).toEqual([{ method: "DELETE", path: "/api/**" }]);
  });
});

describe("validar y fusionar la configuración", () => {
  const base = CONFIG_DE_APROBACIONES_POR_DEFECTO;

  it("cambia solo lo que se manda; null vuelve una operación a lo declarado", () => {
    const a = fusionarConfigDeAprobaciones(base, { enabled: true, operations: { "kon:blog:borrar-entrada": false } });
    expect(a).toMatchObject({ enabled: true, ttlHours: 168, operations: { "kon:blog:borrar-entrada": false } });
    const b = fusionarConfigDeAprobaciones(a, { operations: { "kon:blog:borrar-entrada": null, "mcp:kitsuden_insert_record": true } });
    expect(b.operations).toEqual({ "mcp:kitsuden_insert_record": true });
    expect(base.operations).toEqual({}); // no se muta la base
  });

  it("rechaza con el motivo lo que no vale", () => {
    expect(() => fusionarConfigDeAprobaciones(base, { enabled: "yes" })).toThrow(/enabled/);
    expect(() => fusionarConfigDeAprobaciones(base, { proposeRetention: "todo" })).toThrow(/proposeRetention/);
    expect(fusionarConfigDeAprobaciones(base, { proposeRetention: "strict" }).proposeRetention).toBe("strict");
    expect(() => fusionarConfigDeAprobaciones(base, { ttlHours: 0 })).toThrow(/ttlHours/);
    expect(() => fusionarConfigDeAprobaciones(base, { ttlHours: 721 })).toThrow(/ttlHours/);
    expect(() => fusionarConfigDeAprobaciones(base, { operations: { admin: true } })).toThrow(/operation key/);
    expect(() => fusionarConfigDeAprobaciones(base, { operations: { "kon:blog:x": "si" } })).toThrow(/true, false or null/);
    expect(() => fusionarConfigDeAprobaciones(base, { legacyRules: [{ method: "TRACE", path: "/api/x" }] })).toThrow(/method/);
    expect(() => fusionarConfigDeAprobaciones(base, { legacyRules: [{ method: "GET", path: "/otra" }] })).toThrow(/\/api\//);
  });

  it("normaliza las reglas (método en mayúsculas, sin espacios)", () => {
    const c = fusionarConfigDeAprobaciones(base, { legacyRules: [{ method: " patch ", path: " /api/games/* " }] });
    expect(c.legacyRules).toEqual([{ method: "PATCH", path: "/api/games/*" }]);
  });

  it("lo guardado se lee con defensas: algo roto es lo de fábrica", () => {
    expect(leerConfigDeAprobaciones(null)).toEqual(base);
    expect(leerConfigDeAprobaciones({ enabled: "roto" })).toEqual(base);
    expect(leerConfigDeAprobaciones({ enabled: true }).enabled).toBe(true);
  });
});

describe("herramientas MCP del núcleo y el catálogo de errores", () => {
  it("de fábrica son sensibles las que borran", () => {
    expect(herramientaMcpSensiblePorDefecto("kitsuden_delete_record")).toBe(true);
    expect(herramientaMcpSensiblePorDefecto("kitsuden_insert_record")).toBe(false);
    expect(claveDeHerramientaMcp("kitsuden_delete_record")).toBe("mcp:kitsuden_delete_record");
  });

  it("KITSUDEN_E_APPROVAL_REQUIRED es un 202 no reintentable; UNSUPPORTED un 403", () => {
    expect(KITSUDEN_ERRORS.KITSUDEN_E_APPROVAL_REQUIRED).toMatchObject({ status: 202, retryable: false });
    expect(KITSUDEN_ERRORS.KITSUDEN_E_APPROVAL_UNSUPPORTED).toMatchObject({ status: 403, retryable: false });
    const p = buildProblem({ code: "KITSUDEN_E_APPROVAL_REQUIRED", extensions: { proposal: { id: "x" } } });
    expect(p).toMatchObject({ status: 202, retry_after: null, proposal: { id: "x" } });
    expect(p.docs).toMatch(/#kitsuden_e_approval_required$/);
  });
});

describe("firmante humano de un agente (firmaDeAgente)", () => {
  const valido = { userId: "u-firma", valido: true };
  const agente = (extra: Record<string, unknown> = {}) => ({ role: "agent", scopes: ["blog:*"], ...extra });

  it("un humano: lo pedido, tal cual", () => {
    expect(firmaDeAgente({ role: "editor" }, "otro", "pedido")).toMatchObject({ ok: true, autor: "otro", porQue: "humano" });
  });

  it("sin firmante: como antes (blog acepta lo pedido; datasets, sin dueño salvo admin)", () => {
    expect(firmaDeAgente(agente(), "x", "pedido")).toMatchObject({ ok: true, autor: "x" });
    expect(firmaDeAgente(agente(), undefined, "pedido")).toMatchObject({ ok: true, autor: null });
    expect(firmaDeAgente(agente(), "x", "nadie")).toMatchObject({ ok: true, autor: null });
    expect(firmaDeAgente(agente({ scopes: ["admin"] }), "x", "nadie")).toMatchObject({ ok: true, autor: "x" });
  });

  it("con firmante: firma él; otro autor solo con admin", () => {
    expect(firmaDeAgente(agente({ sponsor: valido }), undefined, "pedido")).toMatchObject({ ok: true, autor: "u-firma", porQue: "sponsor" });
    expect(firmaDeAgente(agente({ sponsor: valido }), "u-firma", "nadie")).toMatchObject({ ok: true, autor: "u-firma" });
    expect(firmaDeAgente(agente({ sponsor: valido }), "otro", "pedido")).toMatchObject({ ok: false, code: "KITSUDEN_E_FORBIDDEN" });
    expect(firmaDeAgente(agente({ sponsor: valido, scopes: ["admin"] }), "otro", "pedido")).toMatchObject({ ok: true, autor: "otro" });
  });

  it("firmante que ya no vale: 403 SPONSOR_INVALID hasta reasignarlo", () => {
    const baja = { userId: "u-baja", valido: false, motivo: "not_staff" };
    expect(firmaDeAgente(agente({ sponsor: baja }), undefined, "pedido")).toMatchObject({ ok: false, code: "KITSUDEN_E_AGENT_SPONSOR_INVALID" });
    expect(firmaDeAgente(agente({ sponsor: baja }), "u-baja", "nadie")).toMatchObject({ ok: false, code: "KITSUDEN_E_AGENT_SPONSOR_INVALID" });
    expect(puedeFirmar("editor")).toBe(true);
    expect(puedeFirmar("user")).toBe(false);
  });
});
