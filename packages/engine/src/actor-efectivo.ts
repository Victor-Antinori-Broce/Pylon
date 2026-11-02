/**
 * El ACTOR EFECTIVO — que las políticas de los kons reconozcan a los agentes
 * ============================================================================
 *
 * ── EL FALLO (fase D, pruebas e2e por HTTP, 2026-10-25) ────────────────────
 *
 * Un agente llega a los kons con `role: "agent"` y sus `scopes`. Las políticas
 * y la RLS de los kons preguntaban por el ROL humano (`role === "admin"`), así
 * que un agente con `admin`:
 *
 *   · en dms, members y booking recibía 200 con la lista VACÍA (la RLS no lo
 *     conocía);
 *   · en newsletter, 403 «Requiere administrador»;
 *   · con `crm:*`, la guía prometía «todo el kon» y no entraba en ninguna ruta
 *     legada.
 *
 * Se parcheó kon a kon (conta 0003, ecommerce 0004, blog, builder), cada uno
 * con su copia de la regla de scopes en TypeScript o en plpgsql. Esto es la
 * regla UNA vez, para todos:
 *
 *   esAdminEfectivo(user, kon)  admin humano, o agente que abre el kon ENTERO
 *                               (`admin`, `<kon>:*`, `kon:<kon>:*`; ver
 *                               `abreKonEntero` en @kitsuden/shared)
 *   esStaffEfectivo(user, kon)  lo anterior, o admin/editor humano
 *   agentePuede(user, scope)    un agente al que sus scopes conceden `scope`
 *   agentePuedeEnKon(user, kon, scope)  lo mismo dentro de un kon (lo abre el
 *                               kon entero; lo cierra `!<kon>:*`)
 *   actorEfectivo(user, kon)    todo junto, para quien prefiera un objeto
 *
 * Y en la base, las mismas preguntas con el mismo nombre (fichero del núcleo
 * `apps/api/src/db/funciones-de-agente.sql`, que se aplica ANTES de las
 * migraciones de los kons): `kitsuden_admin_efectivo('<kon>')`,
 * `kitsuden_staff_efectivo('<kon>')`, `kitsuden_agente_puede('<scope>')`,
 * `kitsuden_agente_puede_en_kon('<kon>', '<scope>')`.
 * Un test compara las dos con la misma tabla de casos.
 *
 * `kon` es el nombre CORTO (`crm`, `dms`, `members`), el de los scopes.
 *
 * Sin `kon`, `esAdminEfectivo` solo reconoce el scope `admin`: un `crm:*` no es
 * administrador de nada más que del CRM.
 */

import { abreKonEntero, concedeScope, denegacionQueCubre } from "@kitsuden/shared";

/**
 * Lo mínimo que se mira de quien pregunta. Estructural (no `AuthzUser`) para
 * que valga el usuario de cualquier kon: `UsuarioDms`, `{ role?: unknown }`…
 */
export type QuienPregunta = { id?: unknown; role?: unknown; scopes?: unknown } | null | undefined;
type Quien = QuienPregunta;

const ROLES_DE_STAFF = new Set(["admin", "editor"]);

/** ¿Es un agente (clave `kitsuden_agent_*`), con su lista de scopes? */
export function esAgente(user: Quien): user is NonNullable<Quien> & { role: "agent"; scopes: string[] } {
  return !!user && user.role === "agent" && Array.isArray(user.scopes);
}

/**
 * ¿Le conceden sus scopes al AGENTE `requerido`? (Un humano: no; los humanos
 * deciden por rol.) Con varios: si una denegación cubre CUALQUIERA de ellos,
 * no; si no, basta con que uno se conceda. Es la forma de «cualquiera de estos
 * permisos deja ver el borrador»: `!kon:blog:*` lo cierra aunque traiga `admin`.
 */
export function agentePuede(user: Quien, requerido: string | readonly string[]): boolean {
  if (!esAgente(user)) return false;
  const lista = typeof requerido === "string" ? [requerido] : requerido;
  if (lista.length === 0) return false;
  if (denegacionQueCubre(user.scopes, lista)) return false;
  return lista.some((r) => concedeScope(user.scopes, r));
}

/**
 * Un permiso suelto DENTRO de un kon: el agente puede `requerido`
 * (`member:view`) o abre el kon entero, y ninguna denegación cierra ni la
 * acción ni el kon entero (`!members:*` cierra también `member:view`, que no
 * empieza por `members:`). En SQL: `kitsuden_agente_puede_en_kon`.
 */
export function agentePuedeEnKon(user: Quien, kon: string, requerido: string): boolean {
  if (!esAgente(user) || !kon) return false;
  if (denegacionQueCubre(user.scopes, [`${kon}:*`, `kon:${kon}:*`, requerido])) return false;
  return abreKonEntero(user.scopes, kon) || concedeScope(user.scopes, requerido);
}

/** Admin humano, o agente que abre ESTE kon entero (o con `admin` si no se dice kon). */
export function esAdminEfectivo(user: Quien, kon?: string): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (!esAgente(user)) return false;
  if (kon) return abreKonEntero(user.scopes, kon);
  return !denegacionQueCubre(user.scopes, ["admin"]) &&
    user.scopes.some((s) => s === "admin" || s === "admin:*");
}

/** Admin o editor humano, o agente que abre este kon entero. */
export function esStaffEfectivo(user: Quien, kon?: string): boolean {
  if (!user) return false;
  if (typeof user.role === "string" && ROLES_DE_STAFF.has(user.role)) return true;
  return esAdminEfectivo(user, kon);
}

export interface ActorEfectivo {
  /** Id de la cuenta o del agente; `null` si nadie. */
  id: string | null;
  esAgente: boolean;
  esAdmin: boolean;
  esStaff: boolean;
}

/** Las preguntas de arriba de una vez (para quien las haga varias). */
export function actorEfectivo(user: Quien, kon?: string): ActorEfectivo {
  return {
    id: typeof user?.id === "string" && user.id.length > 0 ? user.id : null,
    esAgente: esAgente(user),
    esAdmin: esAdminEfectivo(user, kon),
    esStaff: esStaffEfectivo(user, kon),
  };
}
