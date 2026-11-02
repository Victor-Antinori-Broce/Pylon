/**
 * RLS por petición: la pieza común del engine y las políticas públicas de A2
 * ============================================================================
 *
 * PGlite con un rol SIN superusuario (si no, Postgres se salta la RLS y todo
 * daría verde por casualidad). Se prueba con las MISMAS piezas que monta el
 * anfitrión delante de cada kon (`transaccionRls`, `dbDeLaPeticion`,
 * `comoSistema`, `segundoPlano`):
 *
 *   · qué id/rol ve Postgres para el anónimo, una cuenta y una cuenta sin rol;
 *   · que `comoSistema` vacía id Y rol y restaura después;
 *   · que `segundoPlano` sale de la transacción;
 *   · que una ruta que falla (excepción o 5xx) no confirma lo que escribió;
 *   · que dos montajes no abren dos transacciones;
 *   · y las políticas nuevas: plantillas de tier list y builds publicadas
 *     legibles sin sesión, mazos sin dueño, pedidos que el anónimo NO ve.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { Hono, type MiddlewareHandler } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  comoSistema,
  contextoRlsDe,
  dbDeLaPeticion,
  segundoPlano,
  transaccionRls,
} from "../../packages/engine/src/rls-peticion";
import { resolveExecutor } from "../../packages/engine/src/request-scope";

const RAIZ = resolve(__dirname, "../..");
const leer = (ruta: string) => readFileSync(resolve(RAIZ, ruta), "utf8");

let cliente: PGlite;
let db: ReturnType<typeof drizzle>;
let app: Hono;

/** Quién pregunta, por cabecera (como la sesión del anfitrión, ANTES de la transacción). */
const sesion: MiddlewareHandler = async (c, next) => {
  const quien = c.req.header("x-quien");
  if (quien === "ana") c.set("user" as never, { id: "ana", role: "user" } as never);
  if (quien === "sinrol") c.set("user" as never, { id: "sinrol" } as never);
  if (quien === "edi") c.set("user" as never, { id: "edi", role: "editor" } as never);
  await next();
};

const filas = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? r) as Record<string, unknown>[];

