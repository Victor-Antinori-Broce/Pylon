/**
 * Seguridad (2026-10-15): el page builder (`/api/page-builder`) se autoriza SOLO
 * ============================================================================
 *
 * Router montado SIN `puertaDeAdmin`: lo que se deniega aquí se deniega aunque
 * se quite la regla de `RUTAS_SOLO_ADMIN`. Escriben el equipo y el agente con
 * `contenido:editar` (Inti); una cuenta cualquiera, no. Lecturas: borradores,
 * estados inventados y páginas con `requireAuth` no salen al público; el
 * contenido de los bloques (HTML, embed, URLs) y `customCss` se sanean.
 * SQL real con PGlite.
 */

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { resetAuthz } from "@kitsuden/engine";

import { createTestKonContext } from "../../apps/api/src/lib/test-kon-context";
import { registerBlocksPolicy } from "../../packages/core/blocks/blocks.policy";
import { createBlocksRouter } from "../../packages/core/blocks/blocks.routes";

const USUARIOS: Record<string, Record<string, unknown> | null> = {
  anonimo: null,
  usuario: { id: "u-user", role: "user" },
  editor: { id: "u-editor", role: "editor" },
  inti: { id: "agent-inti", role: "agent", scopes: ["contenido:editar"] },
  otroAgente: { id: "agent-x", role: "agent", scopes: ["datasets:read"] },
};

let client: PGlite;
let app: Hono;

