/**
 * Policies/Gates + Validation + Error Envelope — deterministic unit tests.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";

import {
  definePolicy,
  defineGate,
  can,
  authorize,
  policyMap,
  resetAuthz,
  requireGate,
  type AuthzUser,
} from "../lib/authz";
import { AppError, toErrorEnvelope, respondError, ErrorCode } from "../lib/errors";
import { validateRequest, validated, parseOrThrow } from "../lib/validation";

interface Post {
  id: string;
  ownerId: string | null;
  published: boolean;
}

const alice: AuthzUser = { id: "alice", role: "user" };
const bob: AuthzUser = { id: "bob", role: "user" };
const admin: AuthzUser = { id: "root", role: "admin" };

// ── Policies / Gates ──────────────────────────────────────────────────────────

describe("Authorization — Policies & Gates", () => {
  beforeEach(() => {
    resetAuthz();
    definePolicy<Post>("post", {
      view: (u, p) => p.published || p.ownerId === u?.id || u?.role === "admin",
      update: (u, p) => u?.role === "admin" || p.ownerId === u?.id,
    });
    defineGate("access-admin", (u) => u?.role === "admin");
  });

  it("deny-by-default: acción sin regla se deniega", async () => {
    const post: Post = { id: "1", ownerId: "alice", published: true };
    expect(await can(alice, "delete", post, "post")).toBe(false);
  });

  it("el dueño puede actualizar; un tercero no", async () => {
    const post: Post = { id: "1", ownerId: "alice", published: false };
    expect(await can(alice, "update", post, "post")).toBe(true);
    expect(await can(bob, "update", post, "post")).toBe(false);
    expect(await can(admin, "update", post, "post")).toBe(true);
  });

  it("view respeta published y ownership", async () => {
    const draft: Post = { id: "1", ownerId: "alice", published: false };
    expect(await can(bob, "view", draft, "post")).toBe(false);
    expect(await can(alice, "view", draft, "post")).toBe(true);
    const pub: Post = { id: "2", ownerId: "alice", published: true };
    expect(await can(bob, "view", pub, "post")).toBe(true);
  });

  it("gates globales (sin recurso)", async () => {
    expect(await can(admin, "access-admin")).toBe(true);
    expect(await can(alice, "access-admin")).toBe(false);
    expect(await can(alice, "gate-inexistente")).toBe(false); // deny-by-default
  });

  it("authorize lanza 401 sin usuario y 403 con usuario sin permiso", async () => {
    const post: Post = { id: "1", ownerId: "alice", published: false };
    await expect(authorize(null, "update", post, "post")).rejects.toMatchObject({
      code: ErrorCode.UNAUTHENTICATED,
    });
    await expect(authorize(bob, "update", post, "post")).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN,
    });
  });

  it("policyMap introspecciona las acciones para UI/admin", async () => {
    const post: Post = { id: "1", ownerId: "alice", published: true };
    expect(await policyMap(alice, "post", post)).toEqual({ view: true, update: true });
    expect(await policyMap(bob, "post", post)).toEqual({ view: true, update: false });
  });

  it("requireGate middleware: 403 a no-admin, 200 a admin", async () => {
    const app = new Hono();
    app.onError((err, c) => respondError(c, err));
    // El setter de usuario debe ir ANTES del gate.
    app.use("*", async (c, next) => {
      c.set("user", (c.req.header("x-role") === "admin" ? admin : alice) as never);
      await next();
    });
    app.use("/admin", requireGate("access-admin"));
    app.get("/admin", (c) => c.json({ ok: true }));

    const denied = await app.request("http://x/admin", { headers: { "x-role": "user" } });
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as any).error.code).toBe(ErrorCode.FORBIDDEN);

    const allowed = await app.request("http://x/admin", { headers: { "x-role": "admin" } });
    expect(allowed.status).toBe(200);
  });
});

// ── Validation (FormRequest-style) ────────────────────────────────────────────

describe("Validation — FormRequest style", () => {
  const schema = z.object({ title: z.string().min(1), age: z.coerce.number().int().min(0) });

  it("parseOrThrow devuelve datos tipados y coercionados", () => {
    const out = parseOrThrow(schema, { title: "hi", age: "42" });
    expect(out).toEqual({ title: "hi", age: 42 });
  });

  it("parseOrThrow lanza VALIDATION con detalles por campo", () => {
    try {
      parseOrThrow(schema, { title: "", age: -1 });
      throw new Error("no lanzó");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      const err = e as AppError;
      expect(err.code).toBe(ErrorCode.VALIDATION);
      const fields = (err.details as any).fields;
      expect(fields.title).toBeDefined();
      expect(fields.age).toBeDefined();
    }
  });

  it("middleware validate: 422 en fallo, datos tipados en éxito", async () => {
    const app = new Hono();
    app.onError((err, c) => respondError(c, err));
    app.post("/x", validateRequest(schema), (c) => c.json(validated(c)));

    const bad = await app.request("http://x/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "", age: "no" }),
    });
    expect(bad.status).toBe(422);
    expect(((await bad.json()) as any).error.code).toBe(ErrorCode.VALIDATION);

    const ok = await app.request("http://x/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "hi", age: "5" }),
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ title: "hi", age: 5 });
  });
});

// ── Error envelope ────────────────────────────────────────────────────────────

describe("Error envelope", () => {
  it("AppError se serializa con código y detalles", () => {
    const { envelope, status } = toErrorEnvelope(AppError.conflict("dup", { field: "email" }), {});
    expect(status).toBe(409);
    expect(envelope.error.code).toBe(ErrorCode.CONFLICT);
    expect(envelope.error.details).toEqual({ field: "email" });
  });

  it("errores desconocidos 5xx no exponen el message en prod", () => {
    const { envelope, status } = toErrorEnvelope(new Error("secreto interno"), { isDev: false });
    expect(status).toBe(500);
    expect(envelope.error.message).toBe("Internal server error");
  });

  it("en dev sí muestra el message del 5xx", () => {
    const { envelope } = toErrorEnvelope(new Error("detalle"), { isDev: true });
    expect(envelope.error.message).toBe("detalle");
  });
});
