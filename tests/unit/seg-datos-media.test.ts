/**
 * Seguridad (datos): kon-media
 * ============================================================================
 *
 *   · Autorización propia (policy "media"): antes las rutas solo pedían sesión
 *     y lo único que frenaba a una cuenta cualquiera era la regla por prefijo
 *     de `auth-guard.ts`. El listado, la ficha, las carpetas y la
 *     CONFIGURACIÓN (con credenciales de S3/R2) se leían sin ser del equipo.
 *   · Tipo REAL por contenido: se guardaba el `Content-Type` y el nombre que
 *     mandaba el cliente; un SVG/HTML con `<script>` entraba como «imagen».
 *   · `PATCH` hacía `set({...body})`: se podía cambiar la `key` del fichero.
 *   · Transformaciones públicas sin topes (anchura, formato, calidad).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { respondError } from "@kitsuden/engine";

import { createTestKonContext } from "../../apps/api/src/lib/test-kon-context";
import { registerMediaPolicy } from "../../packages/core/media/media.policy";
import { createMediaRouter } from "../../packages/core/media/media.routes";
import { detectarTipoReal, nombreSeguro } from "../../packages/core/media/tipo-real";
import {
  createTransformRouter,
  leerOpcionesDeTransformacion,
} from "../../packages/core/media/transform.routes";

const EDITOR = { id: "u-editor", role: "editor" };
const ADMIN = { id: "u-admin", role: "admin" };
const ANA = { id: "u-ana", role: "user" };

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>'
);
const HTML = new TextEncoder().encode("<!doctype html><script>fetch('/api/auth')</script>");

let client: PGlite;
let app: Hono;
const guardados: { key: string; tipo: string }[] = [];

function req(metodo: string, ruta: string, user: object | null, init: RequestInit = {}) {
  return app.request(ruta, {
    method: metodo,
    ...init,
    headers: {
      ...(init.headers as Record<string, string>),
      ...(user ? { "x-test-user": JSON.stringify(user) } : {}),
    },
  });
}

function subida(nombre: string, bytes: Uint8Array, tipoDeclarado: string) {
  const form = new FormData();
  form.append("files", new File([bytes as BlobPart], nombre, { type: tipoDeclarado }));
  return { body: form };
}

beforeEach(() => {
  registerMediaPolicy();
});

afterAll(async () => {
  await client?.close();
});

beforeAll(async () => {
  client = new PGlite();
  await client.exec(
    readFileSync(join(__dirname, "../../packages/core/media/migrations/0000_initial.sql"), "utf8")
  );
  const db = drizzle(client);
  const requireAuth = async (c: any, next: any) =>
    c.get("user") ? next() : c.json({ error: "Unauthorized" }, 401);
  const ctx = createTestKonContext({
    db: { instance: db } as any,
    auth: { requireAuth } as any,
    storage: {
      put: async (key: string, contenido: Buffer, tipo: string) => {
        guardados.push({ key, tipo });
        return { clave: key, url: `/media/${key}`, bytes: contenido.length };
      },
      delete: async () => {},
      publicUrl: (k: string) => `/media/${k}`,
      getSignedDownloadUrl: async (k: string) => `/media/${k}`,
    } as any,
  });
  app = new Hono();
  app.onError((err, c) => respondError(c, err));
  app.use("*", async (c, next) => {
    const crudo = c.req.header("x-test-user");
    c.set("user" as never, (crudo ? JSON.parse(crudo) : null) as never);
    await next();
  });
  app.route("/", createMediaRouter(ctx));
  app.route("/", createTransformRouter(ctx));

  await client.query(
    `INSERT INTO media (id, filename, original_name, mime_type, size, key, bucket, public_url)
     VALUES ('3f2504e0-4f89-41d3-9a0c-0305e82c3301', 'a.png', 'a.png', 'image/png', 10, 'uploads/1_a.png', 'b', '/media/uploads/1_a.png')`
  );
});

describe("tipo real por contenido y nombre seguro", () => {
  it("detecta por los primeros bytes, no por lo que dice el cliente", () => {
    expect(detectarTipoReal(PNG)?.mime).toBe("image/png");
    expect(detectarTipoReal(SVG)).toBeNull();
    expect(detectarTipoReal(HTML)).toBeNull();
    expect(detectarTipoReal(new TextEncoder().encode("%PDF-1.7\n"))?.mime).toBe("application/pdf");
  });

  it("el nombre guardado no lleva rutas ni la extensión que eligió el cliente", () => {
    const png = { mime: "image/png", extension: "png" };
    expect(nombreSeguro("../../etc/passwd", png)).toBe("passwd.png");
    expect(nombreSeguro("..\\..\\x.html", png)).toBe("x.png");
    expect(nombreSeguro("ｆｏｔｏ．ｓｖｇ", png)).toBe("foto.png");
    expect(nombreSeguro("logo.svg", png)).toBe("logo.png");
    expect(nombreSeguro("", png)).toBe("fichero.png");
  });
});

describe("autorización de la mediateca", () => {
  it("el catálogo no es público ni de cualquier cuenta", async () => {
    expect((await req("GET", "/", null)).status).toBe(401);
    expect((await req("GET", "/", ANA)).status).toBe(403);
    expect((await req("GET", "/folders", ANA)).status).toBe(403);
    expect((await req("GET", "/3f2504e0-4f89-41d3-9a0c-0305e82c3301", null)).status).toBe(401);
    expect((await req("GET", "/", EDITOR)).status).toBe(200);
  });

  it("la configuración (credenciales de almacenamiento) es solo de admin", async () => {
    expect((await req("GET", "/config", ANA)).status).toBe(403);
    expect((await req("GET", "/config", EDITOR)).status).toBe(403);
    const prueba = await req("POST", "/config/test-storage", EDITOR, {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storage: { provider: "local", path: "/tmp/x" } }),
    });
    expect(prueba.status).toBe(403);
  });

  it("una cuenta normal no sube, ni edita, ni borra", async () => {
    expect((await req("POST", "/upload", ANA, subida("a.png", PNG, "image/png"))).status).toBe(403);
    const patch = await req("PATCH", "/3f2504e0-4f89-41d3-9a0c-0305e82c3301", ANA, {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ altText: "x" }),
    });
    expect(patch.status).toBe(403);
    expect((await req("DELETE", "/3f2504e0-4f89-41d3-9a0c-0305e82c3301", ANA)).status).toBe(403);
    expect(
      (
        await req("POST", "/focal-point/3f2504e0-4f89-41d3-9a0c-0305e82c3301", ANA, {
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ x: 0.5, y: 0.5 }),
        })
      ).status
    ).toBe(403);
  });
});

describe("subida del equipo", () => {
  it("rechaza SVG y HTML aunque digan ser imágenes", async () => {
    for (const [nombre, bytes] of [
      ["logo.svg", SVG],
      ["foto.png", HTML],
    ] as const) {
      const r = await req("POST", "/upload", EDITOR, subida(nombre, bytes, "image/png"));
      const body = (await r.json()) as any;
      expect(body.files[0].success, nombre).toBe(false);
    }
    expect(guardados.length).toBe(0);
  });

  it("guarda un PNG con el tipo detectado y una clave única con su extensión", async () => {
    const r = await req("POST", "/upload", EDITOR, subida("../x.html", PNG, "text/html"));
    expect(r.status).toBe(201);
    const body = (await r.json()) as any;
    expect(body.files[0].mimeType).toBe("image/png");
    expect(guardados.at(-1)!.tipo).toBe("image/png");
    expect(guardados.at(-1)!.key).toMatch(/^uploads\/[0-9]+_[0-9a-f]{12}_x\.png$/);
  });

  it("PATCH solo cambia lo editable (no la key ni la URL)", async () => {
    const r = await req("PATCH", "/3f2504e0-4f89-41d3-9a0c-0305e82c3301", ADMIN, {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        altText: "Alt",
        key: "juegos/otra-cosa.webp",
        publicUrl: "https://malo",
      }),
    });
    expect(r.status).toBe(200);
    const fila = await client.query<{ key: string; public_url: string; alt_text: string }>(
      `SELECT key, public_url, alt_text FROM media WHERE id = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'`
    );
    expect(fila.rows[0]).toEqual({
      key: "uploads/1_a.png",
      public_url: "/media/uploads/1_a.png",
      alt_text: "Alt",
    });
  });
});

describe("transformaciones públicas con topes", () => {
  it("valida anchura, altura, calidad, formato, ajuste y punto focal", () => {
    expect(
      leerOpcionesDeTransformacion({ w: "800", h: "600", fit: "inside", f: "png" })
    ).toMatchObject({
      width: 800,
      height: 600,
      fit: "inside",
      format: "png",
    });
    for (const malo of <Record<string, string>[]>[
      { w: "100000" },
      { w: "-5" },
      { w: "abc" },
      { h: "0" },
      { q: "1000" },
      { f: "svg" },
      { f: "heif" },
      { fit: "__proto__" },
      { pos: "x" },
      { fp: "5,5" },
    ]) {
      expect(
        () => leerOpcionesDeTransformacion(malo as Record<string, string>),
        JSON.stringify(malo)
      ).toThrow();
    }
  });

  it("un id que no es uuid (p.ej. con `..`) es 404 en caché y transformaciones", async () => {
    expect((await req("GET", "/transform/..%2F..%2Fetc", null)).status).toBe(404);
    expect((await req("DELETE", "/cache/..", EDITOR)).status).toBe(404);
    expect(
      (await req("GET", "/transform/3f2504e0-4f89-41d3-9a0c-0305e82c3301?w=999999", null)).status
    ).toBe(400);
  });
});
