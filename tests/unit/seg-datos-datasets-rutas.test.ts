/**
 * Seguridad (datos): kon-datasets autoriza cada operación por sí mismo
 * ============================================================================
 *
 * En producción `/api/datasets/*` solo exigía SESIÓN (el `requireAuth` de
 * `datasets-query`, que cubre todo el prefijo) y el alta de cuentas es
 * pública. Con una cuenta recién creada se podía:
 *
 *   · reescribir, mover de dataset o borrar CUALQUIER entrada (IDOR por id);
 *   · crear datasets y cambiar la `policyJson` de uno ajeno (`PATCH {...body}`);
 *   · leer por id entradas de datasets privados, buscar en ellos, exportarlos;
 *   · guardar campos calculados (que además se ejecutaban con `new Function`).
 *
 * Estas pruebas montan el router del kon sobre PGlite (SQL real, sin Docker) y
 * hacen de "middleware de sesión" con una cabecera de test. Fallan con el
 * router anterior: la cuenta normal recibía 200/201 donde ahora hay 403/404.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { respondError } from "@kitsuden/engine";

import { createTestKonContext } from "../../apps/api/src/lib/test-kon-context";
import { registerDatasetsPolicy } from "../../packages/core/datasets/datasets.policy";
import { createDatasetsRouter } from "../../packages/core/datasets/datasets.routes";

const ADMIN = { id: "u-admin", role: "admin" };
const EDITOR = { id: "u-editor", role: "editor" };
const ANA = { id: "u-ana", role: "user" };
const BEA = { id: "u-bea", role: "user" };

let client: PGlite;
let app: Hono;

const g = globalThis as Record<string, unknown>;

let PUBLICO = "";
let PRIVADO = "";
let COMUNITARIO = "";
let ENTRADA_PUBLICA = "";
let ENTRADA_PRIVADA = "";

async function pedir(
  metodo: string,
  ruta: string,
  user: Record<string, unknown> | null,
  cuerpo?: unknown
): Promise<{ status: number; body: any }> {
  const res = await app.request(ruta, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      ...(user ? { "x-test-user": JSON.stringify(user) } : {}),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await res.text();
  let body: any = texto;
  try {
    body = JSON.parse(texto);
  } catch {
    /* texto */
  }
  return { status: res.status, body };
}

beforeEach(() => {
  registerDatasetsPolicy();
  delete g.__seg_datos_pwned;
});

afterAll(async () => {
  await client?.close();
});

beforeAll(async () => {
  client = new PGlite();
  await client.exec(`
    CREATE TABLE data_sets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(200) NOT NULL,
      slug VARCHAR(200) NOT NULL UNIQUE,
      description TEXT,
      icon VARCHAR(50),
      schema JSONB DEFAULT '[]',
      display_config JSONB,
      policy_json JSONB,
      workflow_json JSONB,
      content_config JSONB,
      game_id UUID,
      source_name VARCHAR(300),
      source_url TEXT,
      source_license TEXT,
      source_version VARCHAR(60),
      fetched_at TIMESTAMPTZ,
      source_caveats JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE data_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(500) NOT NULL,
      data_set_id UUID NOT NULL REFERENCES data_sets(id) ON DELETE CASCADE,
      data JSONB NOT NULL DEFAULT '{}',
      owner_id TEXT,
      status VARCHAR(50) DEFAULT 'published',
      sort_order INTEGER DEFAULT 0,
      thumbnail_id UUID,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      created_by_id TEXT,
      updated_by_id TEXT
    );
  `);
  // La tabla de campos calculados sale de la migración del kon.
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  await client.exec(
    readFileSync(
      join(__dirname, "../../packages/core/datasets/migrations/0001_calculated_fields.sql"),
      "utf8"
    )
  );

  const db = drizzle(client);
  const requireAuth = async (c: any, next: any) =>
    c.get("user") ? next() : c.json({ error: "Unauthorized" }, 401);
  const requireRole = (roles: string[]) => async (c: any, next: any) =>
    roles.includes(c.get("user")?.role) ? next() : c.json({ error: "Forbidden" }, 403);

  const ctx = createTestKonContext({
    db: { instance: db } as any,
    auth: { requireAuth, requireRole, optionalAuth: requireAuth } as any,
  });

  app = new Hono();
  app.onError((err, c) => respondError(c, err));
  // Hace de middleware global de sesión del host.
  app.use("*", async (c, next) => {
    const crudo = c.req.header("x-test-user");
    c.set("user" as never, (crudo ? JSON.parse(crudo) : null) as never);
    await next();
  });
  app.route("/", createDatasetsRouter(ctx));

  const crear = async (slug: string, policyJson: unknown) =>
    (
      await client.query<{ id: string }>(
        `INSERT INTO data_sets (name, slug, policy_json) VALUES ($1, $1, $2) RETURNING id`,
        [slug, JSON.stringify(policyJson)]
      )
    ).rows[0].id;

  PUBLICO = await crear("publico", {
    readAccess: "public",
    writeAccess: "admin",
    enableRLS: false,
  });
  PRIVADO = await crear("privado", { readAccess: "admin", writeAccess: "admin", enableRLS: false });
  COMUNITARIO = await crear("comunitario", {
    readAccess: "public",
    writeAccess: "authenticated",
    enableRLS: false,
  });

  const entrada = async (ds: string, title: string, data: unknown) =>
    (
      await client.query<{ id: string }>(
        `INSERT INTO data_entries (title, data_set_id, data) VALUES ($1, $2, $3) RETURNING id`,
        [title, ds, JSON.stringify(data)]
      )
    ).rows[0].id;

  ENTRADA_PUBLICA = await entrada(PUBLICO, "Espada", { dano: 10 });
  ENTRADA_PRIVADA = await entrada(PRIVADO, "Secreto", { clave: "no-se-ve" });
});

