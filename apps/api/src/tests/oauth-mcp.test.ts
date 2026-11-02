/**
 * OAuth 2.1 para MCP (MCP Authorization 2026-07-28) — contra la app y Postgres reales
 * ============================================================================
 *
 * El flujo entero: descubrimiento → registro (DCR y CIMD) → autorización con
 * PKCE → consentimiento en el panel → token → `tools/list` y `tools/call` →
 * rotación del refresco → revocación. Y lo que tiene que fallar: PKCE
 * equivocado, redirección que no casa, audiencia ajena, refresco reusado (la
 * familia entera cae), escaladas de scope, token caducado, y un token del
 * agente A que no ve lo del agente B (RLS). Ver docs/agents/oauth.md.
 */

import { createHash, randomBytes } from "crypto";

import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "../db";
import { agentApiKeys, agentAuditLogs, agentIdentities, brainNotes } from "../db/schema";
import { oauthClients, oauthGrants, oauthTokens } from "../db/schema-oauth";
import { app } from "../index";
import { direccionNoPublica, fijarBuscadorDeMetadatos, leerDocumentoDeCliente } from "../lib/oauth/cimd";
import { barrerOAuth } from "../lib/oauth/servicio";
import { contextoDeAgenteParaAprobacion, createAgent } from "../services/agent-auth";

import { asegurarRolDeApp, entrarComo, generateTestId, isDatabaseAvailable } from "./setup";

// Cada prueba recorre el flujo entero (varias peticiones y sesiones SSE): con
// la máquina cargada, los 5 s por defecto se quedan cortos.
setDefaultTimeout(30_000);

process.env.OAUTH_REGISTER_LIMIT = "100000";
process.env.OAUTH_TOKEN_LIMIT = "100000";

const BASE = "http://localhost:3000";
const ISSUER = (process.env.OAUTH_ISSUER_URL || process.env.BETTER_AUTH_URL || BASE).replace(/\/+$/, "");
const RECURSO = `${ISSUER}/api/mcp`;
const PANEL = process.env.ADMIN_URL || "http://localhost:5173";
const REDIRECCION = "http://127.0.0.1/callback";

let dbAvailable = false;
let admin = { cookie: "", userId: "" };
let editor = { cookie: "", userId: "" };

type Lector = { cancel(): Promise<void> };
const lectores: Lector[] = [];
const notas: string[] = [];
const agentes: string[] = [];

// Una IP pública de documentación (RFC 5737) por ejecución: los límites por IP
// de esta suite no se suman a los del resto de ficheros (todos «unknown»).
const IP = `198.51.100.${1 + Math.floor(Math.random() * 250)}`;
const pedir = (ruta: string, init: RequestInit = {}) =>
  app.request(new Request(`${BASE}${ruta}`, init), undefined, { ip: { address: IP, family: "IPv4", port: 0 } });

function pkce() {
  const verificador = randomBytes(32).toString("base64url");
  return { verificador, reto: createHash("sha256").update(verificador).digest("base64url") };
}

async function registrar(redirect = REDIRECCION, extra: Record<string, unknown> = {}): Promise<string> {
  const res = await pedir("/api/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: `Cliente de prueba ${generateTestId()}`,
      redirect_uris: [redirect],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      ...extra,
    }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { client_id: string }).client_id;
}

function urlDeAutorizacion(clientId: string, reto: string, extra: Record<string, string> = {}) {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECCION,
    code_challenge: reto,
    code_challenge_method: "S256",
    state: "estado-123",
    scope: "mcp:connect mcp:read mcp:write",
    resource: RECURSO,
    ...extra,
  });
  return `/api/oauth/authorize?${q}`;
}

/** GET /authorize → el id de la petición que espera en el panel. */
async function autorizar(clientId: string, reto: string, extra: Record<string, string> = {}): Promise<string> {
  const res = await pedir(urlDeAutorizacion(clientId, reto, extra));
  expect(res.status).toBe(302);
  const destino = new URL(res.headers.get("location")!);
  expect(`${destino.origin}${destino.pathname}`).toBe(`${PANEL.replace(/\/+$/, "")}/oauth/consent`);
  return destino.searchParams.get("request")!;
}

