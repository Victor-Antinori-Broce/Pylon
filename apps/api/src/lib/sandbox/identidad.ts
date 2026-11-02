/**
 * Con qué identidad llama a la API el código de una acción
 * ============================================================================
 *
 * El código del sandbox solo habla con Kitsuden por `kitsuden.api.*`, y cada
 * llamada vuelve a entrar en la app (`app.fetch`) como un AGENTE: pasa por las
 * mismas denegaciones, puertas, permisos de operación (`can()`), RLS, cuotas
 * y aprobaciones que esa identidad por la red. No hay atajo a la base ni a
 * ningún secreto.
 *
 * Qué agente:
 *
 *   · La acción DECLARA lo que su código puede hacer: `config.scopes`
 *     (p. ej. `["datasets:clientes:read"]`). Sin declaración, el código no
 *     tiene API — mínimo privilegio por defecto.
 *   · Si quien ejecuta es un AGENTE (POST /api/actions/:id/execute con su
 *     clave), el código actúa COMO ese agente (sus cuotas, su modo de
 *     aprobación, su auditoría) con los scopes declarados que el agente TIENE
 *     — nunca más — y conservando sus denegaciones `!patrón`.
 *   · Si quien ejecuta es una PERSONA, o la acción salta por cron o por un
 *     evento, el código actúa como un agente sintético `action:<id>` con los
 *     scopes declarados, pero solo si la persona responsable (quien ejecuta, o
 *     quien creó la acción para cron/eventos) es admin AHORA. Si se le retiró el
 *     rol o se borró la cuenta, la acción sigue calculando pero sin API.
 *
 * Las cabeceras que el código pase a la API se ignoran: la identidad la pone el
 * proceso (`MARCA_EJECUCION_INTERNA`, un símbolo que no llega desde la red).
 */

import { concedeScope } from "@kitsuden/shared";
import { eq } from "drizzle-orm";

import { db } from "../../db";
import { authUsers } from "../../db/schema";
import type { AgentAuthContext } from "../../services/agent-auth";
import { peticionInterna } from "../aprobaciones";
import type { ApiDeSandbox } from "../worker-sandbox";

/** Quién pidió la ejecución (lo ponen las rutas; cron y eventos no lo tienen). */
export type EjecutorDeAccion =
  | { tipo: "agente"; agente: AgentAuthContext }
  | { tipo: "humano"; userId: string; role?: string | null };

/** Lo que la acción declara en `config.scopes` (texto no vacío, sin repetir). */
export function scopesDeclarados(config: unknown): string[] {
  const s = (config as { scopes?: unknown } | null)?.scopes;
  if (!Array.isArray(s)) return [];
  return [...new Set(s.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()))];
}

async function rolActual(userId: string): Promise<string | null> {
  const [u] = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, userId)).limit(1);
  return u?.role ?? null;
}

/**
 * La identidad con la que el código de la acción llama a la API, o `null` si
 * no debe tener API (ver la cabecera).
 */
export async function identidadDeLaAccion(
  accion: { id: string; slug?: string | null; config: unknown; createdById?: string | null },
  ejecutor: EjecutorDeAccion | undefined
): Promise<AgentAuthContext | null> {
  const declarados = scopesDeclarados(accion.config).filter((s) => !s.startsWith("!"));
  if (declarados.length === 0) return null;

  if (ejecutor?.tipo === "agente") {
    const propios = ejecutor.agente.scopes ?? [];
    const concedidos = declarados.filter((s) => concedeScope(propios, s));
    if (concedidos.length === 0) return null;
    return {
      ...ejecutor.agente,
      scopes: [...concedidos, ...propios.filter((s) => s.startsWith("!"))],
    };
  }

  // Persona: la que ejecuta; para cron/eventos, la que creó la acción.
  const userId = ejecutor?.tipo === "humano" ? ejecutor.userId : (accion.createdById ?? null);
  if (!userId) return null;
  // El rol se relee de la base: el de la sesión puede ser de hace horas.
  const rol = await rolActual(userId);
  if (rol !== "admin") return null;

  return {
    agentId: `action:${accion.id}`,
    agentName: `action:${accion.slug ?? accion.id}`,
    scopes: declarados,
    rateLimit: 120,
    writesPerDay: null,
    budgetUnitsPerDay: null,
    keyId: "",
    allowedTools: [],
    sponsor: { userId, valido: true },
  };
}

/** La API que se inyecta al sandbox: peticiones internas como `agente`. */
export function apiDeSandboxPara(agente: AgentAuthContext, actionId: string): ApiDeSandbox {
  return async (metodo, camino, cuerpo) => {
    const res = await peticionInterna({ agente, sandbox: { actionId } }, metodo, camino, cuerpo);
    return {
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
      body: await res.text(),
      url: camino,
    };
  };
}

/** El ejecutor de una petición: el agente si llegó con su clave, si no la persona. */
export function ejecutorDePeticion(c: { get?(clave: string): unknown }): EjecutorDeAccion | undefined {
  // Sin `get` (contextos de prueba a medida) no hay a quién atribuir nada.
  const get = typeof c.get === "function" ? (k: string) => c.get!(k) : () => undefined;
  const agente = get("agent") as AgentAuthContext | undefined;
  if (agente?.agentId) return { tipo: "agente", agente };
  const usuario = get("user") as { id?: string; role?: string | null } | null | undefined;
  if (usuario?.id) return { tipo: "humano", userId: usuario.id, role: usuario.role ?? null };
  return undefined;
}

/**
 * Quién queda como creador (`created_by_id`, una cuenta de `auth_users`): la
 * persona; para un agente, su firmante válido. Lo decide la sesión, nunca el
 * cuerpo de la petición.
 */
export function creadorDePeticion(c: { get?(clave: string): unknown }): string | null {
  const e = ejecutorDePeticion(c);
  if (e?.tipo === "humano") return e.userId;
  if (e?.tipo === "agente") return e.agente.sponsor?.valido ? e.agente.sponsor.userId : null;
  return null;
}
