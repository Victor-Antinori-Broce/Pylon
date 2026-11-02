/**
 * Fase F — tres decisiones del propietario (2026-10-24)
 * ============================================================================
 *
 * Contra la app REAL (Postgres de pruebas, kons cargados). Cada bloque falla
 * sin su cambio:
 *
 *   1. FIRMANTE humano por agente: lo que crea el agente (autor del blog,
 *      dueño de entradas de dataset por REST, la API lite y MCP) lo firma su
 *      humano responsable; `created_by_id` es el agente; otro autor solo con
 *      `admin`; firmante sin rol → 403 KITSUDEN_E_AGENT_SPONSOR_INVALID; sin
 *      firmante, como antes; al aprobar una propuesta queda agente + firmante
 *      + aprobador.
 *   2. MCP endurecido: `mcp:read`/`mcp:write` abren la herramienta, no un
 *      dataset que su `policyJson` cierra; `datasets:<slug>:*` sí; las
 *      `rlsRules` se aplican como en REST; un agente solo `contenido:editar`
 *      (Inti) no cambia.
 *   3. Las repeticiones de la idempotencia (`Idempotent-Replayed: true`) no
 *      gastan cuota, por REST ni por MCP.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { eq, inArray, sql } from "drizzle-orm";

import { db } from "../db";
import { agentIdentities, agentProposals, approvalSettings, authUsers, dataEntries, dataSets } from "../db/schema";
import { app } from "../index";
import { invalidarConfigDeAprobaciones } from "../lib/aprobaciones";
import { vaciarMemoriaDeCuotas } from "../lib/cuotas-de-agente";
import { createAgent } from "../services/agent-auth";

import { isDatabaseAvailable, generateTestId, entrarComo } from "./setup";
import { konInstalado } from "../lib/kons-instalados";

// kon-blog es un kon INSTALABLE (repo kitsuden-kons): sin él no hay rutas que
// probar. Lo que lo usa se salta en un clon limpio del núcleo en vez de fallar.
const SIN_BLOG = !konInstalado("kon-blog")?.ruta;
const itConBlog = SIN_BLOG ? it.skip : it;

let dbAvailable = false;
const ORIGEN = "http://localhost:4321";
let admin = { cookie: "", userId: "" };
let firmante = { cookie: "", userId: "" };
const agentes: string[] = [];
const datasets: string[] = [];

async function agente(scopes: string[], extra: Partial<typeof agentIdentities.$inferInsert> = {}) {
  const { agent, plainApiKey } = await createAgent({ name: `firma-${generateTestId()}`, scopes, rateLimit: 100_000 });
  agentes.push(agent.id);
  if (Object.keys(extra).length) await db.update(agentIdentities).set(extra).where(eq(agentIdentities.id, agent.id));
  return { id: agent.id, token: plainApiKey };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cuerpos JSON leídos en la prueba
async function pedir(metodo: string, camino: string, o: { token?: string; cookie?: string; cuerpo?: unknown; cabeceras?: Record<string, string> } = {}): Promise<{ status: number; body: any; headers: Headers }> {
  const headers: Record<string, string> = { origin: ORIGEN, ...(o.cabeceras ?? {}) };
  if (o.token) headers.Authorization = `Bearer ${o.token}`;
  if (o.cookie) headers.Cookie = o.cookie;
  if (o.cuerpo !== undefined) headers["Content-Type"] = "application/json";
  const res = await app.request(
    new Request(`http://localhost:3000${camino}`, {
      method: metodo,
      headers,
      body: o.cuerpo === undefined ? undefined : JSON.stringify(o.cuerpo),
    })
  );
  const texto = await res.text();
  let body: unknown = texto;
  try {
    body = JSON.parse(texto);
  } catch {
    /* texto */
  }
  return { status: res.status, body, headers: res.headers };
}

