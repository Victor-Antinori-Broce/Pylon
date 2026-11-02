/**
 * En producción, un 5xx no enseña su detalle interno a quien no es admin
 * (auditoría 2026-10-15: `POST /api/datasets/:id/query` devolvía a cualquier
 * cuenta el mensaje de Drizzle, que lleva la consulta SQL con sus parámetros).
 */
import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { erroresSinDetalle } from "../../apps/api/src/middleware/errores-sin-detalle";

function app(prod: boolean, rol: string | null) {
  const a = new Hono();
  a.use(
    "*",
    erroresSinDetalle(() => prod)
  );
  a.use("*", async (c, next) => {
    (c as any).set("requestId", "req-1");
    if (rol) (c as any).set("user", { id: "u", role: rol });
    await next();
  });
  a.get("/api/x", (c) =>
    c.json(
      { error: "Query execution failed", message: 'Failed query: select * from "auth_users"' },
      500
    )
  );
  a.get("/api/health", (c) => c.json({ status: "degraded", checks: { db: "unavailable" } }, 503));
  a.get("/api/ok", (c) => c.json({ message: "detalle que sí es para el cliente" }, 400));
  return a;
}

describe("erroresSinDetalle", () => {
  it("producción + usuario normal: cuerpo genérico con requestId", async () => {
    const r = await app(true, "user").request("/api/x");
    expect(r.status).toBe(500);
    const cuerpo = await r.json();
    expect(cuerpo).toEqual({ error: "Internal Server Error", requestId: "req-1" });
    expect(JSON.stringify(cuerpo)).not.toContain("auth_users");
  });

  it("producción + anónimo: igual", async () => {
    expect(JSON.stringify(await (await app(true, null).request("/api/x")).json())).not.toContain(
      "select"
    );
  });

  it("admin sigue viendo el detalle; fuera de producción también", async () => {
    expect((await (await app(true, "admin").request("/api/x")).json()).message).toContain(
      "auth_users"
    );
    expect((await (await app(false, "user").request("/api/x")).json()).message).toContain(
      "auth_users"
    );
  });

  it("no toca los 4xx ni la salud", async () => {
    expect((await (await app(true, null).request("/api/ok")).json()).message).toContain("cliente");
    expect((await (await app(true, null).request("/api/health")).json()).checks).toBeDefined();
  });
});
