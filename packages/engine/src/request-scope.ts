/**
 * Kitsuden — Request-Scoped DI (la deuda real vs NestJS)
 * ============================================================================
 *
 * NestJS ofrece "request-scoped providers": servicios que viven una sola request.
 * En Kitsuden los servicios request-scoped de facto son el `tx` de RLS y el
 * contexto de traza. Esto los formaliza con AsyncLocalStorage, SIN el peso de
 * decoradores ni reflexión.
 *
 * El gran beneficio de DX + seguridad: `repo(tabla)` DENTRO de un request usa
 * automáticamente el `tx` de withTransactionalRLS (RLS aplicado) sin que tengas
 * que pasar `{ db: c.get("tx") }` a mano. Fuera de un request, usa la db global.
 *
 *   app.get("/posts", async (c) => {
 *     const posts = await repo(blogPosts).all();  // ← ya corre bajo RLS
 *     return c.json(posts);
 *   });
 */

import { AsyncLocalStorage } from "node:async_hooks";

// El scope es MUTABLE: se crea vacío al inicio del request y middlewares
// posteriores (p.ej. withTransactionalRLS) lo enriquecen (setean tx).
export interface RequestScope {
  /** Transacción RLS activa, si withTransactionalRLS la estableció. */
  tx?: unknown;
  /** Usuario autenticado del request (opcional). */
  user?: { id?: string; role?: string; scopes?: string[]; keyId?: string } | null;
  /** Correlación con la traza. */
  requestId?: string;
  traceId?: string;
  /** Bag extensible para servicios request-scoped propios. */
  services?: Record<string, unknown>;
}

const als = new AsyncLocalStorage<RequestScope>();

/**
 * Clave de `services` donde la transacción de la petición deja sus medidas
 * (consultas, ms en la base, filas escritas). La lee la «caja de cristal»
 * (caja-de-cristal.ts); vive aquí para no crear un ciclo con rls-peticion.
 */
export const SERVICIO_MEDIDAS_DB = "kitsuden.medidasDb";

/** Ejecuta `fn` con un scope de request activo. */
export function runInRequestScope<T>(scope: RequestScope, fn: () => T): T {
  return als.run(scope, fn);
}

/** Devuelve el scope activo (o undefined fuera de un request). */
export function useRequest(): RequestScope | undefined {
  return als.getStore();
}

/** Setea el `tx` de RLS en el scope activo (lo llama withTransactionalRLS). */
export function setRequestTx(tx: unknown): void {
  const scope = als.getStore();
  if (scope) scope.tx = tx;
}

/** Limpia el `tx` del scope (al cerrar la transacción). */
export function clearRequestTx(): void {
  const scope = als.getStore();
  if (scope) scope.tx = undefined;
}

/** Usuario del request activo (o null). */
export function useUser(): RequestScope["user"] {
  return als.getStore()?.user ?? null;
}

/**
 * Registra un servicio request-scoped bajo una clave (patrón provider de Nest,
 * pero explícito). Se instancia una vez por request via la factory.
 */
export function provideRequestService<T>(key: string, factory: () => T): T {
  const scope = als.getStore();
  if (!scope) return factory(); // fuera de request → instancia efímera
  scope.services ??= {};
  if (!(key in scope.services)) {
    scope.services[key] = factory();
  }
  return scope.services[key] as T;
}

/**
 * Resuelve el executor de base de datos correcto: el `tx` de RLS si estamos
 * dentro de un request transaccional, o `fallback` (la db global) si no.
 * Lo usa `repo()` para aplicar RLS automáticamente.
 */
export function resolveExecutor<T>(fallback: T): T {
  const scope = als.getStore();
  return (scope?.tx as T) ?? fallback;
}
