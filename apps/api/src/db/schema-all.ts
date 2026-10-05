/**
 * Kitsuden — Schema agregado para Drizzle Kit
 * ============================================================================
 *
 * ⚠️ Este archivo es una fachada delgada. El agregado real (core + kons) es
 * AUTO-GENERADO en `schema-kons.generated.ts`. NO se edita a mano.
 *
 * ANTES: había que agregar/curar cada `export *` de kon aquí manualmente,
 * cuidando las colisiones de enums globales de Postgres.
 *
 * AHORA: cada kon declara en su `kon.json` un bloque `schema`:
 *   "schema": { "entry": "./x.schema.ts", "strategy": "drizzle" }
 * y el agregado se regenera con:
 *   kitsuden sync-schema      (→ apps/api/scripts/sync-kon-schema.ts)
 *
 * Estrategias por kon:
 *   - "drizzle": tablas gestionadas por drizzle-kit → entran al agregado.
 *   - "sql":     el kon auto-migra por SQL propio → se EXCLUYE (solo tipos),
 *                evitando colisiones de enums.
 *   - "authoritative": los símbolos del kon ganan sobre schema-core al
 *                colisionar (p.ej. `media`, cuya definición canónica vive en
 *                packages/core/media, no en la legacy de schema-core).
 *
 * El archivo generado ya reexporta schema-core, así que aquí basta con
 * reexportarlo a él.
 */

export * from "./schema-kons.generated";