beforeAll(async () => {
  cliente = new PGlite();
  // Esquema mínimo de los kons afectados, con sus migraciones REALES.
  for (const m of [
    "packages/kons/kon-tierlist/migrations/0001_tierlist.sql",
    "packages/kons/kon-tierlist/migrations/0002_tierlist.sql",
    "packages/kons/kon-character-builder/migrations/0001_builder.sql",
    "packages/kons/kon-character-builder/migrations/0002_builds_publicas.sql",
    "packages/kons/kon-cardsim/migrations/0001_cardsim.sql",
    "packages/kons/kon-ecommerce/migrations/0001_shop.sql",
    "packages/kons/kon-ecommerce/migrations/0002_pedidos_seguros.sql",
  ]) {
    await cliente.exec(leer(m));
  }
  // Las políticas de propiedad del núcleo, y DESPUÉS las nuevas (el orden real
  // del runner es el inverso en cada arranque, pero son independientes).
  await cliente.exec(leer("apps/api/src/db/rls-owned-tables.sql"));
  for (const m of [
    "packages/kons/kon-tierlist/migrations/0003_plantillas_publicas_rls.sql",
    "packages/kons/kon-character-builder/migrations/0003_lectura_publica_rls.sql",
    "packages/kons/kon-cardsim/migrations/0004_mazos_sin_dueno_rls.sql",
    "packages/kons/kon-ecommerce/migrations/0003_sistema_sin_usuario.sql",
  ]) {
    await cliente.exec(leer(m));
  }
  await cliente.exec(`
    CREATE TABLE prueba_escrituras (id text PRIMARY KEY);
    INSERT INTO tier_lists (id, kind, slug, title, tiers, items) VALUES
      ('plantilla', 'template', 'p', 'Plantilla', '[]', '[]');
    INSERT INTO tier_lists (id, kind, title, tiers, items, owner_id) VALUES
      ('personal-ana', 'personal', 'De Ana', '[]', '[]', 'ana');
    INSERT INTO builder_builds (id, builder_id, name, build, code, visibility, owner_id) VALUES
      ('b-pub', 'x', 'p', '{}', 'c1', 'public', 'ana'),
      ('b-oc', 'x', 'o', '{}', 'c2', 'unlisted', 'ana'),
      ('b-priv', 'x', 'v', '{}', 'c3', 'private', 'ana');
    INSERT INTO cardsim_decks (id, game_id, name, cards, owner_id) VALUES
      ('m-libre', 'g', 'libre', '[]', NULL), ('m-ana', 'g', 'de Ana', '[]', 'ana');
    INSERT INTO shop_orders (id, number, fulfillment_type, customer_email)
      VALUES ('pedido', 'P-1', 'pickup', 'cliente@ejemplo.com');
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
  const kon = dbDeLaPeticion(db);
  const contexto = async () =>
    filas(
      await kon.execute(
        sql`SELECT coalesce(current_setting('app.current_user_id', true), '<null>') AS id,
                   coalesce(current_setting('app.current_user_role', true), '<null>') AS rol`
      )
    )[0];

  const rutas = new Hono();
  rutas.get("/contexto", async (c) => c.json(await contexto()));
  rutas.get("/sistema", async (c) => {
    const dentro = await comoSistema(contexto);
    return c.json({ dentro, despues: await contexto() });
  });
  // Dentro de la petición el ejecutor es la transacción; en `segundoPlano`,
  // la conexión global. (Se compara la identidad y no se consulta: PGlite es
  // UNA conexión, y una consulta fuera de la transacción abierta esperaría a
  // que esta terminase. Con el pool de verdad va por otra conexión.)
  rutas.get("/fondo", (c) =>
    c.json({
      dentro: resolveExecutor(db) !== db,
      fuera: segundoPlano(() => resolveExecutor(db) === db),
    })
  );
  rutas.post("/escribe-y-falla", async () => {
    await kon.execute(sql`INSERT INTO prueba_escrituras VALUES ('tras-excepcion')`);
    throw new Error("falla la ruta");
  });
  rutas.post("/escribe-y-500", async (c) => {
    await kon.execute(sql`INSERT INTO prueba_escrituras VALUES ('tras-500')`);
    return c.json({ error: "x" }, 500);
  });
  rutas.post("/escribe-bien", async (c) => {
    await kon.execute(sql`INSERT INTO prueba_escrituras VALUES ('bien')`);
    return c.json({ ok: true }, 201);
  });
  rutas.get("/cuenta/:tabla", async (c) => {
    const tabla = c.req.param("tabla");
    if (!/^[a-z_]+$/.test(tabla)) return c.json({}, 400);
    const r = await kon.execute(sql.raw(`SELECT id FROM ${tabla} ORDER BY id`));
    return c.json(filas(r).map((f) => f.id));
  });

  app = new Hono();
  app.use("*", sesion);
  // Dos montajes que se solapan, como `/x` y `/x/*`: no deben anidar.
  app.use("*", transaccionRls(db));
  app.use("/k/*", transaccionRls(db));
  app.route("/k", rutas);
});

afterAll(async () => {
  await cliente?.close();
});

const pedir = (ruta: string, quien?: string, metodo = "GET") =>
  app.request(ruta, { method: metodo, headers: quien ? { "x-quien": quien } : {} });

describe("contexto que ve Postgres", () => {
  it("anónimo: id '' y rol anonymous (NO es el sistema)", async () => {
    expect(await (await pedir("/k/contexto")).json()).toEqual({ id: "", rol: "anonymous" });
  });
  it("una cuenta: su id y su rol", async () => {
    expect(await (await pedir("/k/contexto", "ana")).json()).toEqual({ id: "ana", rol: "user" });
  });
  it("una cuenta sin rol cuenta como `user`, no como anónimo ni sistema", async () => {
    expect(await (await pedir("/k/contexto", "sinrol")).json()).toEqual({
      id: "sinrol",
      rol: "user",
    });
    expect(contextoRlsDe({ id: "x", role: "" })).toEqual({ userId: "x", userRole: "user" });
  });
  it("comoSistema vacía id Y rol, y restaura al acabar", async () => {
    expect(await (await pedir("/k/sistema", "ana")).json()).toEqual({
      dentro: { id: "", rol: "" },
      despues: { id: "ana", rol: "user" },
    });
  });
  it("segundoPlano sale de la transacción (conexión del sistema, sin contexto)", async () => {
    expect(await (await pedir("/k/fondo", "ana")).json()).toEqual({ dentro: true, fuera: true });
  });
});

describe("una ruta que falla no confirma lo que escribió", () => {
  it("excepción → revertido; 500 → revertido; 201 → confirmado", async () => {
    expect((await pedir("/k/escribe-y-falla", "ana", "POST")).status).toBe(500);
    expect((await pedir("/k/escribe-y-500", "ana", "POST")).status).toBe(500);
    expect((await pedir("/k/escribe-bien", "ana", "POST")).status).toBe(201);
    expect(await (await pedir("/k/cuenta/prueba_escrituras", "ana")).json()).toEqual(["bien"]);
  });
});

describe("políticas públicas nuevas (A2)", () => {
  it("tier lists: la plantilla la ve cualquiera; la personal, solo su dueña", async () => {
    expect(await (await pedir("/k/cuenta/tier_lists")).json()).toEqual(["plantilla"]);
    expect(await (await pedir("/k/cuenta/tier_lists", "edi")).json()).toEqual(["plantilla"]);
    expect(await (await pedir("/k/cuenta/tier_lists", "ana")).json()).toEqual([
      "personal-ana",
      "plantilla",
    ]);
  });
  it("builds: públicas y ocultas para todos; la privada, solo su dueña", async () => {
    expect(await (await pedir("/k/cuenta/builder_builds")).json()).toEqual(["b-oc", "b-pub"]);
    expect(await (await pedir("/k/cuenta/builder_builds", "ana")).json()).toEqual([
      "b-oc",
      "b-priv",
      "b-pub",
    ]);
  });
  it("mazos: el sin dueño es de todos; el de Ana, solo de Ana", async () => {
    expect(await (await pedir("/k/cuenta/cardsim_decks")).json()).toEqual(["m-libre"]);
    expect(await (await pedir("/k/cuenta/cardsim_decks", "ana")).json()).toEqual([
      "m-ana",
      "m-libre",
    ]);
  });
  it("pedidos: el anónimo ya NO pasa por sistema; el equipo sí los ve", async () => {
    expect(await (await pedir("/k/cuenta/shop_orders")).json()).toEqual([]);
    expect(await (await pedir("/k/cuenta/shop_orders", "ana")).json()).toEqual([]);
    expect(await (await pedir("/k/cuenta/shop_orders", "edi")).json()).toEqual(["pedido"]);
  });
});
