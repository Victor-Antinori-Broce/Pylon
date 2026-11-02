/** Fixture: si el cargador llegara a importar esto, la prueba lo detecta. */
import { Hono } from "hono";

(globalThis as Record<string, unknown>).__konFuturoImportado = true;

export const kon = {
  id: "kon-futuro-prueba",
  name: "Futuro (fixture)",
  version: "1.0.0",
  sdk: 99,
  mountPath: "/api/futuro-prueba",
  createRouter() {
    const r = new Hono();
    r.get("/", (c) => c.json({ montado: true }));
    return r;
  },
};

export default kon;
