/**
 * Kitsuden — Request Validation (re-export desde @kitsuden/engine)
 *
 * La implementación vive en packages/engine para que los kons (plugins)
 * validen requests con el mismo envelope. Shim de compatibilidad.
 */
export { validateRequest, validated, parseOrThrow, type ValidationTarget } from "@kitsuden/engine";
