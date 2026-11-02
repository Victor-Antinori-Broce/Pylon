/**
 * OAuth para MCP — lo que necesita la AUTENTICACIÓN (services/agent-auth.ts)
 * ============================================================================
 *
 * Sin importar agent-auth (lo importa él a este): generar tokens, buscarlos
 * por su hash y la regla de los scopes efectivos.
 *
 * ── SCOPES EFECTIVOS: el consentimiento solo ESTRECHA ──────────────────────
 *
 *   efectivos = las denegaciones (`!patrón`) del agente HOY
 *             + cada scope de la concesión que el agente HOY sigue cubriendo
 *
 * Quitar un scope al agente lo quita de sus conexiones OAuth en la siguiente
 * petición; añadírselo NO lo añade (hace falta consentir otra vez). Una
 * denegación del agente gana siempre (permisos-de-agente.ts).
 */

import { randomBytes } from "crypto";

import { concedeScope, esDenegacion, partirScopes } from "@kitsuden/shared";
import { and, eq } from "drizzle-orm";

import { db } from "../../db";
import { agentApiKeys, agentIdentities, authUsers } from "../../db/schema-core";
import { oauthGrants, oauthTokens } from "../../db/schema-oauth";

import { PREFIJO_ACCESO, PREFIJO_REFRESCO, RUTA_MCP, recursoMcp } from "./config";
import { hashDe } from "./uris";

export function esTokenDeAccesoOAuth(token: string): boolean {
  return token.startsWith(PREFIJO_ACCESO);
}

export function esTokenDeRefrescoOAuth(token: string): boolean {
  return token.startsWith(PREFIJO_REFRESCO);
}

export function nuevoToken(tipo: "access" | "refresh"): { token: string; hash: string } {
  const token = `${tipo === "access" ? PREFIJO_ACCESO : PREFIJO_REFRESCO}${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashDe(token) };
}

export function scopesEfectivos(delAgente: readonly string[] | null | undefined, deLaConcesion: readonly string[]): string[] {
  const agente = (delAgente ?? []).filter((s): s is string => typeof s === "string");
  const { denegaciones } = partirScopes(agente);
  const concedidos = deLaConcesion.filter((s) => !esDenegacion(s) && concedeScope(agente, s));
  return [...denegaciones.map((d) => `!${d}`), ...concedidos];
}

/** ¿Es esta ruta el recurso para el que se emiten los tokens? */
export function rutaDelRecurso(ruta: string | undefined): boolean {
  if (!ruta) return false;
  const limpia = ruta.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  return limpia === RUTA_MCP || limpia.startsWith(`${RUTA_MCP}/`);
}

/**
 * Lo que un humano NO puede delegar aunque el agente lo tenga: un `editor`
 * no da `admin`, `admin:*` ni `mcp:admin` (ni un patrón que los cubra), que
 * son más de lo que él puede hacer. Un `admin` delega todo lo del agente.
 */
const SOLO_ADMIN_DELEGA = ["admin", "admin:*", "mcp:admin"];

export function humanoPuedeDelegar(rol: string, scope: string): boolean {
  if (rol === "admin") return true;
  if (rol !== "editor") return false;
  return !SOLO_ADMIN_DELEGA.some((f) => scope === f || concedeScope([scope], f));
}

/**
 * A grant lasts as long as its human can still give it: every token check reads
 * the role of whoever consented. Deleted, moved out of the team, or an editor
 * holding a scope only an admin can delegate (a demoted admin): dead.
 */
export function concesionSigueDelegable(
  rolDelHumano: string | null | undefined,
  scopes: readonly string[] | null | undefined
): boolean {
  if (rolDelHumano !== "admin" && rolDelHumano !== "editor") return false;
  return (scopes ?? []).every((s) => humanoPuedeDelegar(rolDelHumano, s));
}

export type TokenDeAcceso =
  | {
      ok: true;
      tokenId: string;
      grantId: string;
      clientId: string;
      scopes: string[];
      agente: typeof agentIdentities.$inferSelect;
      clave: typeof agentApiKeys.$inferSelect;
    }
  | { ok: false; code: string; error: string; agentId?: string | null };

/**
 * Busca un token de acceso y comprueba TODO lo que lo invalida: que exista,
 * que no esté revocado ni caducado, que la audiencia sea este recurso (y la
 * petición vaya a él), y que la concesión, su clave y el agente sigan vivos.
 * Se lee de la base en cada petición: revocar vale en la siguiente.
 */
export async function buscarTokenDeAcceso(token: string, ruta: string | undefined): Promise<TokenDeAcceso> {
  const [fila] = await db
    .select({ t: oauthTokens, g: oauthGrants, k: agentApiKeys, a: agentIdentities, rol: authUsers.role })
    .from(oauthTokens)
    .innerJoin(oauthGrants, eq(oauthGrants.id, oauthTokens.grantId))
    .innerJoin(agentApiKeys, eq(agentApiKeys.id, oauthGrants.keyId))
    .innerJoin(agentIdentities, eq(agentIdentities.id, oauthGrants.agentId))
    .leftJoin(authUsers, eq(authUsers.id, oauthGrants.userId))
    .where(and(eq(oauthTokens.tokenHash, hashDe(token)), eq(oauthTokens.kind, "access")))
    .limit(1);
  if (!fila) return { ok: false, code: "INVALID_TOKEN", error: "Invalid OAuth access token", agentId: null };
  const { t, g, k, a, rol } = fila;
  const ahora = Date.now();
  if (t.revokedAt || g.revokedAt) return { ok: false, code: "TOKEN_REVOKED", error: "OAuth access token revoked", agentId: a.id };
  if (!concesionSigueDelegable(rol, t.scopes)) {
    return { ok: false, code: "TOKEN_REVOKED", error: "The human who authorized this connection can no longer delegate it", agentId: a.id };
  }
  if (t.expiresAt.getTime() <= ahora) return { ok: false, code: "TOKEN_EXPIRED", error: "OAuth access token expired", agentId: a.id };
  // RFC 8707 / MCP: el token se emitió para ESTE recurso y solo vale en él.
  if (t.resource !== recursoMcp() || !rutaDelRecurso(ruta)) {
    return { ok: false, code: "INVALID_AUDIENCE", error: "OAuth access token was not issued for this resource", agentId: a.id };
  }
  if (k.revokedAt) return { ok: false, code: "KEY_REVOKED", error: "OAuth connection revoked", agentId: a.id };
  if (k.expiresAt && k.expiresAt.getTime() <= ahora) {
    return { ok: false, code: "INVALID_KEY", error: "OAuth connection expired", agentId: a.id };
  }
  return {
    ok: true,
    tokenId: t.id,
    grantId: g.id,
    clientId: g.clientId,
    scopes: scopesEfectivos(a.scopes as string[] | null, t.scopes),
    agente: a,
    clave: k,
  };
}

/** Para aprobaciones (lib/aprobaciones.ts → agent-auth): la concesión detrás de una clave OAuth. */
export async function concesionDeClave(keyId: string): Promise<{ scopes: string[]; revocada: boolean } | null> {
  const [g] = await db
    .select({ scopes: oauthGrants.scopes, revokedAt: oauthGrants.revokedAt, rol: authUsers.role })
    .from(oauthGrants)
    .leftJoin(authUsers, eq(authUsers.id, oauthGrants.userId))
    .where(eq(oauthGrants.keyId, keyId))
    .limit(1);
  return g ? { scopes: g.scopes ?? [], revocada: !!g.revokedAt || !concesionSigueDelegable(g.rol, g.scopes) } : null;
}
