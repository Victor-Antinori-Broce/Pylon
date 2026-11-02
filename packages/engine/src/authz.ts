/**
 * Kitsuden — Authorization: Policies & Gates
 * ============================================================================
 *
 * La capa de autorización ERGONÓMICA que faltaba, encima de lo que ya tienes
 * (RLS nativo + scopes de agente + roles). Combina el DX de Laravel Policies con
 * el modelo de permisos de Django, sin sacrificar el "seguro por defecto".
 *
 *   - Gate:   permiso global no ligado a un recurso ("access-admin").
 *   - Policy: reglas por acción sobre un tipo de recurso ("post": view/update/…).
 *
 * Uso (definición):
 *   definePolicy("post", {
 *     view:   (u, post) => post.published || post.ownerId === u?.id,
 *     update: (u, post) => u?.role === "admin" || post.ownerId === u?.id,
 *   });
 *   defineGate("access-admin", (u) => u?.role === "admin");
 *
 * Uso (chequeo):
 *   if (!can(user, "update", post, "post")) throw AppError.forbidden();
 *   authorize(user, "update", post, "post");            // lanza si no puede
 *   app.patch("/posts/:id", requirePolicy("update", loadPost, "post"), h);
 *
 * DENY-BY-DEFAULT: si no hay policy/gate para la acción, se DENIEGA. Seguro por
 * defecto — nunca “permitir si no está definido”.
 */

import { concedeScope, denegacionQueCubre } from "@kitsuden/shared";
import type { Context, MiddlewareHandler } from "hono";

import { AppError } from "./errors";

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface AuthzUser {
  id?: string;
  role?: string;
  scopes?: string[];
  [key: string]: unknown;
}

/** Una regla recibe el usuario y (para policies) el recurso. Devuelve boolean. */
export type PolicyRule<R = unknown> = (
  user: AuthzUser | null,
  resource: R
) => boolean | Promise<boolean>;

export type GateRule = (user: AuthzUser | null) => boolean | Promise<boolean>;

// ── Registros globales ────────────────────────────────────────────────────────

const policies = new Map<string, Map<string, PolicyRule>>();
const gates = new Map<string, GateRule>();

/** Define (o extiende) la policy de un tipo de recurso. */
export function definePolicy<R = unknown>(
  resourceType: string,
  rules: Record<string, PolicyRule<R>>
): void {
  const existing = policies.get(resourceType) ?? new Map<string, PolicyRule>();
  for (const [action, rule] of Object.entries(rules)) {
    existing.set(action, rule as PolicyRule);
  }
  policies.set(resourceType, existing);
}

/** Define un gate global (permiso no ligado a recurso). */
export function defineGate(name: string, rule: GateRule): void {
  gates.set(name, rule);
}

/**
 * ¿Concede algún scope de agente el permiso `requerido`?
 *
 * Mismas reglas que `hasScope` de la API (`apps/api/src/services/agent-auth`),
 * escritas aquí porque el engine no puede importar de la app. Una prueba
 * compara las dos sobre la misma tabla de casos para que no se separen.
 *
 *   · `admin:*` o `admin`  → todo
 *   · exacto               → `esports:manage` concede `esports:manage`
 *   · `recurso:*`          → `esports:*` concede cualquier acción de esports
 *   · `*:accion`           → `*:view` concede ver cualquier recurso
 */
export function scopeConcede(scopes: readonly string[] | undefined, requerido: string): boolean {
  // Una sola regla para todo Kitsuden (comodines y denegaciones `!patrón`):
  // @kitsuden/shared, permisos-de-agente.ts.
  return concedeScope(scopes, requerido);
}

function concedidoPorScope(user: AuthzUser | null, requerido: string): boolean {
  return Array.isArray(user?.scopes) && scopeConcede(user!.scopes, requerido);
}

/** Limpia los registros (para tests). */
export function resetAuthz(): void {
  policies.clear();
  gates.clear();
}

// ── Evaluación ────────────────────────────────────────────────────────────────

/**
 * ¿Puede `user` ejecutar `action` sobre `resource` (de tipo `resourceType`)?
 * Si `resourceType`/`resource` se omiten, evalúa un GATE con nombre `action`.
 * Deny-by-default.
 */
