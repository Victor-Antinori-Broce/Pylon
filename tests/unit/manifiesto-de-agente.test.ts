/**
 * Manifiesto declarativo de agente — role/goal/backstory → persona
 * ============================================================================
 *
 * Lo que se fija aquí: el compilador (`@kitsuden/shared`) traduce capacidades
 * conocidas a scopes, pasa el resultado por `normalizarScopes` y NUNCA inventa
 * un permiso: entradas desconocidas son un error.
 */
import {
  MAPA_DE_CAPACIDADES,
  compilarManifiestoDeAgente,
  concedeScope,
  normalizarScopes,
} from "@kitsuden/shared";
import { describe, expect, it } from "vitest";

describe("compilarManifiestoDeAgente", () => {
  it("compila rol/objetivo/contexto a systemPrompt y descripción", () => {
    const p = compilarManifiestoDeAgente({
      nombre: "Inti editor",
      rol: "Editor de guías",
      objetivo: "Mantener las guías del sitio actualizadas",
      contexto: "Trabaja de noche, cuando no hay editores.",
    });
    expect(p.nombre).toBe("Inti editor");
    expect(p.descripcion).toBe("Mantener las guías del sitio actualizadas");
    expect(p.systemPrompt).toContain("Eres Editor de guías.");
    expect(p.systemPrompt).toContain("Objetivo: Mantener las guías del sitio actualizadas.");
    expect(p.systemPrompt).toContain("Contexto: Trabaja de noche");
    expect(p.type).toBe("custom");
    expect(p.rateLimit).toBe(60);
  });

  it("las capacidades se expanden a los scopes de su mapa", () => {
    const p = compilarManifiestoDeAgente({
      nombre: "a",
      rol: "r",
      objetivo: "o",
      puede: ["conectar", "leer", "editar-contenido"],
    });
    expect(p.scopes).toEqual(
      normalizarScopes(["mcp:connect", "mcp:read", "contenido:editar", "kon:blog:*", "kon:blocks:*", "kon:media:*"])
    );
    expect(concedeScope(p.scopes, "kon:blog:crear-entrada")).toBe(true);
  });

  it("acepta scopes en bruto y los deniega con noPuede", () => {
    const p = compilarManifiestoDeAgente({
      nombre: "a",
      rol: "r",
      objetivo: "o",
      puede: ["kon:wiki:*"],
      noPuede: ["borrar-datos", "kon:wiki:borrar-pagina"],
    });
    expect(p.scopes).toContain("kon:wiki:*");
    expect(p.scopes).toContain("!datasets:*:delete");
    expect(p.scopes).toContain("!kon:wiki:borrar-pagina");
    // La denegación gana: puede leer datasets pero no borrarlos.
    expect(concedeScope(p.scopes, "datasets:clientes:delete")).toBe(false);
    expect(concedeScope(p.scopes, "kon:wiki:editar-pagina")).toBe(true);
  });

  it("una capacidad desconocida lanza (nunca un permiso inventado)", () => {
    expect(() =>
      compilarManifiestoDeAgente({ nombre: "a", rol: "r", objetivo: "o", puede: ["volar"] })
    ).toThrow(/Unknown capability 'volar'/);
  });

  it("exige nombre, rol y objetivo", () => {
    expect(() => compilarManifiestoDeAgente({} as never)).toThrow(/nombre/);
    expect(() =>
      compilarManifiestoDeAgente({ nombre: "a", objetivo: "o" } as never)
    ).toThrow(/rol/);
    expect(() => compilarManifiestoDeAgente({ nombre: "a", rol: "r" } as never)).toThrow(
      /objetivo/
    );
  });

  it("no admite scopes inválidos que el mapa introdujera (doble validación)", () => {
    // `admin` como capacidad existe; una denegación de admin sigue prohibida.
    expect(() =>
      compilarManifiestoDeAgente({ nombre: "a", rol: "r", objetivo: "o", noPuede: ["administrar"] })
    ).toThrow(/!admin/);
  });

  it("MAPA_DE_CAPACIDADES: administrar concede admin y conectar solo conecta", () => {
    expect(MAPA_DE_CAPACIDADES["administrar"]).toEqual(["admin"]);
    expect(MAPA_DE_CAPACIDADES["conectar"]).toEqual(["mcp:connect"]);
    const p = compilarManifiestoDeAgente({
      nombre: "a",
      rol: "r",
      objetivo: "o",
      puede: ["administrar"],
      noPuede: ["borrar-datos"],
    });
    expect(concedeScope(p.scopes, "kon:blog:crear-entrada")).toBe(true);
    expect(concedeScope(p.scopes, "datasets:x:delete")).toBe(false);
  });
});
