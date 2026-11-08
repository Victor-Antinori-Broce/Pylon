/**
 * Kitsuden — Cableado del realtime con las políticas reales
 * ============================================================================
 *
 * Une las dos mitades: el transporte (`realtime.ts`, que no conoce políticas)
 * y las reglas de acceso (`realtime-changes.ts` + `rls-builder`).
 *
 * Se llama UNA vez al arrancar. Si no se llamara, el realtime queda en
 * deny-by-default (solo admins) — falla cerrado, nunca abierto.
 */

import { eq } from "drizzle-orm";

import { db } from "../db";
import { authSessions, authUsers, dataSets } from "../db/schema-core";

import { events } from "./events";
import {
  setChannelPreparer,
  setRowFilter,
  setSessionValidator,
  setSubscriptionAuthorizer,
  type RealtimeUser,
  type SesionActual,
} from "./realtime";
import {
  canSubscribe,
  changes,
  filterForClient,
  resourceOf,
  type ChangeEvent,
  type ResourcePolicy,
} from "./realtime-changes";
import type { PolicyJson, RLSUser } from "./rls-builder";

/**
 * Caché de políticas por recurso. Resolver la política en CADA evento sería
 * una query por fila y por suscriptor; con el caché es una sola vez por
 * recurso. TTL corto para que un cambio de política se propague rápido.
 *
 * El TTL se respeta TAMBIÉN en el filtro por fila: antes el filtro leía el
 * caché sin mirar la edad, y una política vieja valía para siempre mientras
 * nadie nuevo se suscribiera (auditoría de seguridad, F76). Ahora el
 * preparador del canal la refresca antes de repartir, y si aun así está
 * caducada el filtro la trata como ausente (solo admin).
 */
export const POLICY_TTL_MS = 30_000;
const cache = new Map<string, { policy: ResourcePolicy | null; at: number }>();
/** Una sola consulta por recurso aunque lleguen varios eventos a la vez. */
const enCurso = new Map<string, Promise<ResourcePolicy | null>>();

function fresca(hit: { at: number } | undefined): boolean {
  return !!hit && Date.now() - hit.at < POLICY_TTL_MS;
}

/** La política en caché si sigue fresca; si no, `null` (→ solo admin). */
export function cachedPolicy(resource: string): ResourcePolicy | null {
  const hit = cache.get(resource);
  return fresca(hit) ? hit!.policy : null;
}

/**
 * Usuario de las reglas: el anónimo es `null`, nunca `{ id: undefined }`.
 * Ese objeto es verdadero y pasaba `readAccess: "authenticated"` (F1).
 */
export function comoUsuarioRls(user: RealtimeUser): RLSUser {
  return user.id ? { id: user.id, role: user.role ?? undefined } : null;
}

function resolvePolicy(resource: string): Promise<ResourcePolicy | null> {
  const hit = cache.get(resource);
  if (fresca(hit)) return Promise.resolve(hit!.policy);
  const pendiente = enCurso.get(resource);
  if (pendiente) return pendiente;
  const consulta = leerPolitica(resource).finally(() => enCurso.delete(resource));
  enCurso.set(resource, consulta);
  return consulta;
}

/** Sube con cada invalidación: una consulta empezada antes no se guarda. */
let generacion = 0;
/** Los oyentes de `dataset:*` se registran una sola vez. */
let oyentesDeDatasets = false;

async function leerPolitica(resource: string): Promise<ResourcePolicy | null> {
  const generacionAlEmpezar = generacion;
  let policy: ResourcePolicy | null = null;
  try {
    // Los canales `table:<slug>` apuntan a datasets; su policyJson es la
    // misma fuente de verdad que usan REST y GraphQL.
    const [row] = await db
      .select({ policyJson: dataSets.policyJson })
      .from(dataSets)
      .where(eq(dataSets.slug, resource))
      .limit(1);

    if (row) policy = { policyJson: row.policyJson as PolicyJson | null };
  } catch {
    // Sin DB → sin política → el autorizador cae a admin-only.
    policy = null;
  }

  // Si se invalidó mientras se consultaba, lo leído puede ser la política de
  // ANTES del cambio: se devuelve, pero no se guarda.
  if (generacion === generacionAlEmpezar) cache.set(resource, { policy, at: Date.now() });
  return policy;
}

/**
 * Invalida el caché de una política. Lo llaman las rutas que editan o borran
 * un dataset (y el oyente de `dataset:updated`/`dataset:deleted` de abajo).
 */
export function invalidateRealtimePolicy(resource?: string): void {
  generacion++;
  if (resource) {
    cache.delete(resource);
    enCurso.delete(resource);
  } else {
    cache.clear();
    enCurso.clear();
  }
}

/**
 * La sesión por id, tal como está ahora en la base de datos: la usa el
 * realtime para revalidar los sockets abiertos (F15/F82). Lanza si la DB no
 * responde; el gestor cierra el socket en ese caso (falla cerrado).
 */
