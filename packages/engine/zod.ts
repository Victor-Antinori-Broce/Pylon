/**
 * @kitsuden/engine/zod — LA versión de Zod del monorepo (kitsuden2.md, C1)
 * ============================================================================
 *
 *   import { z } from "@kitsuden/engine/zod";   // pura: no arranca nada
 *   import { z } from "@kitsuden/engine";       // lo mismo, desde el índice
 *
 * Los kons no importan `zod` directamente (regla `no-restricted-imports` en
 * eslint.config.js). Así hay una sola versión controlada por el engine, y
 * subirla (la migración a Zod 4 de 2026-10-25) es un cambio en un sitio.
 *
 * Entrada aparte del índice a propósito: el índice re-exporta módulos del host
 * (db, auth…) e importarlo ARRANCA la base de datos. Un fichero de esquemas o
 * de lógica pura de un kon, que sus tests cargan sin base, debe usar esta.
 */

export { z } from "zod";
export type { ZodError, ZodType } from "zod";
