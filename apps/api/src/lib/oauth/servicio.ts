/**
 * OAuth 2.1 para MCP — el servidor de autorización
 * ============================================================================
 *
 * Registro (DCR y Client ID Metadata Documents), petición de autorización,
 * consentimiento, canje del código, refresco con rotación, revocación y el
 * barrido de lo caducado. Las rutas HTTP están en routes/oauth.ts; la
 * autenticación de los tokens en services/agent-auth.ts (vía ./tokens).
 *
 * El modelo, en una línea: una CONCESIÓN dice «el humano H dejó al cliente C
 * actuar como el agente A con estos scopes». Cuelga de una fila de
 * `agent_api_keys` (algorithm 'oauth'), así que el agente se comporta igual
 * que con su clave estática. Guía: docs/agents/oauth.md.
 */

import { randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { isIPv4, isIPv6 } from "net";

import { concedeScope, esDenegacion, normalizarScopes } from "@kitsuden/shared";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../../db";
import { agentApiKeys, agentIdentities, authUsers } from "../../db/schema-core";
import {
  oauthAuthorizationRequests,
  oauthClients,
  oauthCodes,
  oauthGrants,
  oauthTokens,
} from "../../db/schema-oauth";
import { logAgentAction, logAuthFailure } from "../../services/agent-audit";

import { esClientIdUrl, leerDocumentoDeCliente } from "./cimd";
import {
  PREFIJO_CLIENTE,
  PREFIJO_SECRETO_CLIENTE,
  SCOPES_BASICOS,
  TTL_CODIGO_S,
  TTL_PETICION_S,
  cimdEncendido,
  issuer,
  recursoMcp,
  ttlAcceso,
  ttlFamilia,
  ttlRefresco,
  urlDeConsentimiento,
} from "./config";
import { concesionSigueDelegable, humanoPuedeDelegar, nuevoToken } from "./tokens";
import {
  errorSePuedeRedirigir,
  hashDe,
  leerScopes,
  motivoDeRedireccionInvalida,
  pkceCasa,
  recursoPedido,
  redireccionCasa,
  retoValido,
} from "./uris";

export type Cliente = typeof oauthClients.$inferSelect;

/** Error OAuth (RFC 6749 §5.2 / RFC 7591 §3.2.2). */
export class ErrorOAuth extends Error {
  constructor(
    public readonly error: string,
    public readonly descripcion: string,
    public readonly estado = 400
  ) {
    super(descripcion);
  }
}

const ahora = () => new Date();
const enSegundos = (s: number) => new Date(Date.now() + s * 1000);

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRO DINÁMICO (RFC 7591)
// ═══════════════════════════════════════════════════════════════════════════

const METODOS = ["none", "client_secret_post", "client_secret_basic"] as const;
type Metodo = (typeof METODOS)[number];

const texto = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export interface ClienteRegistrado {
  client_id: string;
  client_secret?: string;
  client_id_issued_at: number;
  client_secret_expires_at?: number;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: Metodo;
  client_uri?: string;
  logo_uri?: string;
  software_id?: string;
  software_version?: string;
}

export async function registrarCliente(cuerpo: unknown, ip: string | null): Promise<ClienteRegistrado> {
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) {
    throw new ErrorOAuth("invalid_client_metadata", "The body must be a JSON object");
  }
  const m = cuerpo as Record<string, unknown>;
  const redirectUris = m.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || redirectUris.length > 10) {
    throw new ErrorOAuth("invalid_redirect_uri", "redirect_uris must be an array of 1-10 URIs");
  }
  for (const r of redirectUris) {
    const motivo = motivoDeRedireccionInvalida(r);
    if (motivo) throw new ErrorOAuth("invalid_redirect_uri", `redirect_uri ${String(r).slice(0, 100)} ${motivo}`);
  }
  // RFC 7591 §2: por defecto client_secret_basic. Los clientes MCP (públicos) mandan `none`.
  const metodo = (m.token_endpoint_auth_method ?? "client_secret_basic") as Metodo;
  if (!METODOS.includes(metodo)) {
    throw new ErrorOAuth(
      "invalid_client_metadata",
      `token_endpoint_auth_method must be one of: ${METODOS.join(", ")}`
    );
  }
  const grantTypes = m.grant_types === undefined ? ["authorization_code", "refresh_token"] : m.grant_types;
  if (
    !Array.isArray(grantTypes) ||
    grantTypes.length === 0 ||
    grantTypes.some((g) => g !== "authorization_code" && g !== "refresh_token") ||
    !grantTypes.includes("authorization_code")
  ) {
    throw new ErrorOAuth(
      "invalid_client_metadata",
      "grant_types must include authorization_code and may include refresh_token (no implicit, password or client_credentials)"
    );
  }
  if (m.response_types !== undefined && (!Array.isArray(m.response_types) || m.response_types.some((r) => r !== "code"))) {
    throw new ErrorOAuth("invalid_client_metadata", "response_types must be [\"code\"]");
  }
  const id = `${PREFIJO_CLIENTE}${randomBytes(18).toString("base64url")}`;
  const secreto = metodo === "none" ? null : `${PREFIJO_SECRETO_CLIENTE}${randomBytes(32).toString("base64url")}`;
  const nombre = texto(m.client_name, 200) ?? "MCP client";
  const [fila] = await db
    .insert(oauthClients)
    .values({
      id,
      kind: "dcr",
      clientName: nombre,
      clientUri: texto(m.client_uri, 500),
      logoUri: texto(m.logo_uri, 500),
      softwareId: texto(m.software_id, 200),
      softwareVersion: texto(m.software_version, 100),
      redirectUris: redirectUris as string[],
      grantTypes: ["authorization_code", "refresh_token"],
      tokenEndpointAuthMethod: metodo,
      secretHash: secreto ? hashDe(secreto) : null,
      registeredIp: ip,
    })
    .returning();
  const c = fila!;
  return {
    client_id: c.id,
    ...(secreto ? { client_secret: secreto, client_secret_expires_at: 0 } : {}),
    client_id_issued_at: Math.floor(c.createdAt.getTime() / 1000),
    client_name: c.clientName,
    redirect_uris: c.redirectUris,
    grant_types: c.grantTypes,
    response_types: ["code"],
    token_endpoint_auth_method: metodo,
    ...(c.clientUri ? { client_uri: c.clientUri } : {}),
    ...(c.logoUri ? { logo_uri: c.logoUri } : {}),
    ...(c.softwareId ? { software_id: c.softwareId } : {}),
    ...(c.softwareVersion ? { software_version: c.softwareVersion } : {}),
  };
}

