/**
 * @kitsuden/core — Kitsuden Core (Nivel 2: las baterías del framework)
 *
 * `packages/core/` es el hogar de las capacidades CORE de Kitsuden: los módulos
 * que TODA app querría, sean del dominio que sean (a diferencia de los kons
 * de dominio en `packages/kons/`, p.ej. games/crm/lms).
 *
 * Módulos core que viven aquí como paquetes propios (cargados por el
 * module-loader vía SOURCE 0, manteniendo su manifest id `kon-*` como clave
 * estable):
 *   - datasets/  (@kitsuden/datasets)  — colecciones dinámicas + auto-API REST
 *   - media/     (@kitsuden/media)     — storage S3/MinIO + optimización
 *   - blocks/    (@kitsuden/blocks)    — fundación del page builder
 *   - vector-search/                — embeddings + búsqueda semántica
 *   - content-publishing/           — utilidades de publicación
 *
 * Otras capacidades core viven en el Engine (Nivel 1, `packages/engine/`):
 * brain, code-graph, system-map, authz, repo, validation. Y como servicios del
 * host: vault + secrets (apps/api/src/services/{vault,secrets}.ts).
 * Ver CORE.md para el mapa completo de la jerarquía.
 */

// Vector search (Engine infrastructure)
export * from "./vector-search";

// Content Publishing (Core API)
export * from "./content-publishing";
