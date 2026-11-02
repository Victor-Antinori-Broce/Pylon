/**
 * Fase I — el contrato puro de la promoción de código: el escaneo local, el
 * diff de capacidades, lo que toca secretos/usuarios/seguridad, la tabla de
 * decisión y la configuración. Sin base de datos ni red.
 */

import {
  CONFIG_DE_PROMOCION_POR_DEFECTO,
  capacidadesDe,
  decidirPromocion,
  diffDeCapacidades,
  escanearCodigo,
  fusionarConfigDePromocion,
  hostCubre,
  leerConfigDePromocion,
  MOTIVOS_DE_RESPALDO,
  nombreDeSecreto,
  toqueDeCamino,
  toqueDeScope,
  type EntradaDeDecision,
} from "@kitsuden/shared";
import { describe, expect, it } from "vitest";

const reglas = (codigo: string, fetchAllow: string[] = []) =>
  escanearCodigo(codigo, { fetchAllow }).findings.map((h) => `${h.severity}:${h.rule}`);

describe("escaneo de código", () => {
  it("código limpio: aprobado, con sus llamadas, hosts y variables", () => {
    const r = escanearCodigo(
      `// comentario con eval( y process.env dentro
       const datos = await kitsuden.api.get('/api/data-sets/clientes/entries?limit=5');
       await kitsuden.api.post("/api/blog", { title: "x" });
       const x = await kitsuden.api.request("PATCH", "/api/items/a", {});
       const h = await fetch("https://api.example.com/v1/x");
       const s = "texto con eval() y globalThis dentro";
       return { n: env.REGION, t: kitsuden.env.OTRA };`,
      { fetchAllow: ["api.example.com"] }
    );
    expect(r.passed).toBe(true);
    expect(r.findings).toEqual([]);
    expect(r.apiCalls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /api/data-sets/clientes/entries?limit=5",
      "POST /api/blog",
      "PATCH /api/items/a",
    ]);
    expect(r.fetchHosts).toEqual(["api.example.com"]);
    expect(r.envVars).toEqual(["OTRA", "REGION"]);
  });

  it.each([
    ["eval('1')", "high:dynamic_eval"],
    ["new Function('return 1')()", "high:dynamic_eval"],
    ["Function('x')", "high:dynamic_eval"],
    ["setTimeout('alert(1)', 1)", "high:dynamic_eval"],
    ["const m = await import('fs')", "high:dynamic_import"],
    ["({}).constructor.constructor('return this')()", "high:constructor_escape"],
    ["const o = {}; o['constructor']", "high:constructor_escape"],
    ["x.__proto__ = null", "high:constructor_escape"],
    ["return process.env", "high:forbidden_global"],
    ["return globalThis.__pedir", "high:forbidden_global"],
    ["require('child_process')", "high:forbidden_global"],
    ["Bun.spawn(['ls'])", "high:forbidden_global"],
    ["__pedir('api', '{}')", "high:forbidden_global"],
    ["\\u0065val('1')", "high:dynamic_eval"],
    ["const k = 'kitsuden_agent_abcdefgh12345678'", "high:secret_literal"],
    ["const k = 'AKIAABCDEFGHIJKLMNOP'", "high:secret_literal"],
    ["const password = 'hunter2hunter2'", "high:secret_literal"],
    ["const u = 'postgres://user:pa55word@db:5432/x'", "high:secret_literal"],
    ["atob('ZXZhbA==')", "medium:obfuscation"],
    ["String.fromCharCode(101, 118)", "medium:obfuscation"],
    ["const a = kitsuden.api; a.get('/api/x')", "medium:api_alias"],
    ["const { api } = kitsuden", "medium:api_alias"],
    ["kitsuden['api'].get('/api/x')", "medium:api_alias"],
    ["new Proxy({}, {})", "medium:reflection"],
    ["const s = 'abc", "medium:unparsable"],
    ["while (true) { break; }", "low:unbounded_loop"],
  ])("%s → %s", (codigo, esperado) => {
    expect(reglas(codigo)).toContain(esperado);
  });

  it("un fetch a un host no declarado es un hallazgo; uno dinámico se anota", () => {
    expect(reglas("await fetch('https://evil.example.net/x')", ["api.example.com"])).toContain("medium:undeclared_host");
    expect(reglas("await fetch('https://a.example.com/x')", ["*.example.com"])).toEqual([]);
    expect(escanearCodigo("await fetch(event.url)").dynamicFetch).toBe(true);
  });

  it("un camino calculado no se clasifica (path null)", () => {
    const r = escanearCodigo("await kitsuden.api.get(`/api/items/${event.t}`); await kitsuden.api.delete(p);");
    expect(r.apiCalls).toEqual([
      { method: "GET", path: null, line: 1 },
      { method: "DELETE", path: null, line: 1 },
    ]);
  });

  it("un método de clase llamado constructor no es una fuga", () => {
    expect(reglas("class A { constructor() { this.x = 1; } }; return new A().x;")).toEqual([]);
  });

  it("los hallazgos nunca repiten el secreto", () => {
    const r = escanearCodigo("const t = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';");
    expect(r.passed).toBe(false);
    expect(JSON.stringify(r)).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
  });

  it("demasiado grande o minificado no se puede revisar", () => {
    expect(reglas("x".repeat(70 * 1024))).toContain("high:oversize");
    expect(reglas(`return ${"1+".repeat(800)}1;`)).toContain("medium:long_line");
  });

  it("es determinista", () => {
    const codigo = "const a = await kitsuden.api.get('/api/x'); eval('1'); return a;";
    expect(escanearCodigo(codigo)).toEqual(escanearCodigo(codigo));
  });
});

