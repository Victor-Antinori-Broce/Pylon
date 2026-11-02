/**
 * Kitsuden — La «caja de cristal» de una petición (kitsuden2.md, C7)
 * ============================================================================
 *
 * Lo que el host necesita para escribir la traza de cada petición sin
 * consultas extra:
 *
 *   · MEDIDAS de la transacción de la petición: cuántas consultas, cuánto
 *     tiempo en la base y cuántas filas tocaron las escrituras. Las anota la
 *     conexión perezosa de `rls-peticion.ts` al pasar cada consulta.
 *   · BLOQUEOS: una escritura (`UPDATE`/`DELETE … WHERE id`) que no tocó
 *     ninguna fila. Hay tres muros —el permiso de la operación, el filtro de
 *     dueño del handler y la RLS— y el filtro del handler actúa ANTES que la
 *     RLS, así que «filas filtradas por RLS» saldría casi siempre 0. Lo útil
 *     es «bloqueado por el filtro de dueño o por la RLS», y se mide así:
 *     0 filas → un `SELECT EXISTS` por id COMO EL SISTEMA para distinguir
 *     «no existe» de «no es tuyo».
 *
 * El resultado va SOLO a la traza (auditoría). Quien pregunta recibe lo mismo
 * en los dos casos (el 404 de siempre): devolverlo sería un oráculo de
 * existencia. Las lecturas NO se miden por defecto: contar filas «antes de la
 * RLS» exigiría SQL dinámico con privilegios elevados (ver kitsuden2.md C7).
 */

import { SERVICIO_MEDIDAS_DB, useRequest } from "./request-scope";
import { comoSistema } from "./rls-peticion";

export interface MedidasDb {
  /** Consultas que fueron a la base en la transacción de la petición. */
  consultas: number;
  /** Milisegundos esperando a la base (suma de las consultas). */
  ms: number;
  /** Filas que tocaron INSERT/UPDATE/DELETE. */
  filas: number;
}

export interface BloqueoAnotado {
  tabla: string;
  operacion: "update" | "delete";
  /** `no_es_tuyo` = existe, pero el filtro de dueño o la RLS lo apartaron. */
  motivo: "no_es_tuyo" | "no_existe";
}

const CLAVE_MEDIDAS = SERVICIO_MEDIDAS_DB;
const CLAVE_BLOQUEOS = "kitsuden.bloqueos";

function servicios(): Record<string, unknown> | null {
  const scope = useRequest();
  if (!scope) return null;
  scope.services ??= {};
  return scope.services;
}

/** Las medidas de la petición en curso (las crea vacías la primera vez). */
export function medidasDeLaPeticion(): MedidasDb | null {
  const s = servicios();
  if (!s) return null;
  return (s[CLAVE_MEDIDAS] ??= { consultas: 0, ms: 0, filas: 0 }) as MedidasDb;
}

export function bloqueosDeLaPeticion(): BloqueoAnotado[] {
  return (servicios()?.[CLAVE_BLOQUEOS] as BloqueoAnotado[] | undefined) ?? [];
}

export function anotarBloqueo(bloqueo: BloqueoAnotado): void {
  const s = servicios();
  if (!s) return;
  ((s[CLAVE_BLOQUEOS] ??= []) as BloqueoAnotado[]).push(bloqueo);
}

/**
 * Para un handler que hizo su propio `UPDATE/DELETE … WHERE id` y no tocó
 * nada: averigua (como el sistema) si la fila existe y lo anota. Solo en una
 * petición de alguien (el sistema no tiene a quién bloquear). No cambia lo
 * que el handler responda.
 */
export async function comprobarBloqueo(
  tabla: string,
  operacion: BloqueoAnotado["operacion"],
  existe: () => Promise<boolean>
): Promise<void> {
  const scope = useRequest();
  if (!scope?.user?.id) return;
  try {
    const hay = await comoSistema(existe);
    anotarBloqueo({ tabla, operacion, motivo: hay ? "no_es_tuyo" : "no_existe" });
  } catch {
    // La traza es un extra: nunca rompe la petición.
  }
}