describe("definición de datasets: solo el equipo, y la política solo admin", () => {
  it("una cuenta normal no crea datasets", async () => {
    const r = await pedir("POST", "/", ANA, { name: "Mío", slug: "mio" });
    expect(r.status).toBe(403);
  });

  it("una cuenta normal no cambia la política de un dataset ajeno", async () => {
    const r = await pedir("PATCH", `/${PRIVADO}`, ANA, { policyJson: { readAccess: "public" } });
    expect(r.status).toBe(404); // ni siquiera lo ve
    const r2 = await pedir("PATCH", `/${PUBLICO}`, ANA, {
      policyJson: { readAccess: "public", writeAccess: "authenticated" },
    });
    expect(r2.status).toBe(403);
    const fila = await client.query<{ policy_json: any }>(
      `SELECT policy_json FROM data_sets WHERE id = $1`,
      [PUBLICO]
    );
    expect(fila.rows[0].policy_json.writeAccess).toBe("admin");
  });

  it("un editor edita, pero no la política ni campos internos", async () => {
    const r = await pedir("PATCH", `/${PUBLICO}`, EDITOR, {
      policyJson: { readAccess: "public", writeAccess: "authenticated" },
    });
    expect(r.status).toBe(403);
    const r2 = await pedir("PATCH", `/${PUBLICO}`, EDITOR, {
      description: "nueva",
      id: "00000000-0000-0000-0000-000000000000",
      createdAt: "2000-01-01T00:00:00Z",
    });
    expect(r2.status).toBe(200);
    expect(r2.body.id).toBe(PUBLICO);
    expect(r2.body.description).toBe("nueva");
    expect(new Date(r2.body.createdAt).getUTCFullYear()).not.toBe(2000);
  });

  it("admin sí cambia la política", async () => {
    const r = await pedir("PATCH", `/${COMUNITARIO}`, ADMIN, {
      policyJson: { readAccess: "public", writeAccess: "authenticated", enableRLS: false },
    });
    expect(r.status).toBe(200);
  });

  it("el listado y la ficha no enseñan datasets privados", async () => {
    const lista = await pedir("GET", "/", null);
    const slugs = lista.body.docs.map((d: { slug: string }) => d.slug);
    expect(slugs).toContain("publico");
    expect(slugs).not.toContain("privado");
    expect((await pedir("GET", `/${PRIVADO}`, ANA)).status).toBe(404);
    expect((await pedir("GET", `/slug/privado`, null)).status).toBe(404);
    expect((await pedir("GET", `/${PRIVADO}`, EDITOR)).status).toBe(200);
  });
});

