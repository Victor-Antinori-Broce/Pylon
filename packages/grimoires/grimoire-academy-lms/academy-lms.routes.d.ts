/**
 * Academy LMS - Rutas API (DI Version)
 *
 * Endpoints para gestionar cursos, progreso, quizzes, asignaciones, learning paths y más.
 *
 * MIGRATED: Now uses Dependency Injection via GrimoireContext
 * - db → ctx.dbInstance.instance
 * - auth → ctx.auth.requireAuth, ctx.auth.requireRole
 *
 * FEATURES:
 * - Full CRUD for Courses, Modules, Topics, Quizzes, Questions, Options
 * - Progress tracking at course, module, and topic level
 * - Learning Paths with sequential approval support
 * - Group-based and individual assignments
 * - Satisfaction surveys and feedback
 * - Certificates generation
 * - Comprehensive reports and analytics
 */
import { Hono } from "hono";
import type { GrimoireContext } from "@gremius/shared";
/**
 * Factory function that creates Academy LMS routes with dependency injection
 * This replaces the old direct import pattern with proper DI
 */
export declare function createAcademyLMSRoutes(ctx: GrimoireContext): Hono;
export { createAcademyLMSRoutes as academyLMSRoutes };
//# sourceMappingURL=academy-lms.routes.d.ts.map