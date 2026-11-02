/**
 * Búsqueda semántica en defineModelo (kitsuden2.md D5), contra Postgres con
 * pgvector: la migración generada crea la columna y el índice HNSW, crear una
 * fila encola su embedding en la cola de Postgres, el worker lo calcula, y
 * `search-<plural>` ordena por similitud respetando el filtro de dueño.
 *
 * Sin proveedor configurado, `generateEmbedding` da un vector determinista
 * (mismo texto → mismo vector): basta para comprobar la tubería, no el sentido.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { campo, defineModelo, generarMigracionDeModelos, type KonContext } from "@kitsuden/shared";
import { sql } from "drizzle-orm";
import { Hono } from "hono";

import { operacionesDeModelo, registrarPoliticasDeModelos } from "../../../../packages/engine/src/modelos";
import { routerDeOperaciones } from "../../../../packages/engine/src/operaciones";
import { runInRequestScope } from "../../../../packages/engine/src/request-scope";
import { dbDeLaPeticion, transaccionRls, type ConexionTransaccional } from "../../../../packages/engine/src/rls-peticion";
import { db } from "../db";
import { configurarEmbeddingsDeModelos } from "../lib/embeddings-de-modelos";
import { pausarTrabajador, procesarPendientes, setReleerActor, setupWorkers, shutdownQueues } from "../lib/queue";
import { createTestKonContext } from "../lib/test-kon-context";

import { isDatabaseAvailable } from "./setup";

const KON = "kon-semprueba";
const nota = defineModelo({
  nombre: "sem-note",
  tabla: "sem_notas_prueba",
  descripcion: "A note with semantic search.",
  campos: { title: campo.texto({ max: 200, requerido: true }), body: campo.textoLargo() },
  acceso: { leer: "dueno", escribir: "dueno" },
  semantica: { campos: ["title", "body"], dimensiones: 8 },
});

let disponible = false;
const app = new Hono();

beforeAll(async () => {
  disponible = await isDatabaseAvailable();
  if (!disponible) return;
  await db.execute(sql.raw(`DROP TABLE IF EXISTS sem_notas_prueba`));
  const migracion = generarMigracionDeModelos(null, [nota], { kon: "semprueba" });
  await db.execute(sql.raw(migracion.sql));

  registrarPoliticasDeModelos(KON, [nota]);
  const pasar = async (c: { get: (k: never) => unknown; json: (b: unknown, s: number) => Response }, next: () => Promise<void>) => {
    if (!c.get("user" as never)) return c.json({ error: "Session required" }, 401);
    await next();
  };
  const ctx = createTestKonContext({
    db: { instance: dbDeLaPeticion(db) } as unknown as KonContext["db"],
    auth: { requireAuth: pasar, optionalAuth: async (_c: unknown, next: () => Promise<void>) => next() } as unknown as KonContext["auth"],
  });
  app.use("*", async (c, next) => {
    const id = c.req.header("x-usuario");
    c.set("user" as never, (id ? { id, role: "user" } : null) as never);
    await runInRequestScope({ requestId: "sem" }, () => next());
  });
  app.use("*", transaccionRls(db as unknown as ConexionTransaccional));
  app.route("/api/semprueba", routerDeOperaciones(KON, operacionesDeModelo(KON, nota), ctx));

  configurarEmbeddingsDeModelos();
  await setupWorkers();
  pausarTrabajador(true);
  // Las cuentas de la prueba no existen en auth_users: la cola, que relee al
  // actor, las daría por revocadas (eso lo prueba cola-postgres.test.ts).
  setReleerActor(async (f) => ({ ok: true, actor: f.user_id ? { id: String(f.user_id), role: "user" } : null }));
});

afterAll(async () => {
  if (!disponible) return;
  await db.execute(sql`DELETE FROM kitsuden_outbox WHERE queue = 'kitsuden-embeddings'`);
  await db.execute(sql.raw(`DROP TABLE IF EXISTS sem_notas_prueba`));
  setReleerActor(null);
  await shutdownQueues();
});

async function crear(usuario: string, title: string, body: string) {
  const res = await app.request("/api/semprueba/sem-notes", {
    method: "POST",
    headers: { "content-type": "application/json", "x-usuario": usuario },
    body: JSON.stringify({ title, body }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string };
}

describe("búsqueda semántica en defineModelo", () => {
  it("la migración crea la columna vector(8) y el índice HNSW", async () => {
    if (!disponible) return;
    const r = await db.execute(sql`
      SELECT format_type(a.atttypid, a.atttypmod) AS tipo FROM pg_attribute a
       WHERE a.attrelid = 'sem_notas_prueba'::regclass AND a.attname = 'embedding'`);
    expect((r.rows[0] as { tipo: string }).tipo).toBe("vector(8)");
    const i = await db.execute(sql`SELECT indexdef FROM pg_indexes WHERE indexname = 'sem_notas_prueba_embedding_idx'`);
    expect(String((i.rows[0] as { indexdef: string }).indexdef)).toContain("hnsw");
  });

  it("crear encola el embedding en la misma transacción; el worker lo guarda", async () => {
    if (!disponible) return;
    const { id } = await crear("ana", "manzana roja", "una fruta");
    const antes = await db.execute(sql`SELECT embedding IS NULL AS vacio FROM sem_notas_prueba WHERE id = ${id}::uuid`);
    expect((antes.rows[0] as { vacio: boolean }).vacio).toBe(true);
    await procesarPendientes();
    const despues = await db.execute(sql`SELECT embedding IS NULL AS vacio FROM sem_notas_prueba WHERE id = ${id}::uuid`);
    expect((despues.rows[0] as { vacio: boolean }).vacio).toBe(false);
  });

  it("search ordena por similitud y solo ve las filas propias", async () => {
    if (!disponible) return;
    await crear("ana", "coche azul", "un vehículo");
    await crear("luis", "manzana roja", "una fruta");
    await procesarPendientes();
    const res = await app.request(`/api/semprueba/sem-notes/search?q=${encodeURIComponent("manzana roja una fruta")}&limit=5`, {
      headers: { "x-usuario": "ana" },
    });
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: Array<{ title: string; ownerId: string; score: number }> };
    expect(data.every((f) => f.ownerId === "ana")).toBe(true);
    expect(data).toHaveLength(2);
    expect(data[0]?.title).toBe("manzana roja");
    expect(data[0]!.score).toBeGreaterThan(0.999);
    expect(data[0]!.score).toBeGreaterThan(data[1]!.score);
  });

  it("la ruta /search no la captura /:id", async () => {
    if (!disponible) return;
    const res = await app.request(`/api/semprueba/sem-notes/search?q=x`, { headers: { "x-usuario": "ana" } });
    expect(res.status).toBe(200);
  });

  it("sin consulta, 422; sin sesión, 401", async () => {
    if (!disponible) return;
    expect((await app.request(`/api/semprueba/sem-notes/search`, { headers: { "x-usuario": "ana" } })).status).toBe(422);
    expect((await app.request(`/api/semprueba/sem-notes/search?q=x`)).status).toBe(401);
  });
});
