/**
 * El FIRMANTE humano de un agente (decisión del propietario, fase F)
 * ============================================================================
 *
 * Cada agente puede tener un humano responsable fijo (`sponsor_user_id`), que
 * un admin elige en el panel. Lo que el agente crea va FIRMADO por ese humano:
 * el `authorId` de una entrada del blog y el `owner_id` de las entradas de un
 * dataset; `created_by_id` sigue diciendo que lo escribió el agente.
 *
 * Aquí está la regla, pura, para que la apliquen igual el blog, los datasets
 * (REST y MCP) y la API. El host deja en el `user` de un agente:
 *
 *   sponsor: null                      → sin firmante configurado
 *   sponsor: { userId, valido: true }  → firmante del equipo (admin o editor)
 *   sponsor: { userId, valido: false } → configurado pero ya no vale (borrado
 *                                        o sin rol de equipo)
 *
 * ── LA REGLA ────────────────────────────────────────────────────────────────
 *
 *   · Con firmante válido: sin autor pedido → el firmante; pedido = firmante →
 *     el firmante; pedido OTRO → solo si el agente tiene `admin`, si no 403.
 *   · Con firmante que ya no vale: 403 `KITSUDEN_E_AGENT_SPONSOR_INVALID`
 *     (no crea contenido firmado hasta que un admin lo reasigne), salvo un
 *     agente con `admin` que nombre él mismo otro autor.
 *   · Sin firmante: como antes de esta decisión. Modo `pedido` (el blog): el
 *     autor que mande el agente. Modo `nadie` (datasets): sin dueño, salvo un
 *     agente con `admin` que lo nombre.
 *
 * Guía pública: docs/agents/approvals.md («Human signer»).
 */

import { concedeScope } from "./permisos-de-agente";

export interface FirmanteDeAgente {
  userId: string;
  /** Existe y es del equipo (`admin` o `editor`). */
  valido: boolean;
  /** Por qué no vale: la cuenta no existe o ya no es del equipo. */
  motivo?: "not_found" | "not_staff";
}

/** Los roles que pueden firmar por un agente. */
export const ROLES_DE_FIRMANTE = ["admin", "editor"] as const;

export function puedeFirmar(rol: unknown): boolean {
  return typeof rol === "string" && (ROLES_DE_FIRMANTE as readonly string[]).includes(rol);
}

export type FirmaResuelta =
  | {
      ok: true;
      /** El autor / dueño que se guarda (`null` = ninguno). */
      autor: string | null;
      porQue: "sponsor" | "pedido" | "ninguno" | "humano";
    }
  | {
      ok: false;
      code: "KITSUDEN_E_AGENT_SPONSOR_INVALID" | "KITSUDEN_E_FORBIDDEN";
      mensaje: string;
    };

interface UsuarioConFirmante {
  role?: unknown;
  scopes?: unknown;
  sponsor?: unknown;
}

function esFirmante(v: unknown): v is FirmanteDeAgente {
  return Boolean(v) && typeof (v as FirmanteDeAgente).userId === "string";
}

/**
 * El autor (o dueño) de lo que crea quien llama. Para un humano devuelve lo
 * pedido tal cual (cada ruta sigue con su regla de siempre); para un agente
 * aplica la regla del firmante.
 *
 * @param modoSinFirmante qué hacer con un agente SIN firmante: `pedido`
 *   acepta el autor que mande (blog, como antes); `nadie` lo deja sin dueño
 *   salvo que el agente tenga `admin` (datasets, como antes).
 */
export function firmaDeAgente(
  usuario: UsuarioConFirmante | null | undefined,
  pedido: string | null | undefined,
  modoSinFirmante: "pedido" | "nadie"
): FirmaResuelta {
  const solicitado = typeof pedido === "string" && pedido.length > 0 ? pedido : null;
  if (usuario?.role !== "agent") return { ok: true, autor: solicitado, porQue: "humano" };
  const scopes = Array.isArray(usuario.scopes) ? (usuario.scopes as string[]) : [];
  const esAdmin = concedeScope(scopes, "admin");
  const sponsor = esFirmante(usuario.sponsor) ? usuario.sponsor : null;

  if (!sponsor) {
    if (solicitado && (modoSinFirmante === "pedido" || esAdmin)) {
      return { ok: true, autor: solicitado, porQue: "pedido" };
    }
    return { ok: true, autor: null, porQue: "ninguno" };
  }
  if (solicitado && solicitado !== sponsor.userId) {
    if (esAdmin) return { ok: true, autor: solicitado, porQue: "pedido" };
    return {
      ok: false,
      code: "KITSUDEN_E_FORBIDDEN",
      mensaje:
        "An agent with a human signer can only write as that signer: send no author/owner, or its signer's id (an agent with `admin` may name another account).",
    };
  }
  if (!sponsor.valido) {
    return {
      ok: false,
      code: "KITSUDEN_E_AGENT_SPONSOR_INVALID",
      mensaje:
        sponsor.motivo === "not_found"
          ? "This agent's human signer no longer exists. An admin must assign a new signer before the agent can create signed content."
          : "This agent's human signer is no longer an admin or editor. An admin must assign a new signer before the agent can create signed content.",
    };
  }
  return { ok: true, autor: sponsor.userId, porQue: "sponsor" };
}