async function pedir(
  quien: keyof typeof USUARIOS,
  metodo: string,
  camino: string,
  cuerpo?: unknown
) {
  const res = await app.request(camino, {
    method: metodo,
    headers: { "content-type": "application/json", "x-quien": quien },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await res.text();
  let json: any = texto;
  try {
    json = JSON.parse(texto);
  } catch {
    /* texto */
  }
  return { status: res.status, cuerpo: json };
}

async function pagina(campos: Record<string, unknown>): Promise<string> {
  const cols = Object.keys(campos);
  const r = await client.query<{ id: string }>(
    `INSERT INTO block_pages (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
    cols.map((c) => campos[c])
  );
  return r.rows[0]!.id;
}

beforeAll(async () => {
  client = new PGlite();
  await client.exec(`
    CREATE TYPE block_page_status AS ENUM ('draft','published','archived');
    CREATE TABLE block_pages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title varchar(500) NOT NULL, slug varchar(500) NOT NULL UNIQUE, description text,
      status block_page_status NOT NULL DEFAULT 'draft',
      meta_title varchar(500), meta_description text, og_image_id uuid,
      layout varchar(50) NOT NULL DEFAULT 'default', css_class varchar(200), custom_css text,
      published_at timestamptz, author_id uuid,
      is_homepage boolean NOT NULL DEFAULT false, require_auth boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE block_contents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      page_id uuid NOT NULL REFERENCES block_pages(id) ON DELETE CASCADE,
      type varchar(64) NOT NULL, name varchar(200),
      sort_order integer NOT NULL DEFAULT 0, column_span integer NOT NULL DEFAULT 12,
      content jsonb NOT NULL,
      css_class varchar(200), background_color varchar(50), text_color varchar(50), padding varchar(50),
      is_visible boolean NOT NULL DEFAULT true, visible_from timestamptz, visible_until timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE block_templates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(200) NOT NULL, description text,
      category varchar(100) NOT NULL, type varchar(64) NOT NULL, content jsonb NOT NULL,
      css_class varchar(200), background_color varchar(50), text_color varchar(50), padding varchar(50),
      is_active boolean NOT NULL DEFAULT true, usage_count integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const ctx = createTestKonContext({
    db: { instance: drizzle(client) } as any,
    auth: {
      requireAuth: async (c: any, next: any) =>
        c.get("user") ? next() : c.json({ error: "Unauthorized" }, 401),
      optionalAuth: async (_c: any, next: any) => next(),
    } as any,
    // Sin caché: cada petición lee la base (la decisión de visibilidad es por petición).
    cache: {
      get: async () => null,
      set: async () => {},
      del: async () => {},
      invalidate: async () => {},
    } as any,
  });

  app = new Hono();
  app.use("*", async (c, next) => {
    const u = USUARIOS[c.req.header("x-quien") ?? "anonimo"];
    if (u) c.set("user" as never, u as never);
    await next();
  });
  app.route("/api/page-builder", createBlocksRouter(ctx) as unknown as Hono);
});

afterAll(async () => {
  await client?.close();
});

beforeEach(async () => {
  resetAuthz();
  registerBlocksPolicy();
  await client.exec(
    "DELETE FROM block_contents; DELETE FROM block_pages; DELETE FROM block_templates;"
  );
});

describe("escrituras", () => {
  it("una cuenta cualquiera u otro agente no escriben; anónimo 401", async () => {
    const id = await pagina({ title: "P", slug: "p", status: "published" });
    for (const quien of ["usuario", "otroAgente"] as const) {
      expect((await pedir(quien, "POST", "/api/page-builder/pages", { title: "X" })).status).toBe(
        403
      );
      expect(
        (await pedir(quien, "PATCH", `/api/page-builder/pages/${id}`, { title: "pwned" })).status
      ).toBe(403);
      expect((await pedir(quien, "DELETE", `/api/page-builder/pages/${id}`)).status).toBe(403);
      expect(
        (
          await pedir(quien, "POST", `/api/page-builder/pages/${id}/blocks`, {
            type: "text",
            content: { text: "x" },
          })
        ).status
      ).toBe(403);
      expect(
        (
          await pedir(quien, "POST", "/api/page-builder/pages/from-block", {
            title: "t",
            blockType: "text",
          })
        ).status
      ).toBe(403);
      expect((await pedir(quien, "POST", `/api/page-builder/pages/${id}/clone`, {})).status).toBe(
        403
      );
      expect(
        (
          await pedir(quien, "POST", "/api/page-builder/templates", {
            name: "t",
            category: "c",
            type: "text",
            content: {},
          })
        ).status
      ).toBe(403);
    }
    expect((await pedir("anonimo", "POST", "/api/page-builder/pages", { title: "X" })).status).toBe(
      401
    );
    const r = await client.query<{ title: string }>("SELECT title FROM block_pages");
    expect(r.rows).toEqual([{ title: "P" }]);
  });

  it("el equipo e Inti (contenido:editar) sí; la portada solo el equipo", async () => {
    expect(
      (await pedir("editor", "POST", "/api/page-builder/pages", { title: "Una", slug: "una" }))
        .status
    ).toBe(201);
    expect(
      (await pedir("inti", "POST", "/api/page-builder/pages", { title: "Dos", slug: "dos" })).status
    ).toBe(201);
    expect(
      (await pedir("inti", "POST", "/api/page-builder/pages", { title: "Tres", isHomepage: true }))
        .status
    ).toBe(403);
  });

  it("asignación masiva: authorId del cuerpo no se guarda; estado, slug, CSS y estilos se validan", async () => {
    const creada = await pedir("editor", "POST", "/api/page-builder/pages", {
      title: "A",
      authorId: "00000000-0000-4000-8000-000000000000",
    });
    expect(creada.status).toBe(201);
    expect(creada.cuerpo.authorId).toBeNull();

    expect(
      (await pedir("editor", "POST", "/api/page-builder/pages", { title: "B", status: "hackeado" }))
        .status
    ).toBe(400);
    expect(
      (
        await pedir("editor", "POST", "/api/page-builder/pages", {
          title: "C",
          customCss: "</style><script>alert(1)</script>",
        })
      ).status
    ).toBe(400);
    expect(
      (
        await pedir("editor", "POST", "/api/page-builder/pages", {
          title: "D",
          blocks: [{ type: "text", cssClass: '" onmouseover="x', content: {} }],
        })
      ).status
    ).toBe(400);
    expect(
      (
        await pedir("editor", "POST", "/api/page-builder/pages", {
          title: "E",
          blocks: [{ type: "no-existe", content: {} }],
        })
      ).status
    ).toBe(400);
    expect(
      (
        await pedir("editor", "PATCH", `/api/page-builder/pages/${creada.cuerpo.id}`, {
          slug: "../x",
        })
      ).status
    ).toBe(400);
    expect(
      (
        await pedir("editor", "PATCH", `/api/page-builder/pages/${creada.cuerpo.id}`, {
          status: "x",
        })
      ).status
    ).toBe(400);
  });

  it("el contenido de los bloques se guarda saneado", async () => {
    const creada = await pedir("editor", "POST", "/api/page-builder/pages", {
      title: "F",
      blocks: [
        { type: "text", content: { format: "html", text: "<p>ok</p><script>alert(1)</script>" } },
        {
          type: "embed",
          content: {
            code: '<iframe src="https://evil.example/x"></iframe><img src=x onerror=alert(1)>',
          },
        },
        {
          type: "cta",
          content: { title: "t", buttonLabel: "b", buttonUrl: "javascript:alert(1)" },
        },
      ],
    });
    expect(creada.status).toBe(201);
    const r = await client.query<{ content: any }>(
      "SELECT content FROM block_contents ORDER BY sort_order"
    );
    expect(r.rows.map((f) => f.content)).toEqual([
      { format: "html", text: "<p>ok</p>" },
      { code: '<img src="x">' },
      { title: "t", buttonLabel: "b", buttonUrl: "" },
    ]);
  });
});

describe("lecturas públicas", () => {
  it("borradores, estados inventados y requireAuth no salen al público", async () => {
    await pagina({ title: "Pub", slug: "pub", status: "published" });
    const borrador = await pagina({ title: "Borrador", slug: "borrador", status: "draft" });
    await pagina({ title: "Socios", slug: "socios", status: "published", require_auth: true });

    const slugs = async (quien: keyof typeof USUARIOS, q = "") =>
      (await pedir(quien, "GET", `/api/page-builder/pages${q}`)).cuerpo.docs
        ?.map((p: any) => p.slug)
        .sort();

    expect(await slugs("anonimo")).toEqual(["pub"]);
    expect(await slugs("anonimo", "?status=draft")).toEqual(["pub"]);
    // `eqEnum` devolvía undefined con un estado inventado y la condición desaparecía: salían TODAS.
    expect(await slugs("anonimo", "?status=inventado")).toEqual(["pub"]);
    expect(await slugs("editor", "?status=draft")).toEqual(["borrador"]);
    expect((await pedir("editor", "GET", "/api/page-builder/pages?status=inventado")).status).toBe(
      400
    );

    expect((await pedir("anonimo", "GET", `/api/page-builder/pages/${borrador}`)).status).toBe(404);
    expect((await pedir("anonimo", "GET", "/api/page-builder/pages/borrador")).status).toBe(404);
    expect((await pedir("editor", "GET", "/api/page-builder/pages/borrador")).status).toBe(200);

    expect((await pedir("anonimo", "GET", "/api/page-builder/pages/socios")).status).toBe(404);
    expect((await pedir("anonimo", "GET", "/api/page-builder/render/socios")).status).toBe(404);
    expect((await pedir("usuario", "GET", "/api/page-builder/render/socios")).status).toBe(200);
    expect((await pedir("anonimo", "GET", "/api/page-builder/render/pub")).status).toBe(200);
    expect(
      (await pedir("anonimo", "GET", "/api/page-builder/render/pub")).cuerpo.requireAuth
    ).toBeUndefined();
  });

  it("lo guardado antes (o por un cargador) se sirve saneado, y customCss malo no se sirve", async () => {
    const id = await pagina({
      title: "Vieja",
      slug: "vieja",
      status: "published",
      custom_css: "</style><script>robar()</script>",
    });
    await client.query(
      "INSERT INTO block_contents (page_id, type, content) VALUES ($1, 'text', $2)",
      [id, JSON.stringify({ format: "html", text: "<b onmouseover=robar()>x</b>" })]
    );
    const render = await pedir("anonimo", "GET", "/api/page-builder/render/vieja");
    expect(render.cuerpo.page.customCss).toBeNull();
    expect(render.cuerpo.blocks[0].content.text).toBe("<b>x</b>");
    const suelta = await pedir("anonimo", "GET", "/api/page-builder/pages/vieja");
    expect(JSON.stringify(suelta.cuerpo)).not.toContain("robar");
  });
});
