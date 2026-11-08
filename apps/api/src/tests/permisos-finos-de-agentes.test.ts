/**
 * Fase E: permisos amplios + finos + denegaciones, claves y cuotas por agente
 * ============================================================================
 *
 * Contra la app REAL (Postgres de pruebas, kons cargados) y agentes reales:
 *
 *   · las puertas por prefijo aceptan el scope fino de la operación, y SOLO de
 *     esa (`kon:blog:crear-entrada` abre `POST /api/blog`, no `PATCH`);
 *   · la unión: un fino no quita a un amplio;
 *   · la denegación gana (a `admin` también), en operaciones del SDK y en las
 *     rutas legadas de un kon denegado entero;
 *   · scopes por dataset en REST (kon-datasets y /api/data-sets), en las
 *     herramientas MCP del núcleo y en las generadas;
 *   · claves: crear, rotar sin corte, revocar al instante, caducar, último uso;
 *   · cuotas: por minuto (KITSUDEN_E_RATE_LIMITED), escrituras y presupuesto
 *     del día (KITSUDEN_E_QUOTA_EXCEEDED) con `retry_after`.
 */

import { patronCubre } from "@kitsuden/shared";
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { eq, sql } from "drizzle-orm";

import { db } from "../db";
import { agentApiKeys, agentIdentities, authUsers, dataSets, dataEntries } from "../db/schema";
import { app } from "../index";
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

async function agente(
  scopes: string[],
  extra: { rateLimit?: number } = {}
): Promise<{ id: string; token: string }> {
  const { agent, plainApiKey } = await createAgent({
    name: `fino-${scopes.join("+").slice(0, 60)}-${generateTestId()}`,
    scopes,
    rateLimit: extra.rateLimit ?? 100_000,
  });
  return { id: agent.id, token: plainApiKey };
}

/**
 * La administración de agentes (claves, scopes, cuotas) es solo de PERSONAS
 * (auditoría 2026-11-04, F5): un agente con `admin` recibe 403 al escribir en ella. Las
 * pruebas que la ejercitan entran con la cookie de un admin humano.
 */
let cookieAdmin = "";
let idAdmin = "";
async function adminHumano(): Promise<{ id: string; token: { cookie: string } }> {
  if (!cookieAdmin) {
    ({ cookie: cookieAdmin, userId: idAdmin } = await entrarComo(app, {
      email: `fino-admin-${generateTestId()}@example.com`,
      password: "TestPassword123!",
      name: "Admin humano",
      role: "admin",
    }));
  }
  return { id: idAdmin, token: { cookie: cookieAdmin } };
}

