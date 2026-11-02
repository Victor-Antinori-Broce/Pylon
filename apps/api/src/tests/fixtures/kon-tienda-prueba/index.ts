/**
 * Fixture de `kon-activado-en-caliente.test.ts`.
 *
 * Reproduce la forma de kon-ecommerce que destapó el fallo: `mountPath` en el
 * código ("/api/escaparate", que no se deduce del id) y un kon.json que no declara `mount.path`. El
 * cargador NO puede deducir esa ruta del id (`/api/tienda-prueba` o
 * `/api/custom/kon-tienda-prueba` serían sus candidatas de siempre).
 */
import { Hono } from "hono";

export const kon = {
  id: "kon-tienda-prueba",
  name: "Tienda (fixture)",
  version: "1.0.0",
  sdk: 1,
  mountPath: "/api/escaparate",
  createRouter() {
    const r = new Hono();
    r.get("/productos", (c) => c.json({ productos: ["taza"] }));
    return r;
  },
};

export default kon;
