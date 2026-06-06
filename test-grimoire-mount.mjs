import { Hono } from "hono";

// Simular la carga de un grimoire
const app = new Hono();

// Importar el grimoire-blog
const blogModule = await import("./packages/grimoires/grimoire-blog/src/index.ts");
console.log("Exports:", Object.keys(blogModule));

if (blogModule.grimoire) {
  console.log("Grimoire ID:", blogModule.grimoire.id);
  console.log("MountPath:", blogModule.grimoire.mountPath);
  console.log("Has createRouter:", typeof blogModule.grimoire.createRouter === "function");

  // Crear un contexto mínimo
  const ctx = {
    db: { instance: {} },
    cache: { get: () => null, set: () => {} },
    auth: { requireAuth: (c, next) => next(), optionalAuth: (c, next) => next() },
    logger: { info: console.log, warn: console.warn, error: console.error },
  };

  const router = blogModule.grimoire.createRouter(ctx);
  console.log("Router type:", router.constructor.name);
  console.log("Router has fetch:", typeof router.fetch === "function");
  console.log("Router has route:", typeof router.route === "function");

  app.route("/api/blog", router);

  // Test
  const req = new Request("http://localhost/api/blog");
  const res = await app.fetch(req);
  console.log("GET /api/blog ->", res.status, await res.text());
} else {
  console.log("No grimoire export found");
}
