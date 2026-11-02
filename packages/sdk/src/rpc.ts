/**
 * @kitsuden/sdk — Hono RPC Client (arquitectura KITSUDEN §7)
 *
 * SDK automático via Hono RPC: vincula el `AppType` exportado por el
 * servidor (apps/api/src/index.ts) con `hc<AppType>()` para obtener un
 * cliente con autocompletado estricto SIN generar archivos intermedios.
 *
 * `hono` es peerDependency: el consumidor debe tenerlo instalado
 * (import from "hono/client" pesa ~2KB, edge-ready).
 *
 * @example
 * ```typescript
 * import { createRpcClient } from '@kitsuden/sdk/rpc';
 * import type { KitsudenRpcType } from '@kitsuden/api'; // tipo RPC profundo (routers chained)
 * // import type { AppType } from '../../apps/api/src/index';
 *
 * const client = createRpcClient<KitsudenRpcType>('http://localhost:3001', {
 *   apiKey: 'kitsuden_agent_xxx',
 * });
 *
 * const res = await client.api.health.$get();
 * const health = await res.json(); // ← tipado end-to-end
 * ```
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { Hono } from "hono";
import { hc } from "hono/client";

export interface RpcClientOptions {
  /** Agent NHI token (kitsuden_agent_*) o API key legacy */
  apiKey?: string;
  /** Headers adicionales */
  headers?: Record<string, string>;
  /** fetch custom (para edge runtimes o testing) */
  fetch?: typeof fetch;
}

/**
 * Crea un cliente Hono RPC tipado contra el AppType del servidor.
 * Sin codegen, sin build steps: los tipos fluyen directo de Hono.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createRpcClient<T extends Hono<any, any, any>>(
  baseUrl: string,
  options: RpcClientOptions = {}
): ReturnType<typeof hc<T>> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.apiKey) headers["Authorization"] = `Bearer ${options.apiKey}`;

  return hc<T>(baseUrl, {
    headers,
    // hono/client acepta fetch custom; undefined usa el global
    fetch: options.fetch as never,
  });
}

export { hc } from "hono/client";
export type { InferRequestType, InferResponseType } from "hono/client";
