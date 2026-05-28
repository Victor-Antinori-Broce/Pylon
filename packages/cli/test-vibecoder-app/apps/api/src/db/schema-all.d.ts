/**
 * GremiusCMS — Aggregated Schema for Drizzle Kit
 *
 * ⚠️ IMPORTANTE: Política de Migraciones
 * ═══════════════════════════════════════════
 *
 * PROBLEMA: Los enums de PostgreSQL son globales. Si dos grimoires definen
 * enums con el mismo nombre (ej: "cargo"), drizzle-kit push pedirá
 * confirmación interactiva, bloqueando el deploy.
 *
 * SOLUCIÓN: Cada grimoire maneja sus propias migraciones SQL
 *
 * 1. Grimoires CORE (siempre activos) → Exportar aquí
 * 2. Grimoires opcionales → NO exportar, usar migraciones SQL
 *
 * Ejemplo de migración SQL segura:
 * ```sql
 * -- migrations/0000_initial.sql
 * DO $$
 * BEGIN
 *   IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'my_status') THEN
 *     CREATE TYPE my_status AS ENUM ('active', 'inactive');
 *   END IF;
 * END $$;
 *
 * CREATE TABLE IF NOT EXISTS my_table (...);
 * ```
 */
export * from "./schema";
export * from "../../../../packages/grimoires/grimoire-blocks/blocks.schema";
//# sourceMappingURL=schema-all.d.ts.map