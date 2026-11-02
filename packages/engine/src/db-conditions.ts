/**
 * Condiciones para operaciones que ESCRIBEN
 * ============================================================================
 *
 * Un solo sitio donde se construye el WHERE de un UPDATE, un DELETE o un
 * UPSERT a partir de un `id` y/o un objeto `where`. Existe porque las dos
 * implementaciones de batch lo hacían por su cuenta y cada una traía su propio
 * agujero.
 *
 * Las tres reglas, en orden de gravedad:
 *
 *   1. SIN CONDICIONES SE LANZA. Un `where: {}` dejaba la sentencia sin WHERE,
 *      y un UPDATE o un DELETE sin WHERE alcanza la TABLA ENTERA. No es un
 *      caso raro: `{}` es lo que llega cuando un cliente construye el filtro
 *      dinámicamente y no encuentra nada que poner.
 *
 *   2. Las condiciones se ACUMULAN y `.where()` se llama una vez. En Drizzle,
 *      encadenar dos `.where()` no las suma: la segunda sustituye a la
 *      primera. Un `where` de dos campos filtraba solo por el último, y
 *      combinado con un `id` se perdía el id.
 *
 *   3. Un campo que no existe en la tabla LANZA en vez de ignorarse. Ignorarlo
 *      ensancha el alcance de la escritura sin que nadie se entere.
 */

import { and, eq, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

export function condicionDeEscritura(
  table: PgTable,
  id: unknown,
  where: Record<string, unknown> | undefined,
  operacion: string
): SQL {
  const condiciones: SQL[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- acceso a columnas por nombre en tiempo de ejecución
  const columnas = table as any;

  if (id !== undefined && id !== null && id !== "") {
    if (!columnas.id) {
      throw new Error(`${operacion} recibió un id pero la tabla no tiene columna 'id'`);
    }
    condiciones.push(eq(columnas.id, id));
  }

  for (const [campo, valor] of Object.entries(where ?? {})) {
    if (!columnas[campo]) {
      throw new Error(`${operacion}: la tabla no tiene la columna '${campo}'`);
    }
    condiciones.push(eq(columnas[campo], valor));
  }

  if (condiciones.length === 0) {
    throw new Error(`${operacion} necesita un id o un where con al menos un campo`);
  }

  return condiciones.length === 1 ? condiciones[0]! : and(...condiciones)!;
}

/**
 * Igualdad contra una columna ENUM con un valor que llega de FUERA.
 * ============================================================================
 *
 * El patrón que sustituye estaba repetido 25 veces en 15 archivos:
 *
 *     const status = c.req.query("status");
 *     if (status) conditions.push(eq(tabla.status, status as any));
 *
 * Ese `as any` no es un descuido de tipos: es que nadie comprueba que el texto
 * pertenezca al enum. Y como es un enum de PostgreSQL, la consulta no devuelve
 * cero filas — FALLA: `invalid input value for enum X: "loquesea"`. O sea que
 * una errata en un parámetro de la URL produce un **500**, y el mensaje publica
 * el nombre interno del tipo.
 *
 * Aquí el valor se contrasta con `enumValues`, que la propia columna trae. No
 * hay lista que mantener en paralelo: si mañana se añade un estado al esquema,
 * este filtro lo acepta solo.
 *
 * Devuelve `undefined` cuando el valor no pertenece, y `undefined` es
 * exactamente lo que `and(...)` de Drizzle descarta — así que el filtro
 * simplemente no se aplica, igual que hace el resto de estas rutas con un
 * parámetro que no reconocen. Un cliente que se equivoca no tumba la petición.
 *
 * Si prefieres rechazar en vez de ignorar, usa el resultado:
 *
 *     const f = eqEnum(tabla.status, status);
 *     if (status && !f) return c.json({ error: "estado no válido" }, 400);
 */
export function eqEnum(columna: PgColumn, valor: unknown): SQL | undefined {
  if (typeof valor !== "string" || valor === "") return undefined;

  const validos = (columna as PgColumn & { enumValues?: readonly string[] }).enumValues;
  // Sin `enumValues` no es una columna enum: se compara tal cual, que es lo
  // correcto para un `text`. Devolver undefined aquí silenciaría un filtro
  // legítimo.
  if (!validos) return eq(columna, valor);

  return validos.includes(valor) ? eq(columna, valor) : undefined;
}
