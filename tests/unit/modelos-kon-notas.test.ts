/**
 * defineModelo de punta a punta (fase H3): el kon de demostración `kon-notas`
 * ============================================================================
 *
 * Dos modelos declarados UNA vez (tests/unit/fixtures/kon-notas/notas.modelo.ts)
 * y su migración GENERADA por `kitsuden makemigrations` (0000_models.sql). Aquí
 * se monta el kon como lo monta el anfitrión: PGlite con un rol SIN
 * superusuario (si no, Postgres se salta la RLS y todo daría verde), la
 * transacción RLS por petición del motor y el router del SDK.
 *
 * Lo que vigila:
 *   · modelo → tabla: la tabla Drizzle y la de la migración son la misma;
 *   · REST: CRUD, validación 422 problem+json, 404 sin filtrar existencia, 409;
 *   · aislamiento: cada cuenta ve lo suyo, el admin todo, el anónimo nada;
 *   · scopes de agente: sin scope nada, `note:read` no escribe, `note:write`
 *     sí, una denegación gana a `admin`, `usuario:actuar` no escribe;
 *   · RLS de verdad, con SABOTAJE: se debilita la política y la sonda tiene
 *     que detectarlo; se restaura y vuelve a aislar;
 *   · OpenAPI 3.1 (validado) y herramientas MCP de las mismas declaraciones.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import {
  campo,
  defineModelo,
  politicasRls,
  scopesQueConceden,
  type KonContext,
} from "@kitsuden/shared";
import { Validator } from "@seriousme/openapi-schema-validator";
import { sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import { Hono, type MiddlewareHandler } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  componentesComunes,
  herramientaMcp,
  operacionOpenApi,
} from "../../apps/api/src/lib/operaciones-openapi";
import { problemasHttp } from "../../apps/api/src/middleware/problemas-http";
import { respondError } from "../../packages/engine/src/errors";
import { tablaDeModelo } from "../../packages/engine/src/modelos";
import { operacionesDe } from "../../packages/engine/src/operaciones";
import { dbDeLaPeticion, transaccionRls } from "../../packages/engine/src/rls-peticion";

import { kon } from "./fixtures/kon-notas/index";
import { category, note } from "./fixtures/kon-notas/notas.modelo";

const RAIZ = resolve(__dirname, "../..");
const leer = (ruta: string) => readFileSync(resolve(RAIZ, ruta), "utf8");

let cliente: PGlite;
let db: ReturnType<typeof drizzle>;
let app: Hono;

type Quien = { id: string; role: string; scopes?: string[] };
const CUENTAS: Record<string, Quien> = {
  ana: { id: "ana", role: "user" },
  bob: { id: "bob", role: "user" },
  edi: { id: "edi", role: "editor" },
  adm: { id: "adm", role: "admin" },
};

/** Quién pregunta: `x-quien` (cuenta) o `x-agente` (scopes separados por comas). */
const sesion: MiddlewareHandler = async (c, next) => {
  const quien = c.req.header("x-quien");
  const agente = c.req.header("x-agente");
  if (quien && CUENTAS[quien]) c.set("user" as never, CUENTAS[quien] as never);
  if (agente !== undefined) {
    c.set("user" as never, { id: "ag_1", role: "agent", scopes: agente.split(",").filter(Boolean) } as never);
  }
  await next();
};
const requireAuth: MiddlewareHandler = async (c, next) => {
  if (!c.get("user" as never)) return c.json({ error: "Unauthorized" }, 401);
  await next();
};
const optionalAuth: MiddlewareHandler = async (_c, next) => next();

const filas = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? r) as Record<string, unknown>[];