async function consentir(cookie: string, idPeticion: string, cuerpo: Record<string, unknown>) {
  const res = await pedir(`/api/oauth/consent/${idPeticion}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: PANEL },
    body: JSON.stringify(cuerpo),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/** Consentir y sacar el código de la redirección. */
async function codigoDe(cookie: string, idPeticion: string, cuerpo: Record<string, unknown>) {
  const r = await consentir(cookie, idPeticion, { decision: "approve", ...cuerpo });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  const vuelta = new URL(r.body.redirectTo as string);
  expect(vuelta.searchParams.get("state")).toBe("estado-123");
  expect(vuelta.searchParams.get("iss")).toBe(ISSUER);
  return vuelta.searchParams.get("code")!;
}

async function token(params: Record<string, string>) {
  const res = await pedir("/api/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  return { status: res.status, body: (await res.json()) as Record<string, string>, headers: res.headers };
}

/** El flujo entero para un agente: devuelve los tokens. */
async function conectar(agentId: string, scopes: string[], cookie = admin.cookie) {
  const clientId = await registrar();
  const { verificador, reto } = pkce();
  const id = await autorizar(clientId, reto);
  const code = await codigoDe(cookie, id, { agentId, scopes });
  const t = await token({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECCION,
    code_verifier: verificador,
    client_id: clientId,
    resource: RECURSO,
  });
  expect(t.status, JSON.stringify(t.body)).toBe(200);
  return { clientId, ...(t.body as { access_token: string; refresh_token: string; scope: string }) };
}

async function agente(scopes: string[]): Promise<string> {
  const { agent } = await createAgent({ name: `oauth-${generateTestId()}`, scopes, rateLimit: 100_000 });
  agentes.push(agent.id);
  return agent.id;
}

async function abrirSesion(bearer: string): Promise<{ status: number; sessionId?: string; headers: Headers }> {
  const res = await pedir("/api/mcp", { headers: { Authorization: `Bearer ${bearer}` } });
  if (res.status !== 200) return { status: res.status, headers: res.headers };
  const lector = res.body!.getReader();
  lectores.push(lector);
  let texto = "";
  while (!texto.includes("\n\n")) {
    const { value, done } = await lector.read();
    if (done) break;
    texto += new TextDecoder().decode(value);
  }
  return { status: 200, sessionId: texto.match(/sessionId=([a-zA-Z0-9-]+)/)![1]!, headers: res.headers };
}

let idRpc = 1;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- respuesta JSON-RPC
async function rpc(sesion: string, bearer: string, method: string, params: unknown = {}): Promise<{ status: number; body: any }> {
  const res = await pedir(`/api/mcp?sessionId=${sesion}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: idRpc++, method, params }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

beforeAll(async () => {
  dbAvailable = await isDatabaseAvailable();
  if (dbAvailable) await asegurarRolDeApp();
  if (!dbAvailable) return;
  admin = await entrarComo(app, {
    email: `oauth-admin-${generateTestId()}@example.com`,
    password: "TestPassword123!",
    name: "OAuth Admin",
    role: "admin",
  });
  editor = await entrarComo(app, {
    email: `oauth-editor-${generateTestId()}@example.com`,
    password: "TestPassword123!",
    name: "OAuth Editor",
    role: "editor",
  });
});

afterAll(async () => {
  for (const l of lectores) await l.cancel().catch(() => {});
  fijarBuscadorDeMetadatos(null);
  if (!dbAvailable) return;
  if (notas.length) await db.delete(brainNotes).where(inArray(brainNotes.id, notas));
  if (agentes.length) await db.delete(agentIdentities).where(inArray(agentIdentities.id, agentes));
});

describe("OAuth para MCP: descubrimiento", () => {
  it("401 en /api/mcp con WWW-Authenticate → metadatos del recurso → del servidor", async () => {
    if (!dbAvailable) return;
    const sin = await pedir("/api/mcp");
    expect(sin.status).toBe(401);
    const desafio = sin.headers.get("www-authenticate") ?? "";
    expect(desafio).toContain(`resource_metadata="${ISSUER}/.well-known/oauth-protected-resource/api/mcp"`);
    expect(desafio).toContain('scope="mcp:connect mcp:read mcp:write"');
    expect(desafio).not.toContain("invalid_token");

    for (const ruta of ["/.well-known/oauth-protected-resource/api/mcp", "/.well-known/oauth-protected-resource"]) {
      const prm = await pedir(ruta);
      expect(prm.status).toBe(200);
      const m = (await prm.json()) as Record<string, unknown>;
      expect(m.resource).toBe(RECURSO);
      expect(m.authorization_servers).toEqual([ISSUER]);
      expect(m.scopes_supported).toEqual(["mcp:connect", "mcp:read", "mcp:write"]);
    }
    const as = await pedir("/.well-known/oauth-authorization-server");
    expect(as.status).toBe(200);
    expect(as.headers.get("access-control-allow-origin")).toBe("*");
    const m = (await as.json()) as Record<string, unknown>;
    expect(m.issuer).toBe(ISSUER);
    expect(m.code_challenge_methods_supported).toEqual(["S256"]);
    expect(m.grant_types_supported).toEqual(["authorization_code", "refresh_token"]);
    expect(m.response_types_supported).toEqual(["code"]);
    expect(m.client_id_metadata_document_supported).toBe(true);
    expect(m.authorization_response_iss_parameter_supported).toBe(true);
    expect(m.registration_endpoint).toBe(`${ISSUER}/api/oauth/register`);
    expect(m.revocation_endpoint).toBe(`${ISSUER}/api/oauth/revoke`);
  });

  it("un token de basura en /api/mcp: 401 con error=invalid_token", async () => {
    if (!dbAvailable) return;
    const r = await pedir("/api/mcp", { headers: { Authorization: "Bearer kitsuden_oat_noexiste" } });
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });
});

describe("OAuth para MCP: el flujo entero", () => {
  it("DCR → PKCE → consentimiento → token → tools/list + tools/call → rotación → revocación", async () => {
    if (!dbAvailable) return;
    const agentId = await agente(["mcp:connect", "mcp:read", "brain:read", "brain:write"]);

    // La pantalla ve al cliente, la redirección y al agente
    const clientId = await registrar();
    const { verificador, reto } = pkce();
    const id = await autorizar(clientId, reto);
    const vista = await pedir(`/api/oauth/consent/${id}`, { headers: { Cookie: admin.cookie } });
    expect(vista.status).toBe(200);
    const v = (await vista.json()) as { client: { id: string; redirectHost: string; localhostRedirect: boolean }; agents: { id: string; grantable: string[] }[] };
    expect(v.client.id).toBe(clientId);
    expect(v.client.redirectHost).toBe("127.0.0.1");
    expect(v.client.localhostRedirect).toBe(true);
    expect(v.agents.find((a) => a.id === agentId)?.grantable).toEqual(["mcp:connect", "mcp:read", "brain:read", "brain:write"]);

    const code = await codigoDe(admin.cookie, id, { agentId, scopes: ["mcp:connect", "mcp:read", "brain:read", "brain:write"] });
    // El humano pasa a firmar por el agente
    const [a] = await db.select().from(agentIdentities).where(eq(agentIdentities.id, agentId));
    expect(a!.sponsorUserId).toBe(admin.userId);

    const t = await token({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECCION,
      code_verifier: verificador,
      client_id: clientId,
      resource: RECURSO,
    });
    expect(t.status).toBe(200);
    expect(t.headers.get("cache-control")).toBe("no-store");
    expect(t.body.token_type).toBe("Bearer");
    expect(t.body.access_token.startsWith("kitsuden_oat_")).toBe(true);
    expect(t.body.refresh_token.startsWith("kitsuden_ort_")).toBe(true);
    expect(Number(t.body.expires_in)).toBeLessThanOrEqual(3600);
    expect(t.body.scope).toBe("mcp:connect mcp:read brain:read brain:write");

    // En la base, solo hashes
    const enBase = await db.select().from(oauthTokens).where(eq(oauthTokens.clientId, clientId));
    expect(enBase.length).toBe(2);
    for (const fila of enBase) {
      expect(fila.tokenHash).not.toContain("kitsuden_");
      expect(JSON.stringify(fila)).not.toContain(t.body.access_token);
      expect(JSON.stringify(fila)).not.toContain(t.body.refresh_token);
    }

    // MCP con el token
    const s = await abrirSesion(t.body.access_token);
    expect(s.status).toBe(200);
    const lista = await rpc(s.sessionId!, t.body.access_token, "tools/list");
    const nombres = (lista.body.result.tools as { name: string }[]).map((x) => x.name);
    expect(nombres).toContain("brain_note_write");
    const marca = `oauth${generateTestId().replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
    const escrita = await rpc(s.sessionId!, t.body.access_token, "tools/call", {
      name: "brain_note_write",
      arguments: { body: { key: `o/${marca}`, title: marca, content: `nota ${marca}` } },
    });
    expect(escrita.body.result.isError, JSON.stringify(escrita.body).slice(0, 500)).toBeUndefined();
    const nota = escrita.body.result.structuredContent.data.note;
    notas.push(nota.id);
    expect(nota.owner.agentId).toBe(agentId);

    // Auditoría: con la clave de la conexión
    const [g] = await db.select().from(oauthGrants).where(eq(oauthGrants.clientId, clientId));
    await new Promise((r) => setTimeout(r, 150));
    const auditoria = await db
      .select()
      .from(agentAuditLogs)
      .where(and(eq(agentAuditLogs.agentId, agentId), eq(agentAuditLogs.keyId, g!.keyId)));
    expect(auditoria.some((x) => x.action === "auth_success")).toBe(true);
    expect(auditoria.some((x) => x.action === "tool_call")).toBe(true);

    // Rotación: el refresco viejo ya no vale y el nuevo sí
    const r1 = await token({ grant_type: "refresh_token", refresh_token: t.body.refresh_token, client_id: clientId, resource: RECURSO });
    expect(r1.status).toBe(200);
    expect(r1.body.refresh_token).not.toBe(t.body.refresh_token);
    const s2 = await abrirSesion(r1.body.access_token);
    expect(s2.status).toBe(200);
    const llamada = await rpc(s2.sessionId!, r1.body.access_token, "tools/call", { name: "brain_read", arguments: { id: nota.id } });
    expect(llamada.body.result.isError).toBeUndefined();

    // Revocar el refresco (RFC 7009) tumba la familia: también el acceso nuevo
    const rev = await pedir("/api/oauth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: r1.body.refresh_token, client_id: clientId }).toString(),
    });
    expect(rev.status).toBe(200);
    expect((await abrirSesion(r1.body.access_token)).status).toBe(401);
    const r2 = await token({ grant_type: "refresh_token", refresh_token: r1.body.refresh_token, client_id: clientId });
    expect(r2.body.error).toBe("invalid_grant");
  });

  it("CIMD: client_id = URL https con su documento; el documento tiene que casar", async () => {
    if (!dbAvailable) return;
    const url = `https://cliente.example/oauth/${generateTestId()}.json`;
    fijarBuscadorDeMetadatos(async (pedida) =>
      new Response(
        JSON.stringify({
          client_id: pedida,
          client_name: "Cliente CIMD",
          redirect_uris: [REDIRECCION],
          grant_types: ["authorization_code", "refresh_token"],
          token_endpoint_auth_method: "none",
        }),
        { status: 200, headers: { "content-type": "application/json", "cache-control": "max-age=600" } }
      )
    );
    const agentId = await agente(["mcp:connect", "mcp:read"]);
    const { verificador, reto } = pkce();
    const id = await autorizar(url, reto);
    const code = await codigoDe(admin.cookie, id, { agentId, scopes: ["mcp:connect", "mcp:read"] });
    const t = await token({ grant_type: "authorization_code", code, redirect_uri: REDIRECCION, code_verifier: verificador, client_id: url });
    expect(t.status).toBe(200);
    const [c] = await db.select().from(oauthClients).where(eq(oauthClients.id, url));
    expect(c!.kind).toBe("cimd");

    // Documento cuyo client_id no es la URL → rechazado, sin redirigir
    const otra = `https://cliente.example/oauth/${generateTestId()}-b.json`;
    fijarBuscadorDeMetadatos(async () =>
      new Response(JSON.stringify({ client_id: "https://otro.example/x.json", client_name: "x", redirect_uris: [REDIRECCION] }), { status: 200 })
    );
    const mala = await pedir(urlDeAutorizacion(otra, reto));
    expect(mala.status).toBe(400);
    expect(((await mala.json()) as { error: string }).error).toBe("invalid_client");
    fijarBuscadorDeMetadatos(null);
  });

  it("CIMD contra SSRF: direcciones no públicas y documentos inválidos no se leen", async () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.1.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "0.0.0.0"]) {
      expect(direccionNoPublica(ip)).toBe(true);
    }
    expect(direccionNoPublica("8.8.8.8")).toBe(false);
    fijarBuscadorDeMetadatos(null);
    const local = await leerDocumentoDeCliente("https://127.0.0.1/cliente.json");
    expect(local.ok).toBe(false);
    const puerto = await leerDocumentoDeCliente("https://cliente.example:8443/c.json");
    expect(puerto.ok).toBe(false);
    const sinRuta = await leerDocumentoDeCliente("https://cliente.example/");
    expect(sinRuta.ok).toBe(false);
  });
});

