/**
 * Plantillas de prompt de agente
 * ============================================================================
 *
 * `renderPromptTemplate` resuelve `{{event.campo}}` recorriendo un objeto que
 * viene del cuerpo de una petición o de un evento. La versión anterior lo hacía
 * con `reduce((obj: any, key) => obj?.[key], data)`.
 *
 * Ese `any` no escondía un fallo de ejecución —aquí solo se lee y se convierte
 * a texto— pero sí uno de LECTURA: `objeto["__proto__"]` no devuelve
 * `undefined`, devuelve `Object.prototype`. Una plantilla podía atravesar la
 * cadena de prototipos y acabar imprimiendo interioridades del motor dentro de
 * un prompt que se manda a un modelo.
 *
 * `kon-formulas` ya cortaba estas claves; aquí no. Ahora sí, con la misma lista.
 */

import { describe, expect, it } from "vitest";

import {
  AVISO_DATOS_NO_CONFIABLES,
  renderPromptTemplate,
} from "../../apps/api/src/lib/actions/handlers/agent-handler";

// Los valores del evento van cercados como dato no confiable (auditoría 2026-11-04, F9).
const cercado = (texto: string) =>
  `${AVISO_DATOS_NO_CONFIABLES}\n\n${texto.replace(/«([^»]*)»/g, "<untrusted-content>$1</untrusted-content>")}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- doble mínimo de ActionContext
const ctx = (data: unknown): any => ({ event: { data } });

describe("renderPromptTemplate", () => {
  it("resuelve una ruta normal", () => {
    expect(renderPromptTemplate("Hola {{nombre}}", ctx({ nombre: "Ana" }))).toBe(cercado("Hola «Ana»"));
  });

  it("resuelve rutas anidadas", () => {
    expect(
      renderPromptTemplate(
        "{{pedido.cliente.email}}",
        ctx({ pedido: { cliente: { email: "a@b.c" } } })
      )
    ).toBe(cercado("«a@b.c»"));
  });

  it("una ruta que no existe se queda vacía, no imprime 'undefined'", () => {
    expect(renderPromptTemplate("[{{no.existe}}]", ctx({}))).toBe("[]");
  });

  it("no atraviesa __proto__", () => {
    // Antes esto devolvía Object.prototype y luego lo convertía a texto.
    expect(renderPromptTemplate("[{{__proto__}}]", ctx({}))).toBe("[]");
    expect(renderPromptTemplate("[{{__proto__.constructor}}]", ctx({}))).toBe("[]");
  });

  it("no atraviesa constructor ni prototype", () => {
    expect(renderPromptTemplate("[{{constructor}}]", ctx({}))).toBe("[]");
    expect(renderPromptTemplate("[{{constructor.name}}]", ctx({}))).toBe("[]");
    expect(renderPromptTemplate("[{{prototype}}]", ctx({}))).toBe("[]");
  });

  it("solo lee propiedades PROPIAS, no heredadas", () => {
    // Heredar una propiedad no es tenerla: `toString` existe en la cadena de
    // todo objeto y no es un dato del evento.
    expect(renderPromptTemplate("[{{toString}}]", ctx({}))).toBe("[]");
  });

  it("no se rompe si el dato intermedio no es un objeto", () => {
    expect(renderPromptTemplate("[{{a.b.c}}]", ctx({ a: "texto" }))).toBe("[]");
    expect(renderPromptTemplate("[{{a.b}}]", ctx({ a: null }))).toBe("[]");
  });
});