beforeAll(async () => {
  cliente = new PGlite();
  await cliente.exec(leer("apps/api/src/db/funciones-de-agente.sql"));
  await cliente.exec(leer("tests/unit/fixtures/kon-notas/migrations/0000_models.sql"));
  await cliente.exec(`
    CREATE ROLE rls_app NOLOGIN;
    GRANT USAGE ON SCHEMA public TO rls_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rls_app;
    SET ROLE rls_app;
  `);
  const r = await cliente.query<{ su: boolean }>(
    `SELECT rolsuper OR rolbypassrls AS su FROM pg_roles WHERE rolname = current_user`
  );
  expect(r.rows[0]?.su).toBe(false);

  db = drizzle(cliente);
  const ctx = {
    db: { instance: dbDeLaPeticion(db) },
    auth: { requireAuth, optionalAuth },
  } as unknown as KonContext;
  app = new Hono();
  app.onError((err, c) => respondError(c, err));
  // Las mismas piezas que el anfitrión pone delante de toda ruta de un kon:
  // problem+json a la salida y la transacción RLS por petición.
  app.use("/api/*", problemasHttp());
  app.use("*", sesion);
  app.use("/api/*", transaccionRls(db));
  app.route("/api/notas", kon.createRouter(ctx));
});

afterAll(async () => {
  await cliente?.close();
});

function pedir(
  ruta: string,
  o: { quien?: string; agente?: string[]; metodo?: string; cuerpo?: unknown } = {}
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (o.quien) headers["x-quien"] = o.quien;
  if (o.agente) headers["x-agente"] = o.agente.join(",");
  return app.request(`/api/notas${ruta}`, {
    method: o.metodo ?? "GET",
    headers,
    body: o.cuerpo === undefined ? undefined : JSON.stringify(o.cuerpo),
  });
}

async function crearNota(quien: string, titulo: string): Promise<Record<string, unknown>> {
  const res = await pedir("/notes", { quien, metodo: "POST", cuerpo: { title: titulo } });
  expect(res.status, await res.clone().text()).toBe(201);
  return (await res.json()) as Record<string, unknown>;
}

// ═════════════════════════════════════════════════════════════════════════════