export async function can(
  user: AuthzUser | null,
  action: string,
  resource?: unknown,
  resourceType?: string
): Promise<boolean> {
  /**
   * ── LOS SCOPES DE UN AGENTE AMPLIAN, NO INVENTAN ──────────────────────────
   *
   * Un agente se autentica con `Bearer kitsuden_agent_*` y llega aquí con
   * `role: "agent"` y sus `scopes`. Las reglas de los kons preguntan por ROL
   * (`admin`, `editor`), así que un agente no pasaba ninguna: con su token
   * podía leer, pero no generar un cuadro ni reportar un set. Kitsuden se
   * vendía como «AI-native» y un agente no podía operar su propio dominio.
   *
   * Ahora un scope concede la acción `recurso:accion` —`esports:manage`,
   * `tierlist:*`— pero SOLO si la policy define esa acción. Sin regla sigue
   * siendo denegar: un `admin:*` no puede abrir una acción que nadie escribió.
   *
   * Los humanos no llevan `scopes`, así que para ellos nada cambia.
   */
  /**
   * Una DENEGACIÓN del agente gana a la regla (arreglos de la fase D): una
   * policy que reconoce al agente como admin del kon (`esAdminEfectivo`, por
   * `crm:*`) no puede abrir lo que la clave niega (`!crm:delete`). Igual que en
   * las operaciones del SDK. Los humanos no llevan scopes: nada cambia.
   */
  if (Array.isArray(user?.scopes)) {
    const pedido = resourceType === undefined ? `gate:${action}` : `${resourceType}:${action}`;
    if (denegacionQueCubre(user!.scopes, [pedido])) return false;
  }
  // Gate global.
  if (resourceType === undefined) {
    const gate = gates.get(action);
    if (!gate) return false; // no definido → denegar
    if (await gate(user)) return true;
    return concedidoPorScope(user, `gate:${action}`);
  }
  // Policy de recurso.
  const policy = policies.get(resourceType);
  const rule = policy?.get(action);
  if (!rule) return false; // no definido → denegar
  if (await rule(user, resource)) return true;
  return concedidoPorScope(user, `${resourceType}:${action}`);
}

/** Igual que `can` pero lanza AppError.forbidden si no está permitido. */
export async function authorize(
  user: AuthzUser | null,
  action: string,
  resource?: unknown,
  resourceType?: string
): Promise<void> {
  const allowed = await can(user, action, resource, resourceType);
  if (!allowed) {
    // 401 si ni siquiera hay usuario; 403 si hay usuario pero sin permiso.
    if (!user) throw AppError.unauthenticated();
    throw AppError.forbidden(
      `No autorizado para '${action}'${resourceType ? ` sobre ${resourceType}` : ""}`
    );
  }
}

/** Introspección: acciones disponibles y su resultado para un usuario/recurso. */
export async function policyMap(
  user: AuthzUser | null,
  resourceType: string,
  resource?: unknown
): Promise<Record<string, boolean>> {
  const policy = policies.get(resourceType);
  if (!policy) return {};
  const out: Record<string, boolean> = {};
  for (const action of policy.keys()) {
    out[action] = await can(user, action, resource, resourceType);
  }
  return out;
}

// ── Middlewares Hono ──────────────────────────────────────────────────────────

/** Requiere un gate global. */
export function requireGate(name: string): MiddlewareHandler {
  return async (c, next) => {
    const user = (c.get("user") ?? null) as AuthzUser | null;
    await authorize(user, name);
    await next();
  };
}

/**
 * Requiere una policy de recurso. `loadResource` obtiene el recurso desde el
 * contexto (p.ej. por :id); si devuelve null → 404.
 */
export function requirePolicy<R>(
  action: string,
  loadResource: (c: Context) => Promise<R | null> | R | null,
  resourceType: string
): MiddlewareHandler {
  return async (c, next) => {
    const user = (c.get("user") ?? null) as AuthzUser | null;
    const resource = await loadResource(c);
    if (resource === null || resource === undefined) {
      throw AppError.notFound(`${resourceType} no encontrado`);
    }
    await authorize(user, action, resource, resourceType);
    // Deja el recurso ya cargado disponible para el handler (evita doble fetch).
    c.set("resource" as never, resource as never);
    await next();
  };
}
