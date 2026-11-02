/**
 * Almacenes de idempotencia de la API real: Valkey y, de respaldo, Postgres.
 *
 * Separado de `idempotencia.ts` para que los tests de las reglas no arrastren
 * la conexión a la base ni a Valkey. Ver la cabecera de `idempotencia.ts`.
 */
import { db } from "../db";

import {
  almacenPostgres,
  almacenValkey,
  type AlmacenIdempotencia,
  type ClienteValkeyMinimo,
  type ConsultaSql,
} from "./idempotencia";
import { getValkeyClient } from "./valkey";

/** `pg.Pool` (node-postgres) y PGlite exponen los dos `query(texto, params) → { rows }`. */
const consulta: ConsultaSql = async (texto, parametros) => {
  const cliente = (
    db as unknown as {
      $client?: { query: (texto: string, parametros: unknown[]) => Promise<unknown> };
    }
  ).$client;
  if (!cliente || typeof cliente.query !== "function") {
    throw new Error("La base no expone un cliente SQL para la tabla de idempotencia");
  }
  const res = (await cliente.query(texto, parametros)) as { rows?: Array<Record<string, unknown>> };
  return res.rows ?? [];
};

let cache: AlmacenIdempotencia[] | null = null;

export function almacenesPorDefecto(): AlmacenIdempotencia[] {
  cache ??= [
    almacenValkey(async () => (await getValkeyClient()) as unknown as ClienteValkeyMinimo),
    almacenPostgres(consulta),
  ];
  return cache;
}
