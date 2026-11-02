/**
 * Operaciones que hacen `yield` (kitsuden2.md C5) contra Postgres de verdad
 * ============================================================================
 *   · Cada `yield` sale como un evento SSE estándar, validado; al acabar, `end`.
 *   · Cada paso del generador corre en su transacción RLS con quien pregunta
 *     (la RLS ve al usuario en cada paso, aunque la petición ya se confirmó).
 *   · Un evento que no cumple el esquema, o un generador que lanza: `error`.
 *   · El cliente que corta: el generador se cierra (su `finally` corre).
 *   · OpenAPI: text/event-stream con el esquema de cada evento; MCP lee la lista.
 */

import { beforeAll, describe, expect, it } from "bun:test";
import { defineOperacion, type KonContext } from "@kitsuden/shared";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { leerEventosSse } from "../../../../packages/engine/src/flujos";
import { routerDeOperaciones } from "../../../../packages/engine/src/operaciones";
import { runInRequestScope } from "../../../../packages/engine/src/request-scope";
import {
  dbDeLaPeticion,
  transaccionRls,
  type ConexionTransaccional,
} from "../../../../packages/engine/src/rls-peticion";
import { db } from "../db";
import { createTestKonContext } from "../lib/test-kon-context";
import { operacionOpenApi } from "../lib/operaciones-openapi";

import { isDatabaseAvailable } from "./setup";

let disponible = false;
let cerrados = 0;
const instancia = dbDeLaPeticion(db);
const Evento = z.object({ paso: z.number(), usuario: z.string() });

const progreso = defineOperacion({
  id: "progreso",
  metodo: "GET",
  ruta: "/progreso",
  resumen: "Progress",
  descripcion: "Three steps, each one reading who asks from the database.",
  acceso: "publico",
  entrada: { query: z.object({ hasta: z.coerce.number().int().min(1).max(10).default(3), roto: z.string().optional() }) },
  salida: { flujo: true, esquema: Evento },
  async *manejar({ query }) {
    try {
      for (let paso = 1; paso <= query.hasta; paso++) {
        const r = await instancia.execute(sql`SELECT current_setting('app.current_user_id', true) AS uid`);
        const uid = String((r.rows[0] as { uid: string | null }).uid ?? "");
        if (query.roto === "esquema" && paso === 2) yield { paso: "dos" } as never;
        if (query.roto === "lanza" && paso === 2) throw new Error("se rompió");
        yield { paso, usuario: uid };
      }
    } finally {
      cerrados++;
    }
  },
});

const ctx = createTestKonContext({ db: { instance: dbDeLaPeticion(db) } as unknown as KonContext["db"] });
const app = new Hono();
app.use("*", async (c, next) => {
  const id = c.req.header("x-usuario");
  c.set("user" as never, (id ? { id, role: "user" } : null) as never);
  await runInRequestScope({ requestId: "sse" }, () => next());
});
app.use("*", transaccionRls(db as unknown as ConexionTransaccional));
app.route("/demo", routerDeOperaciones("kon-demo", [progreso], ctx));

beforeAll(async () => {
  disponible = await isDatabaseAvailable();
});

describe("flujos SSE", () => {
  it("cada yield es un evento con id, y acaba con `end`", async () => {
    if (!disponible) return;
    const res = await app.request("/demo/progreso?hasta=3", { headers: { "x-usuario": "u-sse" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const eventos = leerEventosSse(await res.text());
    expect(eventos.map((e) => e.event ?? "message")).toEqual(["message", "message", "message", "end"]);
    expect(eventos[0]?.id).toBe("1");
    expect(JSON.parse(eventos[3]!.data)).toEqual({ count: 3 });
    // Cada paso, en su transacción RLS con quien pregunta (la petición ya se confirmó).
    expect(eventos.slice(0, 3).map((e) => JSON.parse(e.data).usuario)).toEqual(["u-sse", "u-sse", "u-sse"]);
  });

  it("un evento que no cumple el esquema corta con `error` (500 genérico)", async () => {
    if (!disponible) return;
    const res = await app.request("/demo/progreso?hasta=3&roto=esquema", { headers: { "x-usuario": "u-sse" } });
    const eventos = leerEventosSse(await res.text());
    expect(eventos.map((e) => e.event ?? "message")).toEqual(["message", "error"]);
    expect(JSON.parse(eventos[1]!.data).code).toBe("KITSUDEN_E_INTERNAL");
  });

  it("un generador que lanza corta con `error` sin filtrar el mensaje interno", async () => {
    if (!disponible) return;
    const res = await app.request("/demo/progreso?hasta=3&roto=lanza");
    const eventos = leerEventosSse(await res.text());
    const ultimo = eventos.at(-1)!;
    expect(ultimo.event).toBe("error");
    expect(ultimo.data).not.toContain("se rompió");
  });

  it("si el cliente corta, el generador se cierra (corre su finally)", async () => {
    if (!disponible) return;
    const antes = cerrados;
    const res = await app.request("/demo/progreso?hasta=10");
    const lector = res.body!.getReader();
    await lector.read();
    await lector.cancel();
    // `cancel` es asíncrono: se le da un instante.
    await new Promise((r) => setTimeout(r, 50));
    expect(cerrados).toBe(antes + 1);
  });

  it("OpenAPI: text/event-stream, el esquema de cada evento y la marca stream", () => {
    const { operacion } = operacionOpenApi("kon-demo", "/api/demo", progreso);
    const r = (operacion.responses as Record<string, { content?: Record<string, Record<string, unknown>> }>)["200"];
    const media = r?.content?.["text/event-stream"];
    expect(media?.["x-kitsuden-event-schema"]).toMatchObject({ type: "object", required: ["paso", "usuario"] });
    expect((operacion["x-kitsuden-operation"] as { stream?: boolean }).stream).toBe(true);
  });

  it("defineOperacion rechaza un flujo sin esquema o con otro estado", () => {
    expect(() =>
      defineOperacion({ ...progreso, id: "sin-esquema", salida: { flujo: true } } as never)
    ).toThrow(/esquema/);
    expect(() =>
      defineOperacion({ ...progreso, id: "con-201", salida: { flujo: true, esquema: Evento, estado: 201 } } as never)
    ).toThrow(/200/);
  });
});
