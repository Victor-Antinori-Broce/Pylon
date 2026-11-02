/**
 * Kitsuden — Realtime: emisión de cambios con autorización por suscriptor
 * ============================================================================
 *
 * La mitad que faltaba. `realtimeManager` ya tenía el transporte (WebSocket +
 * Valkey Pub/Sub, escuchando `table:*`), pero NADIE publicaba esos eventos y
 * `subscribeToChannel` aceptaba cualquier canal sin validar.
 *
 * Este módulo cierra ambos huecos:
 *
 *   emitChange()      → publica INSERT/UPDATE/DELETE al canal de la tabla
 *   canSubscribe()    → decide si un usuario puede escuchar un canal
 *   filterForClient() → recorta la fila a lo que ese usuario puede ver
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POR QUÉ LA AUTORIZACIÓN VA AQUÍ Y NO EN EL TRANSPORTE
 * ═══════════════════════════════════════════════════════════════════════════
 * Un fan-out ingenuo ("publico la fila a todos los suscritos al canal") filtra
 * datos entre tenants: es el MISMO bug que teníamos en GraphQL y en las entries
 * de datasets, pero en streaming. La regla es que el realtime NO puede tener su
 * propia ruta de autorización — debe reusar la que ya está probada:
 * `checkReadAccess` para la puerta y `rlsRules` para el filtro por fila.
 *
 * Por eso el evento se publica UNA vez y se evalúa POR SUSCRIPTOR antes de
 * entregarlo. Cuesta un poco más de CPU, pero es la única forma correcta.
 */

import { checkReadAccess, type PolicyJson, type RLSUser } from "./rls-builder";

// ── Tipos ────────────────────────────────────────────────────────────────────

export type ChangeType = "INSERT" | "UPDATE" | "DELETE";

export interface ChangeEvent {
  type: ChangeType;
  /** Tabla o slug del dataset afectado. */
  resource: string;
  /** Fila resultante (INSERT/UPDATE) o la borrada (DELETE). */
  row: Record<string, unknown>;
  /** Fila previa, solo en UPDATE — permite diffs en el cliente. */
  previous?: Record<string, unknown>;
  /** Momento del cambio (ISO). */
  at: string;
}

/** Política del recurso, resuelta por el emisor. */
export interface ResourcePolicy {
  policyJson: PolicyJson | null;
  /** Campo que identifica al dueño de la fila (default "ownerId"). */
  ownerField?: string;
}

// ── Canales ──────────────────────────────────────────────────────────────────

/**
 * Nombre del canal de una tabla. El prefijo `table:` es el que ya escucha
 * `realtimeManager` desde Valkey.
 */
export function channelFor(resource: string): string {
  return `table:${resource}`;
}

/** Extrae el recurso de un canal (`table:products` → `products`). */
export function resourceOf(channel: string): string | null {
  const match = /^table:([A-Za-z0-9_-]+)$/.exec(channel);
  return match ? match[1] : null;
}

// ── Autorización ─────────────────────────────────────────────────────────────

/**
 * ¿Puede este usuario suscribirse al canal?
 *
 * Reusa `checkReadAccess`, la MISMA puerta que usan las rutas REST y GraphQL:
 * sin policy → solo admin (deny-by-default); `authenticated` → logueado;
 * `public` → cualquiera.
 *
 * Un canal cuyo recurso no se reconoce se DENIEGA (no se asume público).
 */
export function canSubscribe(
  channel: string,
  user: RLSUser | null,
  policy: ResourcePolicy | null
): boolean {
  const resource = resourceOf(channel);
  if (!resource) return false; // canal con formato desconocido → denegar
  if (!policy) return user?.role === "admin"; // recurso sin política → admin
  return checkReadAccess(policy.policyJson, user);
}

/**
 * ¿Este suscriptor puede ver ESTA fila concreta?
 *
 * Es el equivalente en streaming de `buildDatasetWhere`: cuando la política
 * declara aislamiento por dueño, un usuario solo recibe los cambios de sus
 * propias filas. El admin ve todo.
 *
 * Devuelve la fila (posiblemente recortada) o `null` si no debe entregarse.
 */
