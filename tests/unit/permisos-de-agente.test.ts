/**
 * Permisos de agente (fase E): amplios + finos, unión, y la denegación que gana
 * ============================================================================
 *
 * La regla vive UNA vez en `@kitsuden/shared` (permisos-de-agente.ts) y la
 * usan la API (`hasScope`), el motor (`scopeConcede`, `can`), el SDK de kons
 * (`concedePorScopes`) y las herramientas MCP. Aquí se fija su tabla de verdad.
 */
import {
  PRESETS_DE_AGENTE,
  SCOPES_AMPLIOS_DEL_NUCLEO,
  accesoADataset,
  concedePorScopes,
  concedeScope,
  costeDeOperacion,
  defineOperacion,
  denegacionDeOperacion,
  motivoDeScopeInvalido,
  normalizarScopes,
  patronCubre,
  scopeCubre,
} from "@kitsuden/shared";
import { describe, expect, it } from "vitest";
import { z } from "zod";

describe("patronCubre: comodines", () => {
  const casos: [string, string, boolean][] = [
    ["crm:*", "crm:contactos", true],
    ["crm:*", "crm:a:b", true],
    ["crm:*", "crmx:a", false],
    ["crm:*", "crm", false],
    ["*:read", "posts:read", true],
    ["*:read", "datasets:clientes:read", true],
    ["*:read", "posts:write", false],
    ["datasets:*:read", "datasets:clientes:read", true],
    ["datasets:*:read", "datasets:clientes:write", false],
    ["datasets:*:read", "datasets:a:b:read", false],
    ["kon:*", "kon:blog:crear-entrada", true],
    ["kon:blog:*", "kon:blog:crear-entrada", true],
    ["kon:blog:*", "kon:blocks:crear-pagina", false],
    ["kon:*:crear-entrada", "kon:blog:crear-entrada", true],
    // Lo que no cubría antes, tampoco ahora (nada de ampliar por sorpresa)
    ["*:*", "lo:que-sea", false],
    ["*", "lo:que-sea", false],
    ["esports", "esports:manage", false],
    ["esports:man", "esports:manage", false],
  ];
  for (const [patron, req, esperado] of casos) {
    it(`${patron} → ${req}: ${esperado}`, () => expect(patronCubre(patron, req)).toBe(esperado));
  }
});

describe("concedeScope: unión, admin y denegaciones", () => {
  it("admin lo cubre todo", () => {
    expect(concedeScope(["admin"], "kon:crm:borrar-contacto")).toBe(true);
    expect(concedeScope(["admin:*"], "datasets:x:delete")).toBe(true);
  });
  it("un fino no quita nada a un amplio (unión)", () => {
    expect(concedeScope(["crm:*", "kon:blog:crear-entrada"], "crm:contactos")).toBe(true);
    expect(concedeScope(["crm:*", "kon:blog:crear-entrada"], "kon:blog:crear-entrada")).toBe(true);
  });
  it("una denegación gana a cualquier concesión, admin incluido", () => {
    expect(concedeScope(["admin", "!kon:crm:borrar-contacto"], "kon:crm:borrar-contacto")).toBe(false);
    expect(concedeScope(["admin", "!kon:crm:borrar-contacto"], "kon:crm:crear-contacto")).toBe(true);
    expect(concedeScope(["kon:crm:*", "!kon:crm:*"], "kon:crm:crear-contacto")).toBe(false);
    expect(concedeScope(["datasets:*:read", "!datasets:nominas:*"], "datasets:nominas:read")).toBe(false);
    expect(concedeScope(["datasets:*:read", "!datasets:nominas:*"], "datasets:clientes:read")).toBe(true);
  });
  it("una denegación sola no concede nada", () => {
    expect(concedeScope(["!kon:crm:borrar-contacto"], "kon:crm:crear-contacto")).toBe(false);
    expect(scopeCubre("!kon:crm:*", "kon:crm:x")).toBe(false);
  });
});

describe("accesoADataset", () => {
  it("concedido, denegado o sin decisión (decide la política)", () => {
    expect(accesoADataset(["datasets:clientes:read"], "clientes", "read")).toBe("concedido");
    expect(accesoADataset(["datasets:clientes:read"], "clientes", "write")).toBeNull();
    expect(accesoADataset(["datasets:clientes:read"], "otros", "read")).toBeNull();
    expect(accesoADataset(["datasets:*:write"], "otros", "write")).toBe("concedido");
    expect(accesoADataset(["admin", "!datasets:clientes:delete"], "clientes", "delete")).toBe("denegado");
    expect(accesoADataset(["admin", "!datasets:clientes:delete"], "clientes", "write")).toBe("concedido");
    expect(accesoADataset([], "clientes", "read")).toBeNull();
  });
});