async function pedir(
  token: string | { cookie: string } | null,
  metodo: string,
  camino: string,
  cuerpo?: unknown
): Promise<Response> {
  const headers: Record<string, string> = { origin: ORIGEN };
  if (typeof token === "string") headers.Authorization = `Bearer ${token}`;
  else if (token) headers.Cookie = token.cookie;
  if (cuerpo !== undefined) headers["Content-Type"] = "application/json";
  return app.request(
    new Request(`http://localhost:3000${camino}`, {
      method: metodo,
      headers,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    })
  );
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
const esError = (r: { result?: { isError?: boolean }; error?: unknown }) =>
  Boolean(r.error) || r.result?.isError === true;
const textoDe = (r: { result?: { content?: { text: string }[] }; error?: { message?: string } }) =>
  r.result?.content?.[0]?.text ?? r.error?.message ?? "";

// ── Datasets de prueba ──
let privado: { id: string; slug: string };
/** Una cuenta humana: un agente escribe entradas del blog EN SU NOMBRE (authorId). */
let autorId = "";
let otro: { id: string; slug: string };
/** Fase F: abierto a cualquier sesión (leer y escribir): el que un scope amplio de MCP sí alcanza. */
let abierto: { id: string; slug: string };

async function crearDataset(prefijo: string, policyJson: unknown = null) {
  const slug = `${prefijo}-${generateTestId()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  // policyJson null = solo admin: ni el anónimo ni una cuenta lo ven.
  const [ds] = await db
    .insert(dataSets)
    .values({ name: slug, slug, schema: [{ key: "n", type: "text" }], policyJson } as never)
    .returning({ id: dataSets.id, slug: dataSets.slug });
  await db.insert(dataEntries).values({ dataSetId: ds!.id, title: "fila", data: { n: "1" } } as never);
  return ds!;
}

describe("Fase E — permisos finos de agentes", () => {
  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (!dbAvailable) return;
    autorId = `autor-${generateTestId()}`;
    await db.insert(authUsers).values({ id: autorId, name: "Autora", email: `${autorId}@example.test` } as never);
    privado = await crearDataset("fino-priv");
    otro = await crearDataset("fino-otro");
    abierto = await crearDataset("fino-abierto", { readAccess: "authenticated", writeAccess: "authenticated" });
  });
  afterAll(async () => {
    for (const s of abiertas) await s.cerrar();
    if (dbAvailable) {
      for (const ds of [privado, otro, abierto]) if (ds) await db.delete(dataSets).where(eq(dataSets.id, ds.id));
      // Las entradas del blog de la autora se quedan (author_id SET NULL no
      // aplica: es NOT NULL); la cuenta de prueba también. Base de pruebas.
    }
  });

  // ── 1. Puertas por prefijo con permisos finos ──
  itConBlog("kon:blog:crear-entrada abre POST /api/blog y nada más del blog", async () => {
    if (!dbAvailable) return;
    const a = await agente(["kon:blog:crear-entrada"]);
    // Sin authorId: un agente no es una cuenta y la entrada necesita autor
    const sinAutor = await pedir(a.token, "POST", "/api/blog", { title: `Sin ${generateTestId()}` });
    expect(sinAutor.status).toBe(400);
    expect(await sinAutor.text()).toContain("authorId");
    const crear = await pedir(a.token, "POST", "/api/blog", { title: `Fino ${generateTestId()}`, authorId: autorId });
    expect(crear.status, await crear.clone().text()).toBe(201);
    const { id } = (await crear.json()) as { id: string };

    expect((await pedir(a.token, "PATCH", `/api/blog/${id}`, { title: "x" })).status).toBe(403);
    expect((await pedir(a.token, "DELETE", `/api/blog/${id}`)).status).toBe(403);
    expect((await pedir(a.token, "POST", "/api/page-builder/pages", { title: "p" })).status).toBe(403);

    const sin = await agente(["mcp:connect"]);
    expect((await pedir(sin.token, "POST", "/api/blog", { title: "no" })).status).toBe(403);
  });

  itConBlog("unión: un fino no quita nada a un amplio", async () => {
    if (!dbAvailable) return;
    const a = await agente(["contenido:editar", "kon:blog:crear-entrada"]);
    const slug = `u-${generateTestId()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    expect((await pedir(a.token, "POST", "/api/page-builder/pages", { title: "U", slug })).status).toBe(201);
    expect(
      (await pedir(a.token, "POST", "/api/blog", { title: `U ${generateTestId()}`, authorId: autorId })).status
    ).toBe(201);
  });

  // ── 2. Denegaciones ──
  it("la denegación gana al amplio: contenido:editar − crear-pagina", async () => {
    if (!dbAvailable) return;
    const a = await agente(["contenido:editar", "!kon:blocks:crear-pagina"]);
    const res = await pedir(a.token, "POST", "/api/page-builder/pages", { title: "D", slug: `d-${Date.now()}` });
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("!kon:blocks:crear-pagina");
    // El resto del amplio sigue: crear una plantilla
    const t = await pedir(a.token, "POST", "/api/page-builder/templates", { name: `T ${generateTestId()}`, blocks: [] });
    expect([200, 201, 400, 422]).toContain(t.status);
  });

  itConBlog("la denegación gana a admin, también en lo público y en rutas legadas", async () => {
    if (!dbAvailable) return;
    const a = await agente(["admin", "!kon:blog:*", "!crm:*"]);
    expect((await pedir(a.token, "POST", "/api/blog", { title: "no" })).status).toBe(403);
    // Pública para cualquiera… menos para ESTA clave
    expect((await pedir(a.token, "GET", "/api/blog")).status).toBe(403);
    expect((await pedir(null, "GET", "/api/blog")).status).toBe(200);
    // El resto de admin sigue
    expect((await pedir(a.token, "GET", "/api/page-builder/pages")).status).toBe(200);
    // Ruta legada de un kon denegado entero (si el CRM está montado)
    const crm = await pedir(a.token, "GET", "/api/crm/contacts");
    if (crm.status !== 404) expect(crm.status).toBe(403);
  });

  // ── 3. Datasets ──
  it("REST: datasets:<slug>:read abre ESE dataset (y solo para leer)", async () => {
    if (!dbAvailable) return;
    const lector = await agente([`datasets:${privado.slug}:read`]);
    const r = await pedir(lector.token, "GET", `/api/datasets/${privado.id}/entries`);
    expect(r.status, await r.clone().text()).toBe(200);
    expect(((await r.json()) as { docs: unknown[] }).docs.length).toBe(1);
    // La API lite también
    expect((await pedir(lector.token, "GET", `/api/data-sets/${privado.id}/entries`)).status).toBe(200);
    // Otro dataset: no lo ve (404, no se confirma que exista)
    expect((await pedir(lector.token, "GET", `/api/datasets/${otro.id}/entries`)).status).toBe(404);
    // Escribir: no
    const w = await pedir(lector.token, "POST", `/api/datasets/${privado.id}/entries`, { title: "x", data: { n: "2" } });
    expect([401, 403]).toContain(w.status);
    // Sin scope: no lo ve
    const nadie = await agente(["mcp:connect"]);
    // 403 desde 2026-10-25: una clave sin ningún scope de la familia no actúa
    // como usuario (middleware/agente-como-usuario.ts). Llega igual para
    // cualquier id, así que tampoco dice si el dataset existe.
    expect([403, 404]).toContain((await pedir(nadie.token, "GET", `/api/datasets/${privado.id}/entries`)).status);
  });

  it("REST: datasets:<slug>:write escribe; la denegación cierra aunque haya comodín", async () => {
    if (!dbAvailable) return;
    const escritor = await agente([`datasets:${privado.slug}:write`]);
    const w = await pedir(escritor.token, "POST", `/api/datasets/${privado.id}/entries`, {
      title: "nueva",
      data: { n: "3" },
    });
    expect(w.status, await w.clone().text()).toBe(201);

    const vetado = await agente(["datasets:*:read", `!datasets:${privado.slug}:*`]);
    expect((await pedir(vetado.token, "GET", `/api/datasets/${privado.id}/entries`)).status).toBe(404);
    expect((await pedir(vetado.token, "GET", `/api/datasets/${otro.id}/entries`)).status).toBe(200);
  });

  it("MCP del núcleo: query/insert/delete respetan el scope por dataset y la denegación", async () => {
    if (!dbAvailable) return;
    const a = await agente(["mcp:connect", `datasets:${privado.slug}:read`]);
    const s = await sesionMcp(a.token);
    const q = await llamar(s, "kitsuden_query_collection", { collection: privado.slug });
    expect(esError(q), textoDe(q)).toBe(false);
    expect(textoDe(q)).toContain("fila");
    const q2 = await llamar(s, "kitsuden_query_collection", { collection: otro.slug });
    expect(esError(q2)).toBe(true);
    const ins = await llamar(s, "kitsuden_insert_record", { datasetId: privado.id, data: { title: "no" } });
    expect(esError(ins)).toBe(true);
    const lista = await llamar(s, "kitsuden_list_datasets", {});
    expect(textoDe(lista)).toContain(privado.slug);
    expect(textoDe(lista)).not.toContain(otro.slug);

    // amplio mcp:read/mcp:write − denegado en un dataset
    const b = await agente(["mcp:connect", "mcp:read", "mcp:write", `!datasets:${privado.slug}:*`]);
    const sb = await sesionMcp(b.token);
    expect(esError(await llamar(sb, "kitsuden_query_collection", { collection: privado.slug }))).toBe(true);
    // Fase F: el amplio abre la herramienta, no un dataset que su política cierra
    // (`otro`: sin política = solo admin); sí uno abierto a cualquier sesión.
    expect(esError(await llamar(sb, "kitsuden_query_collection", { collection: otro.slug }))).toBe(true);
    expect(esError(await llamar(sb, "kitsuden_query_collection", { collection: abierto.slug }))).toBe(false);
    expect(esError(await llamar(sb, "kitsuden_insert_record", { datasetId: privado.id, data: { title: "no" } }))).toBe(true);
    expect(textoDe(await llamar(sb, "kitsuden_list_datasets", {}))).not.toContain(privado.slug);

    // borrar con delete y sin
    const [fila] = await db.select({ id: dataEntries.id }).from(dataEntries).where(eq(dataEntries.dataSetId, otro.id)).limit(1);
    const c = await agente(["mcp:connect", `datasets:${otro.slug}:write`]);
    const sc = await sesionMcp(c.token);
    expect(esError(await llamar(sc, "kitsuden_delete_record", { collection: otro.slug, id: fila!.id }))).toBe(true);
    const d = await agente(["mcp:connect", `datasets:${otro.slug}:delete`]);
    const sd = await sesionMcp(d.token);
    const borrado = await llamar(sd, "kitsuden_delete_record", { collection: otro.slug, id: fila!.id });
    expect(esError(borrado), textoDe(borrado)).toBe(false);
  });

  it("MCP generado: datasets__listar-entradas hereda el scope por dataset", async () => {
    if (!dbAvailable) return;
    const a = await agente(["mcp:connect", `datasets:${privado.slug}:read`]);
    const s = await sesionMcp(a.token);
    const r = await llamar(s, "datasets__listar-entradas", { id: privado.id });
    expect(esError(r), textoDe(r)).toBe(false);
    expect(r.result.structuredContent.status).toBe(200);
  });

  itConBlog("RLS: la regla en SQL (kitsuden_patron_cubre) es la misma que la de shared", async () => {
    if (!dbAvailable) return;
    const casos: [string, string][] = [
      ["crm:*", "crm:a"], ["crm:*", "crm:a:b"], ["crm:*", "crmx:a"], ["crm:*", "crm"],
      ["*:read", "x:read"], ["*:read", "datasets:c:read"], ["*:read", "x:write"],
      ["datasets:*:read", "datasets:c:read"], ["datasets:*:read", "datasets:c:write"],
      ["datasets:*:read", "datasets:a:b:read"], ["kon:*", "kon:blog:x"], ["*:*", "a:b"],
      ["*", "a:b"], ["esports", "esports:manage"], ["a:b", "a:b"], ["datasets:*", "datasets:x:read"],
    ];
    for (const [patron, req] of casos) {
      const filas = (await db.execute(sql`SELECT kitsuden_patron_cubre(${patron}, ${req}) AS r`)) as unknown as {
        rows: { r: boolean }[];
      };
      expect(filas.rows[0]!.r, `${patron} → ${req}`).toBe(patronCubre(patron, req));
    }
  });

  // ── 4. Claves ──
  itConBlog("claves: rotar sin corte, revocar al instante, caducar y último uso", async () => {
    if (!dbAvailable) return;
    const admin = await adminHumano();
    const objetivo = await agente(["mcp:connect"]);
    // Un agente `admin` no se acuña claves (ni para otro): F5
    const agenteAdmin = await agente(["admin"]);
    expect((await pedir(agenteAdmin.token, "POST", `/api/v1/agents/${objetivo.id}/keys`, {})).status).toBe(403);

    const nueva = await pedir(admin.token, "POST", `/api/v1/agents/${objetivo.id}/keys`, {
      name: "ci",
      expiresInDays: 30,
    });
    expect(nueva.status).toBe(201);
    const { apiKey: k1, key } = (await nueva.json()) as { apiKey: string; key: { id: string; expiresAt: string } };
    expect(new Date(key.expiresAt).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    expect((await pedir(k1, "GET", "/api/blog")).status).toBe(200);

    // Rotar con 1 h de gracia: las DOS valen
    const rot = await pedir(admin.token, "POST", `/api/v1/agents/${objetivo.id}/keys/${key.id}/rotate`, { graceHours: 1 });
    expect(rot.status).toBe(201);
    const { apiKey: k2, key: k2fila, previous } = (await rot.json()) as {
      apiKey: string;
      key: { id: string; rotatedFrom: string };
      previous: { expiresAt: string };
    };
    expect(k2fila.rotatedFrom).toBe(key.id);
    expect(new Date(previous.expiresAt).getTime()).toBeLessThan(Date.now() + 2 * 3_600_000);
    expect((await pedir(k1, "GET", "/api/blog")).status).toBe(200);
    expect((await pedir(k2, "GET", "/api/blog")).status).toBe(200);

    // Revocar k2: la siguiente petición ya no vale
    const rev = await pedir(admin.token, "POST", `/api/v1/agents/${objetivo.id}/keys/${k2fila.id}/revoke`, {});
    expect(rev.status).toBe(200);
    expect((await pedir(k2, "GET", "/api/blog")).status).toBe(401);
    // Rotar con gracia 0: la vieja muere ya
    const rot0 = await pedir(admin.token, "POST", `/api/v1/agents/${objetivo.id}/keys/${key.id}/rotate`, { graceHours: 0 });
    expect(rot0.status).toBe(201);
    const { apiKey: k3 } = (await rot0.json()) as { apiKey: string };
    expect((await pedir(k1, "GET", "/api/blog")).status).toBe(401);
    expect((await pedir(k3, "GET", "/api/blog")).status).toBe(200);
    // Rotar una revocada: 409
    expect(
      (await pedir(admin.token, "POST", `/api/v1/agents/${objetivo.id}/keys/${k2fila.id}/rotate`, {})).status
    ).toBe(409);

    // Último uso y la lista (sin secretos)
    await new Promise((r) => setTimeout(r, 200));
    const lista = (await (await pedir(admin.token, "GET", `/api/v1/agents/${objetivo.id}/keys`)).json()) as {
      keys: { id: string; status: string; lastUsedAt: string | null }[];
    };
    const estados = Object.fromEntries(lista.keys.map((k) => [k.id, k.status]));
    expect(estados[k2fila.id]).toBe("revoked");
    expect(estados[key.id]).toBe("expired");
    expect(lista.keys.some((k) => k.lastUsedAt)).toBe(true);
    expect(JSON.stringify(lista)).not.toContain(k3);

    // La fila revocada sigue en la base (auditoría), con quién
    const [fila] = await db.select().from(agentApiKeys).where(eq(agentApiKeys.id, k2fila.id));
    expect(fila!.revokedAt).not.toBeNull();
    expect(fila!.revokedBy).toBe(admin.id);
  });

  // ── 5. Scopes por el panel ──
  itConBlog("PUT scopes valida, y /access fusiona lo que puede hacer", async () => {
    if (!dbAvailable) return;
    const admin = await adminHumano();
    const obj = await agente([]);
    // Un agente `admin` con denegaciones no las borra reescribiendo sus scopes: F5
    const recortado = await agente(["admin", `!datasets:${privado.slug}:*`]);
    expect(
      (await pedir(recortado.token, "PUT", `/api/v1/agents/${recortado.id}/scopes`, { scopes: ["admin"] })).status
    ).toBe(403);
    // Ningún scope fino abre la administración de agentes: no se registra entre
    // las operaciones montadas (un agente no puede darse permisos a sí mismo).
    const listo = await agente(["kon:*", "agentes:*", "kon:agentes:*"]);
    expect((await pedir(listo.token, "GET", "/api/v1/agent-access/catalog")).status).toBe(403);
    expect(
      (await pedir(listo.token, "PUT", `/api/v1/agents/${listo.id}/scopes`, { scopes: ["admin"] })).status
    ).toBe(403);
    const mal = await pedir(admin.token, "PUT", `/api/v1/agents/${obj.id}/scopes`, { scopes: ["!admin"] });
    expect(mal.status).toBe(422);
    const bien = await pedir(admin.token, "PUT", `/api/v1/agents/${obj.id}/scopes`, {
      scopes: ["contenido:editar", "!kon:blocks:borrar-pagina", `datasets:${privado.slug}:read`],
    });
    expect(bien.status).toBe(200);
    const acc = (await bien.json()) as {
      operations: { scope: string; state: string; by: string | null }[];
      datasets: { slug: string; read: { state: string } }[];
      denies: string[];
    };
    const de = (s: string) => acc.operations.find((o) => o.scope === s);
    expect(de("kon:blocks:borrar-pagina")?.state).toBe("denied");
    expect(de("kon:blocks:crear-pagina")?.state).toBe("policy"); // contenido:editar vía la política del kon
    expect(acc.datasets.find((d) => d.slug === privado.slug)?.read.state).toBe("granted");
    expect(acc.denies).toEqual(["!kon:blocks:borrar-pagina"]);

    const cat = (await (await pedir(admin.token, "GET", "/api/v1/agent-access/catalog")).json()) as {
      presets: { id: string }[];
      broad: { scope: string; operations: string[] }[];
      kons: { kon: string; operations: { scope: string }[] }[];
    };
    expect(cat.presets.map((p) => p.id)).toContain("read-only");
    expect(cat.broad.find((b) => b.scope === "blog:*")?.operations).toContain("kon:blog:crear-entrada");
    expect(cat.kons.find((k) => k.kon === "blog")?.operations.length).toBeGreaterThan(10);
  });

  // ── 6. Cuotas ──
  itConBlog("cuotas: minuto → RATE_LIMITED; escrituras y presupuesto → QUOTA_EXCEEDED con retry_after", async () => {
    if (!dbAvailable) return;
    vaciarMemoriaDeCuotas();
    const admin = await adminHumano();

    const lento = await agente(["mcp:connect"], { rateLimit: 3 });
    for (let i = 0; i < 3; i++) expect((await pedir(lento.token, "GET", "/api/blog")).status).toBe(200);
    const r429 = await pedir(lento.token, "GET", "/api/blog");
    expect(r429.status).toBe(429);
    const p = (await r429.json()) as { code: string; retry_after: number; quota: string };
    expect(p.code).toBe("KITSUDEN_E_RATE_LIMITED");
    expect(p.retry_after).toBeGreaterThan(0);
    expect(p.retry_after).toBeLessThanOrEqual(60);
    expect(r429.headers.get("retry-after")).toBe(String(p.retry_after));

    const escritor = await agente(["kon:blog:crear-entrada"]);
    const put = await pedir(admin.token, "PUT", `/api/v1/agents/${escritor.id}/quotas`, { writesPerDay: 2 });
    expect(put.status).toBe(200);
    for (let i = 0; i < 2; i++) {
      expect(
        (await pedir(escritor.token, "POST", "/api/blog", { title: `Q ${generateTestId()}`, authorId: autorId }))
          .status
      ).toBe(201);
    }
    const q = await pedir(escritor.token, "POST", "/api/blog", { title: "tercera", authorId: autorId });
    expect(q.status).toBe(429);
    const pq = (await q.json()) as { code: string; retry_after: number; quota: string; limit: number };
    expect(pq.code).toBe("KITSUDEN_E_QUOTA_EXCEEDED");
    expect(pq.quota).toBe("writes_per_day");
    expect(pq.limit).toBe(2);
    expect(pq.retry_after).toBeGreaterThan(0);
    expect(pq.retry_after).toBeLessThanOrEqual(86_400);
    // Leer no es escribir
    expect((await pedir(escritor.token, "GET", "/api/blog")).status).toBe(200);

    const presupuesto = await agente(["mcp:connect"]);
    await pedir(admin.token, "PUT", `/api/v1/agents/${presupuesto.id}/quotas`, { budgetUnitsPerDay: 2 });
    expect((await pedir(presupuesto.token, "GET", "/api/blog")).status).toBe(200);
    expect((await pedir(presupuesto.token, "GET", "/api/blog")).status).toBe(200);
    const b = await pedir(presupuesto.token, "GET", "/api/blog");
    expect(b.status).toBe(429);
    expect(((await b.json()) as { quota: string }).quota).toBe("budget_units_per_day");

    // El panel ve el consumo
    const uso = (await (await pedir(admin.token, "GET", `/api/v1/agents/${escritor.id}/quotas`)).json()) as {
      limits: { writesPerDay: number };
      usage: { escriturasHoy: number; almacen: string };
    };
    expect(uso.limits.writesPerDay).toBe(2);
    expect(uso.usage.escriturasHoy).toBe(2);
    expect(["valkey", "postgres"]).toContain(uso.usage.almacen);

    // Y por MCP: la herramienta paga su escritura
    const m = await agente(["mcp:connect", "mcp:write", "mcp:read"]);
    await pedir(admin.token, "PUT", `/api/v1/agents/${m.id}/quotas`, { writesPerDay: 1 });
    const sm = await sesionMcp(m.token);
    expect(esError(await llamar(sm, "kitsuden_insert_record", { datasetId: abierto.id, data: { title: "1" } }))).toBe(false);
    const segunda = await llamar(sm, "kitsuden_insert_record", { datasetId: abierto.id, data: { title: "2" } });
    expect(esError(segunda)).toBe(true);
    expect(textoDe(segunda)).toContain("KITSUDEN_E_QUOTA_EXCEEDED");
    // Leer por MCP sigue (no es escritura)
    expect(esError(await llamar(sm, "kitsuden_query_collection", { collection: abierto.slug }))).toBe(false);

    await db.delete(agentIdentities).where(eq(agentIdentities.id, m.id));
  });
});