export function filterForClient(
  event: ChangeEvent,
  user: RLSUser | null,
  policy: ResourcePolicy | null
): ChangeEvent | null {
  if (!policy) return user?.role === "admin" ? event : null;
  if (!checkReadAccess(policy.policyJson, user)) return null;
  if (user?.role === "admin") return event;

  // TODAS las reglas, como `buildDrizzleWhere` en una lectura REST (AND).
  // Antes solo se miraba la del dueño: con `status eq published` el socket
  // entregaba también los borradores (auditoría 2026-10-25).
  const rules = policy.policyJson?.rlsRules ?? [];
  const data = (event.row.data ?? {}) as Record<string, unknown>;
  for (const regla of rules) {
    if (!cumpleRegla(regla, event.row, data, user, policy.ownerField)) return null;
  }
  return event;
}

/**
 * Una regla de `rlsRules` sobre una fila, en memoria: la misma semántica que
 * `buildRuleCondition` de @kitsuden/shared (`data->>campo` como texto). Un
 * operador desconocido NO deja pasar (en SQL se ignora; aquí no se arriesga).
 */
function cumpleRegla(
  regla: { field?: string; operator?: string; value?: unknown },
  fila: Record<string, unknown>,
  data: Record<string, unknown>,
  user: RLSUser | null,
  ownerField?: string
): boolean {
  // Los dos marcadores de «el usuario actual»: `__USER_ID__` (el que entiende
  // rls-builder) y el histórico `{{current_user_id}}`.
  const delUsuario = regla.value === "__USER_ID__" || regla.value === "{{current_user_id}}";
  if (delUsuario && !user?.id) return false;
  const esperado = delUsuario ? user!.id : regla.value;
  // El ownerId puede venir en la columna o dentro del JSONB `data` (datasets)
  const campo = regla.field || (delUsuario ? ownerField || "ownerId" : "");
  if (!campo) return false;
  const crudo = fila[campo] ?? data[campo];
  const valor = crudo === undefined || crudo === null ? null : String(crudo);
  switch (regla.operator) {
    case "eq":
      return valor !== null && valor === String(esperado);
    case "neq":
      // En SQL `NULL <> x` no es verdadero: tampoco aquí
      return valor !== null && valor !== String(esperado);
    case "contains":
      return valor !== null && valor.includes(String(esperado));
    case "gt":
      return valor !== null && Number(valor) > Number(esperado);
    case "lt":
      return valor !== null && Number(valor) < Number(esperado);
    default:
      return false;
  }
}

// ── Emisión ──────────────────────────────────────────────────────────────────

/**
 * Publica un cambio al canal de su recurso.
 *
 * Se apoya en Valkey Pub/Sub para que el evento llegue a TODAS las instancias
 * de la API (no solo a la que atendió el request). Si Valkey no está
 * disponible, degrada en silencio: el realtime es una mejora, nunca puede
 * tumbar la escritura que lo originó.
 */
export async function emitChange(
  type: ChangeType,
  resource: string,
  row: Record<string, unknown>,
  previous?: Record<string, unknown>
): Promise<void> {
  const event: ChangeEvent = {
    type,
    resource,
    row,
    ...(previous ? { previous } : {}),
    at: new Date().toISOString(),
  };

  try {
    const { publish } = await import("./valkey");
    await publish(channelFor(resource), JSON.stringify(event));
  } catch {
    // Valkey caído → sin realtime, pero la operación de datos ya se completó.
  }
}

/** Azúcar para los tres tipos, para que los handlers se lean bien. */
export const changes = {
  inserted: (resource: string, row: Record<string, unknown>) => emitChange("INSERT", resource, row),
  updated: (resource: string, row: Record<string, unknown>, previous?: Record<string, unknown>) =>
    emitChange("UPDATE", resource, row, previous),
  deleted: (resource: string, row: Record<string, unknown>) => emitChange("DELETE", resource, row),
};
