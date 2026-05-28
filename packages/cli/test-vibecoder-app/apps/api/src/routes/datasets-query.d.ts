/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DATASETS QUERY & BATCH ROUTES - FASE 2: La Magia de los Datos
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Expone los motores core (QueryTranslator, BatchProcessor, Auto-Join) vía REST.
 *
 * Endpoints:
 * - POST /:id/query    → Ejecuta consultas Gremius QL con expansión de relaciones
 * - POST /batch        → Ejecuta operaciones batch transaccionales (ACID)
 *
 * Features:
 * - Anti N+1: Expansión de relaciones en una sola query
 * - Validación semántica: Errores claros (COLUMN_NOT_FOUND, etc.)
 * - Transacciones ACID: Rollback automático en batch
 * - Seguridad: Reutiliza middleware de auth existente
 */
import { Hono } from "hono";
import type { AppVariables } from "../types/hono";
export declare const datasetsQueryRoutes: Hono<{
    Variables: AppVariables;
}, import("hono/types").BlankSchema, "/">;
//# sourceMappingURL=datasets-query.d.ts.map