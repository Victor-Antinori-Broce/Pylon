/**
 * Extended Data Sets routes — PATCH/DELETE for definitions + entries
 *
 * Real-time: Mutations broadcast to Valkey Pub/Sub for Live Queries.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VALIDACIÓN ZOD: Todas las operaciones de escritura validan contra
 * el esquema compartido @gremius/shared para garantizar consistencia
 * entre Frontend y Backend.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { Hono } from "hono";
import type { AppVariables } from "../types/hono";
export declare const dataSetsFullRoutes: Hono<{
    Variables: AppVariables;
}, import("hono/types").BlankSchema, "/">;
//# sourceMappingURL=datasets.d.ts.map