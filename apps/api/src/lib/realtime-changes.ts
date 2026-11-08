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
  // El equipo lee cualquier dataset por REST (`legible` en crud.ts, `view` en
  // kon-datasets): aquí igual.
  if (esDelEquipo(user)) return true;
  return checkReadAccess(policy.policyJson, user);
}

/**
 * El equipo (admin, editor): la misma regla que `esStaff` de kon-datasets y
 * `esDelEquipo` de crud.ts. Ve todas las filas, sin `rlsRules` ni
 * `publishedOrOwn`.
 */
export function esDelEquipo(user: RLSUser | null): boolean {
  return !!user?.id && (user.role === "admin" || user.role === "editor");
}

/**
 * `publishedOrOwn` de rls-builder, en memoria: fuera del equipo solo se ven
 * las filas publicadas y las propias (`ownerId` o `createdById` es el usuario).
 * Sin id, solo las publicadas. Una fila sin `status` no cuenta como publicada.
 */
export function publicadaOPropia(fila: Record<string, unknown>, user: RLSUser | null): boolean {
  if (fila.status === "published") return true;
  const id = user?.id;
  if (!id) return false;
  const dueno = fila.ownerId ?? fila.owner_id;
  const autor = fila.createdById ?? fila.created_by_id;
  return (dueno != null && String(dueno) === id) || (autor != null && String(autor) === id);
}

/**
 * ¿Este suscriptor puede ver ESTA fila concreta?
 *
 * Es el equivalente en streaming de `buildDatasetWhere` + `publishedOrOwn`:
 * fuera del equipo, solo filas publicadas o propias, y que cumplan TODAS las
 * `rlsRules`. El equipo ve todo.
 *
 * Devuelve el evento (posiblemente recortado) o `null` si no debe entregarse.
 */
export function filterForClient(
  event: ChangeEvent,
  user: RLSUser | null,
  policy: ResourcePolicy | null
): ChangeEvent | null {
  if (!policy) return user?.role === "admin" ? event : null;
  if (esDelEquipo(user)) return event;
  if (!checkReadAccess(policy.policyJson, user)) return null;
  if (!event.row || typeof event.row !== "object") return null;

  // Los borradores ajenos no salen (REST tampoco los da: auditoría 2026-10-25).
  if (!filaVisible(event.row, user, policy)) return null;

  // La fila previa de un UPDATE también es contenido: si era un borrador
  // ajeno (o no cumple las reglas), se entrega el evento sin ella.
  if (event.previous && !filaVisible(event.previous, user, policy)) {
    const { previous: _previa, ...sinPrevia } = event;
    return sinPrevia;
  }
  return event;
}

/** `publishedOrOwn` y TODAS las `rlsRules`, como una lectura REST (AND). */
function filaVisible(
  fila: Record<string, unknown>,
  user: RLSUser | null,
  policy: ResourcePolicy
): boolean {
  if (!publicadaOPropia(fila, user)) return false;
  // Antes solo se miraba la del dueño: con `status eq published` el socket
  // entregaba también los borradores (auditoría 2026-10-25).
  const rules = policy.policyJson?.rlsRules ?? [];
  const data = (fila.data ?? {}) as Record<string, unknown>;
  for (const regla of rules) {
    if (!cumpleRegla(regla, fila, data, user, policy.ownerField)) return false;
  }
  return true;
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
