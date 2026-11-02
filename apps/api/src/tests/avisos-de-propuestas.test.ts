/**
 * Avisar al agente cuando se resuelve su propuesta (kitsuden2.md B3), contra
 * Postgres de verdad y un receptor HTTP local:
 *   · la firma `t=…,v1=…` se verifica con el secreto y caduca;
 *   · el secreto se ve UNA vez (al poner la URL o al rotarlo);
 *   · el webhook sale por la cola: cabeceras, cuerpo firmado, reintento si el
 *     receptor falla y «dead letter» si responde 410;
 *   · el bus lleva la resolución al flujo SSE (`proposal:<id>`);
 *   · la operación SSE se publica en OpenAPI como flujo y fuera de MCP.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";

import { db } from "../db";
import {
  ajustesDeAviso,
  avisarResolucion,
  canalDePropuesta,
  firmar,
  guardarUrlDeAviso,
  motivoDeUrlInvalida,
  rotarSecretoDeAviso,
  verificarFirma,
} from "../lib/avisos-de-propuestas";
import { operacionOpenApi } from "../lib/operaciones-openapi";
import { pausarTrabajador, procesarPendientes, setupWorkers, shutdownQueues } from "../lib/queue";
import { subscribe } from "../lib/valkey";
import { operacionesDePropuestas } from "../routes/aprobaciones";

import { isDatabaseAvailable } from "./setup";

const AGENTE = `agente-avisos-${crypto.randomUUID().slice(0, 8)}`;
let disponible = false;
let servidor: ReturnType<typeof Bun.serve> | null = null;
let respuesta = 200;
const recibidos: Array<{ headers: Headers; cuerpo: string }> = [];

function filas(r: unknown): Array<Record<string, unknown>> {
  return ((r as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
}

async function trabajosDelAgente() {
  return filas(
    await db.execute(sql`SELECT status, attempts, last_error FROM kitsuden_outbox
      WHERE queue = 'kitsuden-webhooks' AND payload->>'agentId' = ${AGENTE} ORDER BY created_at`)
  );
}

beforeAll(async () => {
  disponible = await isDatabaseAvailable();
  if (!disponible) return;
  process.env.KITSUDEN_WEBHOOKS_ALLOW_PRIVATE = "true";
  process.env.KITSUDEN_SECRETS_KEY ??= "clave-de-pruebas-de-secretos-0123456789abcdef";
  servidor = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      recibidos.push({ headers: req.headers, cuerpo: await req.text() });
      return new Response(null, { status: respuesta });
    },
  });
  await db.execute(sql`INSERT INTO agent_identities (id, name) VALUES (${AGENTE}, 'avisos') ON CONFLICT DO NOTHING`);
  await setupWorkers();
  pausarTrabajador(true);
});

beforeEach(async () => {
  if (!disponible) return;
  recibidos.length = 0;
  respuesta = 200;
  await db.execute(sql`DELETE FROM kitsuden_outbox WHERE queue = 'kitsuden-webhooks' AND payload->>'agentId' = ${AGENTE}`);
});

afterAll(async () => {
  if (!disponible) return;
  servidor?.stop(true);
  await db.execute(sql`DELETE FROM kitsuden_outbox WHERE queue = 'kitsuden-webhooks' AND payload->>'agentId' = ${AGENTE}`);
  await db.execute(sql`DELETE FROM agent_identities WHERE id = ${AGENTE}`);
  await shutdownQueues();
  delete process.env.KITSUDEN_WEBHOOKS_ALLOW_PRIVATE;
});

describe("firma", () => {
  it("verifica con el secreto, falla con otro secreto, otro cuerpo o un t viejo", () => {
    const s = "whsec_prueba";
    const cab = firmar(s, '{"a":1}');
    expect(verificarFirma(s, '{"a":1}', cab)).toBe(true);
    expect(verificarFirma("otro", '{"a":1}', cab)).toBe(false);
    expect(verificarFirma(s, '{"a":2}', cab)).toBe(false);
    expect(verificarFirma(s, '{"a":1}', firmar(s, '{"a":1}', Math.floor(Date.now() / 1000) - 3600))).toBe(false);
  });

  it("la URL de aviso: https, sin credenciales", () => {
    delete process.env.KITSUDEN_WEBHOOKS_ALLOW_PRIVATE;
    expect(motivoDeUrlInvalida("http://ejemplo.com/h")).toMatch(/https/);
    expect(motivoDeUrlInvalida("https://u:p@ejemplo.com/h")).toMatch(/credentials/);
    expect(motivoDeUrlInvalida("https://ejemplo.com/h")).toBeNull();
    process.env.KITSUDEN_WEBHOOKS_ALLOW_PRIVATE = "true";
  });
});

describe("avisos por webhook (cola de Postgres)", () => {
  it("el secreto se ve una vez: al poner la URL; rotarlo da otro", async () => {
    if (!disponible) return;
    const primera = await guardarUrlDeAviso(AGENTE, `http://127.0.0.1:${servidor!.port}/hook`, "admin-1");
    expect(primera.secret).toMatch(/^whsec_/);
    const otra = await guardarUrlDeAviso(AGENTE, `http://127.0.0.1:${servidor!.port}/hook`, "admin-1");
    expect(otra.secret).toBeUndefined();
    expect(await ajustesDeAviso(AGENTE)).toEqual({ url: `http://127.0.0.1:${servidor!.port}/hook`, hasSecret: true });
    const rotado = await rotarSecretoDeAviso(AGENTE, "admin-1");
    expect(rotado).not.toBe(primera.secret);
  });

  it("una propuesta ejecutada manda un POST firmado con su evento y su id de entrega", async () => {
    if (!disponible) return;
    const secreto = await rotarSecretoDeAviso(AGENTE, "admin-1");
    await avisarResolucion(AGENTE, { id: "11111111-2222-4333-8444-555555555555", status: "executed" });
    await procesarPendientes();
    expect(recibidos).toHaveLength(1);
    const r = recibidos[0]!;
    expect(r.headers.get("x-kitsuden-event")).toBe("proposal.executed");
    expect(r.headers.get("x-kitsuden-delivery")).toMatch(/^[0-9a-f-]{36}$/);
    expect(verificarFirma(secreto, r.cuerpo, r.headers.get("x-kitsuden-signature") ?? "")).toBe(true);
    expect(JSON.parse(r.cuerpo)).toMatchObject({ type: "proposal.executed", agentId: AGENTE, proposal: { status: "executed" } });
    expect((await trabajosDelAgente())[0]?.status).toBe("done");
  });

  it("un estado que no es final no avisa", async () => {
    if (!disponible) return;
    await avisarResolucion(AGENTE, { id: "11111111-2222-4333-8444-555555555556", status: "pending" });
    expect(await trabajosDelAgente()).toHaveLength(0);
  });

  it("si el receptor falla se reintenta; si responde 410, a la dead letter", async () => {
    if (!disponible) return;
    respuesta = 503;
    await avisarResolucion(AGENTE, { id: "11111111-2222-4333-8444-555555555557", status: "rejected" });
    await procesarPendientes();
    let [t] = await trabajosDelAgente();
    expect(t?.status).toBe("pending");
    expect(String(t?.last_error)).toContain("503");

    respuesta = 410;
    await db.execute(sql`UPDATE kitsuden_outbox SET run_at = now() WHERE queue = 'kitsuden-webhooks' AND payload->>'agentId' = ${AGENTE}`);
    await procesarPendientes();
    [t] = await trabajosDelAgente();
    expect(t?.status).toBe("dead");
  });

  it("sin URL de aviso no se encola nada (el agente sigue teniendo el SSE)", async () => {
    if (!disponible) return;
    await guardarUrlDeAviso(AGENTE, null, "admin-1");
    await avisarResolucion(AGENTE, { id: "11111111-2222-4333-8444-555555555558", status: "expired" });
    expect(await trabajosDelAgente()).toHaveLength(0);
  });
});

describe("avisos por SSE", () => {
  it("la resolución llega por el bus al canal de la propuesta", async () => {
    if (!disponible) return;
    const id = "11111111-2222-4333-8444-555555555559";
    const llegados: unknown[] = [];
    const dejar = await subscribe(canalDePropuesta(id), (_c, m) => llegados.push(JSON.parse(m)));
    await avisarResolucion(AGENTE, { id, status: "failed" });
    await new Promise((r) => setTimeout(r, 20));
    await dejar();
    expect(llegados).toEqual([{ id, status: "failed" }]);
  });

  it("la operación de eventos es un flujo en OpenAPI y queda fuera de MCP", () => {
    const op = operacionesDePropuestas.find((o) => o.id === "eventos-de-propuesta")!;
    expect(op).toBeDefined();
    const { camino, operacion } = operacionOpenApi("kon-propuestas", "/api/proposals", op);
    expect(camino).toBe("/proposals/{id}/events");
    const x = operacion["x-kitsuden-operation"] as { stream?: boolean; mcp?: { excluded?: string } };
    expect(x.stream).toBe(true);
    expect(x.mcp?.excluded).toBeTruthy();
  });
});
