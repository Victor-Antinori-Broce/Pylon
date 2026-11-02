/**
 * kon-ingesta (kitsuden2.md D4) contra Postgres de verdad: extraer y trocear
 * (puro), y la tubería entera —ingestar → la cola trocea → la cola calcula los
 * embeddings → `search-chunks` encuentra el pasaje— con el dueño separando.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { KonContext } from "@kitsuden/shared";
import { sql } from "drizzle-orm";
import { Hono } from "hono";

import { registrarPoliticasDeModelos } from "../../../../packages/engine/src/modelos";
import { operacionesDe, routerDeOperaciones } from "../../../../packages/engine/src/operaciones";
import { runInRequestScope } from "../../../../packages/engine/src/request-scope";
import { dbDeLaPeticion, transaccionRls, type ConexionTransaccional } from "../../../../packages/engine/src/rls-peticion";
import { extraerTexto, NoSePuedeExtraer, textoDeHtml, trocear } from "../../../../packages/kons/kon-ingesta/extraer";
import { kon } from "../../../../packages/kons/kon-ingesta/index";
import { documento, trozo } from "../../../../packages/kons/kon-ingesta/ingesta.modelo";
import { db } from "../db";
import { configurarEmbeddingsDeModelos } from "../lib/embeddings-de-modelos";
import { pausarTrabajador, procesarPendientes, setReleerActor, setupWorkers, shutdownQueues } from "../lib/queue";
import { createTestKonContext } from "../lib/test-kon-context";

import { isDatabaseAvailable } from "./setup";

const RAIZ = join(import.meta.dir, "../../../..");
let disponible = false;
const app = new Hono();

describe("extraer y trocear (puro)", () => {
  it("HTML: sin etiquetas, scripts ni estilos; entidades decodificadas", () => {
    const t = textoDeHtml("<html><style>x{}</style><h1>Hola &amp; adi&oacute;s</h1><p>Uno</p><script>mal()</script><p>Dos &#233;</p></html>");
    expect(t).toContain("Hola & adi");
    expect(t).toContain("Uno");
    expect(t).toContain("Dos é");
    expect(t).not.toContain("mal()");
  });

  it("trocea por párrafos, respeta el máximo, solapa y empieza trozo en cada título", () => {
    const texto = ["# Uno", "a".repeat(500), "b".repeat(500), "c".repeat(500), "# Dos", "d".repeat(100)].join("\n\n");
    const t = trocear(texto, 1200, 100);
    expect(t.every((x) => x.length <= 1400)).toBe(true);
    expect(t.some((x) => x.startsWith("# Dos"))).toBe(true);
    expect(t.length).toBeGreaterThanOrEqual(3);
  });

  it("un párrafo enorme se corta", () => {
    expect(trocear("x".repeat(5000), 1000, 0).every((x) => x.length <= 1000)).toBe(true);
  });

  it("PDF sin 'unpdf' e imagen sin sidecar: error claro y permanente", async () => {
    await expect(extraerTexto("image/png", "")).rejects.toBeInstanceOf(NoSePuedeExtraer);
    await expect(extraerTexto("application/zip", "")).rejects.toBeInstanceOf(NoSePuedeExtraer);
  });
});

beforeAll(async () => {
  disponible = await isDatabaseAvailable();
  if (!disponible) return;
  await db.execute(sql.raw(`DROP TABLE IF EXISTS ingesta_chunks; DROP TABLE IF EXISTS ingesta_documents;`));
  await db.execute(sql.raw(readFileSync(join(RAIZ, "packages/kons/kon-ingesta/migrations/0000_models.sql"), "utf8")));
  registrarPoliticasDeModelos("kon-ingesta", [documento, trozo]);
  const pasar = async (c: { get: (k: never) => unknown; json: (b: unknown, s: number) => Response }, next: () => Promise<void>) => {
    if (!c.get("user" as never)) return c.json({ error: "Session required" }, 401);
    await next();
  };
  const ctx = createTestKonContext({
    db: { instance: dbDeLaPeticion(db) } as unknown as KonContext["db"],
    auth: { requireAuth: pasar, optionalAuth: async (_c: unknown, n: () => Promise<void>) => n() } as unknown as KonContext["auth"],
  });
  app.use("*", async (c, next) => {
    const id = c.req.header("x-usuario");
    c.set("user" as never, (id ? { id, role: "user" } : null) as never);
    await runInRequestScope({ requestId: "ing" }, () => next());
  });
  app.use("*", transaccionRls(db as unknown as ConexionTransaccional));
  app.route("/api/ingesta", routerDeOperaciones("kon-ingesta", operacionesDe(kon as never, ctx), ctx));
  await kon.hooks!.onStartup!(ctx);
  configurarEmbeddingsDeModelos();
  await setupWorkers();
  pausarTrabajador(true);
  setReleerActor(async (f) => ({ ok: true, actor: f.user_id ? { id: String(f.user_id), role: "user" } : null }));
});

afterAll(async () => {
  if (!disponible) return;
  await db.execute(sql`DELETE FROM kitsuden_outbox WHERE queue IN ('kitsuden-ingesta', 'kitsuden-embeddings')`);
  await db.execute(sql.raw(`DROP TABLE IF EXISTS ingesta_chunks; DROP TABLE IF EXISTS ingesta_documents;`));
  setReleerActor(null);
  await shutdownQueues();
});

describe("kon-ingesta: la tubería", () => {
  it("ingestar → trozos con embedding → search-chunks encuentra el pasaje", async () => {
    if (!disponible) return;
    const md = ["# Recetas", "La tortilla de patatas lleva huevo, patata y cebolla.", "# Coches", "Un motor eléctrico no tiene embrague."].join("\n\n");
    const res = await app.request("/api/ingesta/documents/ingest", {
      method: "POST",
      headers: { "content-type": "application/json", "x-usuario": "ana" },
      body: JSON.stringify({ title: "Notas", mimeType: "text/markdown", content: md }),
    });
    expect(res.status).toBe(202);
    const { id } = (await res.json()) as { id: string };

    await procesarPendientes(); // trocea y encola los embeddings
    await procesarPendientes(); // calcula los embeddings

    const doc = await app.request(`/api/ingesta/documents/${id}`, { headers: { "x-usuario": "ana" } });
    const d = (await doc.json()) as { status: string; chunks: number };
    expect(d.status).toBe("done");
    expect(d.chunks).toBe(2);

    const q = encodeURIComponent("# Coches\n\nUn motor eléctrico no tiene embrague.");
    const r = await app.request(`/api/ingesta/chunks/search?q=${q}&limit=2`, { headers: { "x-usuario": "ana" } });
    expect(r.status).toBe(200);
    const { data } = (await r.json()) as { data: Array<{ text: string; score: number }> };
    expect(data[0]?.text).toContain("motor eléctrico");

    // Otro usuario no ve nada de ana.
    const otro = await app.request(`/api/ingesta/chunks/search?q=${q}`, { headers: { "x-usuario": "luis" } });
    expect(((await otro.json()) as { data: unknown[] }).data).toHaveLength(0);
  });

  it("un tipo no soportado acaba en failed con su error", async () => {
    if (!disponible) return;
    const res = await app.request("/api/ingesta/documents/ingest", {
      method: "POST",
      headers: { "content-type": "application/json", "x-usuario": "ana" },
      body: JSON.stringify({ title: "zip", mimeType: "application/zip", contentBase64: "UEsDBA==" }),
    });
    const { id } = (await res.json()) as { id: string };
    await procesarPendientes();
    const d = (await (await app.request(`/api/ingesta/documents/${id}`, { headers: { "x-usuario": "ana" } })).json()) as { status: string; error: string };
    expect(d.status).toBe("failed");
    expect(d.error).toMatch(/Unsupported/);
  });
});