describe("entradas: IDOR, asignación masiva y dueño", () => {
  it("una cuenta normal no escribe en un dataset de solo administración", async () => {
    const r = await pedir("POST", `/${PUBLICO}/entries`, ANA, { title: "Spam", data: {} });
    expect(r.status).toBe(403);
    const r2 = await pedir("PATCH", `/${PUBLICO}/entries/${ENTRADA_PUBLICA}`, ANA, {
      title: "Hackeado",
    });
    expect(r2.status).toBe(403);
    const r3 = await pedir("DELETE", `/${PUBLICO}/entries/${ENTRADA_PUBLICA}`, ANA);
    expect(r3.status).toBe(403);
    const fila = await client.query<{ title: string }>(
      `SELECT title FROM data_entries WHERE id = $1`,
      [ENTRADA_PUBLICA]
    );
    expect(fila.rows[0].title).toBe("Espada");
  });

  it("una entrada privada no se lee por id a través de un dataset público", async () => {
    const r = await pedir("GET", `/${PUBLICO}/entries/${ENTRADA_PRIVADA}`, null);
    expect(r.status).toBe(404);
    const r2 = await pedir("GET", `/${PRIVADO}/entries/${ENTRADA_PRIVADA}`, ANA);
    expect(r2.status).toBe(404);
  });

  it("ni el equipo mueve una entrada de dataset por la URL de otro", async () => {
    const r = await pedir("PATCH", `/${PUBLICO}/entries/${ENTRADA_PRIVADA}`, EDITOR, {
      title: "x",
    });
    expect(r.status).toBe(404);
    const r2 = await pedir("PATCH", `/${PUBLICO}/entries/${ENTRADA_PUBLICA}`, EDITOR, {
      dataSetId: PRIVADO,
      title: "Espada+",
    });
    expect(r2.status).toBe(200);
    expect(r2.body.dataSetId).toBe(PUBLICO);
  });

  it("en un dataset comunitario cada uno escribe lo SUYO", async () => {
    const creada = await pedir("POST", `/${COMUNITARIO}/entries`, ANA, {
      title: "Build de Ana",
      data: { arma: "arco" },
      ownerId: BEA.id, // intento de atribuírsela a otra
      status: "featured", // intento de saltarse la moderación
    });
    expect(creada.status).toBe(201);
    expect(creada.body.ownerId).toBe(ANA.id);
    expect(creada.body.status).toBe("published");

    const ajena = await pedir("PATCH", `/${COMUNITARIO}/entries/${creada.body.id}`, BEA, {
      title: "de Bea",
    });
    expect(ajena.status).toBe(403);
    const borrar = await pedir("DELETE", `/${COMUNITARIO}/entries/${creada.body.id}`, BEA);
    expect(borrar.status).toBe(403);

    const propia = await pedir("PATCH", `/${COMUNITARIO}/entries/${creada.body.id}`, ANA, {
      title: "Build de Ana v2",
      ownerId: BEA.id,
    });
    expect(propia.status).toBe(200);
    expect(propia.body.ownerId).toBe(ANA.id);
  });

  it("sin sesión no se escribe nada", async () => {
    expect((await pedir("POST", `/${COMUNITARIO}/entries`, null, { title: "x" })).status).toBe(401);
  });
});

describe("lecturas masivas: búsqueda, comparación, exportación, snapshots", () => {
  it("no se busca ni se compara en un dataset privado", async () => {
    expect((await pedir("GET", `/${PRIVADO}/search?q=secreto`, null)).status).toBe(404);
    expect((await pedir("GET", `/${PRIVADO}/search?q=secreto`, ANA)).status).toBe(404);
    const cmp = await pedir("POST", `/${PRIVADO}/compare`, ANA, {
      entryIds: [ENTRADA_PRIVADA, ENTRADA_PUBLICA],
    });
    expect(cmp.status).toBe(404);
    expect(
      (await pedir("GET", `/${PRIVADO}/entries/${ENTRADA_PRIVADA}/snapshots`, ANA)).status
    ).toBe(404);
  });

  it("exportar es del equipo", async () => {
    const r = await pedir("POST", "/export", ANA, { datasets: [PRIVADO] });
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.body)).not.toContain("no-se-ve");
  });

  it("restaurar un snapshot es del equipo", async () => {
    const r = await pedir("POST", `/${PUBLICO}/entries/${ENTRADA_PUBLICA}/restore`, ANA, {
      timestamp: "2020-01-01",
    });
    expect(r.status).toBe(403);
  });

  it("las estadísticas de índices son de administración", async () => {
    expect((await pedir("GET", "/indexes/stats", ANA)).status).toBe(403);
    expect((await pedir("POST", "/indexes/report", EDITOR)).status).toBe(403);
  });

  it("demasiados filtros en una búsqueda es 400, no trabajo para la base", async () => {
    const filtros = Array.from({ length: 30 }, (_, i) => `c${i}:x`).join(",");
    expect((await pedir("GET", `/${PUBLICO}/search?filtros=${filtros}`, null)).status).toBe(400);
  });
});

describe("campos calculados: solo el equipo, y nunca ejecutan código", () => {
  it("una cuenta normal no crea ni borra campos calculados", async () => {
    const r = await pedir("POST", `/${PUBLICO}/calculated-fields`, ANA, {
      name: "x",
      label: "x",
      type: "formula",
      config: { expression: "1" },
    });
    expect(r.status).toBe(403);
    expect((await pedir("GET", `/${PRIVADO}/calculated-fields`, ANA)).status).toBe(404);
  });

  it("la fórmula de un editor se interpreta, no se ejecuta", async () => {
    const r = await pedir("POST", `/${PUBLICO}/calculated-fields`, EDITOR, {
      name: "trampa",
      label: "trampa",
      type: "formula",
      config: { expression: "globalThis.__seg_datos_pwned = 1" },
    });
    expect(r.status).toBe(201);
    const r2 = await pedir("POST", `/${PUBLICO}/calculated-fields`, EDITOR, {
      name: "doble",
      label: "doble",
      type: "formula",
      config: { expression: "{dano} * 2" },
    });
    expect(r2.status).toBe(201);

    const lista = await pedir("GET", `/${PUBLICO}/entries?includeCalculated=true`, null);
    expect(lista.status).toBe(200);
    expect(g.__seg_datos_pwned).toBeUndefined();
    const espada = lista.body.docs.find((d: { id: string }) => d.id === ENTRADA_PUBLICA);
    expect(espada._calculated.trampa).toBeNull();
    expect(espada._calculated.doble).toBe(20);
  });
});
