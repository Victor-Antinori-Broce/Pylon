/**
 * Presets y transformaciones de imágenes con almacenamiento local (2026-10-18).
 *
 * `/preset/:id/:preset` redirigía a `/transform/:id`, y este redirigía a
 * `getSignedDownloadUrl(transformKey)` SIN comprobar que existiera: con disco
 * local esa función solo compone `/media/transforms/...`, así que toda URL de
 * preset terminaba en 404 (los originales de `/media/*` sí se veían). Ahora la
 * transformación se lee con `ctx.storage.get`, se genera si falta y se sirve.
 *
 * El almacén de aquí es un Map, como un disco: `get` devuelve null si no hay
 * nada, igual que `leerObjeto` en local y en S3.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { Hono } from "hono";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestKonContext } from "../../apps/api/src/lib/test-kon-context";
import { registerMediaPolicy } from "../../packages/core/media/media.policy";
import { createTransformRouter, formatoDeSalida } from "../../packages/core/media/transform.routes";

const ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const SIN_ORIGINAL = "9b2f5c3e-1d4a-4c8b-9e7f-2a6b8c0d1e3f";

const almacen = new Map<string, { bytes: Buffer; tipo: string }>();
let escrituras = 0;
let client: PGlite;
let app: Hono;

beforeAll(async () => {
  client = new PGlite();
  await client.exec(
    readFileSync(join(__dirname, "../../packages/core/media/migrations/0000_initial.sql"), "utf8")
  );
  const original = await sharp({
    create: { width: 640, height: 480, channels: 3, background: { r: 200, g: 40, b: 90 } },
  })
    .png()
    .toBuffer();
  almacen.set("uploads/1_foto.png", { bytes: original, tipo: "image/png" });

  const ctx = createTestKonContext({
    db: { instance: drizzle(client) } as never,
    // Las rutas de punto focal y caché exigen sesión: aquí se dejan pasar
    // (la autorización de `DELETE /cache/:id` la cubre la matriz).
    auth: { requireAuth: async (_c: unknown, next: () => Promise<void>) => next() } as never,
    storage: {
      put: async (key: string, bytes: Buffer, tipo: string) => {
        escrituras++;
        almacen.set(key, { bytes, tipo });
        return { clave: key, url: `/media/${key}`, bytes: bytes.length };
      },
      get: async (key: string) => almacen.get(key)?.bytes ?? null,
      list: async (prefijo: string) => [...almacen.keys()].filter((k) => k.startsWith(prefijo)),
      delete: async (key: string) => {
        almacen.delete(key);
      },
      publicUrl: (k: string) => `/media/${k}`,
      // Lo que hace el modo local: componer la URL, exista o no.
      getSignedDownloadUrl: async (k: string) => `/media/${k}`,
      getSignedUploadUrl: async () => {
        throw new Error("solo S3");
      },
    },
  });
  registerMediaPolicy();
  app = new Hono();
  // `DELETE /cache/:id` exige permiso de media: un administrador.
  app.use("*", async (c, next) => {
    c.set("user" as never, { id: "u-admin", role: "admin" } as never);
    await next();
  });
  app.route("/", createTransformRouter(ctx));

  await client.query(
    `INSERT INTO media (id, filename, original_name, mime_type, size, key, bucket, public_url) VALUES
     ('${ID}', 'foto.png', 'foto.png', 'image/png', 10, 'uploads/1_foto.png', 'b', '/media/uploads/1_foto.png'),
     ('${SIN_ORIGINAL}', 'perdida.png', 'perdida.png', 'image/png', 10, 'uploads/2_perdida.png', 'b', '/media/uploads/2_perdida.png')`
  );
});

afterAll(async () => {
  await client?.close();
});

beforeEach(() => {
  for (const k of [...almacen.keys()]) if (k.startsWith("transforms/")) almacen.delete(k);
  escrituras = 0;
});

describe("presets con almacenamiento local", () => {
  it("/preset/:id/thumbnail devuelve la imagen (200), no una redirección a un fichero inexistente", async () => {
    const r = await app.request(`/preset/${ID}/thumbnail`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/webp");
    const meta = await sharp(Buffer.from(await r.arrayBuffer())).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(150);
    expect(meta.height).toBe(150);
  });

  it("la segunda vez se sirve lo guardado, sin volver a generar", async () => {
    await app.request(`/preset/${ID}/medium`);
    expect(escrituras).toBe(1);
    const r = await app.request(`/preset/${ID}/medium`);
    expect(r.status).toBe(200);
    expect(escrituras).toBe(1);
    expect(
      [...almacen.keys()].some((k) => k.startsWith(`transforms/${ID}/`) && k.endsWith(".webp"))
    ).toBe(true);
  });

  it("sin formato pedido se conserva el del original", async () => {
    const r = await app.request(`/transform/${ID}?w=100`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect((await sharp(Buffer.from(await r.arrayBuffer())).metadata()).width).toBe(100);
  });

  it("si falta el original, 404 (no 500)", async () => {
    expect((await app.request(`/preset/${SIN_ORIGINAL}/thumbnail`)).status).toBe(404);
  });

  it("formatoDeSalida: el pedido, si no el del original, si no webp", () => {
    expect(formatoDeSalida("avif", "image/png")).toBe("avif");
    expect(formatoDeSalida("auto", "image/jpeg")).toBe("jpeg");
    expect(formatoDeSalida(undefined, "image/svg+xml")).toBe("webp");
  });
});

describe("DELETE /cache/:id", () => {
  it("borra las transformaciones guardadas de esa imagen y solo esas (antes: storage.list no existía, 500)", async () => {
    await app.request(`/preset/${ID}/thumbnail`);
    await app.request(`/preset/${ID}/small`);
    almacen.set(`transforms/${SIN_ORIGINAL}/otra.webp`, {
      bytes: Buffer.from("x"),
      tipo: "image/webp",
    });

    const r = await app.request(`/cache/${ID}`, { method: "DELETE" });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ success: true, cleared: 2 });
    expect([...almacen.keys()].filter((k) => k.startsWith(`transforms/${ID}/`))).toEqual([]);
    expect(almacen.has(`transforms/${SIN_ORIGINAL}/otra.webp`)).toBe(true);
    expect(almacen.has("uploads/1_foto.png")).toBe(true);
  });

  it("sin transformaciones guardadas, cleared: 0", async () => {
    const r = await app.request(`/cache/${ID}`, { method: "DELETE" });
    expect(await r.json()).toEqual({ success: true, cleared: 0 });
  });
});