describe("modelo → tabla", () => {
  it("la tabla Drizzle tiene las columnas que creó la migración generada", async () => {
    const drizzleCols = getTableConfig(tablaDeModelo(note)).columns.map((c) => c.name).sort();
    const sqlCols = filas(
      await db.execute(
        sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'notes'`
      )
    )
      .map((f) => String(f.column_name))
      .sort();
    expect(drizzleCols).toEqual(sqlCols);
    expect(sqlCols).toEqual(
      ["body", "created_at", "due_at", "id", "meta", "owner_id", "pinned", "priority", "slug", "status", "title", "updated_at"]
    );
  });

  it("las dos tablas nacen con RLS ENABLE y FORCE", async () => {
    const r = filas(
      await db.execute(
        sql`SELECT relname, relrowsecurity AS rls, relforcerowsecurity AS forzada FROM pg_class WHERE relname IN ('notes', 'categories') ORDER BY relname`
      )
    );
    expect(r).toEqual([
      { relname: "categories", rls: true, forzada: true },
      { relname: "notes", rls: true, forzada: true },
    ]);
  });

  it("el kon declara sus tablas y seis operaciones por modelo", () => {
    expect(kon.tables).toEqual(["notes", "categories"]);
    expect(operacionesDe(kon).map((o) => o.id)).toEqual([
      "describe-note",
      "list-notes",
      "get-note",
      "create-note",
      "update-note",
      "delete-note",
      "describe-category",
      "list-categories",
      "get-category",
      "create-category",
      "update-category",
      "delete-category",
    ]);
  });
});

describe("REST: CRUD con validación y problem+json", () => {
  it("crear → 201 con dueño y valores por defecto de la columna", async () => {
    const n = await crearNota("ana", "Comprar pan");
    expect(n).toMatchObject({ title: "Comprar pan", ownerId: "ana", status: "draft", priority: 0, pinned: false });
    expect(typeof n.id).toBe("string");
  });

  it("el dueño no se elige: un ownerId en el cuerpo es un campo desconocido (422)", async () => {
    const res = await pedir("/notes", { quien: "ana", metodo: "POST", cuerpo: { title: "x", ownerId: "bob" } });
    // No se puede forjar el dueño: el campo no existe en la entrada (422 con la lista de válidos).
    expect(res.status).toBe(422);
    expect(JSON.stringify(await res.json())).toContain("ownerId");
  });

  it("un campo mal escrito es 422 KITSUDEN_E_VALIDATION con «¿quisiste decir?»", async () => {
    const res = await pedir("/notes", { quien: "ana", metodo: "POST", cuerpo: { titel: "x" } });
    expect(res.status).toBe(422);
    const cuerpo = JSON.stringify(await res.json());
    expect(cuerpo).toContain("KITSUDEN_E_VALIDATION");
    expect(cuerpo).toContain("title");
  });

  it("valores fuera del modelo: enum, rango y longitud → 422", async () => {
    for (const malo of [{ title: "x", status: "borrado" }, { title: "x", priority: 9 }, { title: "x".repeat(201) }]) {
      const res = await pedir("/notes", { quien: "ana", metodo: "POST", cuerpo: malo });
      expect(res.status, JSON.stringify(malo)).toBe(422);
    }
  });

  it("leer, listar, editar y borrar", async () => {
    const n = await crearNota("ana", "Llamar");
    const uno = await pedir(`/notes/${n.id}`, { quien: "ana" });
    expect(uno.status).toBe(200);
    const lista = (await (await pedir("/notes?limit=50&sort=title", { quien: "ana" })).json()) as {
      data: { id: string }[];
      total: number;
      limit: number;
    };
    expect(lista.data.some((f) => f.id === n.id)).toBe(true);
    expect(lista.limit).toBe(50);
    const editada = await pedir(`/notes/${n.id}`, {
      quien: "ana",
      metodo: "PATCH",
      cuerpo: { status: "published", dueAt: "2026-11-01T10:00:00Z", meta: { a: 1 } },
    });
    expect(editada.status).toBe(200);
    expect(await editada.json()).toMatchObject({ status: "published", meta: { a: 1 }, title: "Llamar" });
    const filtro = (await (await pedir("/notes?status=published", { quien: "ana" })).json()) as { data: { id: string }[] };
    expect(filtro.data.map((f) => f.id)).toContain(n.id);
    expect((await pedir(`/notes/${n.id}`, { quien: "ana", metodo: "DELETE" })).status).toBe(204);
    expect((await pedir(`/notes/${n.id}`, { quien: "ana" })).status).toBe(404);
  });

  it("un id que no es uuid es 422, no un 500 de Postgres", async () => {
    expect((await pedir("/notes/no-es-uuid", { quien: "ana" })).status).toBe(422);
  });

  it("el descriptor del modelo (lo que pinta el panel)", async () => {
    const res = await pedir("/notes/_model", { quien: "ana" });
    expect(res.status).toBe(200);
    const d = (await res.json()) as { scopes: unknown; campos: { clave: string }[]; conDueno: boolean };
    expect(d.scopes).toEqual({ leer: "note:read", escribir: "note:write" });
    expect(d.conDueno).toBe(true);
    expect(d.campos.map((c) => c.clave)).toEqual(["title", "body", "status", "priority", "pinned", "dueAt", "slug", "meta"]);
  });
});

describe("aislamiento por dueño (los dos muros: handler y RLS)", () => {
  it("bob no ve, no lee, no edita ni borra lo de ana (404, sin filtrar existencia)", async () => {
    const n = await crearNota("ana", "Secreto de ana");
    const deBob = (await (await pedir("/notes?limit=100", { quien: "bob" })).json()) as { data: { id: string }[]; total: number };
    expect(deBob.data.find((f) => f.id === n.id)).toBeUndefined();
    expect((await pedir(`/notes/${n.id}`, { quien: "bob" })).status).toBe(404);
    expect((await pedir(`/notes/${n.id}`, { quien: "bob", metodo: "PATCH", cuerpo: { title: "mío" } })).status).toBe(404);
    expect((await pedir(`/notes/${n.id}`, { quien: "bob", metodo: "DELETE" })).status).toBe(404);
    expect((await pedir(`/notes/${n.id}`, { quien: "ana" })).status).toBe(200);
  });

  it("el admin lo ve todo; el editor (staff) no es dueño de las notas ajenas", async () => {
    const n = await crearNota("ana", "Para el admin");
    expect((await pedir(`/notes/${n.id}`, { quien: "adm" })).status).toBe(200);
    expect((await pedir(`/notes/${n.id}`, { quien: "edi" })).status).toBe(404);
  });

  it("sin sesión: 401 en notas; las categorías (públicas) se leen", async () => {
    expect((await pedir("/notes")).status).toBe(401);
    expect((await pedir("/categories")).status).toBe(200);
    expect((await pedir("/categories", { metodo: "POST", cuerpo: { name: "x" } })).status).toBe(401);
  });

  it("categorías: escribe el equipo, no una cuenta cualquiera; repetir el único es 409", async () => {
    expect((await pedir("/categories", { quien: "ana", metodo: "POST", cuerpo: { name: "Ocio" } })).status).toBe(403);
    expect((await pedir("/categories", { quien: "edi", metodo: "POST", cuerpo: { name: "Ocio" } })).status).toBe(201);
    const repetida = await pedir("/categories", { quien: "edi", metodo: "POST", cuerpo: { name: "Ocio" } });
    expect(repetida.status).toBe(409);
    expect(repetida.headers.get("content-type")).toContain("application/problem+json");
    expect(((await repetida.json()) as { code: string }).code).toBe("KITSUDEN_E_CONFLICT");
    const publica = (await (await pedir("/categories")).json()) as { data: { name: string }[] };
    expect(publica.data.map((c) => c.name)).toContain("Ocio");
  });
});

describe("scopes de agente: un agente nunca escribe por defecto", () => {
  it("sin scopes (o solo de conexión): 403 al leer y al escribir notas", async () => {
    for (const scopes of [[], ["mcp:connect", "mcp:read"]]) {
      expect((await pedir("/notes", { agente: scopes })).status).toBe(403);
      expect((await pedir("/notes", { agente: scopes, metodo: "POST", cuerpo: { title: "x" } })).status).toBe(403);
    }
  });

  it("actuar como usuario no da escritura en un modelo", async () => {
    expect(
      (await pedir("/notes", { agente: ["usuario:actuar"], metodo: "POST", cuerpo: { title: "x" } })).status
    ).toBe(403);
  });

  it("note:read lee (sus filas) pero no escribe", async () => {
    const res = await pedir("/notes", { agente: ["note:read"] });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: unknown[] }).data).toEqual([]);
    expect((await pedir("/notes", { agente: ["note:read"], metodo: "POST", cuerpo: { title: "x" } })).status).toBe(403);
  });

  it("note:write crea, y la fila es del agente; el fino kon:notas:create-note también", async () => {
    const res = await pedir("/notes", { agente: ["note:write"], metodo: "POST", cuerpo: { title: "del agente" } });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { ownerId: string }).ownerId).toBe("ag_1");
    const fino = await pedir("/notes", { agente: ["kon:notas:create-note"], metodo: "POST", cuerpo: { title: "fino" } });
    expect(fino.status).toBe(201);
    // El fino de crear no abre borrar.
    const id = ((await fino.json()) as { id: string }).id;
    expect((await pedir(`/notes/${id}`, { agente: ["kon:notas:create-note"], metodo: "DELETE" })).status).toBe(403);
  });

  it("una denegación gana a todo, admin incluido", async () => {
    for (const scopes of [["note:write", "!note:write"], ["admin", "!note:write"], ["admin", "!kon:notas:*"]]) {
      const res = await pedir("/notes", { agente: scopes, metodo: "POST", cuerpo: { title: "no" } });
      expect(res.status, scopes.join(",")).toBe(403);
    }
  });

  it("notas:* abre el kon entero: ve las notas de todos (y la RLS coincide)", async () => {
    await crearNota("ana", "Visible para notas:*");
    const res = await pedir("/notes?limit=100", { agente: ["notas:*"] });
    expect(res.status).toBe(200);
    const cuerpo = (await res.json()) as { data: { ownerId: string }[] };
    expect(cuerpo.data.some((f) => f.ownerId === "ana")).toBe(true);
  });

  it("category:write: el agente escribe en el modelo del equipo y la RLS le deja", async () => {
    const res = await pedir("/categories", { agente: ["category:write"], metodo: "POST", cuerpo: { name: "Del agente" } });
    expect(res.status, await res.clone().text()).toBe(201);
    expect((await pedir("/categories", { agente: ["note:read"], metodo: "POST", cuerpo: { name: "No" } })).status).toBe(403);
  });

  it("los scopes que conceden crear una nota (lo que enseña el panel)", () => {
    const crear = operacionesDe(kon).find((o) => o.id === "create-note")!;
    const lista = scopesQueConceden("kon-notas", crear);
    expect(lista).toEqual(expect.arrayContaining(["kon:notas:create-note", "notas:*", "note:write", "admin"]));
    expect(lista).not.toContain("note:read");
  });
});

describe("RLS de Postgres (el muro de la base), con sabotaje", () => {
  /** Cuántas filas de `notes` cuyo dueño NO es `id` ve `id` con el rol de la app. */
  async function ajenasQueVe(id: string, rol: string): Promise<number> {
    return cliente.transaction(async (tx) => {
      await tx.query(
        "SELECT set_config('app.current_user_id', $1, true), set_config('app.current_user_role', $2, true)",
        [id, rol]
      );
      const r = await tx.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM notes WHERE owner_id IS DISTINCT FROM $1",
        [id]
      );
      return Number(r.rows[0]?.n ?? 0);
    });
  }
  /** La sonda: ni un desconocido ni el anónimo ven filas ajenas. */
  async function aisla(): Promise<boolean> {
    return (await ajenasQueVe("desconocido", "user")) === 0 && (await ajenasQueVe("", "anonymous")) === 0;
  }

  it("hay filas de otros (si no, la sonda no prueba nada)", async () => {
    await crearNota("ana", "Fila para la sonda");
    const r = await cliente.query<{ n: number }>("SELECT count(*)::int AS n FROM notes");
    // Con el rol de la app y sin contexto (el sistema) se ve todo:
    expect(Number(r.rows[0]?.n)).toBeGreaterThan(0);
  });

  it("aísla: un desconocido y el anónimo ven cero filas ajenas", async () => {
    expect(await aisla()).toBe(true);
  });

  it("SABOTAJE: con la política debilitada la sonda lo detecta, y el handler sigue aislando; restaurada, vuelve a aislar", async () => {
    await cliente.exec(`
      RESET ROLE;
      DROP POLICY "notes_select" ON "notes";
      CREATE POLICY "notes_select" ON "notes" FOR SELECT TO PUBLIC USING (true);
      SET ROLE rls_app;
    `);
    try {
      expect(await aisla()).toBe(false);
      // El segundo muro (el filtro del handler) no depende de la RLS.
      const deBob = (await (await pedir("/notes?limit=100", { quien: "bob" })).json()) as { data: { ownerId: string }[] };
      expect(deBob.data.every((f) => f.ownerId === "bob")).toBe(true);
    } finally {
      // Se restaura con el MISMO SQL que genera la migración.
      const { instantaneaDeModelo } = await import("@kitsuden/shared");
      await cliente.exec(`RESET ROLE;\n${politicasRls(instantaneaDeModelo(note, "notas")).join("\n")}\nSET ROLE rls_app;`);
    }
    expect(await aisla()).toBe(true);
  });

  it("INSERT con dueño ajeno: la RLS lo rechaza aunque el handler no estuviera", async () => {
    await expect(
      cliente.transaction(async (tx) => {
        await tx.query("SELECT set_config('app.current_user_id', 'bob', true), set_config('app.current_user_role', 'user', true)");
        await tx.query("INSERT INTO notes (title, owner_id) VALUES ('forjada', 'ana')");
      })
    ).rejects.toThrow(/row-level security/);
  });
});

describe("OpenAPI 3.1 y MCP salen de la misma declaración", () => {
  const ops = operacionesDe(kon);

  it("el documento OpenAPI de las operaciones del kon es VÁLIDO", async () => {
    const doc = {
      openapi: "3.1.0",
      info: { title: "kon-notas", version: "test" },
      servers: [{ url: "http://localhost:3000/api" }],
      paths: {} as Record<string, Record<string, unknown>>,
      components: componentesComunes(),
    };
    for (const op of ops) {
      const g = operacionOpenApi("kon-notas", "/api/notas", op);
      (doc.paths[g.camino] ??= {})[g.metodo] = g.operacion;
    }
    expect(Object.keys(doc.paths).sort()).toEqual([
      "/notas/categories",
      "/notas/categories/_model",
      "/notas/categories/{id}",
      "/notas/notes",
      "/notas/notes/_model",
      "/notas/notes/{id}",
    ]);
    const r = await new Validator().validate(doc);
    expect(r.errors ?? [], JSON.stringify(r.errors, null, 1)?.slice(0, 3000)).toEqual([]);
  });

  it("crear acepta Idempotency-Key y exige title; borrar es sensible", () => {
    const crear = operacionOpenApi("kon-notas", "/api/notas", ops.find((o) => o.id === "create-note")!).operacion as {
      parameters: { name: string; in: string }[];
      requestBody: { content: { "application/json": { schema: { required?: string[]; properties: object } } } };
    };
    expect(crear.parameters.some((p) => p.name === "Idempotency-Key" && p.in === "header")).toBe(true);
    const esquema = crear.requestBody.content["application/json"].schema;
    expect(esquema.required).toEqual(["title"]);
    expect(Object.keys(esquema.properties)).not.toContain("ownerId");
    const borrar = operacionOpenApi("kon-notas", "/api/notas", ops.find((o) => o.id === "delete-note")!).operacion;
    expect(JSON.stringify(borrar)).toContain('"sensitive":true');
  });

  it("herramientas MCP: nombres estables, lectura y destrucción anunciadas", () => {
    const herramientas = ops.map((op) => herramientaMcp("kon-notas", "/api/notas", op)!);
    expect(herramientas.map((h) => h.name)).toContain("notas__create-note");
    const listar = herramientas.find((h) => h.name === "notas__list-notes")!;
    expect(listar.annotations.readOnlyHint).toBe(true);
    const borrar = herramientas.find((h) => h.name === "notas__delete-note")!;
    expect(borrar.annotations.destructiveHint).toBe(true);
    const crear = herramientas.find((h) => h.name === "notas__create-note")!;
    expect(JSON.stringify(crear.inputSchema)).toContain('"title"');
  });
});

describe("seguro por defecto al declarar", () => {
  const campos = { t: campo.texto({ requerido: true }) };
  it("sin política de acceso no hay modelo", () => {
    expect(() => defineModelo({ nombre: "x", descripcion: "x", campos } as never)).toThrow(/acceso/);
  });
  it("la escritura pública no existe", () => {
    expect(() =>
      defineModelo({ nombre: "x", descripcion: "x", campos, acceso: { leer: "publico", escribir: "publico" } } as never)
    ).toThrow(/escritura pública/);
  });
  it("un nombre del núcleo no puede ser modelo (su scope chocaría)", () => {
    expect(() => defineModelo({ nombre: "admin", descripcion: "x", campos, acceso: { leer: "dueno", escribir: "dueno" } })).toThrow(/reservado/);
  });
  it("un valor por defecto que no valida se rechaza al declarar", () => {
    expect(() =>
      defineModelo({
        nombre: "x",
        descripcion: "x",
        campos: { s: campo.enumerado(["a"], { porDefecto: "b" }) },
        acceso: { leer: "dueno", escribir: "dueno" },
      })
    ).toThrow(/por defecto/);
  });
  it("la categoría es pública de leer y del equipo para escribir", () => {
    expect(category.acceso).toEqual({ leer: "publico", escribir: "staff" });
  });
});
