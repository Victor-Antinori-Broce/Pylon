/**
 * Conta Grimoire — Shared Types
 *
 * Tipos reutilizables para tipado fuerte del cliente de base de datos
 * y otros contratos internos.
 */

import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "./conta.schema";

/**
 * Cliente de base de datos tipado con el schema de contabilidad.
 * Usar en ContaService, routers y helpers.
 */
export type ContaDb = PgDatabase<any, typeof schema, any>;

/**
 * Condiciones dinámicas para queries con Drizzle AND
 */
export type Condition = Parameters<ContaDb["select"]>[0] extends infer R
  ? R
  : never;
