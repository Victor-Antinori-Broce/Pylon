/**
 * Kitsuden — Error Envelope (re-export desde @kitsuden/engine)
 *
 * La implementación vive en packages/engine para que TANTO la app COMO los
 * kons (plugins) usen el mismo envelope. Este shim mantiene los imports
 * existentes (`../lib/errors`) funcionando.
 */
export {
  AppError,
  ErrorCode,
  toErrorEnvelope,
  respondError,
  type ErrorCodeValue,
  type ErrorEnvelope,
} from "@kitsuden/engine";
