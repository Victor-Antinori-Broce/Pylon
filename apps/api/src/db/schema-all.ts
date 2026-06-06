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

// ═══════════════════════════════════════════════════════════════════════════
// CORE SCHEMA (siempre activo)
// ═══════════════════════════════════════════════════════════════════════════
export * from "./schema-core";

// ═══════════════════════════════════════════════════════════════════════════
// GRIMOIRES CORE (Siempre activos - migraciones en Drizzle)
// ═══════════════════════════════════════════════════════════════════════════
// NOTA: Estos grimoires usan drizzle-kit migrate/push porque sus tablas
// son fundamentales y se crean en el primer setup

export * from "../../../../packages/grimoires/grimoire-blocks/blocks.schema";

// ═══════════════════════════════════════════════════════════════════════════
// GRIMOIRES DE DOMINIO GAMING (Migraciones gestionadas por Drizzle Kit)
// ═══════════════════════════════════════════════════════════════════════════
// Estas tablas están en la migración inicial 0000_amusing_lethal_legion.sql
// y se mantienen aquí para compatibilidad con drizzle-kit generate/push.

export {
  games,
  platforms,
  tags,
  gameCollections,
  gameCollectionEntries,
  gamesToPlatforms,
  gamesToTags,
  gamesRelations,
  platformsRelations,
  tagsRelations,
  gameCollectionsRelations,
  gameCollectionEntriesRelations,
  gamesToPlatformsRelations,
  gamesToTagsRelations,
} from "../../../../packages/grimoires/grimoire-games/games.schema";

export {
  streamers,
  gamesToStreamers,
  streamersRelations,
  gamesToStreamersRelations,
} from "../../../../packages/grimoires/grimoire-streamers/streamers.schema";

export {
  blogPosts,
  blogPostsToTags,
  blogPostsToGames,
} from "../../../../packages/grimoires/grimoire-blog/src/schema.local";

export { media, mediaFolders } from "../../../../packages/grimoires/grimoire-media/media.schema";

// ═══════════════════════════════════════════════════════════════════════════
// GRIMOIRES OPCIONALES (Migraciones SQL independientes)
// ═══════════════════════════════════════════════════════════════════════════
// NOTA: Estos grimoires usan migraciones SQL manuales para evitar conflictos
// de enums y tener control total sobre sus tablas.
//
// El schema se exporta solo para tipos TypeScript, NO para drizzle-kit push.

// Academy LMS - Usa enums como "cargo" que pueden colisionar
// Las tablas se crean via SQL en el hook onStartup
// export * from "../../../../packages/grimoires/grimoire-academy-lms/academy-lms.schema";

// Booking - Usa migraciones SQL en packages/grimoires/grimoire-booking/migrations/
// export * from "../../../../packages/grimoires/grimoire-booking/booking.schema";

// ═══════════════════════════════════════════════════════════════════════════
// REGLAS PARA NUEVOS GRIMOIRES
// ═══════════════════════════════════════════════════════════════════════════
//
// 1. Si tu grimoire tiene enums con nombres genéricos (status, type, cargo, etc.)
//    → NO exportes aquí. Usa migraciones SQL.
//
// 2. Si tu grimoire es opcional (puede habilitarse/deshabilitarse)
//    → NO exportes aquí. Usa migraciones SQL.
//
// 3. Si tu grimoire es CORE y tiene enums únicos
//    → Puedes exportar aquí, pero usa nombres con prefijo:
//      pgEnum("grimoire_name_enum_name", [...])
//
// 4. Template de migración SQL:
//    packages/grimoires/grimoire-xxx/migrations/0000_initial.sql
//
//    Ver ejemplo en: grimoire-booking/migrations/0000_initial.sql
//