/**
 * Clientes sin consentir creados en las últimas 24 h (freno contra el relleno de
 * la tabla). With `ip`, those of that origin: /24 for IPv4, /48 for IPv6. The
 * global count let anyone with a few dozen IPs block registration for everybody.
 */
export async function clientesPendientesRecientes(ip?: string | null): Promise<number> {
  const rango = ip ? rangoDeRegistro(ip) : null;
  const r = (await db.execute(sql`
    SELECT count(*)::int AS n FROM oauth_clients c
    WHERE c.kind = 'dcr' AND c.created_at > now() - interval '24 hours'
      AND NOT EXISTS (SELECT 1 FROM oauth_grants g WHERE g.client_id = c.id)
      ${rango ? sql`AND c.registered_ip LIKE ${`${rango}%`}` : sql``}
  `)) as unknown as { rows: { n: number }[] };
  return r.rows[0]?.n ?? 0;
}

/** The text prefix shared by the addresses of a client's network, or `null` if it is not an IP. */
export function rangoDeRegistro(ip: string): string | null {
  if (isIPv4(ip)) return `${ip.split(".").slice(0, 3).join(".")}.`;
  if (isIPv6(ip)) return `${ip.toLowerCase().split(":").slice(0, 3).join(":")}:`;
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENTES: búsqueda (DCR) y documentos de metadatos (CIMD)
// ═══════════════════════════════════════════════════════════════════════════

/** El cliente de un client_id, leyendo (o refrescando) su documento si es una URL. */
export async function clientePorId(clientId: string): Promise<Cliente | null> {
  if (!clientId || clientId.length > 2000) return null;
  const [fila] = await db.select().from(oauthClients).where(eq(oauthClients.id, clientId)).limit(1);
  if (!esClientIdUrl(clientId)) return fila && fila.kind === "dcr" ? fila : null;
  if (!cimdEncendido()) return null;
  if (fila && fila.kind === "cimd" && fila.metadataExpiresAt && fila.metadataExpiresAt > ahora()) return fila;
  const lectura = await leerDocumentoDeCliente(clientId);
  if (!lectura.ok) {
    throw new ErrorOAuth("invalid_client", `Client ID Metadata Document rejected: ${lectura.motivo}`);
  }
  const d = lectura.doc;
  const valores = {
    kind: "cimd",
    clientName: d.clientName,
    clientUri: d.clientUri,
    logoUri: d.logoUri,
    softwareId: d.softwareId,
    softwareVersion: d.softwareVersion,
    redirectUris: d.redirectUris,
    grantTypes: d.grantTypes,
    tokenEndpointAuthMethod: "none",
    secretHash: null,
    metadataExpiresAt: d.caduca,
  };
  const [guardado] = await db
    .insert(oauthClients)
    .values({ id: clientId, ...valores })
    .onConflictDoUpdate({ target: oauthClients.id, set: valores })
    .returning();
  return guardado ?? null;
}

/**
 * Autenticación del cliente en /token y /revoke (OAuth 2.1 §2.4): `none`
 * (solo el client_id), `client_secret_post` o `client_secret_basic`.
 */
export async function autenticarCliente(
  cabecera: string | undefined,
  parametros: Record<string, string>
): Promise<Cliente> {
  let clientId = parametros.client_id;
  let secreto: string | undefined = parametros.client_secret;
  let porBasic = false;
  if (cabecera?.toLowerCase().startsWith("basic ")) {
    porBasic = true;
    try {
      const plano = Buffer.from(cabecera.slice(6).trim(), "base64").toString("utf8");
      const i = plano.indexOf(":");
      if (i < 0) throw new Error();
      const id = decodeURIComponent(plano.slice(0, i));
      if (clientId && clientId !== id) throw new Error();
      clientId = id;
      secreto = decodeURIComponent(plano.slice(i + 1));
    } catch {
      throw new ErrorOAuth("invalid_client", "Malformed HTTP Basic client credentials", 401);
    }
  }
  if (!clientId) throw new ErrorOAuth("invalid_client", "client_id is required", 401);
  let cliente: Cliente | null;
  try {
    cliente = await clientePorId(clientId);
  } catch (e) {
    if (e instanceof ErrorOAuth) throw new ErrorOAuth("invalid_client", e.descripcion, 401);
    throw e;
  }
  if (!cliente) throw new ErrorOAuth("invalid_client", "Unknown client", 401);
  const metodo = cliente.tokenEndpointAuthMethod as Metodo;
  if (metodo === "none") {
    if (secreto) throw new ErrorOAuth("invalid_client", "This is a public client: send no client_secret", 401);
    return cliente;
  }
  if (!secreto || (metodo === "client_secret_basic") !== porBasic || !cliente.secretHash) {
    throw new ErrorOAuth("invalid_client", `Client authentication failed (expected ${metodo})`, 401);
  }
  const a = Buffer.from(hashDe(secreto));
  const b = Buffer.from(cliente.secretHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ErrorOAuth("invalid_client", "Client authentication failed", 401);
  }
  return cliente;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTORIZACIÓN (GET /api/oauth/authorize)
// ═══════════════════════════════════════════════════════════════════════════

export type ResultadoDeAutorizacion =
  /** Error que NO se puede devolver al cliente (cliente o redirección no válidos): se enseña. */
  | { tipo: "pantalla"; error: string; descripcion: string }
  /** A dónde mandar el navegador: el consentimiento, o la redirección del cliente con un error. */
  | { tipo: "redirigir"; url: string };

export function urlDeVuelta(redirectUri: string, parametros: Record<string, string | null | undefined>): string {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(parametros)) if (v !== undefined && v !== null) u.searchParams.set(k, v);
  // RFC 9207: el emisor, en éxito y en error
  u.searchParams.set("iss", issuer());
  return u.toString();
}

/** ¿Tiene este cliente alguna concesión sin revocar? (un humano lo aprobó) */
async function tieneConcesionViva(clientId: string): Promise<boolean> {
  const [g] = await db
    .select({ id: oauthGrants.id })
    .from(oauthGrants)
    .where(and(eq(oauthGrants.clientId, clientId), isNull(oauthGrants.revokedAt)))
    .limit(1);
  return Boolean(g);
}

export async function empezarAutorizacion(q: Record<string, string | undefined>): Promise<ResultadoDeAutorizacion> {
  const clientId = q.client_id ?? "";
  let cliente: Cliente | null = null;
  try {
    cliente = await clientePorId(clientId);
  } catch (e) {
    if (e instanceof ErrorOAuth) return { tipo: "pantalla", error: e.error, descripcion: e.descripcion };
    throw e;
  }
  if (!cliente) return { tipo: "pantalla", error: "invalid_client", descripcion: "Unknown client_id" };
  const clienteId = cliente.id;
  const redirectUri = q.redirect_uri ?? "";
  if (!redirectUri || !redireccionCasa(cliente.redirectUris, redirectUri)) {
    return {
      tipo: "pantalla",
      error: "invalid_request",
      descripcion: "redirect_uri is missing or does not exactly match a registered redirect URI",
    };
  }
  /**
   * Un error se devuelve al cliente con un 302 solo si su redirección es de
   * fiar (RFC 9700 §4.11): loopback, o un cliente que un humano ya aprobó
   * (concesión sin revocar). Un cliente registrado por un anónimo y nunca
   * aprobado ve la pantalla de error: si no, el registro abierto más este 302
   * sin login ni consentimiento son un redirector abierto (auditoría F68).
   */
  const error = async (codigo: string, descripcion: string): Promise<ResultadoDeAutorizacion> => {
    if (!errorSePuedeRedirigir(redirectUri, await tieneConcesionViva(clienteId))) {
      return { tipo: "pantalla", error: codigo, descripcion };
    }
    return {
      tipo: "redirigir",
      url: urlDeVuelta(redirectUri, { error: codigo, error_description: descripcion, state: q.state }),
    };
  };
  if (q.response_type !== "code") {
    return error("unsupported_response_type", "Only response_type=code is supported");
  }
  if (q.code_challenge_method !== "S256" || !retoValido(q.code_challenge)) {
    return error("invalid_request", "PKCE is required: code_challenge (43 base64url chars) with code_challenge_method=S256");
  }
  const scopes = leerScopes(q.scope);
  if (scopes === null) return error("invalid_scope", "Malformed scope parameter");
  const recurso = recursoPedido(q.resource);
  if (recurso && !recurso.ok) return error("invalid_target", `The only resource served here is ${recursoMcp()}`);
  if (q.state && q.state.length > 2000) return error("invalid_request", "state is too long");

  const id = randomUUID();
  await db.insert(oauthAuthorizationRequests).values({
    id,
    clientId: cliente.id,
    redirectUri,
    state: q.state ?? null,
    codeChallenge: q.code_challenge!,
    requestedScopes: scopes,
    resource: recurso?.ok ? recurso.recurso : recursoMcp(),
    expiresAt: enSegundos(TTL_PETICION_S),
  });
  return { tipo: "redirigir", url: urlDeConsentimiento(id) };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSENTIMIENTO (panel)
// ═══════════════════════════════════════════════════════════════════════════

export interface Humano {
  id: string;
  role: string;
}

/** El rol de AHORA (no el de la cookie). */
export async function humanoFresco(id: string): Promise<Humano | null> {
  const [u] = await db.select({ id: authUsers.id, role: authUsers.role }).from(authUsers).where(eq(authUsers.id, id)).limit(1);
  return u ? { id: u.id, role: (u.role as string | null) ?? "user" } : null;
}

export { humanoPuedeDelegar };

/** Los agentes que este humano puede elegir: un admin, todos los activos; un editor, los que ya firma. */
/** A quién puede delegar esta persona: un admin, a cualquier agente activo; los demás, a los que firman. */
function filtroDeElegibles(h: Humano) {
  return h.role === "admin"
    ? eq(agentIdentities.isActive, true)
    : and(eq(agentIdentities.isActive, true), eq(agentIdentities.sponsorUserId, h.id));
}

/** Tope de la LISTA de la pantalla de consentimiento (no de lo que se puede elegir). */
const MAX_AGENTES_EN_PANTALLA = 500;

/**
 * Los agentes que la pantalla enseña: los más recientes primero, hasta
 * `MAX_AGENTES_EN_PANTALLA` (uno más para saber si hay más). Antes iban por
 * nombre y cortados a 500, y la DECISIÓN buscaba el agente elegido en esa
 * misma lista: con más de 500, un agente válido daba «not yours to delegate».
 */
async function agentesElegibles(h: Humano) {
  return db
    .select()
    .from(agentIdentities)
    .where(filtroDeElegibles(h))
    .orderBy(desc(agentIdentities.updatedAt), agentIdentities.name)
    .limit(MAX_AGENTES_EN_PANTALLA + 1);
}

/** El agente elegido, por id y con el mismo filtro: sin tope. */
async function agenteElegible(h: Humano, id: string | undefined) {
  if (!id) return undefined;
  const [a] = await db
    .select()
    .from(agentIdentities)
    .where(and(filtroDeElegibles(h), eq(agentIdentities.id, id)))
    .limit(1);
  return a;
}

async function peticionViva(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [p] = await db
    .select({ p: oauthAuthorizationRequests, c: oauthClients })
    .from(oauthAuthorizationRequests)
    .innerJoin(oauthClients, eq(oauthClients.id, oauthAuthorizationRequests.clientId))
    .where(eq(oauthAuthorizationRequests.id, id))
    .limit(1);
  if (!p || p.p.decidedAt || p.p.expiresAt <= ahora()) return null;
  return p;
}

function hostDe(uri: string): string {
  try {
    const u = new URL(uri);
    return u.host || `${u.protocol}//`;
  } catch {
    return uri;
  }
}

export async function vistaDeConsentimiento(idPeticion: string, h: Humano) {
  const viva = await peticionViva(idPeticion);
  if (!viva) return null;
  const { p, c } = viva;
  const agentes = await agentesElegibles(h);
  let soloLoopback = false;
  try {
    const u = new URL(p.redirectUri);
    soloLoopback = u.protocol === "http:";
  } catch {
    /* nada */
  }
  return {
    request: { id: p.id, expiresAt: p.expiresAt, requestedScopes: p.requestedScopes, resource: p.resource },
    client: {
      id: c.id,
      name: c.clientName,
      kind: c.kind,
      uri: c.clientUri,
      logoUri: c.logoUri,
      softwareId: c.softwareId,
      redirectUri: p.redirectUri,
      redirectHost: hostDe(p.redirectUri),
      // MCP 2026-07-28, CIMD security: avisar de las redirecciones solo-localhost
      localhostRedirect: soloLoopback,
      registeredAt: c.createdAt,
    },
    human: { id: h.id, role: h.role, canCreateAgent: h.role === "admin" },
    basicScopes: [...SCOPES_BASICOS],
    // Hay más agentes de los que caben en la pantalla: se elige igual por id.
    moreAgents: agentes.length > MAX_AGENTES_EN_PANTALLA,
    agents: agentes.slice(0, MAX_AGENTES_EN_PANTALLA).map((a) => {
      const scopes = ((a.scopes as string[] | null) ?? []).filter((s) => typeof s === "string");
      return {
        id: a.id,
        name: a.name,
        description: a.description,
        grantable: scopes.filter((s) => !esDenegacion(s) && humanoPuedeDelegar(h.role, s)),
        notDelegable: scopes.filter((s) => !esDenegacion(s) && !humanoPuedeDelegar(h.role, s)),
        denies: scopes.filter((s) => esDenegacion(s)),
        sponsorUserId: a.sponsorUserId ?? null,
      };
    }),
  };
}

export interface Decision {
  decision: "approve" | "deny";
  agentId?: string;
  newAgent?: { name: string; description?: string };
  scopes?: string[];
}

export async function decidirConsentimiento(
  idPeticion: string,
  h: Humano,
  d: Decision
): Promise<{ redirectTo: string } | null> {
  const viva = await peticionViva(idPeticion);
  if (!viva) return null;
  const { p, c } = viva;

  if (d.decision === "deny") {
    const [marcada] = await db
      .update(oauthAuthorizationRequests)
      .set({ decidedAt: ahora() })
      .where(and(eq(oauthAuthorizationRequests.id, p.id), isNull(oauthAuthorizationRequests.decidedAt)))
      .returning({ id: oauthAuthorizationRequests.id });
    if (!marcada) return null;
    return {
      redirectTo: urlDeVuelta(p.redirectUri, {
        error: "access_denied",
        error_description: "The user denied the request",
        state: p.state,
      }),
    };
  }
  if (d.decision !== "approve") throw new ErrorOAuth("invalid_request", "decision must be approve or deny", 422);

  let scopes: string[];
  try {
    scopes = normalizarScopes(d.scopes ?? []);
  } catch (e) {
    throw new ErrorOAuth("invalid_scope", (e as Error).message, 422);
  }
  if (scopes.some(esDenegacion)) throw new ErrorOAuth("invalid_scope", "A grant cannot contain deny ('!') scopes: denies come from the agent", 422);
  if (!concedeScope(scopes, "mcp:connect")) {
    throw new ErrorOAuth("invalid_scope", "The grant must include mcp:connect (or a scope that covers it)", 422);
  }
  const indelegables = scopes.filter((s) => !humanoPuedeDelegar(h.role, s));
  if (indelegables.length) {
    throw new ErrorOAuth("invalid_scope", `Your role cannot delegate: ${indelegables.join(", ")}`, 403);
  }

  const hecho = await db.transaction(async (tx) => {
    // Lo primero: la petición se decide UNA vez (dos clics, dos pestañas).
    const [marcada] = await tx
      .update(oauthAuthorizationRequests)
      .set({ decidedAt: ahora() })
      .where(and(eq(oauthAuthorizationRequests.id, p.id), isNull(oauthAuthorizationRequests.decidedAt)))
      .returning({ id: oauthAuthorizationRequests.id });
    if (!marcada) throw new ErrorOAuth("invalid_request", "This authorization request was already decided", 404);
    let agente: typeof agentIdentities.$inferSelect | undefined;
    if (d.newAgent) {
      if (h.role !== "admin") throw new ErrorOAuth("access_denied", "Only an admin can create an agent", 403);
      const nombre = texto(d.newAgent.name, 100);
      if (!nombre) throw new ErrorOAuth("invalid_request", "newAgent.name is required", 422);
      [agente] = await tx
        .insert(agentIdentities)
        .values({
          name: nombre,
          description: texto(d.newAgent.description, 500) ?? `Connected with OAuth from ${c.clientName}`,
          type: "oauth-client",
          scopes,
          sponsorUserId: h.id,
        })
        .returning();
    } else {
      agente = await agenteElegible(h, d.agentId);
      if (!agente) throw new ErrorOAuth("access_denied", "Agent not found or not yours to delegate", 403);
      // Solo ESTRECHA: cada scope tiene que estar ya cubierto por el agente.
      const delAgente = (agente.scopes as string[] | null) ?? [];
      const sobran = scopes.filter((s) => !concedeScope(delAgente, s));
      if (sobran.length) {
        throw new ErrorOAuth("invalid_scope", `The agent does not have: ${sobran.join(", ")}`, 403);
      }
    }
    const firmanteAntes = agente!.sponsorUserId ?? null;
    if (firmanteAntes !== h.id) {
      // Quien consiente FIRMA lo que el agente crea (fase F): pasa a ser su firmante.
      await tx
        .update(agentIdentities)
        .set({ sponsorUserId: h.id, updatedAt: ahora() })
        .where(eq(agentIdentities.id, agente!.id));
    }
    const [clave] = await tx
      .insert(agentApiKeys)
      .values({
        agentId: agente!.id,
        keyId: null,
        // Marcador: no es el hash de nada, nunca verifica (algorithm 'oauth')
        keyHash: `oauth:${randomUUID()}`,
        keyPrefix: "kitsuden_oat_",
        algorithm: "oauth",
        name: `OAuth · ${c.clientName}`.slice(0, 100),
      })
      .returning();
    const grantId = randomUUID();
    await tx.insert(oauthGrants).values({
      id: grantId,
      clientId: c.id,
      agentId: agente!.id,
      keyId: clave!.id,
      userId: h.id,
      scopes,
      resource: p.resource,
    });
    const codigo = randomBytes(32).toString("base64url");
    await tx.insert(oauthCodes).values({
      codeHash: hashDe(codigo),
      grantId,
      clientId: c.id,
      redirectUri: p.redirectUri,
      codeChallenge: p.codeChallenge,
      scopes,
      resource: p.resource,
      expiresAt: enSegundos(TTL_CODIGO_S),
    });
    return {
      redirectTo: urlDeVuelta(p.redirectUri, { code: codigo, state: p.state }),
      auditoria: { agentId: agente!.id, keyId: clave!.id, grantId, firmanteAntes },
    };
  });
  // Fuera de la transacción: la fila de auditoría apunta al agente (FK), que
  // puede ser nuevo y no existir hasta el COMMIT.
  logAgentAction({
    agentId: hecho.auditoria.agentId,
    keyId: hecho.auditoria.keyId,
    action: "config_change",
    resource: "oauth_grant",
    details: {
      grantId: hecho.auditoria.grantId,
      clientId: c.id,
      clientName: c.clientName,
      scopes,
      by: h.id,
      sponsorBefore: hecho.auditoria.firmanteAntes,
      sponsorAfter: h.id,
      createdAgent: !!d.newAgent,
    },
    success: true,
  });
  return { redirectTo: hecho.redirectTo };
}

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN (POST /api/oauth/token)
// ═══════════════════════════════════════════════════════════════════════════

export interface RespuestaDeToken {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

async function emitir(
  tx: Pick<typeof db, "insert">,
  datos: { grantId: string; familyId: string; clientId: string; scopes: string[]; resource: string; finDeFamilia: Date }
): Promise<RespuestaDeToken> {
  const acceso = nuevoToken("access");
  const refresco = nuevoToken("refresh");
  const vidaAcceso = ttlAcceso();
  const finRefresco = new Date(Math.min(Date.now() + ttlRefresco() * 1000, datos.finDeFamilia.getTime()));
  const comunes = {
    grantId: datos.grantId,
    familyId: datos.familyId,
    clientId: datos.clientId,
    scopes: datos.scopes,
    resource: datos.resource,
    familyExpiresAt: datos.finDeFamilia,
  };
  await tx.insert(oauthTokens).values([
    { id: randomUUID(), tokenHash: acceso.hash, kind: "access", expiresAt: enSegundos(vidaAcceso), ...comunes },
    { id: randomUUID(), tokenHash: refresco.hash, kind: "refresh", expiresAt: finRefresco, ...comunes },
  ]);
  return {
    access_token: acceso.token,
    token_type: "Bearer",
    expires_in: vidaAcceso,
    refresh_token: refresco.token,
    scope: datos.scopes.join(" "),
  };
}

/** Revoca TODO lo de una familia (reuso de un refresco o de un código). */
async function revocarFamilia(familyId: string): Promise<void> {
  await db
    .update(oauthTokens)
    .set({ revokedAt: ahora() })
    .where(and(eq(oauthTokens.familyId, familyId), isNull(oauthTokens.revokedAt)));
}

async function concesionViva(grantId: string) {
  const [g] = await db
    .select({ g: oauthGrants, k: agentApiKeys, a: agentIdentities, rol: authUsers.role })
    .from(oauthGrants)
    .innerJoin(agentApiKeys, eq(agentApiKeys.id, oauthGrants.keyId))
    .innerJoin(agentIdentities, eq(agentIdentities.id, oauthGrants.agentId))
    .leftJoin(authUsers, eq(authUsers.id, oauthGrants.userId))
    .where(eq(oauthGrants.id, grantId))
    .limit(1);
  if (!g || g.g.revokedAt || g.k.revokedAt || !g.a.isActive) return null;
  // The human who consented must still be able to delegate this (see tokens.ts).
  if (!concesionSigueDelegable(g.rol, g.g.scopes)) return null;
  return g;
}

export async function canjearCodigo(cliente: Cliente, p: Record<string, string>): Promise<RespuestaDeToken> {
  const codigo = p.code;
  if (!codigo) throw new ErrorOAuth("invalid_request", "code is required");
  const [fila] = await db.select().from(oauthCodes).where(eq(oauthCodes.codeHash, hashDe(codigo))).limit(1);
  if (!fila || fila.clientId !== cliente.id) throw new ErrorOAuth("invalid_grant", "Invalid authorization code");
  if (fila.usedAt) {
    // OAuth 2.1 §4.1.3: un código usado dos veces → se revoca lo que emitió.
    if (fila.familyId) await revocarFamilia(fila.familyId);
    logAuthFailure(null, "OAuth authorization code reused", undefined, undefined, { grantId: fila.grantId });
    throw new ErrorOAuth("invalid_grant", "Authorization code already used");
  }
  if (fila.expiresAt <= ahora()) throw new ErrorOAuth("invalid_grant", "Authorization code expired");
  if (p.redirect_uri !== fila.redirectUri) throw new ErrorOAuth("invalid_grant", "redirect_uri does not match the authorization request");
  if (!pkceCasa(p.code_verifier, fila.codeChallenge)) throw new ErrorOAuth("invalid_grant", "PKCE verification failed");
  const recurso = recursoPedido(p.resource);
  if (recurso && (!recurso.ok || recurso.recurso !== fila.resource)) {
    throw new ErrorOAuth("invalid_target", "resource does not match the authorization request");
  }
  const familyId = randomUUID();
  // Un solo canje, también con dos peticiones a la vez
  const [marcado] = await db
    .update(oauthCodes)
    .set({ usedAt: ahora(), familyId })
    .where(and(eq(oauthCodes.codeHash, fila.codeHash), isNull(oauthCodes.usedAt)))
    .returning({ codeHash: oauthCodes.codeHash });
  if (!marcado) throw new ErrorOAuth("invalid_grant", "Authorization code already used");
  const viva = await concesionViva(fila.grantId);
  if (!viva) throw new ErrorOAuth("invalid_grant", "The grant was revoked");
  await db.update(oauthClients).set({ lastUsedAt: ahora() }).where(eq(oauthClients.id, cliente.id));
  return emitir(db, {
    grantId: fila.grantId,
    familyId,
    clientId: cliente.id,
    scopes: fila.scopes,
    resource: fila.resource,
    finDeFamilia: enSegundos(ttlFamilia()),
  });
}

export async function refrescar(cliente: Cliente, p: Record<string, string>): Promise<RespuestaDeToken> {
  const token = p.refresh_token;
  if (!token) throw new ErrorOAuth("invalid_request", "refresh_token is required");
  const [fila] = await db
    .select()
    .from(oauthTokens)
    .where(and(eq(oauthTokens.tokenHash, hashDe(token)), eq(oauthTokens.kind, "refresh")))
    .limit(1);
  if (!fila || fila.clientId !== cliente.id) throw new ErrorOAuth("invalid_grant", "Invalid refresh token");
  if (fila.usedAt || fila.revokedAt) {
    // OAuth 2.1 §4.3.1: un refresco ya rotado vuelve → alguien lo robó. Fuera la familia.
    await revocarFamilia(fila.familyId);
    logAuthFailure(null, "OAuth refresh token reuse: family revoked", undefined, undefined, {
      grantId: fila.grantId,
      familyId: fila.familyId,
    });
    throw new ErrorOAuth("invalid_grant", "Refresh token already used: all tokens of this authorization were revoked");
  }
  if (fila.expiresAt <= ahora() || fila.familyExpiresAt <= ahora()) throw new ErrorOAuth("invalid_grant", "Refresh token expired");
  const recurso = recursoPedido(p.resource);
  if (recurso && (!recurso.ok || recurso.recurso !== fila.resource)) {
    throw new ErrorOAuth("invalid_target", "resource does not match the original authorization");
  }
  const pedidos = leerScopes(p.scope);
  if (pedidos === null) throw new ErrorOAuth("invalid_scope", "Malformed scope parameter");
  // Solo se puede ESTRECHAR (RFC 6749 §6): nada que no estuviera ya.
  const fuera = pedidos.filter((s) => !fila.scopes.includes(s));
  if (fuera.length) throw new ErrorOAuth("invalid_scope", `Cannot add scopes on refresh: ${fuera.join(", ")}`);
  const scopes = pedidos.length ? pedidos : fila.scopes;

  return db.transaction(async (tx) => {
    const [gastado] = await tx
      .update(oauthTokens)
      .set({ usedAt: ahora() })
      .where(and(eq(oauthTokens.id, fila.id), isNull(oauthTokens.usedAt), isNull(oauthTokens.revokedAt)))
      .returning({ id: oauthTokens.id });
    if (!gastado) throw new ErrorOAuth("invalid_grant", "Refresh token already used");
    const viva = await concesionViva(fila.grantId);
    if (!viva) throw new ErrorOAuth("invalid_grant", "The grant was revoked");
    return emitir(tx, {
      grantId: fila.grantId,
      familyId: fila.familyId,
      clientId: cliente.id,
      scopes,
      resource: fila.resource,
      finDeFamilia: fila.familyExpiresAt,
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// REVOCACIÓN (RFC 7009) y CONEXIONES (panel)
// ═══════════════════════════════════════════════════════════════════════════

/** RFC 7009: siempre «bien» (no se confirma si el token existía). */
export async function revocarToken(cliente: Cliente, token: string | undefined): Promise<void> {
  if (!token) throw new ErrorOAuth("invalid_request", "token is required");
  const [fila] = await db.select().from(oauthTokens).where(eq(oauthTokens.tokenHash, hashDe(token))).limit(1);
  if (!fila || fila.clientId !== cliente.id) return;
  if (fila.kind === "refresh") await revocarFamilia(fila.familyId);
  else await db.update(oauthTokens).set({ revokedAt: ahora() }).where(eq(oauthTokens.id, fila.id));
}

/** Corta una concesión: su clave, sus tokens y la propia concesión. */
export async function revocarConcesion(grantId: string, por: string, motivo = "revoked_by_user"): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [g] = await tx
      .update(oauthGrants)
      .set({ revokedAt: ahora(), revokedBy: por, revokedReason: motivo })
      .where(and(eq(oauthGrants.id, grantId), isNull(oauthGrants.revokedAt)))
      .returning();
    if (!g) return null;
    await tx
      .update(agentApiKeys)
      .set({ revokedAt: ahora(), revokedBy: por })
      .where(and(eq(agentApiKeys.id, g.keyId), isNull(agentApiKeys.revokedAt)));
    await tx
      .update(oauthTokens)
      .set({ revokedAt: ahora() })
      .where(and(eq(oauthTokens.grantId, g.id), isNull(oauthTokens.revokedAt)));
    return g;
  }).then((g) => {
    if (!g) return false;
    logAgentAction({
      agentId: g.agentId,
      keyId: g.keyId,
      action: "config_change",
      resource: "oauth_revoke",
      details: { grantId: g.id, clientId: g.clientId, by: por, reason: motivo },
      success: true,
    });
    return true;
  });
}

/** Las conexiones que ve un humano: un admin, todas; un editor, las que consintió él. */
export async function listarConexiones(h: Humano, opciones: { agentId?: string; incluirRevocadas?: boolean } = {}) {
  const filtros = [];
  if (h.role !== "admin") filtros.push(eq(oauthGrants.userId, h.id));
  if (opciones.agentId) filtros.push(eq(oauthGrants.agentId, opciones.agentId));
  if (!opciones.incluirRevocadas) filtros.push(isNull(oauthGrants.revokedAt));
  const filas = await db
    .select({ g: oauthGrants, c: oauthClients, a: { id: agentIdentities.id, name: agentIdentities.name }, k: { lastUsedAt: agentApiKeys.lastUsedAt } })
    .from(oauthGrants)
    .innerJoin(oauthClients, eq(oauthClients.id, oauthGrants.clientId))
    .innerJoin(agentIdentities, eq(agentIdentities.id, oauthGrants.agentId))
    .innerJoin(agentApiKeys, eq(agentApiKeys.id, oauthGrants.keyId))
    .where(filtros.length ? and(...filtros) : undefined)
    .orderBy(desc(oauthGrants.createdAt))
    .limit(500);
  const usuarios = [...new Set(filas.map((f) => f.g.userId))];
  const nombres = usuarios.length
    ? await db.select({ id: authUsers.id, name: authUsers.name, email: authUsers.email }).from(authUsers).where(inArray(authUsers.id, usuarios))
    : [];
  return filas.map(({ g, c, a, k }) => {
    const u = nombres.find((n) => n.id === g.userId);
    return {
      id: g.id,
      client: { id: c.id, name: c.clientName, kind: c.kind, uri: c.clientUri, logoUri: c.logoUri },
      agent: a,
      grantedBy: { id: g.userId, name: u?.name ?? null, email: u?.email ?? null },
      scopes: g.scopes,
      createdAt: g.createdAt,
      lastUsedAt: k.lastUsedAt,
      revokedAt: g.revokedAt,
      revokedReason: g.revokedReason,
    };
  });
}

/** ¿Puede este humano revocar esta concesión? (admin: todas; editor: las suyas). */
export async function concesionVisible(h: Humano, grantId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(grantId)) return false;
  const filtro = h.role === "admin" ? eq(oauthGrants.id, grantId) : and(eq(oauthGrants.id, grantId), eq(oauthGrants.userId, h.id));
  const [g] = await db.select({ id: oauthGrants.id }).from(oauthGrants).where(filtro).limit(1);
  return !!g;
}

// ═══════════════════════════════════════════════════════════════════════════
// BARRIDO de lo caducado y de los clientes abandonados
// ═══════════════════════════════════════════════════════════════════════════

export interface Barrido {
  peticiones: number;
  codigos: number;
  tokens: number;
  concesionesCaducadas: number;
  clientes: number;
}

const cuantas = (r: unknown) => (r as { rowCount?: number }).rowCount ?? 0;

/**
 * Lo que sobra:
 *   · peticiones y códigos caducados hace más de una hora;
 *   · tokens caducados hace más de un día (los refrescos se guardan hasta su
 *     caducidad: hacen falta para detectar un reuso);
 *   · concesiones sin ningún refresco vivo y sin uso en `ttlFamilia()` →
 *     revocadas por «stale» (su clave también);
 *   · clientes registrados que nadie consintió en 7 días, clientes cuyas
 *     concesiones están todas revocadas y sin uso en 90 días, y copias CIMD
 *     caducadas sin concesiones.
 */
export async function barrerOAuth(): Promise<Barrido> {
  const peticiones = cuantas(
    await db.execute(sql`DELETE FROM oauth_authorization_requests WHERE expires_at < now() - interval '1 hour'`)
  );
  const codigos = cuantas(await db.execute(sql`DELETE FROM oauth_codes WHERE expires_at < now() - interval '1 hour'`));
  const tokens = cuantas(
    await db.execute(sql`DELETE FROM oauth_tokens WHERE expires_at < now() - interval '1 day' OR family_expires_at < now() - interval '1 day'`)
  );
  const viejas = (await db.execute(sql`
    SELECT g.id FROM oauth_grants g
    JOIN agent_api_keys k ON k.id = g.key_id
    WHERE g.revoked_at IS NULL
      AND g.created_at < now() - make_interval(secs => ${ttlFamilia()})
      AND COALESCE(k.last_used_at, g.created_at) < now() - make_interval(secs => ${ttlFamilia()})
      AND NOT EXISTS (
        SELECT 1 FROM oauth_tokens t
        WHERE t.grant_id = g.id AND t.kind = 'refresh' AND t.revoked_at IS NULL AND t.used_at IS NULL AND t.expires_at > now()
      )
    LIMIT 500
  `)) as unknown as { rows: { id: string }[] };
  let concesionesCaducadas = 0;
  for (const { id } of viejas.rows) if (await revocarConcesion(id, "system", "stale")) concesionesCaducadas++;
  const clientes = cuantas(
    await db.execute(sql`
      DELETE FROM oauth_clients c
      WHERE (c.kind = 'dcr' AND c.created_at < now() - interval '7 days'
             AND NOT EXISTS (SELECT 1 FROM oauth_grants g WHERE g.client_id = c.id))
         OR (EXISTS (SELECT 1 FROM oauth_grants g WHERE g.client_id = c.id)
             AND NOT EXISTS (SELECT 1 FROM oauth_grants g WHERE g.client_id = c.id AND g.revoked_at IS NULL)
             AND COALESCE(c.last_used_at, c.created_at) < now() - interval '90 days')
         OR (c.kind = 'cimd' AND c.metadata_expires_at < now()
             AND NOT EXISTS (SELECT 1 FROM oauth_grants g WHERE g.client_id = c.id))
    `)
  );
  return { peticiones, codigos, tokens, concesionesCaducadas, clientes };
}

let barrido: ReturnType<typeof setInterval> | null = null;

export function arrancarBarridoDeOAuth(): void {
  if (barrido) return;
  barrido = setInterval(() => {
    barrerOAuth().catch(() => undefined);
  }, 60 * 60_000);
  (barrido as { unref?: () => void }).unref?.();
}

