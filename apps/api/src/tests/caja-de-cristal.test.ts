/**
 * La «caja de cristal» (kitsuden2.md C7) contra Postgres de verdad
 * ============================================================================
 *   · La traza de cada petición lleva las medidas de su transacción
 *     (consultas, tiempo en la base, filas escritas).
 *   · Una escritura por id que no toca nada se anota como bloqueo, y se
 *     distingue «no es tuyo» de «no existe»… pero quien pregunta recibe el
 *     MISMO 404 en los dos casos (no hay oráculo de existencia).
 *   · Las trazas se escriben en lote en particiones por día, y se listan y
 *     resumen por las funciones del panel.
 *   · El span OTLP (G2) sale con el trace_id W3C de la petición.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { Hono } from "hono";

import { repo } from "../../../../packages/engine/src/repository";
import { runInRequestScope } from "../../../../packages/engine/src/request-scope";
import { transaccionRls, type ConexionTransaccional } from "../../../../packages/engine/src/rls-peticion";
import { db } from "../db";
import { spanDe } from "../lib/otlp";
import { listarTrazas, resumenDeTrazas, rotar, seGuarda, trazasDePeticion, volcar, type Traza } from "../lib/trazas";

import { isDatabaseAvailable } from "./setup";

const notas = pgTable("cct_notas_prueba", {
  id: uuid("id").primaryKey(),
  owner: text("owner").notNull(),
  titulo: text("titulo").notNull(),
});

const ID_AJENA = "11111111-1111-4111-8111-111111111111";
const ID_INEXISTENTE = "22222222-2222-4222-8222-222222222222";
// Únicos por ejecución: las trazas de otras ejecuciones siguen en la base.
const YO_1 = `u-cct-1-${crypto.randomUUID().slice(0, 8)}`;
const YO_2 = `u-cct-2-${crypto.randomUUID().slice(0, 8)}`;
let disponible = false;

const app = new Hono();
app.use("*", async (c, next) => {
  const id = c.req.header("x-usuario") ?? null;
  c.set("user" as never, (id ? { id, role: "user" } : null) as never);
  c.set("requestId" as never, `cct-${crypto.randomUUID()}` as never);
  await runInRequestScope({ requestId: "cct", traceId: "0af7651916cd43dd8448eb211c80319c" }, () => next());
});
app.use("*", trazasDePeticion());
app.use("*", transaccionRls(db as unknown as ConexionTransaccional));
app.patch("/notas/:id", async (c) => {
  const yo = c.req.header("x-usuario") ?? "";
  // El filtro de dueño del handler: el primer muro.
  const filas = await repo(notas).filter({ id: c.req.param("id"), owner: yo }).update({ titulo: "nuevo" });
  return filas.length ? c.json(filas[0]) : c.json({ error: "Not found" }, 404);
});
app.post("/notas", async (c) => {
  const yo = c.req.header("x-usuario") ?? "";
  const nota = await repo(notas).create({ id: crypto.randomUUID(), owner: yo, titulo: "hola" });
  return c.json(nota, 201);
});

beforeAll(async () => {
  disponible = await isDatabaseAvailable();
  if (!disponible) return;
  process.env.TRAZAS_ENABLED = "true";
  process.env.TRAZAS_MUESTREO_LECTURAS = "1";
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS cct_notas_prueba (id uuid PRIMARY KEY, owner text NOT NULL, titulo text NOT NULL)`));
  await db.execute(sql.raw(`DELETE FROM cct_notas_prueba`));
  await db.execute(sql`INSERT INTO cct_notas_prueba (id, owner, titulo) VALUES (${ID_AJENA}::uuid, 'otra-persona', 'ajena')`);
  await rotar();
});

afterAll(async () => {
  if (!disponible) return;
  await db.execute(sql.raw(`DROP TABLE IF EXISTS cct_notas_prueba`));
  delete process.env.TRAZAS_ENABLED;
  delete process.env.TRAZAS_MUESTREO_LECTURAS;
});

async function trazasDe(actor: string) {
  await volcar();
  return listarTrazas({ desde: new Date(Date.now() - 600_000), limite: 50, soloBloqueos: false, soloErrores: false, actor });
}

describe("caja de cristal", () => {
  it("una escritura guarda su traza con las medidas de la transacción", async () => {
    if (!disponible) return;
    const res = await app.request("/notas", { method: "POST", headers: { "x-usuario": YO_1 } });
    expect(res.status).toBe(201);
    const [t] = await trazasDe(YO_1);
    expect(t).toBeDefined();
    expect(t?.metodo).toBe("POST");
    expect(t?.ruta).toBe("/notas");
    expect(t?.actor_tipo).toBe("humano");
    expect(Number(t?.consultas)).toBeGreaterThan(0);
    expect(Number(t?.filas_afectadas)).toBe(1);
    expect(t?.trace_id).toBe("0af7651916cd43dd8448eb211c80319c");
  });

  it("no es tuyo y no existe dan el MISMO 404, pero la traza los distingue", async () => {
    if (!disponible) return;
    const ajena = await app.request(`/notas/${ID_AJENA}`, { method: "PATCH", headers: { "x-usuario": YO_2 } });
    const nada = await app.request(`/notas/${ID_INEXISTENTE}`, { method: "PATCH", headers: { "x-usuario": YO_2 } });
    expect(ajena.status).toBe(404);
    expect(nada.status).toBe(404);
    expect(await ajena.text()).toBe(await nada.text());

    const trazas = await trazasDe(YO_2);
    const motivos = trazas.map((t) => (t.detalle_bloqueos as Array<{ motivo: string }>)[0]?.motivo).sort();
    expect(motivos).toEqual(["no_es_tuyo", "no_existe"]);
    expect(trazas.every((t) => Number(t.bloqueos) === 1 && t.ruta === "/notas/:id")).toBe(true);
    // La nota ajena sigue intacta.
    const [f] = (await db.execute(sql`SELECT titulo FROM cct_notas_prueba WHERE id = ${ID_AJENA}::uuid`)).rows as Array<{ titulo: string }>;
    expect(f?.titulo).toBe("ajena");
  });

  it("el resumen agrupa por ruta con bloqueos y errores", async () => {
    if (!disponible) return;
    const resumen = await resumenDeTrazas(new Date(Date.now() - 600_000));
    const patch = resumen.find((r) => r.metodo === "PATCH" && r.ruta === "/notas/:id");
    expect(Number(patch?.bloqueos)).toBeGreaterThanOrEqual(2);
  });

  it("muestreo: escrituras, errores y bloqueos siempre; lecturas según la tasa", () => {
    process.env.TRAZAS_MUESTREO_LECTURAS = "0.1";
    expect(seGuarda("POST", 201, 0, 0.99)).toBe(true);
    expect(seGuarda("GET", 404, 0, 0.99)).toBe(true);
    expect(seGuarda("GET", 200, 1, 0.99)).toBe(true);
    expect(seGuarda("GET", 200, 0, 0.99)).toBe(false);
    expect(seGuarda("GET", 200, 0, 0.05)).toBe(true);
    process.env.TRAZAS_MUESTREO_LECTURAS = "1";
  });

  it("rotar crea la partición de hoy y de los dos días siguientes", async () => {
    if (!disponible) return;
    await rotar();
    const r = await db.execute(sql`
      SELECT count(*)::int AS n FROM pg_inherits i JOIN pg_class p ON p.oid = i.inhparent
       WHERE p.relname = 'kitsuden_trazas'`);
    expect(Number((r.rows[0] as { n: number }).n)).toBeGreaterThanOrEqual(3);
  });
});

describe("OTLP (G2)", () => {
  it("un span lleva el trace_id W3C, la ruta y los atributos de la caja", () => {
    const t: Traza = {
      creado: new Date("2026-10-28T12:00:00.000Z"),
      requestId: "r1",
      traceId: "0af7651916cd43dd8448eb211c80319c",
      metodo: "PATCH",
      ruta: "/notas/:id",
      estado: 404,
      actorTipo: "agente",
      actorId: "agente-1",
      kon: "kon-blog",
      operacion: "actualizar-nota",
      duracionMs: 12,
      tiempoDbMs: 5,
      consultas: 3,
      filasAfectadas: 0,
      bloqueos: 1,
      detalleBloqueos: null,
    };
    const span = spanDe(t) as { traceId: string; name: string; attributes: Array<{ key: string }>; endTimeUnixNano: string; startTimeUnixNano: string };
    expect(span.traceId).toBe(t.traceId as string);
    expect(span.name).toBe("PATCH /notas/:id");
    expect(span.attributes.map((a) => a.key)).toContain("kitsuden.blocked");
    expect(BigInt(span.endTimeUnixNano) - BigInt(span.startTimeUnixNano)).toBe(12_000_000n);
  });
});