export async function leerSesionActual(sessionId: string): Promise<SesionActual | null> {
  const [fila] = await db
    .select({
      userId: authSessions.userId,
      expiresAt: authSessions.expiresAt,
      role: authUsers.role,
    })
    .from(authSessions)
    .innerJoin(authUsers, eq(authUsers.id, authSessions.userId))
    .where(eq(authSessions.id, sessionId))
    .limit(1);
  if (!fila) return null;
  return {
    userId: fila.userId,
    role: (fila.role as string | null) ?? null,
    expiresAt: new Date(fila.expiresAt).getTime(),
  };
}

/**
 * Conecta autorización y filtrado por fila al gestor de realtime.
 * Idempotente: llamarlo dos veces simplemente re-registra las funciones.
 */
export function wireRealtimeAuthorization(): void {
  setSubscriptionAuthorizer(async (channel: string, user: RealtimeUser) => {
    const resource = resourceOf(channel);
    // Canales que no son de tabla (entry:, content:) mantienen el
    // comportamiento conservador: solo admin hasta que tengan política propia.
    if (!resource) return user.role === "admin" && !!user.id;
    const policy = await resolvePolicy(resource);
    return canSubscribe(channel, comoUsuarioRls(user), policy);
  });

  // Antes de repartir un evento de `table:<slug>`, refrescar su política si
  // caducó o se invalidó. Con la política fresca no devuelve promesa y el
  // reparto sigue síncrono.
  setChannelPreparer((channel: string) => {
    const resource = resourceOf(channel);
    if (!resource || fresca(cache.get(resource))) return;
    return resolvePolicy(resource).then(() => undefined);
  });

  setRowFilter((channel: string, data: unknown, user: RealtimeUser) => {
    const resource = resourceOf(channel);
    if (!resource) return user.role === "admin" && user.id ? data : null;

    // El filtro corre en el camino caliente del broadcast: usa el caché que
    // el preparador acaba de refrescar, y solo si sigue fresco.
    const policy = cachedPolicy(resource);

    const event = data as ChangeEvent;
    if (!event || typeof event !== "object" || !("row" in event)) {
      // Mensaje que no es un ChangeEvent (formato legacy): solo admin.
      return user.role === "admin" && user.id ? data : null;
    }

    return filterForClient(event, comoUsuarioRls(user), policy);
  });

  setSessionValidator(leerSesionActual);

  // Editar o borrar un dataset invalida su política al momento, sin esperar
  // al TTL. Las rutas de kon-datasets solo emiten el evento (el id, no el
  // slug, al borrar; y el slug pudo cambiar al editar): se vacía todo el
  // caché, que es pequeño y se rehace en la siguiente consulta.
  if (!oyentesDeDatasets) {
    oyentesDeDatasets = true;
    events.on("dataset:updated", () => invalidateRealtimePolicy());
    events.on("dataset:deleted", () => invalidateRealtimePolicy());
  }

  console.log("  🔒 Realtime: autorización por canal + filtrado por fila activos");
}

// ═══════════════════════════════════════════════════════════════════════════
// PUENTE eventos internos → canales de realtime
//
// Los kons ya emiten eventos semánticos por el EventEmitter del host
// (`ctx.events.emit("entry:created", …)`). En vez de tocar cada mutación de
// cada kon, un único puente los traduce a eventos de cambio publicados en
// Valkey — así cualquier kon gana realtime sin escribir una línea extra, y
// el día que cambie el formato del canal se toca un solo sitio.
// ═══════════════════════════════════════════════════════════════════════════

/** Resuelve el slug de un dataset por id (los canales usan slug, no uuid). */
async function slugOf(datasetId: string): Promise<string | null> {
  try {
    const [row] = await db
      .select({ slug: dataSets.slug })
      .from(dataSets)
      .where(eq(dataSets.id, datasetId))
      .limit(1);
    return row?.slug ?? null;
  } catch {
    return null;
  }
}

export function bridgeEventsToRealtime(): void {
  events.on("entry:created", async (payload: unknown) => {
    const { datasetId, entries } = (payload ?? {}) as {
      datasetId?: string;
      entries?: Record<string, unknown>[];
    };
    if (!datasetId || !Array.isArray(entries)) return;
    const slug = await slugOf(datasetId);
    if (!slug) return;
    for (const row of entries) await changes.inserted(slug, row);
  });

  events.on("entry:updated", async (payload: unknown) => {
    const row = payload as Record<string, unknown> | undefined;
    const datasetId = row?.dataSetId as string | undefined;
    if (!row || !datasetId) return;
    const slug = await slugOf(datasetId);
    if (slug) await changes.updated(slug, row);
  });

  events.on("entry:deleted", async (payload: unknown) => {
    const row = payload as Record<string, unknown> | undefined;
    const datasetId = row?.dataSetId as string | undefined;
    if (!row || !datasetId) return;
    const slug = await slugOf(datasetId);
    if (slug) await changes.deleted(slug, row);
  });

  console.log("  📡 Realtime: puente de eventos internos → canales activo");
}
