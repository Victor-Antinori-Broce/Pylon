/**
 * Operaciones del SDK que monta el NÚCLEO (no un kon)
 * ============================================================================
 *
 * Las rutas de permisos de agentes (`kon-agentes`, /api/v1), las de la
 * aprobación humana (`kon-aprobaciones`, /api/approvals) y el estado de las
 * propuestas para el agente (`kon-propuestas`, /api/proposals) se declaran con
 * el SDK pero NO se registran entre las operaciones montadas de los kons: así
 * ningún scope fino (`kon:*`) las abre. Este registro solo existe para
 * publicarlas en `GET /api/docs/openapi.json` (lib/openapi-aggregator.ts).
 *
 * Sin dependencias a propósito: lo importan las rutas y el agregador.
 */
import type { OperacionDeKon } from "@kitsuden/shared";

export interface OperacionesDelNucleo {
  konId: string;
  mountPath: string;
  descripcion: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cada operación trae sus propios esquemas
  operaciones: OperacionDeKon<any, any, any>[];
}

const registro = new Map<string, OperacionesDelNucleo>();

export function registrarOperacionesDelNucleo(e: OperacionesDelNucleo): void {
  registro.set(e.konId, e);
}

export function operacionesDelNucleo(): OperacionesDelNucleo[] {
  return [...registro.values()];
}
