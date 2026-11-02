/**
 * Activar un kon en caliente, sin reiniciar
 * ============================================================================
 *
 * Activar un kon desde el panel hace DOS cosas:
 *
 *   · Crear sus tablas  → `lib/migraciones-kon.ts`.
 *   · Servir sus rutas  → `lib/kons-diferidos.ts`.
 *
 * Esta prueba fija la segunda, que es la que tiene truco.
 *
 * ── POR QUÉ NO SE PUEDEN MONTAR RUTAS EN CALIENTE ──────────────────────────
 *
 * Hono construye el matcher de su router de forma perezosa, en la primera
 * petición, y a partir de ahí lo congela. `app.route()` después de eso lanza:
 *
 *     Can not add a route since the matcher is already built.
 *
 * `loadKons()` corre una vez al arrancar. Así que un kon activado con el
 * servidor en marcha tiene sus tablas pero ningún endpoint hasta el siguiente
 * reinicio.
 *
 * ── QUÉ SE HACE CON ESO ────────────────────────────────────────────────────
 *
 * Decirlo. `PATCH /api/modules/:key` devuelve `requiresRestart: true` y el
 * panel enseña un aviso. La alternativa —callarlo— produce un kon que aparece
 * en el menú y devuelve 404 en cada pantalla sin explicar por qué: media
 * instalación presentada como completa, que es la clase de fallo que costó una
 * sesión entera de depuración.
 *
 * ── SI ESTA PRUEBA FALLA ───────────────────────────────────────────────────
 *
 * Significa que Hono cambió y ahora SÍ admite montar rutas después de servir.
 * Sería una buena noticia: se podría montar el kon en caliente y quitar el
 * aviso de reinicio. No la borres sin hacer ese cambio.
 */

import { Hono } from "hono";
import { describe, expect, it } from "vitest";

describe("montar rutas con el servidor en marcha", () => {
  it("Hono NO admite app.route() después de la primera petición", async () => {
    const app = new Hono();
    app.get("/ya-existia", (c) => c.text("ok"));

    // Servir una petición es lo que compromete el matcher. Antes de esto,
    // añadir rutas funciona: por eso `loadKons()` puede montarlas al arrancar.
    const previa = await app.request("/ya-existia");
    expect(previa.status).toBe(200);

    const kon = new Hono();
    kon.get("/ping", (c) => c.text("pong"));

    expect(() => app.route("/api/kon-nuevo", kon)).toThrowError(/matcher is already built/i);
  });

  it("antes de la primera petición sí se puede montar", async () => {
    // La otra mitad del contrato: es lo que hace `loadKons()` en el arranque.
    const app = new Hono();
    const kon = new Hono();
    kon.get("/ping", (c) => c.text("pong"));
    app.route("/api/kon-nuevo", kon);

    const res = await app.request("/api/kon-nuevo/ping");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("pong");
  });

  /**
   * ── LA SOLUCIÓN ──────────────────────────────────────────────────────────
   *
   * Lo que Hono congela es la TABLA DE RUTAS, no lo que hace cada handler. Así
   * que el camino se reserva en el arranque con un comodín y el destino se
   * decide en cada petición. Es lo que hace `lib/kons-diferidos.ts` con los
   * kons apagados, y lo que permite activar uno sin reiniciar.
   *
   * Se reproduce aquí el mecanismo entero, en pequeño: si esto se rompiera, la
   * activación en caliente dejaría de funcionar sin que nada más fallara.
   */
  it("reservar el camino en el arranque SÍ permite servir un kon activado después", async () => {
    const app = new Hono();
    const MONTAJE = "/api/demo";
    let router: Hono | null = null;

    const delegar = async (c: {
      req: { raw: Request };
      json: (b: unknown, s?: number) => Response;
    }) => {
      if (!router) return c.json({ error: "Kon no activado" }, 404);
      // El sub-router declara sus rutas RELATIVAS al montaje: sin quitar el
      // prefijo buscaría `/api/demo/ping` en vez de `/ping` y daría 404 por el
      // motivo equivocado.
      const url = new URL(c.req.raw.url);
      url.pathname = url.pathname.slice(MONTAJE.length) || "/";
      return router.fetch(new Request(url.toString(), c.req.raw));
    };

    app.all(MONTAJE, delegar as never);
    app.all(`${MONTAJE}/*`, delegar as never);

    // Se sirve una petición: a partir de aquí el matcher está congelado.
    const apagado = await app.request(`${MONTAJE}/ping`);
    expect(apagado.status).toBe(404);
    expect(await apagado.json()).toEqual({ error: "Kon no activado" });

    // Activación en caliente: solo se asigna el router. Nada toca la tabla de rutas.
    const kon = new Hono();
    kon.get("/ping", (c) => c.json({ pong: true }));
    kon.post("/items", async (c) => c.json({ creado: await c.req.json() }, 201));
    router = kon;

    const get = await app.request(`${MONTAJE}/ping`);
    expect(get.status).toBe(200);
    expect(await get.json()).toEqual({ pong: true });

    // El cuerpo de la petición tiene que sobrevivir a la reescritura de la URL.
    const post = await app.request(`${MONTAJE}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    });
    expect(post.status).toBe(201);
    expect(await post.json()).toEqual({ creado: { a: 1 } });

    // Y un 404 dentro del kon sigue siendo un 404 del kon, no del delegador.
    expect((await app.request(`${MONTAJE}/no-existe`)).status).toBe(404);
  });
});