async function dataset(prefijo: string, policyJson: unknown) {
  const slug = `${prefijo}-${generateTestId()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const [ds] = await db
    .insert(dataSets)
    .values({ name: slug, slug, schema: [{ key: "n", type: "text" }], policyJson } as never)
    .returning({ id: dataSets.id, slug: dataSets.slug });
  datasets.push(ds!.id);
  return ds!;
}

// ── MCP ──
interface Sesion {
  token: string;
  sessionId: string;
  cerrar: () => Promise<void>;
}
const abiertas: Sesion[] = [];
async function sesionMcp(token: string): Promise<Sesion> {
  const res = await app.request(new Request("http://localhost:3000/api/mcp", { headers: { Authorization: `Bearer ${token}` } }));
  expect(res.status).toBe(200);
  const lector = res.body!.getReader();
  let texto = "";
  while (!texto.includes("\n\n")) {
    const { value, done } = await lector.read();
    if (done) break;
    texto += new TextDecoder().decode(value);
  }
  const s = { token, sessionId: texto.match(/sessionId=([a-zA-Z0-9-]+)/)![1]!, cerrar: () => lector.cancel().catch(() => {}) };
  abiertas.push(s);
  return s;
}
let rpcId = 1;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON-RPC leído en la prueba
async function llamar(s: Sesion, name: string, args: unknown): Promise<any> {
  const res = await app.request(
    new Request(`http://localhost:3000/api/mcp?sessionId=${s.sessionId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${s.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method: "tools/call", params: { name, arguments: args } }),
    })
  );
  return res.json();
}
const esError = (r: { result?: { isError?: boolean }; error?: unknown }) => Boolean(r.error) || r.result?.isError === true;
const textoDe = (r: { result?: { content?: { text: string }[] }; error?: { message?: string } }) =>
  r.result?.content?.[0]?.text ?? r.error?.message ?? "";

