/**
 * Kitsuden — Authorization: Policies & Gates (re-export desde @kitsuden/engine)
 *
 * La implementación vive en packages/engine para que los kons (plugins)
 * puedan definir y evaluar sus propias policies. Shim de compatibilidad.
 */
export {
  definePolicy,
  defineGate,
  can,
  authorize,
  policyMap,
  resetAuthz,
  requireGate,
  requirePolicy,
  type AuthzUser,
  type PolicyRule,
  type GateRule,
} from "@kitsuden/engine";
