/**
 * El entorno que reciben los kons
 * ============================================================================
 *
 * `createKonContext()` construye lo que reciben los 29 kons. Su campo
 * `config.environment` está declarado como `"development" | "production" |
 * "test"`, pero se rellenaba con `(process.env.NODE_ENV as any) || "development"`.
 *
 * Ese `as any` no era un descuido de tipos: dejaba pasar CUALQUIER valor del
 * entorno. Con `NODE_ENV=staging` —que es un valor perfectamente normal en
 * muchos despliegues— todo kon que hiciera `if (env === "production")` decidía
 * que no lo era, y todo el que hiciera `if (env === "development")` tampoco. El
 * kon acababa en una tercera rama que nadie escribió.
 *
 * Ahora se acota: lo que no sea `production` ni `test` es `development`.
 */

import { afterEach, describe, expect, it } from "vitest";

import { createKonContext } from "../../apps/api/src/lib/module-loader";

const original = process.env.NODE_ENV;
afterEach(() => {
  process.env.NODE_ENV = original;
});

describe("entorno del KonContext", () => {
  it("reconoce los tres valores declarados", () => {
    for (const valor of ["production", "test", "development"] as const) {
      process.env.NODE_ENV = valor;
      expect(createKonContext().config.environment).toBe(valor);
    }
  });

  it("un NODE_ENV desconocido cae en development, no se cuela tal cual", () => {
    // Antes esto devolvía "staging", un valor que el tipo no admite y que
    // ninguna comparación de ningún kon contempla.
    process.env.NODE_ENV = "staging";
    expect(createKonContext().config.environment).toBe("development");
  });

  it("sin NODE_ENV también cae en development", () => {
    delete process.env.NODE_ENV;
    expect(createKonContext().config.environment).toBe("development");
  });

  it("el contexto trae el registro de content-publishing ya montado", () => {
    // Se construye con una referencia diferida al propio contexto (huevo y
    // gallina). Si esa parte se rompe, el kon recibe un `undefined` y falla al
    // registrar su target, lejos de aquí.
    const ctx = createKonContext();
    expect(typeof ctx.contentPublishing.register).toBe("function");
    expect(ctx.contentPublishing.getAvailableTargets()).toEqual([]);
  });
});