describe("capacidades declaradas", () => {
  it("se normalizan (orden, repetidos, valores por defecto)", () => {
    expect(capacidadesDe({ scopes: ["b", "a", "a", " "], fetchAllow: ["X.com"] })).toEqual({
      scopes: ["a", "b"],
      fetchAllow: ["x.com"],
      timeoutMs: 5000,
      memoryLimitMb: 64,
      maxCalls: 50,
    });
  });

  it("hostCubre: exacto y comodín de subdominio", () => {
    expect(hostCubre("a.com", "a.com")).toBe(true);
    expect(hostCubre("*.a.com", "b.a.com")).toBe(true);
    expect(hostCubre("*.a.com", "*.b.a.com")).toBe(true);
    expect(hostCubre("*.a.com", "a.com")).toBe(false);
    expect(hostCubre("b.a.com", "*.a.com")).toBe(false);
  });

  it("diff: scopes cubiertos por un comodín no son nuevos; quitar una denegación sí amplía", () => {
    const activa = capacidadesDe({ scopes: ["datasets:*:read", "!datasets:secreto:read"], fetchAllow: ["*.a.com"] });
    const d = diffDeCapacidades(
      activa,
      capacidadesDe({ scopes: ["datasets:clientes:read", "kon:blog:crear-entrada"], fetchAllow: ["x.a.com", "b.com"], timeoutMs: 9000 })
    );
    expect(d.newTarget).toBe(false);
    expect(d.scopesAdded).toEqual(["kon:blog:crear-entrada"]);
    expect(d.denialsRemoved).toEqual(["!datasets:secreto:read"]);
    expect(d.hostsAdded).toEqual(["b.com"]);
    expect(d.limitsIncreased).toEqual([{ field: "timeoutMs", before: 5000, after: 9000 }]);
  });

  it("sin versión activa todo lo declarado es nuevo", () => {
    const d = diffDeCapacidades(null, capacidadesDe({ scopes: ["x:read"] }));
    expect(d.newTarget).toBe(true);
    expect(d.scopesAdded).toEqual(["x:read"]);
  });
});

describe("lo que toca", () => {
  it.each([
    ["/api/admin/vault/x", "secrets"],
    ["/api/keys", "secrets"],
    ["/api/v1/agents/a/scopes", "users_roles"],
    ["/api/auth/sign-up/email", "users_roles"],
    ["/api/approvals/settings", "security_config"],
    ["/api/promotion/drafts", "security_config"],
    ["/api/settings?x=1", "security_config"],
    ["/api/data-sets/x", null],
    ["/api/blog", null],
  ])("camino %s → %s", (camino, toque) => {
    expect(toqueDeCamino(camino)).toBe(toque);
  });

  it.each([
    ["admin", "security_config"],
    ["mcp:admin", "security_config"],
    ["kon:*", "security_config"],
    ["secrets:read", "secrets"],
    ["vault:*", "secrets"],
    ["users:write", "users_roles"],
    ["usuario:actuar", "users_roles"],
    ["promotion:propose", "security_config"],
    ["datasets:*:read", null],
    ["kon:blog:crear-entrada", null],
  ])("scope %s → %s", (scope, toque) => {
    expect(toqueDeScope(scope)).toBe(toque);
  });

  it("nombres de variables con pinta de secreto", () => {
    for (const n of ["API_TOKEN", "stripeSecret", "DB_PASSWORD", "apiKey", "PRIVATE_KEY", "AUTH_HEADER"]) {
      expect(nombreDeSecreto(n), n).toBe(true);
    }
    for (const n of ["REGION", "LIMIT", "monkey"]) expect(nombreDeSecreto(n), n).toBe(false);
  });
});

