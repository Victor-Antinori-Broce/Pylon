/**
 * Content Publishing API Routes
 *
 * Endpoints públicos para el sistema de promoción de contenido.
 * Estos endpoints son parte del Core (Nivel 2) y siempre están disponibles.
 */
import { Hono } from "hono";
import type { GrimoireContext } from "@gremius/shared";
import type { AppVariables } from "../types/hono";
/**
 * Factory que crea el router de Content Publishing
 * Nota: Este router usa el GrimoireContext inyectado
 */
export declare function createContentPublishingRouter(ctx: GrimoireContext): Hono<{
    Variables: AppVariables;
}, import("hono/types").BlankSchema, "/">;
//# sourceMappingURL=content-publishing.d.ts.map