/**
 * Fase F: aprobación humana de lo que piden los agentes
 * ============================================================================
 *
 * Contra la app REAL (Postgres de pruebas, kons cargados), agentes reales y
 * cuentas humanas reales (admin y editor con sesión):
 *
 *   · apagado (lo de fábrica) → todo se ejecuta como antes;
 *   · global encendido → lo sensible de un agente en `inherit` queda como
 *     propuesta (202 + KITSUDEN_E_APPROVAL_REQUIRED + id + Location) y NO se
 *     ejecuta; lo no sensible, directo; un humano nunca se retiene;
 *   · el global es el interruptor MAESTRO (apagado, ni `propose` retiene);
 *   · modos por agente: `propose` (escrituras, con retención selectiva o
 *     estricta) y `direct` (nunca);
 *   · sensibilidad por operación cambiada por el admin y reglas legadas;
 *   · aprobar ejecuta UNA vez con la identidad del agente (y queda quién
 *     aprobó); el agente ve el resultado; rechazar no ejecuta nunca;
 *   · idempotencia: la misma Idempotency-Key → la misma propuesta; otra
 *     petición con esa clave → 422; sin clave, no se duplica la pendiente;
 *   · revalidación: clave revocada o permiso retirado entre medias → no se
 *     ejecuta;
 *   · un agente (ni con `admin`) no aprueba ni configura; un editor solo
 *     aprueba lo que él podría hacer;
 *   · MCP: herramienta del SDK y del núcleo retenidas, `kitsuden_proposal_status`;
 *   · caducidad, secretos y auditoría.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { eq, inArray, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import { db } from "../db";
import {
  agentApiKeys,
  agentAuditLogs,
  agentIdentities,
  agentProposals,
  approvalSettings,
  authUsers,
  dataEntries,
  dataSets,
} from "../db/schema";
import { app } from "../index";
import { invalidarConfigDeAprobaciones } from "../lib/aprobaciones";
import { vaciarMemoriaDeCuotas } from "../lib/cuotas-de-agente";
import { createAgent } from "../services/agent-auth";

import { isDatabaseAvailable, generateTestId, entrarComo } from "./setup";
import { konInstalado } from "../lib/kons-instalados";

// kon-blog es un kon INSTALABLE (repo kitsuden-kons): sin él no hay rutas que
// probar. Lo que lo usa se salta en un clon limpio del núcleo en vez de fallar.
const SIN_BLOG = !konInstalado("kon-blog")?.ruta;
// La tabla de categorías del blog (la operación sensible de ejemplo), si está.
// (especificador en variable: así el núcleo compila sin el kon instalado)
const ESQUEMA_DEL_BLOG = "../../../../packages/kons/kon-blog/src/schema.local";
const { blogCategories } = (SIN_BLOG ? {} : await import(ESQUEMA_DEL_BLOG)) as {
  blogCategories: PgTable & { id: PgColumn };
};

let dbAvailable = false;
const ORIGEN = "http://localhost:4321";
let admin = { cookie: "", userId: "" };
let editor = { cookie: "", userId: "" };
let autorId = "";
const agentesCreados: string[] = [];

async function agente(scopes: string[]): Promise<{ id: string; token: string }> {
  const { agent, plainApiKey } = await createAgent({
    name: `aprob-${generateTestId()}`,
    scopes,
    rateLimit: 100_000,
  });
  agentesCreados.push(agent.id);
  return { id: agent.id, token: plainApiKey };
}

interface Opciones {
  token?: string | null;
  cookie?: string;
  cuerpo?: unknown;
  cabeceras?: Record<string, string>;
}

async function pedir(metodo: string, camino: string, o: Opciones = {}): Promise<Response> {
  const headers: Record<string, string> = { origin: ORIGEN, ...(o.cabeceras ?? {}) };
  if (o.token) headers.Authorization = `Bearer ${o.token}`;
  if (o.cookie) headers.Cookie = o.cookie;
  if (o.cuerpo !== undefined) headers["Content-Type"] = "application/json";
  return app.request(
    new Request(`http://localhost:3000${camino}`, {
      method: metodo,
      headers,
      body: o.cuerpo === undefined ? undefined : JSON.stringify(o.cuerpo),
    })
  );
}

const comoAdmin = (metodo: string, camino: string, cuerpo?: unknown) =>
  pedir(metodo, camino, { cookie: admin.cookie, cuerpo });

async function configurar(cambio: Record<string, unknown>) {
  const r = await comoAdmin("PUT", "/api/approvals/settings", cambio);
  expect(r.status, await r.clone().text()).toBe(200);
  return r.json();
}

async function modo(agentId: string, m: "inherit" | "propose" | "direct") {
  const r = await comoAdmin("PUT", `/api/approvals/agents/${agentId}/mode`, { mode: m });
  expect(r.status, await r.clone().text()).toBe(200);
}

async function categoria(): Promise<string> {
  const slug = `aprob-${generateTestId()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const [c] = await db.insert(blogCategories).values({ name: slug, slug } as never).returning({ id: blogCategories.id });
  return c!.id as string;
}

async function existeCategoria(id: string): Promise<boolean> {
  const filas = await db.select({ id: blogCategories.id }).from(blogCategories).where(eq(blogCategories.id, id));
  return filas.length > 0;
}

async function datasetConFila(
  prefijo: string,
  policyJson: unknown = null
): Promise<{ id: string; slug: string; filaId: string }> {
  const slug = `${prefijo}-${generateTestId()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const [ds] = await db
    .insert(dataSets)
    .values({ name: slug, slug, schema: [{ key: "n", type: "text" }], policyJson } as never)
    .returning({ id: dataSets.id });
  const [fila] = await db
    .insert(dataEntries)
    .values({ dataSetId: ds!.id, title: "fila", data: { n: "1" } } as never)
    .returning({ id: dataEntries.id });
  return { id: ds!.id, slug, filaId: fila!.id };
}

async function existeFila(id: string): Promise<boolean> {
  return (await db.select({ id: dataEntries.id }).from(dataEntries).where(eq(dataEntries.id, id))).length > 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cuerpos JSON leídos en la prueba
async function json(r: Response): Promise<any> {
  return r.json();
}

// ── MCP ──
interface Sesion {
  token: string;
  sessionId: string;
  cerrar: () => Promise<void>;
}
const abiertas: Sesion[] = [];
async function sesionMcp(token: string): Promise<Sesion> {
  const res = await app.request(
    new Request("http://localhost:3000/api/mcp", { headers: { Authorization: `Bearer ${token}` } })
  );
  expect(res.status).toBe(200);
  const lector = res.body!.getReader();
  let texto = "";
  while (!texto.includes("\n\n")) {
    const { value, done } = await lector.read();
    if (done) break;
    texto += new TextDecoder().decode(value);
  }
  const sessionId = texto.match(/sessionId=([a-zA-Z0-9-]+)/)![1]!;
  const s = { token, sessionId, cerrar: () => lector.cancel().catch(() => {}) };
  abiertas.push(s);
  return s;
}
let rpcId = 1;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON-RPC leído en la prueba
async function rpc(s: Sesion, method: string, params: unknown): Promise<any> {
  const res = await app.request(
    new Request(`http://localhost:3000/api/mcp?sessionId=${s.sessionId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${s.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
    })
  );
  return res.json();
}
const llamar = (s: Sesion, name: string, args: unknown) => rpc(s, "tools/call", { name, arguments: args });

describe.skipIf(SIN_BLOG)("Fase F — aprobación humana", () => {
  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (!dbAvailable) return;
    vaciarMemoriaDeCuotas();
    admin = await entrarComo(app, {
      email: `aprob-admin-${generateTestId()}@example.com`,
      password: "TestPassword123!",
      name: "Aprobadora",
      role: "admin",
    });
    editor = await entrarComo(app, {
      email: `aprob-editor-${generateTestId()}@example.com`,
      password: "TestPassword123!",
      name: "Editora",
      role: "editor",
    });
    autorId = admin.userId;
    await db.delete(approvalSettings);
    invalidarConfigDeAprobaciones();
  });

  afterAll(async () => {
    for (const s of abiertas) await s.cerrar();
    if (!dbAvailable) return;
    // Lo de fábrica otra vez: los demás ficheros de pruebas esperan la API de siempre.
    await db.delete(approvalSettings);
    if (agentesCreados.length) {
      await db.update(agentIdentities).set({ approvalMode: "inherit" }).where(inArray(agentIdentities.id, agentesCreados));
    }
    invalidarConfigDeAprobaciones();
  });

  // ── 1. Apagado: como antes ──
  it("de fábrica (apagado) un agente borra directamente y no se crea ninguna propuesta", async () => {
    if (!dbAvailable) return;
    const a = await agente(["blog:*"]);
    const id = await categoria();
    const r = await pedir("DELETE", `/api/blog/categories/${id}`, { token: a.token });
    expect(r.status, await r.clone().text()).toBeLessThan(300);
    expect(await existeCategoria(id)).toBe(false);
    const propuestas = await db.select().from(agentProposals).where(eq(agentProposals.agentId, a.id));
    expect(propuestas.length).toBe(0);
  });

  // ── 2. Global encendido ──
  it("global encendido: el DELETE de un agente queda como propuesta (202) y no se ejecuta", async () => {
    if (!dbAvailable) return;
    await configurar({ enabled: true });
    const a = await agente(["blog:*"]);
    const otro = await agente(["blog:*"]);
    const id = await categoria();

    const r = await pedir("DELETE", `/api/blog/categories/${id}`, { token: a.token });
    expect(r.status).toBe(202);
    const cuerpo = await json(r);
    expect(cuerpo.code).toBe("KITSUDEN_E_APPROVAL_REQUIRED");
    expect(cuerpo.proposal.status).toBe("pending");
    expect(cuerpo.proposal.reason).toBe("sensitive");
    expect(cuerpo.proposal.operation).toBe("kon:blog:borrar-categoria");
    expect(r.headers.get("location")).toBe(`/api/proposals/${cuerpo.proposal.id}`);
    expect(await existeCategoria(id)).toBe(true);

    // El agente lo consulta; otro agente no lo ve
    const estado = await pedir("GET", `/api/proposals/${cuerpo.proposal.id}`, { token: a.token });
    expect(estado.status, await estado.clone().text()).toBe(200);
    expect((await json(estado)).status).toBe("pending");
    expect((await pedir("GET", `/api/proposals/${cuerpo.proposal.id}`, { token: otro.token })).status).toBe(404);

    // Lo no sensible se ejecuta: crear una categoría
    const slug = `ok-${generateTestId()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const crear = await pedir("POST", "/api/blog/categories", { token: a.token, cuerpo: { name: slug, slug } });
    expect(crear.status, await crear.clone().text()).toBe(201);

    // Un humano nunca se retiene
    const id2 = await categoria();
    const humano = await comoAdmin("DELETE", `/api/blog/categories/${id2}`);
    expect(humano.status).toBeLessThan(300);
    expect(await existeCategoria(id2)).toBe(false);
  });

  it("aprobar ejecuta UNA vez con la identidad del agente; el agente ve el resultado; la auditoría lo cuenta", async () => {
    if (!dbAvailable) return;
    await configurar({ enabled: true });
    const a = await agente(["blog:*"]);
    const id = await categoria();
    const p = await json(await pedir("DELETE", `/api/blog/categories/${id}`, { token: a.token }));
    const pid = p.proposal.id as string;

    // Bandeja y contador
    const bandeja = await json(await comoAdmin("GET", "/api/approvals/proposals?status=pending"));
    expect(bandeja.proposals.some((x: { id: string }) => x.id === pid)).toBe(true);
    expect((await json(await comoAdmin("GET", "/api/approvals/proposals/count"))).pending).toBeGreaterThan(0);
    const detalle = await json(await comoAdmin("GET", `/api/approvals/proposals/${pid}`));
    expect(detalle.canDecide).toBe(true);
    expect(detalle.agentId).toBe(a.id);

    // Dos aprobaciones a la vez: una ejecuta, la otra 409
    const [r1, r2] = await Promise.all([
      comoAdmin("POST", `/api/approvals/proposals/${pid}/approve`, { comment: "ok" }),
      comoAdmin("POST", `/api/approvals/proposals/${pid}/approve`, { comment: "ok" }),
    ]);
    const estados = [r1.status, r2.status].sort();
    expect(estados).toEqual([200, 409]);
    const ganadora = await json(r1.status === 200 ? r1 : r2);
    expect(ganadora.proposal.status).toBe("executed");
    expect(ganadora.proposal.decidedBy).toBe(admin.userId);
    expect(ganadora.proposal.result.status).toBeLessThan(300);
    expect(await existeCategoria(id)).toBe(false);

    // Una tercera, ya ejecutada: 409 y nada se repite
    expect((await comoAdmin("POST", `/api/approvals/proposals/${pid}/approve`, {})).status).toBe(409);
    const ejecuciones = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(agentAuditLogs)
      .where(sql`${agentAuditLogs.resourceId} = ${pid} AND ${agentAuditLogs.action} = 'proposal_executed'`);
    expect(ejecuciones[0]!.n).toBe(1);

    // El agente ve el resultado
    const visto = await json(await pedir("GET", `/api/proposals/${pid}`, { token: a.token }));
    expect(visto.status).toBe("executed");
    expect(visto.result.status).toBeLessThan(300);
    expect(visto.comment).toBe("ok");

    // Auditoría: propuesta, aprobación (con quién) y ejecución
    const audit = await json(await comoAdmin("GET", `/api/approvals/audit?proposalId=${pid}`));
    const acciones = audit.events.map((e: { action: string }) => e.action);
    expect(acciones).toEqual(expect.arrayContaining(["proposal_created", "proposal_approved", "proposal_executed"]));
    const aprob = audit.events.find((e: { action: string }) => e.action === "proposal_approved");
    expect(aprob.by).toBe(admin.userId);
    expect(aprob.byName).toBe("Aprobadora");
  });

  it("rechazar: no se ejecuta nunca y el agente ve el comentario", async () => {
    if (!dbAvailable) return;
    await configurar({ enabled: true });
    const a = await agente(["blog:*"]);
    const id = await categoria();
    const pid = (await json(await pedir("DELETE", `/api/blog/categories/${id}`, { token: a.token }))).proposal.id;
    const r = await comoAdmin("POST", `/api/approvals/proposals/${pid}/reject`, { comment: "no se borra" });
    expect(r.status).toBe(200);
    expect((await json(r)).proposal.status).toBe("rejected");
    expect((await comoAdmin("POST", `/api/approvals/proposals/${pid}/approve`, {})).status).toBe(409);
    expect(await existeCategoria(id)).toBe(true);
    const visto = await json(await pedir("GET", `/api/proposals/${pid}`, { token: a.token }));
    expect(visto.status).toBe("rejected");
    expect(visto.comment).toBe("no se borra");
    expect(visto.result).toBeUndefined();
  });

  // ── 3. Idempotencia ──
  it("misma Idempotency-Key → la misma propuesta; otra petición con esa clave → 422; sin clave no se duplica", async () => {
    if (!dbAvailable) return;
    await configurar({ enabled: true });
    const a = await agente(["blog:*"]);
    const id = await categoria();
    const clave = `aprob-${generateTestId()}`;
    const r1 = await pedir("DELETE", `/api/blog/categories/${id}`, { token: a.token, cabeceras: { "Idempotency-Key": clave } });
    const r2 = await pedir("DELETE", `/api/blog/categories/${id}`, { token: a.token, cabeceras: { "Idempotency-Key": clave } });
    expect(r1.status).toBe(202);
    expect(r2.status).toBe(202);
    expect(r2.headers.get("idempotent-replayed")).toBe("true");
    const p1 = (await json(r1)).proposal.id;
    expect((await json(r2)).proposal.id).toBe(p1);
    const otra = await categoria();
    const r3 = await pedir("DELETE", `/api/blog/categories/${otra}`, { token: a.token, cabeceras: { "Idempotency-Key": clave } });
    expect(r3.status).toBe(422);

    // Sin clave: el mismo DELETE dos veces → una sola pendiente
    const s1 = await json(await pedir("DELETE", `/api/blog/categories/${otra}`, { token: a.token }));
    const s2 = await json(await pedir("DELETE", `/api/blog/categories/${otra}`, { token: a.token }));
    expect(s2.proposal.id).toBe(s1.proposal.id);
    const filas = await db.select().from(agentProposals).where(eq(agentProposals.agentId, a.id));
    expect(filas.length).toBe(2);
  });

  // ── 4. Modos por agente y sensibilidad por operación ──
  it("modo propose: toda escritura es propuesta (las lecturas no); modo direct: nunca, aunque esté encendido", async () => {
    if (!dbAvailable) return;
    await configurar({ enabled: true, proposeRetention: "selective" });
    const p = await agente(["blog:*"]);
    await modo(p.id, "propose");
    const slug = `pr-${generateTestId()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const crear = await pedir("POST", "/api/blog/categories", { token: p.token, cuerpo: { name: slug, slug } });
    expect(crear.status).toBe(202);
    expect((await json(crear)).proposal.reason).toBe("propose_only");
    expect((await pedir("GET", "/api/blog/categories", { token: p.token })).status).toBe(200);

    // Retención selectiva: un POST declarado soloLectura no se retiene; estricta, sí.
    const seo = { title: "Un título de prueba" };
    expect((await pedir("POST", "/api/blog/validate-seo", { token: p.token, cuerpo: seo })).status).toBe(200);
    await configurar({ proposeRetention: "strict" });
    const estricto = await pedir("POST", "/api/blog/validate-seo", { token: p.token, cuerpo: seo });
    expect(estricto.status, await estricto.clone().text()).toBe(202);
    await configurar({ proposeRetention: "selective" });

    const d = await agente(["blog:*"]);
    await modo(d.id, "direct");
    const id = await categoria();
    const r = await pedir("DELETE", `/api/blog/categories/${id}`, { token: d.token });
    expect(r.status).toBeLessThan(300);
    expect(await existeCategoria(id)).toBe(false);
  });

  it("el global es el interruptor MAESTRO: apagado, un agente en propose tampoco pide aprobación", async () => {
    if (!dbAvailable) return;
    await configurar({ enabled: false });
    const p = await agente(["blog:*"]);
    await modo(p.id, "propose");
    const slug = `pm-${generateTestId()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const crear = await pedir("POST", "/api/blog/categories", { token: p.token, cuerpo: { name: slug, slug } });
    expect(crear.status, await crear.clone().text()).toBe(201);
    const id = await categoria();
    expect((await pedir("DELETE", `/api/blog/categories/${id}`, { token: p.token })).status).toBeLessThan(300);
    expect(await existeCategoria(id)).toBe(false);
    const sin = await db.select().from(agentProposals).where(eq(agentProposals.agentId, p.id));
    expect(sin.length).toBe(0);
  });

  it("el admin cambia la sensibilidad de una operación y las reglas legadas, sin reiniciar", async () => {
    if (!dbAvailable) return;
    await configurar({ enabled: true, operations: { "kon:blog:borrar-categoria": false, "kon:blog:crear-categoria": true } });
    const a = await agente(["blog:*"]);
    const id = await categoria();
    expect((await pedir("DELETE", `/api/blog/categories/${id}`, { token: a.token })).status).toBeLessThan(300);
    const slug = `s-${generateTestId()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    expect((await pedir("POST", "/api/blog/categories", { token: a.token, cuerpo: { name: slug, slug } })).status).toBe(202);
    // Vuelve a lo declarado
    await configurar({ operations: { "kon:blog:borrar-categoria": null, "kon:blog:crear-categoria": null } });
    const ajustes = await json(await comoAdmin("GET", "/api/approvals/settings"));
    const op = ajustes.operations.find((o: { key: string }) => o.key === "kon:blog:borrar-categoria");
    expect(op).toMatchObject({ default: true, override: null, sensitive: true });
    expect(ajustes.config.legacyRules).toEqual([{ method: "DELETE", path: "/api/**" }]);
    // Validación
    expect((await comoAdmin("PUT", "/api/approvals/settings", { legacyRules: [{ method: "GET", path: "nope" }] })).status).toBe(422);
    expect((await comoAdmin("PUT", "/api/approvals/settings", { ttlHours: 0 })).status).toBe(422);
  });

  it("una ruta LEGADA cubierta por la regla DELETE /api/** también queda retenida", async () => {
    if (!dbAvailable) return;
    await configurar({ enabled: true });
    const a = await agente(["admin"]);
    const { slug, filaId } = await datasetConFila("leg");
    const r = await pedir("DELETE", `/api/items/${slug}/${filaId}`, { token: a.token });
    expect(r.status, await r.clone().text()).toBe(202);
    const cuerpo = await json(r);
    expect(cuerpo.proposal.operation).toBeNull();
    expect(await existeFila(filaId)).toBe(true);
    // Se aprueba y se ejecuta por la ruta legada
    const ok = await json(await comoAdmin("POST", `/api/approvals/proposals/${cuerpo.proposal.id}/approve`, {}));
    expect(ok.proposal.status, JSON.stringify(ok.proposal.result)).toBe("executed");
    expect(await existeFila(filaId)).toBe(false);
  });

  it("el diff de un PATCH: lo de ahora frente a lo propuesto", async () => {
    if (!dbAvailable) return;
    await configurar({ enabled: false });
    const a = await agente(["blog:*"]);
    const antes = `Antes ${generateTestId()}`;
    const crear = await pedir("POST", "/api/blog", { token: a.token, cuerpo: { title: antes, authorId: autorId } });
    expect(crear.status, await crear.clone().text()).toBe(201);
    const { id } = await json(crear);
    // Publicada: un borrador no lo ve un agente (regla del blog), y el diff se
    // lee CON SU identidad (sin borrador visible, el diff dice que no pudo leer).
    await db.execute(sql`UPDATE blog_posts SET status = 'published', published_at = now() - interval '1 hour' WHERE id = ${id}`);
    await modo(a.id, "propose");
    await configurar({ enabled: true });
    const r = await pedir("PATCH", `/api/blog/${id}`, { token: a.token, cuerpo: { title: "Después" } });
    expect(r.status).toBe(202);
    const detalle = await json(await comoAdmin("GET", `/api/approvals/proposals/${(await json(r)).proposal.id}`));
    expect(detalle.diff.kind).toBe("update");
    expect(detalle.diff.changes).toEqual([{ field: "title", before: antes, after: "Después" }]);
    expect(detalle.body).toEqual({ title: "Después" });
  });

  // ── 5. Revalidación ──
  it("clave revocada o permiso retirado entre la propuesta y la aprobación → no se ejecuta", async () => {
    if (!dbAvailable) return;
    await configurar({ enabled: true });
    const a = await agente(["blog:*"]);
    const id = await categoria();
    const pid = (await json(await pedir("DELETE", `/api/blog/categories/${id}`, { token: a.token }))).proposal.id;
    await db.update(agentApiKeys).set({ revokedAt: new Date() }).where(eq(agentApiKeys.agentId, a.id));
    const r = await json(await comoAdmin("POST", `/api/approvals/proposals/${pid}/approve`, {}));
    expect(r.proposal.status).toBe("failed");
    expect(r.proposal.result.error).toContain("key_revoked");
    expect(await existeCategoria(id)).toBe(true);

    const b = await agente(["blog:*"]);
    const id2 = await categoria();
    const pid2 = (await json(await pedir("DELETE", `/api/blog/categories/${id2}`, { token: b.token }))).proposal.id;
    await db.update(agentIdentities).set({ scopes: ["mcp:connect"] }).where(eq(agentIdentities.id, b.id));
    const r2 = await json(await comoAdmin("POST", `/api/approvals/proposals/${pid2}/approve`, {}));
    expect(r2.proposal.status).toBe("failed");
    expect(await existeCategoria(id2)).toBe(true);
  });

  it("caducada: no se puede aprobar y queda auditada", async () => {
    if (!dbAvailable) return;
    await configurar({ enabled: true });
    const a = await agente(["blog:*"]);
    const id = await categoria();
    const pid = (await json(await pedir("DELETE", `/api/blog/categories/${id}`, { token: a.token }))).proposal.id;
    await db.update(agentProposals).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(agentProposals.id, pid));
    const r = await comoAdmin("POST", `/api/approvals/proposals/${pid}/approve`, {});
    expect(r.status).toBe(409);
    expect((await json(r)).proposal.status).toBe("expired");
    expect(await existeCategoria(id)).toBe(true);
    const audit = await json(await comoAdmin("GET", `/api/approvals/audit?proposalId=${pid}`));
    expect(audit.events.some((e: { action: string }) => e.action === "proposal_expired")).toBe(true);
  });

  it("un cuerpo con secretos no se guarda: 403 KITSUDEN_E_APPROVAL_UNSUPPORTED", async () => {
    if (!dbAvailable) return;
    await configurar({ enabled: true });
    const a = await agente(["blog:*"]);
    await modo(a.id, "propose");
    const r = await pedir("POST", "/api/blog/categories", {
      token: a.token,
      cuerpo: { name: "x", slug: "x", password: "hunter2-secreto" },
    });
    expect(r.status).toBe(403);
    const cuerpo = await json(r);
    expect(cuerpo.code).toBe("KITSUDEN_E_APPROVAL_UNSUPPORTED");
    expect(cuerpo.reason).toBe("secret");
  });

  // ── 6. Quién decide y quién configura ──
  it("un agente, ni con admin, aprueba, rechaza, configura ni cambia modos", async () => {
    if (!dbAvailable) return;
    await configurar({ enabled: true });
    const a = await agente(["blog:*"]);
    const id = await categoria();
    const pid = (await json(await pedir("DELETE", `/api/blog/categories/${id}`, { token: a.token }))).proposal.id;
    const jefe = await agente(["admin"]);
    for (const token of [a.token, jefe.token]) {
      expect((await pedir("POST", `/api/approvals/proposals/${pid}/approve`, { token, cuerpo: {} })).status).toBe(403);
      expect((await pedir("POST", `/api/approvals/proposals/${pid}/reject`, { token, cuerpo: {} })).status).toBe(403);
      expect((await pedir("PUT", "/api/approvals/settings", { token, cuerpo: { enabled: false } })).status).toBe(403);
      expect((await pedir("PUT", `/api/approvals/agents/${a.id}/mode`, { token, cuerpo: { mode: "direct" } })).status).toBe(403);
      expect((await pedir("GET", "/api/approvals/proposals", { token })).status).toBe(403);
    }
    expect(await existeCategoria(id)).toBe(true);
    const sigue = await db.select().from(agentProposals).where(eq(agentProposals.id, pid));
    expect(sigue[0]!.status).toBe("pending");
    const ajustes = await json(await comoAdmin("GET", "/api/approvals/settings"));
    expect(ajustes.config.enabled).toBe(true);
  });

  it("un editor aprueba lo que su rol puede hacer, pero no configura ni aprueba lo de admin", async () => {
    if (!dbAvailable) return;
    await configurar({ enabled: true });
    const a = await agente(["admin"]);
    const id = await categoria();
    const pid = (await json(await pedir("DELETE", `/api/blog/categories/${id}`, { token: a.token }))).proposal.id;
    const ok = await pedir("POST", `/api/approvals/proposals/${pid}/approve`, { cookie: editor.cookie, cuerpo: {} });
    expect(ok.status, await ok.clone().text()).toBe(200);
    expect((await json(ok)).proposal.status).toBe("executed");

    // DELETE en /api/items (ruta legada, puerta de admin): el editor no
    const { slug, filaId } = await datasetConFila("ed");
    const pid2 = (await json(await pedir("DELETE", `/api/items/${slug}/${filaId}`, { token: a.token }))).proposal.id;
    const detalle = await json(await pedir("GET", `/api/approvals/proposals/${pid2}`, { cookie: editor.cookie }));
    expect(detalle.canDecide).toBe(false);
    expect((await pedir("POST", `/api/approvals/proposals/${pid2}/approve`, { cookie: editor.cookie, cuerpo: {} })).status).toBe(403);
    expect((await pedir("PUT", "/api/approvals/settings", { cookie: editor.cookie, cuerpo: { enabled: false } })).status).toBe(403);
    // Una cuenta sin rol, fuera
    const normal = await entrarComo(app, {
      email: `aprob-user-${generateTestId()}@example.com`,
      password: "TestPassword123!",
      name: "Normal",
    });
    expect((await pedir("GET", "/api/approvals/proposals", { cookie: normal.cookie })).status).toBe(403);
    expect((await pedir("GET", `/api/proposals/${pid2}`, { cookie: normal.cookie })).status).toBe(403);
    expect((await pedir("GET", `/api/proposals/${pid2}`)).status).toBe(401);
  });

  // ── 7. MCP ──
  it("MCP: herramienta del SDK retenida → pendiente con id; kitsuden_proposal_status; aprobada → resultado", async () => {
    if (!dbAvailable) return;
    await configurar({ enabled: true });
    const a = await agente(["mcp:connect", "blog:*"]);
    const s = await sesionMcp(a.token);
    const lista = await rpc(s, "tools/list", {});
    const nombres = lista.result.tools.map((t: { name: string }) => t.name);
    expect(nombres).toContain("kitsuden_proposal_status");

    const id = await categoria();
    const r = await llamar(s, "blog__borrar-categoria", { id });
    expect(r.result.isError).toBe(false);
    expect(r.result.structuredContent.code).toBe("KITSUDEN_E_APPROVAL_REQUIRED");
    const pid = r.result.structuredContent.proposal.id as string;
    expect(await existeCategoria(id)).toBe(true);

    const estado = await llamar(s, "kitsuden_proposal_status", { proposal_id: pid });
    expect(estado.result.structuredContent.status).toBe("pending");
    expect(estado.result.structuredContent.channel).toBe("mcp");

    const ok = await json(await comoAdmin("POST", `/api/approvals/proposals/${pid}/approve`, {}));
    expect(ok.proposal.status, JSON.stringify(ok.proposal.result)).toBe("executed");
    expect(await existeCategoria(id)).toBe(false);
    const fin = await llamar(s, "kitsuden_proposal_status", { proposal_id: pid });
    expect(fin.result.structuredContent.status).toBe("executed");

    // La de otro agente: no existe para este
    const b = await agente(["mcp:connect"]);
    const sb = await sesionMcp(b.token);
    const ajena = await llamar(sb, "kitsuden_proposal_status", { proposal_id: pid });
    expect(ajena.error?.data?.code ?? ajena.result?.structuredContent?.code).toBe("KITSUDEN_E_NOT_FOUND");
  });

  it("MCP: herramienta del núcleo (kitsuden_delete_record) retenida y ejecutada al aprobar", async () => {
    if (!dbAvailable) return;
    await configurar({ enabled: true });
    // Abierto a cualquier sesión: el scope amplio de MCP no abre un dataset que
    // su política cierra (fase F).
    const { id: dsId, slug, filaId } = await datasetConFila("mcpn", {
      readAccess: "authenticated",
      writeAccess: "authenticated",
    });
    const fila = { id: filaId };
    const ds = { id: dsId };
    const a = await agente(["mcp:connect", "mcp:read", "mcp:write"]);
    const s = await sesionMcp(a.token);
    const r = await llamar(s, "kitsuden_delete_record", { collection: slug, id: fila!.id });
    expect(r.result.structuredContent.code, JSON.stringify(r)).toBe("KITSUDEN_E_APPROVAL_REQUIRED");
    const pid = r.result.structuredContent.proposal.id as string;
    expect((await db.select().from(dataEntries).where(eq(dataEntries.id, fila!.id))).length).toBe(1);

    // Un editor no aprueba herramientas del núcleo
    expect((await pedir("POST", `/api/approvals/proposals/${pid}/approve`, { cookie: editor.cookie, cuerpo: {} })).status).toBe(403);
    const ok = await json(await comoAdmin("POST", `/api/approvals/proposals/${pid}/approve`, {}));
    expect(ok.proposal.status, JSON.stringify(ok.proposal.result)).toBe("executed");
    expect((await db.select().from(dataEntries).where(eq(dataEntries.id, fila!.id))).length).toBe(0);
    await db.delete(dataSets).where(eq(dataSets.id, ds!.id));
  });

  // ── 8. Auditoría de la configuración y apagar ──
  it("la configuración queda auditada (quién y cuándo) y al apagar todo vuelve a ejecutarse directo", async () => {
    if (!dbAvailable) return;
    await configurar({ enabled: true });
    await configurar({ enabled: false });
    const audit = await json(await comoAdmin("GET", "/api/approvals/audit?limit=20"));
    const cambios = audit.events.filter((e: { action: string }) => e.action === "approval_settings_changed");
    expect(cambios.length).toBeGreaterThanOrEqual(2);
    expect(cambios[0].by).toBe(admin.userId);
    expect(cambios[0].details.after.enabled).toBe(false);
    const ajustes = await json(await comoAdmin("GET", "/api/approvals/settings"));
    expect(ajustes.updatedBy).toBe(admin.userId);

    const a = await agente(["blog:*"]);
    const id = await categoria();
    expect((await pedir("DELETE", `/api/blog/categories/${id}`, { token: a.token })).status).toBeLessThan(300);
    expect(await existeCategoria(id)).toBe(false);
    const fila = await db.select().from(authUsers).where(eq(authUsers.id, admin.userId));
    expect(fila.length).toBe(1);
  });
});
