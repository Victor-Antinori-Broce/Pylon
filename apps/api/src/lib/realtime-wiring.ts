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
import { dataSets } from "../db/schema-core";

import { events } from "./events";
import { setSubscriptionAuthorizer, setRowFilter, type RealtimeUser } from "./realtime";
import {
  canSubscribe,
  changes,
  filterForClient,
  resourceOf,
  type ChangeEvent,
  type ResourcePolicy,
} from "./realtime-changes";
import type { PolicyJson } from "./rls-builder";

/**
 * Caché de políticas por recurso. Resolver la política en CADA evento sería
 * una query por fila y por suscriptor; con el caché es una sola vez por
 * recurso. TTL corto para que un cambio de política se propague rápido.
 */
const POLICY_TTL_MS = 30_000;
const cache = new Map<string, { policy: ResourcePolicy | null; at: number }>();

async function resolvePolicy(resource: string): Promise<ResourcePolicy | null> {
  const hit = cache.get(resource);
  if (hit && Date.now() - hit.at < POLICY_TTL_MS) return hit.policy;

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

  cache.set(resource, { policy, at: Date.now() });
  return policy;
}

/** Invalida el caché de una política (llamar al editar un dataset). */
export function invalidateRealtimePolicy(resource?: string): void {
  if (resource) cache.delete(resource);
  else cache.clear();
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
    if (!resource) return user.role === "admin";
    const policy = await resolvePolicy(resource);
    return canSubscribe(
      channel,
      { id: user.id ?? undefined, role: user.role ?? undefined } as never,
      policy
    );
  });

  setRowFilter((channel: string, data: unknown, user: RealtimeUser) => {
    const resource = resourceOf(channel);
    if (!resource) return user.role === "admin" ? data : null;

    // El filtro corre en el camino caliente del broadcast, así que usa el
    // caché ya poblado por la suscripción (que siempre ocurre antes).
    const cached = cache.get(resource);
    const policy = cached?.policy ?? null;

    const event = data as ChangeEvent;
    if (!event || typeof event !== "object" || !("row" in event)) {
      // Mensaje que no es un ChangeEvent (formato legacy): solo admin.
      return user.role === "admin" ? data : null;
    }

    return filterForClient(
      event,
      { id: user.id ?? undefined, role: user.role ?? undefined } as never,
      policy
    );
  });

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