describe("SDK: concedePorScopes con fino, amplio, recurso y denegación", () => {
  const op = defineOperacion({
    id: "crear-entrada",
    metodo: "POST",
    ruta: "/",
    resumen: "Crear",
    descripcion: "Crea una entrada.",
    acceso: "sesion",
    entrada: { cuerpo: z.object({ t: z.string() }) },
    salida: { estado: 201, esquema: z.object({}) },
    permiso: {
      politica: { recurso: "blog_post", accion: "create" },
      scopeDeRecurso: (_e, recurso) =>
        (recurso as { slug?: string } | undefined)?.slug
          ? `datasets:${(recurso as { slug: string }).slug}:write`
          : null,
    },
    manejar: () => ({}),
  });
  const entrada = { params: undefined, query: undefined, cuerpo: { t: "x" } };

  it("el fino concede SOLO esa operación", () => {
    expect(concedePorScopes(["kon:blog:crear-entrada"], "kon-blog", op).concedido).toBe(true);
    expect(concedePorScopes(["kon:blog:editar-entrada"], "kon-blog", op).concedido).toBe(false);
  });
  it("amplios del kon y comodines", () => {
    expect(concedePorScopes(["blog:*"], "kon-blog", op).por).toBe("blog:*");
    expect(concedePorScopes(["kon:*"], "kon-blog", op).concedido).toBe(true);
  });
  it("el scope de recurso (con el recurso cargado)", () => {
    expect(concedePorScopes(["datasets:x:write"], "kon-blog", op, entrada, { slug: "x" }).concedido).toBe(true);
    expect(concedePorScopes(["datasets:x:write"], "kon-blog", op, entrada, { slug: "y" }).concedido).toBe(false);
  });
  it("la denegación gana: por fino, por kon, por alias y por recurso", () => {
    expect(concedePorScopes(["admin", "!kon:blog:crear-entrada"], "kon-blog", op)).toEqual({
      concedido: false,
      denegadoPor: "!kon:blog:crear-entrada",
    });
    expect(denegacionDeOperacion(["admin", "!kon:blog:*"], "kon-blog", op)).toBe("!kon:blog:*");
    expect(denegacionDeOperacion(["admin", "!blog:*"], "kon-blog", op)).toBe("!blog:*");
    expect(
      concedePorScopes(["admin", "!datasets:x:*"], "kon-blog", op, entrada, { slug: "x" }).concedido
    ).toBe(false);
  });
  it("coste: 1 por defecto, el declarado si lo hay, y se valida al declarar", () => {
    expect(costeDeOperacion(op)).toBe(1);
    expect(costeDeOperacion({ coste: 5 })).toBe(5);
    expect(() => defineOperacion({ ...op, id: "cara", coste: -1 })).toThrow(/coste/);
  });
});

describe("validar lo que se guarda", () => {
  it("acepta amplios, finos y denegaciones", () => {
    for (const s of [
      "admin",
      "mcp:connect",
      "contenido:editar",
      "crm:*",
      "kon:blog:crear-entrada",
      "datasets:clientes:read",
      "datasets:*:read",
      "!kon:crm:borrar-contacto",
      "!datasets:nominas:*",
    ]) {
      expect(motivoDeScopeInvalido(s), s).toBeNull();
    }
  });
  it("rechaza lo que no significa nada o confunde", () => {
    for (const s of ["", "Admin", "*", "*:*", "!admin", "!x", "a b:c", "a:b:c:d:e:f", 3]) {
      expect(motivoDeScopeInvalido(s), String(s)).not.toBeNull();
    }
  });
  it("normaliza (sin repetidos) y lanza con el motivo", () => {
    expect(normalizarScopes(["mcp:read", "mcp:read", " kon:blog:* "])).toEqual(["mcp:read", "kon:blog:*"]);
    expect(() => normalizarScopes(["!admin"])).toThrow(/Invalid scope/);
    expect(() => normalizarScopes("admin")).toThrow(/array/);
  });
  it("los presets y los amplios del núcleo son válidos", () => {
    for (const p of PRESETS_DE_AGENTE) expect(() => normalizarScopes([...p.scopes])).not.toThrow();
    expect(() => normalizarScopes([...SCOPES_AMPLIOS_DEL_NUCLEO])).not.toThrow();
  });
});