describe("la tabla de decisión", () => {
  const verde = (): EntradaDeDecision => ({
    modo: "turbo",
    config: { turboAllowed: true },
    diff: diffDeCapacidades(capacidadesDe({}), capacidadesDe({})),
    pruebas: { total: 2, passed: 2, failed: 0, errored: 0 },
    escaneoAprobado: true,
    toques: [],
    operacionSensible: false,
    llamadaSinClasificar: false,
  });

  it("turbo solo con todo en verde", () => {
    expect(decidirPromocion(verde())).toEqual({ ruta: "turbo", motivos: [] });
  });

  it("suggestion: siempre propuesta (y enseña lo demás)", () => {
    const d = decidirPromocion({ ...verde(), modo: "suggestion", pruebas: { total: 1, passed: 0, failed: 1, errored: 0 } });
    expect(d.ruta).toBe("proposal");
    expect(d.motivos).toEqual(["suggestion_mode", "tests_failed"]);
  });

  it.each<[string, (e: EntradaDeDecision) => EntradaDeDecision]>([
    ["turbo_disabled_globally", (e) => ({ ...e, config: { turboAllowed: false } })],
    ["agent_held_for_approval", (e) => ({ ...e, agenteRetenido: true })],
    ["new_target", (e) => ({ ...e, diff: diffDeCapacidades(null, capacidadesDe({})) })],
    ["no_tests", (e) => ({ ...e, pruebas: { total: 0, passed: 0, failed: 0, errored: 0 } })],
    ["tests_failed", (e) => ({ ...e, pruebas: { total: 2, passed: 1, failed: 1, errored: 0 } })],
    ["tests_errored", (e) => ({ ...e, pruebas: { total: 2, passed: 1, failed: 0, errored: 1 } })],
    ["scan_failed", (e) => ({ ...e, escaneoAprobado: false })],
    ["scope_escalation", (e) => ({ ...e, diff: diffDeCapacidades(capacidadesDe({}), capacidadesDe({ scopes: ["x:y"] })) })],
    [
      "scope_escalation",
      (e) => ({ ...e, diff: diffDeCapacidades(capacidadesDe({ scopes: ["!x:y"] }), capacidadesDe({})) }),
    ],
    ["new_outbound_hosts", (e) => ({ ...e, diff: diffDeCapacidades(capacidadesDe({}), capacidadesDe({ fetchAllow: ["a.com"] })) })],
    ["limits_increased", (e) => ({ ...e, diff: diffDeCapacidades(capacidadesDe({}), capacidadesDe({ maxCalls: 100 })) })],
    ["touches_secrets", (e) => ({ ...e, toques: ["secrets"] })],
    ["touches_users_or_roles", (e) => ({ ...e, toques: ["users_roles"] })],
    ["touches_security_config", (e) => ({ ...e, toques: ["security_config"] })],
    ["sensitive_operation", (e) => ({ ...e, operacionSensible: true })],
    ["unclassifiable_api_call", (e) => ({ ...e, llamadaSinClasificar: true })],
  ])("turbo → propuesta por %s", (motivo, cambiar) => {
    const d = decidirPromocion(cambiar(verde()));
    expect(d.ruta).toBe("proposal");
    expect(d.motivos).toContain(motivo);
  });

  it("cada motivo está en el catálogo", () => {
    expect(new Set(MOTIVOS_DE_RESPALDO).size).toBe(MOTIVOS_DE_RESPALDO.length);
  });

  it("quitar permisos no impide turbo", () => {
    const d = decidirPromocion({
      ...verde(),
      diff: diffDeCapacidades(capacidadesDe({ scopes: ["x:y"], fetchAllow: ["a.com"], timeoutMs: 9000 }), capacidadesDe({})),
    });
    expect(d).toEqual({ ruta: "turbo", motivos: [] });
  });
});

describe("configuración", () => {
  it("de fábrica: turbo apagado", () => {
    expect(CONFIG_DE_PROMOCION_POR_DEFECTO.turboAllowed).toBe(false);
    expect(leerConfigDePromocion(null)).toEqual(CONFIG_DE_PROMOCION_POR_DEFECTO);
    expect(leerConfigDePromocion({ watchMinutes: "x" })).toEqual(CONFIG_DE_PROMOCION_POR_DEFECTO);
  });

  it("valida los límites", () => {
    expect(fusionarConfigDePromocion(CONFIG_DE_PROMOCION_POR_DEFECTO, { turboAllowed: true, watchMinutes: 5 })).toMatchObject({
      turboAllowed: true,
      watchMinutes: 5,
    });
    expect(() => fusionarConfigDePromocion(CONFIG_DE_PROMOCION_POR_DEFECTO, { watchMinutes: 0 })).toThrow();
    expect(() => fusionarConfigDePromocion(CONFIG_DE_PROMOCION_POR_DEFECTO, { maxErrorRate: 2 })).toThrow();
    expect(() => fusionarConfigDePromocion(CONFIG_DE_PROMOCION_POR_DEFECTO, { turboAllowed: "yes" })).toThrow();
  });
});