const slugUnico = (p: string) => `${p}-${generateTestId()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");

describe("Fase F — firmante, MCP endurecido y repeticiones sin cuota", () => {
  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (!dbAvailable) return;
    vaciarMemoriaDeCuotas();
    admin = await entrarComo(app, { email: `firma-admin-${generateTestId()}@example.com`, password: "TestPassword123!", name: "Admin Firma", role: "admin" });
    firmante = await entrarComo(app, { email: `firma-ed-${generateTestId()}@example.com`, password: "TestPassword123!", name: "Firmante", role: "editor" });
    await db.delete(approvalSettings);
    invalidarConfigDeAprobaciones();
  });

  afterAll(async () => {
    for (const s of abiertas) await s.cerrar();
    if (!dbAvailable) return;
    await db.delete(approvalSettings);
    invalidarConfigDeAprobaciones();
    if (datasets.length) await db.delete(dataSets).where(inArray(dataSets.id, datasets));
  });

  // ══ 1. Firmante ══════════════════════════════════════════════════════════

  itConBlog("sin firmante, el blog sigue como antes; con firmante, el agente escribe COMO su firmante", async () => {
    if (!dbAvailable) return;
    const a = await agente(["blog:*"]);
    // Como antes: sin authorId, 400; con uno cualquiera, vale
    expect((await pedir("POST", "/api/blog", { token: a.token, cuerpo: { title: slugUnico("sin") } })).status).toBe(400);
    const libre = await pedir("POST", "/api/blog", { token: a.token, cuerpo: { title: slugUnico("libre"), authorId: admin.userId } });
    expect(libre.status, JSON.stringify(libre.body)).toBe(201);

    // El admin elige al firmante en /api/v1 (lo que hace el panel)
    const puesto = await pedir("PUT", `/api/v1/agents/${a.id}/sponsor`, { cookie: admin.cookie, cuerpo: { userId: firmante.userId } });
    expect(puesto.status, JSON.stringify(puesto.body)).toBe(200);
    expect(puesto.body.sponsor).toMatchObject({ userId: firmante.userId, valid: true, role: "editor" });
    expect(puesto.body.candidates.some((c: { id: string }) => c.id === firmante.userId)).toBe(true);

    const firmado = await pedir("POST", "/api/blog", { token: a.token, cuerpo: { title: slugUnico("firmado") } });
    expect(firmado.status, JSON.stringify(firmado.body)).toBe(201);
    expect(firmado.body.authorId).toBe(firmante.userId);
    const mismo = await pedir("POST", "/api/blog", { token: a.token, cuerpo: { title: slugUnico("mismo"), authorId: firmante.userId } });
    expect(mismo.status).toBe(201);
    const ajeno = await pedir("POST", "/api/blog", { token: a.token, cuerpo: { title: slugUnico("ajeno"), authorId: admin.userId } });
    expect(ajeno.status).toBe(403);
    expect(ajeno.body.code).toBe("KITSUDEN_E_FORBIDDEN");

    // Con `admin`, puede nombrar a otro autor
    const jefe = await agente(["admin"], { sponsorUserId: firmante.userId });
    const otro = await pedir("POST", "/api/blog", { token: jefe.token, cuerpo: { title: slugUnico("jefe"), authorId: admin.userId } });
    expect(otro.status, JSON.stringify(otro.body)).toBe(201);
    expect(otro.body.authorId).toBe(admin.userId);

    // Solo un admin o editor puede ser firmante
    const normal = await entrarComo(app, { email: `firma-u-${generateTestId()}@example.com`, password: "TestPassword123!", name: "Normal" });
    expect((await pedir("PUT", `/api/v1/agents/${a.id}/sponsor`, { cookie: admin.cookie, cuerpo: { userId: normal.userId } })).status).toBe(422);
    // Quitarlo: vuelve lo de antes
    expect((await pedir("PUT", `/api/v1/agents/${a.id}/sponsor`, { cookie: admin.cookie, cuerpo: { userId: null } })).status).toBe(200);
    expect((await pedir("POST", "/api/blog", { token: a.token, cuerpo: { title: slugUnico("otra-vez") } })).status).toBe(400);
  });

  it("las entradas de dataset que crea el agente son del firmante (REST, API lite y MCP); created_by_id es el agente", async () => {
    if (!dbAvailable) return;
    const ds = await dataset("firma-ds", null);
    const a = await agente(["mcp:connect", `datasets:${ds.slug}:write`, `datasets:${ds.slug}:read`], { sponsorUserId: firmante.userId });

    const rest = await pedir("POST", `/api/datasets/${ds.id}/entries`, { token: a.token, cuerpo: { title: "rest", data: { n: "1" } } });
    expect(rest.status, JSON.stringify(rest.body)).toBe(201);
    const lite = await pedir("POST", `/api/data-sets/${ds.id}/entries`, { token: a.token, cuerpo: { title: "lite", n: "2" } });
    expect(lite.status, JSON.stringify(lite.body)).toBe(201);
    const s = await sesionMcp(a.token);
    const mcp = await llamar(s, "kitsuden_insert_record", { datasetId: ds.id, data: { title: "mcp", n: "3" } });
    expect(esError(mcp), textoDe(mcp)).toBe(false);

    const filas = await db.select({ title: dataEntries.title, owner: dataEntries.ownerId, by: dataEntries.createdById }).from(dataEntries).where(eq(dataEntries.dataSetId, ds.id));
    expect(filas.length).toBe(3);
    for (const f of filas) {
      expect(f.owner, f.title).toBe(firmante.userId);
      expect(f.by, f.title).toBe(a.id);
    }

    // Sin firmante: sin dueño, como antes (y un ownerId ajeno de un agente sin admin no cuela)
    const b = await agente(["mcp:connect", `datasets:${ds.slug}:write`]);
    const sb = await sesionMcp(b.token);
    const sinFirma = await llamar(sb, "kitsuden_insert_record", { datasetId: ds.id, data: { title: "sin", ownerId: admin.userId } });
    expect(esError(sinFirma), textoDe(sinFirma)).toBe(false);
    const [fila] = await db.select({ owner: dataEntries.ownerId }).from(dataEntries).where(sql`${dataEntries.dataSetId} = ${ds.id} AND ${dataEntries.title} = 'sin'`);
    expect(fila!.owner).toBeNull();
  });

  itConBlog("si el firmante pierde su rol, el agente no crea contenido firmado hasta que lo reasignen", async () => {
    if (!dbAvailable) return;
    const quien = await entrarComo(app, { email: `firma-baja-${generateTestId()}@example.com`, password: "TestPassword123!", name: "Baja", role: "editor" });
    const ds = await dataset("firma-baja", null);
    const a = await agente(["blog:*", `datasets:${ds.slug}:write`], { sponsorUserId: quien.userId });
    expect((await pedir("POST", "/api/blog", { token: a.token, cuerpo: { title: slugUnico("antes") } })).status).toBe(201);

    await db.update(authUsers).set({ role: "user" }).where(eq(authUsers.id, quien.userId));
    const blog = await pedir("POST", "/api/blog", { token: a.token, cuerpo: { title: slugUnico("despues") } });
    expect(blog.status).toBe(403);
    expect(blog.body.code).toBe("KITSUDEN_E_AGENT_SPONSOR_INVALID");
    const entrada = await pedir("POST", `/api/datasets/${ds.id}/entries`, { token: a.token, cuerpo: { title: "x", data: { n: "1" } } });
    expect(entrada.status).toBe(403);
    expect(entrada.body.code).toBe("KITSUDEN_E_AGENT_SPONSOR_INVALID");
    const vista = await pedir("GET", `/api/v1/agents/${a.id}/sponsor`, { cookie: admin.cookie });
    expect(vista.body.sponsor).toMatchObject({ userId: quien.userId, valid: false, reason: "not_staff" });

    // Reasignado: vuelve a firmar
    await pedir("PUT", `/api/v1/agents/${a.id}/sponsor`, { cookie: admin.cookie, cuerpo: { userId: firmante.userId } });
    expect((await pedir("POST", "/api/blog", { token: a.token, cuerpo: { title: slugUnico("reasignado") } })).status).toBe(201);
  });

  itConBlog("al aprobar una propuesta queda el agente, el firmante y quien aprueba", async () => {
    if (!dbAvailable) return;
    await pedir("PUT", "/api/approvals/settings", { cookie: admin.cookie, cuerpo: { enabled: true } });
    try {
      const a = await agente(["blog:*"], { sponsorUserId: firmante.userId });
      const slug = slugUnico("cat");
      const p = await pedir("POST", "/api/blog/categories", { token: a.token, cuerpo: { name: slug, slug } });
      // Crear una categoría no es sensible: se fuerza para la prueba
      if (p.status !== 202) {
        await pedir("PUT", "/api/approvals/settings", { cookie: admin.cookie, cuerpo: { operations: { "kon:blog:crear-categoria": true } } });
      }
      const r = p.status === 202 ? p : await pedir("POST", "/api/blog/categories", { token: a.token, cuerpo: { name: `${slug}-b`, slug: `${slug}-b` } });
      expect(r.status).toBe(202);
      const pid = r.body.proposal.id;
      const ok = await pedir("POST", `/api/approvals/proposals/${pid}/approve`, { cookie: admin.cookie, cuerpo: {} });
      expect(ok.body.proposal.status).toBe("executed");
      expect(ok.body.proposal.agentId).toBe(a.id);
      expect(ok.body.proposal.sponsorUserId).toBe(firmante.userId);
      expect(ok.body.proposal.decidedBy).toBe(admin.userId);
      const [fila] = await db.select().from(agentProposals).where(eq(agentProposals.id, pid));
      expect(fila!.sponsorUserId).toBe(firmante.userId);
      const audit = await pedir("GET", `/api/approvals/audit?proposalId=${pid}`, { cookie: admin.cookie });
      const aprobada = audit.body.events.find((e: { action: string }) => e.action === "proposal_approved");
      expect(aprobada.details).toMatchObject({ by: admin.userId, sponsor: firmante.userId });
    } finally {
      await pedir("PUT", "/api/approvals/settings", { cookie: admin.cookie, cuerpo: { enabled: false, operations: { "kon:blog:crear-categoria": null } } });
    }
  });

  // ══ 2. MCP endurecido ═══════════════════════════════════════════════════

  it("mcp:read/mcp:write abren la herramienta, no un dataset que su política cierra", async () => {
    if (!dbAvailable) return;
    const cerrado = await dataset("mcp-cerrado", null);
    const abierto = await dataset("mcp-abierto", { readAccess: "authenticated", writeAccess: "authenticated" });
    const soloLectura = await dataset("mcp-lectura", { readAccess: "public", writeAccess: "admin" });
    await db.insert(dataEntries).values([
      { dataSetId: cerrado.id, title: "secreta", data: { n: "1" } },
      { dataSetId: abierto.id, title: "visible", data: { n: "1" } },
    ] as never);

    const a = await agente(["mcp:connect", "mcp:read", "mcp:write"]);
    const s = await sesionMcp(a.token);
    const q1 = await llamar(s, "kitsuden_query_collection", { collection: cerrado.slug });
    expect(esError(q1)).toBe(true);
    expect(textoDe(q1)).not.toContain("secreta");
    expect(esError(await llamar(s, "kitsuden_query_dataset", { datasetId: cerrado.id }))).toBe(true);
    expect(esError(await llamar(s, "kitsuden_describe_collection", { collection: cerrado.slug }))).toBe(true);
    expect(esError(await llamar(s, "kitsuden_insert_record", { datasetId: cerrado.id, data: { title: "no" } }))).toBe(true);
    const lista = textoDe(await llamar(s, "kitsuden_list_datasets", {}));
    expect(lista).not.toContain(cerrado.slug);
    expect(lista).toContain(abierto.slug);
    expect(textoDe(await llamar(s, "kitsuden_query_collection", { collection: abierto.slug }))).toContain("visible");
    expect(esError(await llamar(s, "kitsuden_insert_record", { datasetId: abierto.id, data: { title: "si" } }))).toBe(false);
    // Leer sí, escribir no
    expect(esError(await llamar(s, "kitsuden_query_dataset", { datasetId: soloLectura.id }))).toBe(false);
    expect(esError(await llamar(s, "kitsuden_insert_record", { datasetId: soloLectura.id, data: { title: "no" } }))).toBe(true);

    // El scope por dataset sigue abriendo (fase E); `admin` también
    const fino = await agente(["mcp:connect", `datasets:${cerrado.slug}:read`]);
    const sf = await sesionMcp(fino.token);
    expect(textoDe(await llamar(sf, "kitsuden_query_collection", { collection: cerrado.slug }))).toContain("secreta");
    const jefe = await agente(["mcp:connect", "admin"]);
    const sj = await sesionMcp(jefe.token);
    expect(esError(await llamar(sj, "kitsuden_query_collection", { collection: cerrado.slug }))).toBe(false);
  });

  it("las rlsRules de la política se aplican por MCP como en REST", async () => {
    if (!dbAvailable) return;
    const porDueno = await dataset("mcp-dueno", {
      readAccess: "authenticated",
      writeAccess: "authenticated",
      rlsRules: [{ field: "ownerId", operator: "eq", value: "__USER_ID__" }],
    });
    await db.insert(dataEntries).values({ dataSetId: porDueno.id, title: "de-otro", data: { n: "1", ownerId: admin.userId }, ownerId: admin.userId } as never);
    const a = await agente(["mcp:connect", "mcp:read"]);
    const s = await sesionMcp(a.token);
    const r = await llamar(s, "kitsuden_query_collection", { collection: porDueno.slug });
    expect(esError(r), textoDe(r)).toBe(false);
    expect(textoDe(r)).not.toContain("de-otro");
    const rest = await pedir("GET", `/api/datasets/${porDueno.id}/entries`, { token: a.token });
    expect(JSON.stringify(rest.body)).not.toContain("de-otro");
  });

  it("Inti (solo contenido:editar) no cambia: sin MCP, y su escritura editorial sigue entrando", async () => {
    if (!dbAvailable) return;
    const inti = await agente(["contenido:editar"]);
    const mcp = await app.request(new Request("http://localhost:3000/api/mcp", { headers: { Authorization: `Bearer ${inti.token}` } }));
    expect(mcp.status).toBe(403);
    const pagina = await pedir("POST", "/api/page-builder/pages", { token: inti.token, cuerpo: { title: slugUnico("inti") } });
    expect([401, 403]).not.toContain(pagina.status);
  });

  // ══ 3. Repeticiones sin cuota ═══════════════════════════════════════════

  itConBlog("REST: una repetición de la idempotencia no gasta escrituras del día", async () => {
    if (!dbAvailable) return;
    vaciarMemoriaDeCuotas();
    const a = await agente(["blog:*"], { writesPerDay: 2 });
    const slug = slugUnico("idem");
    const clave = `cuota-${generateTestId()}`;
    const primera = await pedir("POST", "/api/blog/categories", { token: a.token, cuerpo: { name: slug, slug }, cabeceras: { "Idempotency-Key": clave } });
    expect(primera.status).toBe(201);
    for (let i = 0; i < 3; i++) {
      const otra = await pedir("POST", "/api/blog/categories", { token: a.token, cuerpo: { name: slug, slug }, cabeceras: { "Idempotency-Key": clave } });
      expect(otra.status, `repetición ${i}`).toBe(201);
      expect(otra.headers.get("idempotent-replayed")).toBe("true");
    }
    // Solo se gastó UNA escritura: cabe otra, y la tercera no
    const s2 = slugUnico("idem2");
    expect((await pedir("POST", "/api/blog/categories", { token: a.token, cuerpo: { name: s2, slug: s2 } })).status).toBe(201);
    const s3 = slugUnico("idem3");
    const tercera = await pedir("POST", "/api/blog/categories", { token: a.token, cuerpo: { name: s3, slug: s3 } });
    expect(tercera.status).toBe(429);
    expect(tercera.body.code).toBe("KITSUDEN_E_QUOTA_EXCEEDED");
    const uso = await pedir("GET", `/api/v1/agents/${a.id}/quotas`, { cookie: admin.cookie });
    expect(uso.body.usage.escriturasHoy).toBe(2);
  });

  itConBlog("MCP: una repetición con la misma idempotency_key no gasta", async () => {
    if (!dbAvailable) return;
    vaciarMemoriaDeCuotas();
    const a = await agente(["mcp:connect", "blog:*"], { writesPerDay: 1 });
    const s = await sesionMcp(a.token);
    const slug = slugUnico("mcp-idem");
    const args = { body: { name: slug, slug }, idempotency_key: `mcp-${generateTestId()}` };
    const r1 = await llamar(s, "blog__crear-categoria", args);
    expect(esError(r1), textoDe(r1)).toBe(false);
    const r2 = await llamar(s, "blog__crear-categoria", args);
    expect(esError(r2), textoDe(r2)).toBe(false);
    expect(r2.result.structuredContent.idempotentReplayed).toBe(true);
    // La cuota (1 al día) la gastó solo la primera: otra distinta ya no cabe
    const s3 = slugUnico("mcp-otra");
    const r3 = await llamar(s, "blog__crear-categoria", { body: { name: s3, slug: s3 } });
    expect(textoDe(r3)).toContain("KITSUDEN_E_QUOTA_EXCEEDED");
  });
});
