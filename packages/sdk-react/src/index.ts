/**
 * @kitsuden/sdk-react — bindings de React
 * ============================================================================
 *
 * **El SDK core sigue siendo agnóstico.** Este paquete es UN binding entre
 * varios posibles; React es `peerDependency`, así que quien use Vue, Svelte o
 * nada no lo instala ni lo paga.
 *
 * Lo que había antes se llamaba `useXxx` pero **no era un hook**: devolvía
 * `{ url, fetcher }`, sin estado ni suscripción. Eso es peor que no usar el
 * prefijo — `react-hooks/rules-of-hooks` lo trata como hook y avisa donde no
 * toca, y cualquier dev de React espera estado y no lo encuentra.
 *
 * Aquí los hooks son hooks de verdad: tienen estado, cancelan al desmontar y
 * no actualizan componentes ya desmontados.
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface QueryState<T> {
  data: T | null;
  error: Error | null;
  /** Primera carga. */
  loading: boolean;
  /** Recarga con datos ya presentes — para no parpadear la interfaz. */
  refreshing: boolean;
  refetch: () => void;
}

export interface MutationState<TArgs extends unknown[], TResult> {
  mutate: (...args: TArgs) => Promise<TResult>;
  data: TResult | null;
  error: Error | null;
  pending: boolean;
  reset: () => void;
}

// ── Query ────────────────────────────────────────────────────────────────────

/**
 * Ejecuta una consulta asíncrona y expone su estado.
 *
 * Detalles que separan un hook usable de uno que produce bugs:
 *
 * - **`deps` gobierna la recarga.** Se pasa explícito en vez de intentar
 *   comparar la función: una función anónima cambia en cada render y provocaría
 *   un bucle infinito de peticiones.
 * - **No se actualiza tras desmontar.** Sin la guarda, cambiar de página con
 *   una petición en vuelo avisa por consola y, con StrictMode, dos veces.
 * - **Se descartan respuestas obsoletas.** Si llegan dos peticiones fuera de
 *   orden, gana la última PEDIDA, no la última en llegar — el bug clásico del
 *   buscador que muestra resultados de lo que ya no escribiste.
 */
export function useKitsudenQuery<T>(
  queryFn: () => Promise<T>,
  deps: readonly unknown[] = [],
  options: { enabled?: boolean } = {}
): QueryState<T> {
  const enabled = options.enabled ?? true;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);

  const mounted = useRef(true);
  /** Nº de petición: solo la más reciente puede escribir el estado. */
  const requestId = useRef(0);
  const fnRef = useRef(queryFn);
  fnRef.current = queryFn;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const id = ++requestId.current;
    const hadData = data !== null;
    if (hadData) setRefreshing(true);
    else setLoading(true);

    fnRef
      .current()
      .then((result) => {
        // Desmontado, o llegó una respuesta de una petición ya superada.
        if (!mounted.current || id !== requestId.current) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!mounted.current || id !== requestId.current) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!mounted.current || id !== requestId.current) return;
        setLoading(false);
        setRefreshing(false);
      });
    // NOTA para quien active `react-hooks/exhaustive-deps` en SU proyecto:
    // `data` queda fuera a propósito — solo decide loading vs refreshing, y
    // meterlo aquí volvería a disparar la consulta con cada respuesta, en
    // bucle. Este repo no tiene el plugin (el admin es Svelte), así que no se
    // pone un `eslint-disable` de una regla que aquí no existe: sería un error
    // de lint por sí mismo.
  }, [enabled, tick, ...deps]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  return { data, error, loading, refreshing, refetch };
}

// ── Mutación ─────────────────────────────────────────────────────────────────

/**
 * Envuelve una escritura.
 *
 * `mutate` **devuelve la promesa** además de guardar el estado: sin eso no se
 * puede encadenar (crear y luego navegar) ni capturar el error en el sitio de
 * la llamada, que es donde suele hacer falta.
 */
export function useKitsudenMutation<TArgs extends unknown[], TResult>(
  mutationFn: (...args: TArgs) => Promise<TResult>,
  options: { onSuccess?: (data: TResult) => void; onError?: (error: Error) => void } = {}
): MutationState<TArgs, TResult> {
  const [data, setData] = useState<TResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [pending, setPending] = useState(false);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fnRef = useRef(mutationFn);
  fnRef.current = mutationFn;
  const optsRef = useRef(options);
  optsRef.current = options;

  const mutate = useCallback(async (...args: TArgs): Promise<TResult> => {
    setPending(true);
    setError(null);
    try {
      const result = await fnRef.current(...args);
      if (mounted.current) setData(result);
      optsRef.current.onSuccess?.(result);
      return result;
    } catch (err) {
      const normalized = err instanceof Error ? err : new Error(String(err));
      if (mounted.current) setError(normalized);
      optsRef.current.onError?.(normalized);
      // Se relanza: quien llama debe poder capturarlo donde ocurre.
      throw normalized;
    } finally {
      if (mounted.current) setPending(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setPending(false);
  }, []);

  return { mutate, data, error, pending, reset };
}

// ── Nombres anteriores ───────────────────────────────────────────────────────

/**
 * @deprecated Nombre de cuando el proyecto se llamaba Usagibase. Usa
 * `useKitsudenQuery`. Se mantiene para no romper a quien ya lo importa.
 */
export const useUsagiQuery = useKitsudenQuery;

/** @deprecated Usa `useKitsudenMutation`. */
export const useUsagiMutation = useKitsudenMutation;

export * from "./synced-state.js";
export * from "./dominio-puro.js";
export * from "./dominio.js";