describe("OAuth para MCP: lo que tiene que fallar", () => {
  it("PKCE equivocado, sin S256 o sin reto", async () => {
    if (!dbAvailable) return;
    const agentId = await agente(["mcp:connect", "mcp:read"]);
    const clientId = await registrar();
    const { reto } = pkce();
    const id = await autorizar(clientId, reto);
    const code = await codigoDe(admin.cookie, id, { agentId, scopes: ["mcp:connect"] });
    const mal = await token({ grant_type: "authorization_code", code, redirect_uri: REDIRECCION, code_verifier: pkce().verificador, client_id: clientId });
    expect(mal.status).toBe(400);
    expect(mal.body.error).toBe("invalid_grant");

    const variantes: Record<string, string>[] = [{ code_challenge_method: "plain" }, { code_challenge: "" }];
    for (const extra of variantes) {
      const res = await pedir(urlDeAutorizacion(clientId, reto, extra));
      expect(res.status).toBe(302);
      const vuelta = new URL(res.headers.get("location")!);
      expect(vuelta.searchParams.get("error")).toBe("invalid_request");
      expect(vuelta.searchParams.get("iss")).toBe(ISSUER);
    }
    // Ni implícito ni contraseña
    const implicito = await pedir(urlDeAutorizacion(clientId, reto, { response_type: "token" }));
    expect(new URL(implicito.headers.get("location")!).searchParams.get("error")).toBe("unsupported_response_type");
    const password = await token({ grant_type: "password", username: "x", password: "y", client_id: clientId });
    expect(password.body.error).toBe("unsupported_grant_type");
    const sinImplicito = await pedir("/api/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redirect_uris: [REDIRECCION], grant_types: ["implicit"], token_endpoint_auth_method: "none" }),
    });
    expect(sinImplicito.status).toBe(400);
  });

  it("redirecciones: exactas (salvo el puerto en loopback), nunca http público ni fragmentos", async () => {
    if (!dbAvailable) return;
    const clientId = await registrar();
    const { verificador, reto } = pkce();
    // Otra ruta → no se redirige a ningún sitio: 400 en pantalla
    const otra = await pedir(urlDeAutorizacion(clientId, reto, { redirect_uri: "http://127.0.0.1/otra" }));
    expect(otra.status).toBe(400);
    expect(otra.headers.get("location")).toBeNull();
    const ajena = await pedir(urlDeAutorizacion(clientId, reto, { redirect_uri: "https://evil.example/callback" }));
    expect(ajena.status).toBe(400);
    // Loopback con otro puerto: vale (OAuth 2.1 §8.4.2)
    const conPuerto = await pedir(urlDeAutorizacion(clientId, reto, { redirect_uri: "http://127.0.0.1:54321/callback" }));
    expect(conPuerto.status).toBe(302);
    // El canje exige la MISMA redirección que la autorización
    const agentId = await agente(["mcp:connect"]);
    const id = await autorizar(clientId, reto);
    const code = await codigoDe(admin.cookie, id, { agentId, scopes: ["mcp:connect"] });
    const distinta = await token({ grant_type: "authorization_code", code, redirect_uri: "http://127.0.0.1:9999/callback", code_verifier: verificador, client_id: clientId });
    expect(distinta.body.error).toBe("invalid_grant");

    for (const mala of ["http://evil.example/cb", "https://x.example/cb#frag", "javascript:alert(1)", "https://u:p@x.example/cb"]) {
      const res = await pedir("/api/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redirect_uris: [mala], token_endpoint_auth_method: "none" }),
      });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe("invalid_redirect_uri");
    }
  });

  it("audiencia: otro resource no se autoriza; el token no vale fuera de /api/mcp ni con otra audiencia", async () => {
    if (!dbAvailable) return;
    const clientId = await registrar();
    const { reto } = pkce();
    const otra = await pedir(urlDeAutorizacion(clientId, reto, { resource: "https://evil.example/mcp" }));
    expect(new URL(otra.headers.get("location")!).searchParams.get("error")).toBe("invalid_target");

    const agentId = await agente(["mcp:connect", "mcp:read", "datasets:*:read", "usuario:actuar"]);
    const t = await conectar(agentId, ["mcp:connect", "mcp:read", "datasets:*:read", "usuario:actuar"]);
    // Fuera del recurso: 401 aunque el agente tenga el scope
    const fuera = await pedir("/api/datasets", { headers: { Authorization: `Bearer ${t.access_token}` } });
    expect(fuera.status).toBe(401);
    const v1 = await pedir("/api/v1/agents", { headers: { Authorization: `Bearer ${t.access_token}` } });
    expect(v1.status).toBe(401);
    // Emitido para otro recurso (otra instalación): 401 también en /api/mcp
    await db.update(oauthTokens).set({ resource: "https://otro.example/api/mcp" }).where(eq(oauthTokens.clientId, t.clientId));
    const s = await abrirSesion(t.access_token);
    expect(s.status).toBe(401);
    expect(s.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });

  it("un refresco reusado revoca la familia entera; un código reusado también", async () => {
    if (!dbAvailable) return;
    const agentId = await agente(["mcp:connect", "mcp:read"]);
    const t = await conectar(agentId, ["mcp:connect", "mcp:read"]);
    const r1 = await token({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: t.clientId });
    expect(r1.status).toBe(200);
    expect((await abrirSesion(r1.body.access_token)).status).toBe(200);
    // El atacante (o el cliente legítimo, quien llegue segundo) reusa el viejo
    const reuso = await token({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: t.clientId });
    expect(reuso.body.error).toBe("invalid_grant");
    // Cae todo: el acceso y el refresco NUEVOS
    expect((await abrirSesion(r1.body.access_token)).status).toBe(401);
    expect((await token({ grant_type: "refresh_token", refresh_token: r1.body.refresh_token, client_id: t.clientId })).body.error).toBe("invalid_grant");
    // Otro cliente no canjea refrescos ajenos
    const otro = await registrar();
    const t2 = await conectar(agentId, ["mcp:connect"]);
    expect((await token({ grant_type: "refresh_token", refresh_token: t2.refresh_token, client_id: otro })).body.error).toBe("invalid_grant");

    // Código reusado → invalid_grant y la familia que emitió, revocada
    const clientId = await registrar();
    const { verificador, reto } = pkce();
    const id = await autorizar(clientId, reto);
    const code = await codigoDe(admin.cookie, id, { agentId, scopes: ["mcp:connect"] });
    const params = { grant_type: "authorization_code", code, redirect_uri: REDIRECCION, code_verifier: verificador, client_id: clientId };
    const primero = await token(params);
    expect(primero.status).toBe(200);
    const segundo = await token(params);
    expect(segundo.body.error).toBe("invalid_grant");
    expect((await abrirSesion(primero.body.access_token)).status).toBe(401);
  });

  it("escaladas de scope: nada que el agente o el humano no tengan", async () => {
    if (!dbAvailable) return;
    const agentId = await agente(["mcp:connect", "mcp:read", "brain:read", "brain:write", "!kon:crm:*"]);
    // Pedir un scope que el agente no tiene
    let id = await autorizar(await registrar(), pkce().reto);
    expect((await consentir(admin.cookie, id, { decision: "approve", agentId, scopes: ["mcp:connect", "admin"] })).status).toBe(403);
    // Denegaciones en la concesión: no
    id = await autorizar(await registrar(), pkce().reto);
    expect((await consentir(admin.cookie, id, { decision: "approve", agentId, scopes: ["mcp:connect", "!brain:write"] })).status).toBe(422);
    // Sin mcp:connect: no conectaría
    id = await autorizar(await registrar(), pkce().reto);
    expect((await consentir(admin.cookie, id, { decision: "approve", agentId, scopes: ["mcp:read"] })).status).toBe(422);

    // Un editor: solo agentes que ya firma, y nada de admin
    const ajeno = await agente(["mcp:connect", "admin"]);
    id = await autorizar(await registrar(), pkce().reto);
    expect((await consentir(editor.cookie, id, { decision: "approve", agentId: ajeno, scopes: ["mcp:connect"] })).status).toBe(403);
    await db.update(agentIdentities).set({ sponsorUserId: editor.userId }).where(eq(agentIdentities.id, ajeno));
    id = await autorizar(await registrar(), pkce().reto);
    expect((await consentir(editor.cookie, id, { decision: "approve", agentId: ajeno, scopes: ["mcp:connect", "admin"] })).status).toBe(403);
    id = await autorizar(await registrar(), pkce().reto);
    expect((await consentir(editor.cookie, id, { decision: "approve", newAgent: { name: "x" }, scopes: ["mcp:connect"] })).status).toBe(403);
    id = await autorizar(await registrar(), pkce().reto);
    expect((await consentir(editor.cookie, id, { decision: "approve", agentId: ajeno, scopes: ["mcp:connect"] })).status).toBe(200);

    // Un agente (aunque tenga admin) no consiente
    const { plainApiKey } = await createAgent({ name: `oauth-agente-admin-${generateTestId()}`, scopes: ["admin"] });
    id = await autorizar(await registrar(), pkce().reto);
    const porAgente = await pedir(`/api/oauth/consent/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${plainApiKey}` },
      body: JSON.stringify({ decision: "approve", agentId, scopes: ["mcp:connect"] }),
    });
    expect(porAgente.status).toBe(403);

    // Lo concedido ESTRECHA: sin brain:write en la concesión, no escribe
    const t = await conectar(agentId, ["mcp:connect", "mcp:read", "brain:read"]);
    const s = await abrirSesion(t.access_token);
    const lista = await rpc(s.sessionId!, t.access_token, "tools/list");
    const nombres = (lista.body.result.tools as { name: string }[]).map((x) => x.name);
    expect(nombres).toContain("brain_search");
    expect(nombres).not.toContain("brain_note_write");
    const escribe = await rpc(s.sessionId!, t.access_token, "tools/call", {
      name: "brain_note_write",
      arguments: { body: { key: "x", title: "x", content: "x" } },
    });
    expect(escribe.body.result.isError).toBe(true);
    // El refresco no amplía
    const mas = await token({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: t.clientId, scope: "mcp:connect brain:write" });
    expect(mas.body.error).toBe("invalid_scope");
    // …pero puede estrechar
    const menos = await token({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: t.clientId, scope: "mcp:connect" });
    expect(menos.status).toBe(200);
    expect(menos.body.scope).toBe("mcp:connect");

    // Quitar un scope al agente vale ya en la conexión OAuth; añadirlo, no
    const t3 = await conectar(agentId, ["mcp:connect", "mcp:read", "brain:read"]);
    await db.update(agentIdentities).set({ scopes: ["mcp:connect", "mcp:read", "brain:write", "!kon:crm:*"] }).where(eq(agentIdentities.id, agentId));
    const s3 = await abrirSesion(t3.access_token);
    const lista3 = await rpc(s3.sessionId!, t3.access_token, "tools/list");
    const n3 = (lista3.body.result.tools as { name: string }[]).map((x) => x.name);
    expect(n3).not.toContain("brain_search"); // brain:read ya no lo tiene el agente
    expect(n3).not.toContain("brain_note_write"); // brain:write no se concedió
    // Sin mcp:connect en el agente: 403 con insufficient_scope
    await db.update(agentIdentities).set({ scopes: ["mcp:read"] }).where(eq(agentIdentities.id, agentId));
    const sinConnect = await abrirSesion(t3.access_token);
    expect(sinConnect.status).toBe(403);
    expect(sinConnect.headers.get("www-authenticate")).toContain('error="insufficient_scope"');
  });

  it("token caducado: 401 invalid_token; refresco caducado: invalid_grant", async () => {
    if (!dbAvailable) return;
    const agentId = await agente(["mcp:connect", "mcp:read"]);
    const t = await conectar(agentId, ["mcp:connect", "mcp:read"]);
    await db.update(oauthTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(oauthTokens.clientId, t.clientId));
    const s = await abrirSesion(t.access_token);
    expect(s.status).toBe(401);
    expect(s.headers.get("www-authenticate")).toContain('error="invalid_token"');
    expect((await token({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: t.clientId })).body.error).toBe("invalid_grant");
  });

  it("RLS: el token del agente A no ve las notas privadas del agente B", async () => {
    if (!dbAvailable) return;
    const a = await agente(["mcp:connect", "brain:read", "brain:write"]);
    const b = await agente(["mcp:connect", "brain:read", "brain:write"]);
    const ta = await conectar(a, ["mcp:connect", "brain:read", "brain:write"]);
    const tb = await conectar(b, ["mcp:connect", "brain:read", "brain:write"]);
    const sa = await abrirSesion(ta.access_token);
    const sb = await abrirSesion(tb.access_token);
    const marca = `rlsoauth${generateTestId().replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
    const escrita = await rpc(sb.sessionId!, tb.access_token, "tools/call", {
      name: "brain_note_write",
      arguments: { body: { key: `b/${marca}`, title: marca, content: `secreto ${marca}` } },
    });
    const nota = escrita.body.result.structuredContent.data.note;
    notas.push(nota.id);
    expect(nota.visibility).toBe("private");

    const leer = await rpc(sa.sessionId!, ta.access_token, "tools/call", { name: "brain_read", arguments: { id: nota.id } });
    expect(leer.body.result.isError).toBe(true);
    expect(JSON.stringify(leer.body)).toContain("KITSUDEN_E_NOT_FOUND");
    const busca = await rpc(sa.sessionId!, ta.access_token, "tools/call", { name: "brain_search", arguments: { q: marca, threshold: 0 } });
    const vistas = (busca.body.result.structuredContent.data.hits as { note: { id: string } }[]).map((h) => h.note.id);
    expect(vistas).not.toContain(nota.id);
    // La sesión de B no se puede usar con el token de A
    const cruzada = await rpc(sb.sessionId!, ta.access_token, "tools/list");
    expect(cruzada.status).toBe(400);

    // Y la base sola (rol de la app, sin filtro de la aplicación) lo corta
    const cuantas = (agentId: string) =>
      db.transaction(async (tx) => {
        const su = await tx.execute(sql`SELECT current_setting('is_superuser') AS su`);
        if ((su.rows[0] as { su: string }).su === "on") await tx.execute(sql`SET LOCAL ROLE kitsuden_app`);
        await tx.execute(sql`SELECT set_config('app.current_user_id', ${agentId}, true)`);
        await tx.execute(sql`SELECT set_config('app.current_user_role', 'agent', true)`);
        const r = await tx.execute(sql`SELECT count(*)::int AS n FROM brain_notes WHERE id = ${nota.id}`);
        return (r.rows[0] as { n: number }).n;
      });
    expect(await cuantas(b)).toBe(1);
    expect(await cuantas(a)).toBe(0);
  });
});

describe("OAuth para MCP: conexiones, aprobaciones, claves estáticas y barrido", () => {
  it("el panel lista y revoca; la revocación vale en la petición siguiente", async () => {
    if (!dbAvailable) return;
    const agentId = await agente(["mcp:connect", "mcp:read"]);
    const t = await conectar(agentId, ["mcp:connect", "mcp:read"]);
    expect((await abrirSesion(t.access_token)).status).toBe(200);
    const lista = await pedir(`/api/oauth/grants?agentId=${agentId}`, { headers: { Cookie: admin.cookie } });
    const { grants } = (await lista.json()) as { grants: { id: string; client: { id: string }; agent: { id: string } }[] };
    const g = grants.find((x) => x.client.id === t.clientId)!;
    expect(g.agent.id).toBe(agentId);
    // Un editor no ve ni revoca la de otro (404, no 403: no confirma que exista)
    const delEditor = await pedir(`/api/oauth/grants/${g.id}`, { method: "DELETE", headers: { Cookie: editor.cookie, Origin: PANEL } });
    expect(delEditor.status).toBe(404);
    const borra = await pedir(`/api/oauth/grants/${g.id}`, { method: "DELETE", headers: { Cookie: admin.cookie, Origin: PANEL } });
    expect(borra.status).toBe(200);
    expect((await abrirSesion(t.access_token)).status).toBe(401);
    expect((await token({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: t.clientId })).body.error).toBe("invalid_grant");
    // La clave de la conexión queda revocada (pestaña «Claves»)
    const [fila] = await db.select().from(oauthGrants).where(eq(oauthGrants.id, g.id));
    const [clave] = await db.select().from(agentApiKeys).where(eq(agentApiKeys.id, fila!.keyId));
    expect(clave!.revokedAt).not.toBeNull();
    expect(clave!.algorithm).toBe("oauth");
  });

  it("revocar la clave OAuth desde la pestaña Claves también corta la conexión", async () => {
    if (!dbAvailable) return;
    const agentId = await agente(["mcp:connect", "mcp:read"]);
    const t = await conectar(agentId, ["mcp:connect", "mcp:read"]);
    const [g] = await db.select().from(oauthGrants).where(eq(oauthGrants.clientId, t.clientId));
    await db.update(agentApiKeys).set({ revokedAt: new Date() }).where(eq(agentApiKeys.id, g!.keyId));
    expect((await abrirSesion(t.access_token)).status).toBe(401);
    expect((await token({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: t.clientId })).body.error).toBe("invalid_grant");
  });

  it("aprobaciones: una propuesta de una conexión OAuth se ejecuta con lo concedido, y no si se revocó", async () => {
    if (!dbAvailable) return;
    const agentId = await agente(["mcp:connect", "mcp:read", "mcp:write", "!datasets:secreto:*"]);
    const t = await conectar(agentId, ["mcp:connect", "mcp:read"]);
    const [g] = await db.select().from(oauthGrants).where(eq(oauthGrants.clientId, t.clientId));
    const ctx = await contextoDeAgenteParaAprobacion(agentId, g!.keyId);
    expect(ctx.ok).toBe(true);
    if (ctx.ok) expect(ctx.context.scopes).toEqual(["!datasets:secreto:*", "mcp:connect", "mcp:read"]);
    await db.update(oauthGrants).set({ revokedAt: new Date() }).where(eq(oauthGrants.id, g!.id));
    const despues = await contextoDeAgenteParaAprobacion(agentId, g!.keyId);
    expect(despues.ok).toBe(false);
  });

  it("las claves estáticas siguen funcionando igual", async () => {
    if (!dbAvailable) return;
    const { plainApiKey } = await createAgent({ name: `oauth-estatica-${generateTestId()}`, scopes: ["mcp:connect", "mcp:read"] });
    const s = await abrirSesion(plainApiKey);
    expect(s.status).toBe(200);
    const lista = await rpc(s.sessionId!, plainApiKey, "tools/list");
    expect(lista.status).toBe(200);
  });

  it("denegar en el consentimiento devuelve access_denied con state e iss", async () => {
    if (!dbAvailable) return;
    const id = await autorizar(await registrar(), pkce().reto);
    const r = await consentir(admin.cookie, id, { decision: "deny" });
    expect(r.status).toBe(200);
    const vuelta = new URL(r.body.redirectTo as string);
    expect(vuelta.searchParams.get("error")).toBe("access_denied");
    expect(vuelta.searchParams.get("state")).toBe("estado-123");
    expect(vuelta.searchParams.get("iss")).toBe(ISSUER);
    // Una petición se decide una vez
    expect((await consentir(admin.cookie, id, { decision: "deny" })).status).toBe(404);
  });

  it("los clientes confidenciales se autentican con su secreto", async () => {
    if (!dbAvailable) return;
    const res = await pedir("/api/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redirect_uris: [REDIRECCION], client_name: "Confidencial" }),
    });
    const c = (await res.json()) as { client_id: string; client_secret: string; token_endpoint_auth_method: string };
    expect(c.token_endpoint_auth_method).toBe("client_secret_basic");
    const [fila] = await db.select().from(oauthClients).where(eq(oauthClients.id, c.client_id));
    expect(fila!.secretHash).not.toBe(c.client_secret);
    const agentId = await agente(["mcp:connect"]);
    const { verificador, reto } = pkce();
    const id = await autorizar(c.client_id, reto);
    const code = await codigoDe(admin.cookie, id, { agentId, scopes: ["mcp:connect"] });
    const params = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECCION, code_verifier: verificador }).toString();
    const sinSecreto = await pedir("/api/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `${params}&client_id=${c.client_id}` });
    expect(sinSecreto.status).toBe(401);
    const basica = `Basic ${Buffer.from(`${c.client_id}:${c.client_secret}`).toString("base64")}`;
    const bien = await pedir("/api/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basica }, body: params });
    expect(bien.status).toBe(200);
  });

  it("límite de registro por IP (falla cerrado)", async () => {
    if (!dbAvailable) return;
    process.env.OAUTH_REGISTER_LIMIT = "1";
    try {
      await pedir("/api/oauth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redirect_uris: [REDIRECCION], token_endpoint_auth_method: "none" }) });
      const segundo = await pedir("/api/oauth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redirect_uris: [REDIRECCION], token_endpoint_auth_method: "none" }) });
      expect(segundo.status).toBe(429);
    } finally {
      process.env.OAUTH_REGISTER_LIMIT = "100000";
    }
  });

  it("el barrido borra los clientes que nadie consintió en 7 días", async () => {
    if (!dbAvailable) return;
    const viejo = await registrar();
    const usado = await registrar();
    await db.update(oauthClients).set({ createdAt: new Date(Date.now() - 8 * 86_400_000) }).where(inArray(oauthClients.id, [viejo, usado]));
    const agentId = await agente(["mcp:connect"]);
    const { reto } = pkce();
    const id = await autorizar(usado, reto);
    await codigoDe(admin.cookie, id, { agentId, scopes: ["mcp:connect"] });
    await barrerOAuth();
    expect((await db.select().from(oauthClients).where(eq(oauthClients.id, viejo))).length).toBe(0);
    expect((await db.select().from(oauthClients).where(eq(oauthClients.id, usado))).length).toBe(1);
  });
});
