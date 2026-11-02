/**
 * El limitador cuenta el cupo por VISITANTE cuando la petición la firma el
 * sitio, y por IP en cualquier otro caso. La cabecera del visitante sin la
 * clave buena no puede servir para repartirse el cupo a voluntad.
 */
import { afterEach, describe, expect, it } from "vitest";

import { visitanteDelSitio } from "../../apps/api/src/lib/rate-limiter";

const contexto = (cabeceras: Record<string, string>) =>
  ({ req: { header: (n: string) => cabeceras[n.toLowerCase()] } }) as never;

const antes = process.env.SITIO_API_CLAVE;
afterEach(() => {
  if (antes === undefined) delete process.env.SITIO_API_CLAVE;
  else process.env.SITIO_API_CLAVE = antes;
});

describe("visitanteDelSitio", () => {
  it("con la clave buena, el cupo es del visitante", () => {
    process.env.SITIO_API_CLAVE = "clave-de-prueba";
    expect(
      visitanteDelSitio(
        contexto({ "x-kitsuden-sitio": "clave-de-prueba", "x-kitsuden-cliente": "203.0.113.7" })
      )
    ).toBe("sitio:203.0.113.7");
  });

  it("sin IP del visitante, un cubo propio del sitio (nunca el de «unknown»)", () => {
    process.env.SITIO_API_CLAVE = "clave-de-prueba";
    expect(visitanteDelSitio(contexto({ "x-kitsuden-sitio": "clave-de-prueba" }))).toBe(
      "sitio:sin-ip"
    );
  });

  it("con otra clave, la cabecera del visitante se ignora", () => {
    process.env.SITIO_API_CLAVE = "clave-de-prueba";
    expect(
      visitanteDelSitio(
        contexto({ "x-kitsuden-sitio": "otra", "x-kitsuden-cliente": "203.0.113.7" })
      )
    ).toBeNull();
  });

  it("sin clave configurada en la API, nadie es el sitio", () => {
    delete process.env.SITIO_API_CLAVE;
    expect(
      visitanteDelSitio(contexto({ "x-kitsuden-sitio": "", "x-kitsuden-cliente": "203.0.113.7" }))
    ).toBeNull();
    expect(visitanteDelSitio(contexto({ "x-kitsuden-sitio": "cualquiera" }))).toBeNull();
  });

  it("recorta una IP absurda", () => {
    process.env.SITIO_API_CLAVE = "k";
    const r = visitanteDelSitio(
      contexto({ "x-kitsuden-sitio": "k", "x-kitsuden-cliente": "x".repeat(500) })
    );
    expect(r!.length).toBe("sitio:".length + 64);
  });
});
