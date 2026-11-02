/**
 * `/media` tiene que poder incrustarse desde otra web
 * ============================================================================
 *
 * `secureHeaders()` pone `Cross-Origin-Resource-Policy: same-origin` en todo.
 * Para la API está bien; para `/media` es un desastre silencioso: el navegador
 * recibe la imagen entera con un 200 y se niega a pintarla, sin un solo error
 * en la página. Pasó con las imágenes de cartas alojadas en casa.
 *
 * Esta prueba reproduce el mismo montaje que `apps/api/src/index.ts` y
 * comprueba las dos mitades: que `/media` sale `cross-origin` y que la API
 * SIGUE saliendo `same-origin` — abrir la política para todo sería arreglar
 * las imágenes rompiendo la protección de la API.
 */
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { describe, expect, it } from "vitest";

const BASE = "/media";
const app = new Hono();
const seguras = secureHeaders();
const deMedios = secureHeaders({ crossOriginResourcePolicy: "cross-origin" });
app.use("*", (c, next) => (c.req.path.startsWith(`${BASE}/`) ? deMedios : seguras)(c, next));
// El manejador de /media pone su propia cabecera: no debe perderse
app.get(
  `${BASE}/*`,
  () => new Response("img", { headers: { "Cache-Control": "public, max-age=31536000, immutable" } })
);
app.get("/api/algo", (c) => c.json({ ok: true }));
// «/mediateca» empieza por «/media» pero no es «/media/»: no debe abrirse
app.get("/mediateca", (c) => c.text("x"));

const cabeceras = async (ruta: string) => (await app.request(ruta)).headers;

describe("las cabeceras de /media", () => {
  it("una imagen se puede incrustar desde otra web", async () => {
    expect((await cabeceras("/media/cartas/x.webp")).get("Cross-Origin-Resource-Policy")).toBe(
      "cross-origin"
    );
  });

  it("la API sigue protegida", async () => {
    expect((await cabeceras("/api/algo")).get("Cross-Origin-Resource-Policy")).toBe("same-origin");
  });

  it("el resto de cabeceras de seguridad siguen en /media", async () => {
    const h = await cabeceras("/media/cartas/x.webp");
    expect(h.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("la caché que pone el manejador no se pierde", async () => {
    expect((await cabeceras("/media/cartas/x.webp")).get("Cache-Control")).toContain("immutable");
  });

  it("un prefijo parecido NO se abre", async () => {
    expect((await cabeceras("/mediateca")).get("Cross-Origin-Resource-Policy")).toBe("same-origin");
  });
});
