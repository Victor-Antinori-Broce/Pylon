/**
 * Avisar al agente cuando se resuelve su propuesta (kitsuden2.md B3)
 * ============================================================================
 *
 * Antes el agente recibía `202` con `/api/proposals/<id>` y no le quedaba
 * otra que consultar. Ahora, cuando la propuesta queda EJECUTADA, FALLIDA,
 * RECHAZADA o CADUCADA:
 *
 *   1. Un evento en el bus (`proposal:<id>`): lo sirve el flujo SSE
 *      `GET /api/proposals/<id>/events` (routes/aprobaciones.ts). Funciona sin
 *      configurar nada, con o sin Valkey.
 *   2. Si un admin le puso al agente una URL de aviso, un webhook FIRMADO a
 *      esa URL, entregado por la cola de Postgres (`kitsuden-webhooks`):
 *      reintentos con espera, «dead letter» en el panel, y ATÓMICO con la
 *      decisión (si la petición que aprueba se revierte, no sale nada).
 *
 * ── LA FIRMA ───────────────────────────────────────────────────────────────
 *
 *   X-Kitsuden-Event:     proposal.executed | proposal.failed | proposal.rejected | proposal.expired
 *   X-Kitsuden-Delivery:  id del trabajo (el mismo en cada reintento: deduplica)
 *   X-Kitsuden-Signature: t=<unix>,v1=<hex HMAC-SHA256(secreto, "<t>.<cuerpo>")>
 *
 * El receptor recalcula el HMAC sobre el cuerpo CRUDO y rechaza un `t` de más
 * de 5 minutos (repetición). El secreto es por agente, se guarda cifrado y se
 * enseña una sola vez (al configurar la URL o al rotarlo).
 *
 * ── A DÓNDE NO SE MANDA ────────────────────────────────────────────────────
 *
 * Solo `https://` y a direcciones públicas (se resuelve el nombre y se
 * rechaza loopback, red privada, link-local…: el mismo filtro que los
 * metadatos OAuth). Para desarrollo, `KITSUDEN_WEBHOOKS_ALLOW_PRIVATE=true`
 * permite `http://` y direcciones privadas.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";

import { sql } from "drizzle-orm";

import { ErrorPermanente, queue, type TrabajoDeCola } from "../../../../packages/engine/src/cola";
import { db } from "../db";
import { decryptSecret, encryptSecret, type EncryptedValue } from "../services/secrets";

import { logger } from "./logger";
import { direccionNoPublica } from "./oauth/cimd";
import { publish } from "./valkey";

export const COLA_DE_WEBHOOKS = "kitsuden-webhooks";
const FINALES = new Set(["executed", "failed", "rejected", "expired"]);

/** Lo que el agente ve de su propuesta (`vistaParaAgente`), lo mínimo que se usa aquí. */
export interface VistaDePropuesta {
  id: string;
  status: string;
  [k: string]: unknown;
}

function filas(r: unknown): Array<Record<string, unknown>> {
  return ((r as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
}

/** Canal del bus de una propuesta (lo escucha el flujo SSE). */
export function canalDePropuesta(id: string): string {
  return `proposal:${id}`;
}

/**
 * La propuesta quedó resuelta: avisa por el bus y, si el agente tiene URL de
 * aviso, encola el webhook (en la transacción en curso, si la hay).
 */
export async function avisarResolucion(agentId: string, vista: VistaDePropuesta): Promise<void> {
  if (!FINALES.has(vista.status)) return;
  await publish(canalDePropuesta(vista.id), vista).catch(() => undefined);
  try {
    const [cfg] = filas(
      await db.execute(sql`SELECT url FROM agent_notify_settings WHERE agent_id = ${agentId} AND url IS NOT NULL`)
    );
    if (!cfg) return;
    await queue.dispatch(
      COLA_DE_WEBHOOKS,
      `proposal.${vista.status}`,
      { agentId, proposal: vista },
      { intentos: 8 }
    );
  } catch (err) {
    // Sin la tabla (base sin migrar) o sin cola: el agente sigue pudiendo consultar.
    logger.warn({ err: err instanceof Error ? err.message : String(err), proposalId: vista.id }, "[avisos] no se pudo encolar el webhook");
  }
}

// ── La firma ───────────────────────────────────────────────────────────────

export function firmar(secreto: string, cuerpo: string, t = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac("sha256", secreto).update(`${t}.${cuerpo}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

/** Para el receptor (y las pruebas): ¿la firma es de este cuerpo y reciente? */
export function verificarFirma(secreto: string, cuerpo: string, cabecera: string, toleranciaS = 300): boolean {
  const partes = Object.fromEntries(cabecera.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = Number(partes.t);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > toleranciaS || !partes.v1) return false;
  const esperado = Buffer.from(createHmac("sha256", secreto).update(`${t}.${cuerpo}`).digest("hex"));
  const recibido = Buffer.from(partes.v1);
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
}

// ── El destino ─────────────────────────────────────────────────────────────

function privadasPermitidas(): boolean {
  return process.env.KITSUDEN_WEBHOOKS_ALLOW_PRIVATE === "true";
}

/** Valida la URL de aviso (al guardarla). Devuelve el motivo si no vale. */
export function motivoDeUrlInvalida(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "Not a valid URL";
  }
  if (u.username || u.password) return "The URL cannot carry credentials";
  if (u.protocol !== "https:" && !(privadasPermitidas() && u.protocol === "http:")) {
    return "The notify URL must be https://";
  }
  if (url.length > 2000) return "URL too long";
  return null;
}

/** Al entregar: el nombre se resuelve y ninguna dirección puede ser privada. */
async function destinoPermitido(url: URL): Promise<boolean> {
  if (privadasPermitidas()) return true;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const ips = await lookup(host, { all: true }).catch(() => []);
  return ips.length > 0 && ips.every((d) => !direccionNoPublica(d.address));
}

// ── Configuración por agente (panel) ──────────────────────────────────────

export async function ajustesDeAviso(agentId: string): Promise<{ url: string | null; hasSecret: boolean }> {
  const [f] = filas(await db.execute(sql`SELECT url, secret IS NOT NULL AS tiene FROM agent_notify_settings WHERE agent_id = ${agentId}`));
  return { url: (f?.url as string | null) ?? null, hasSecret: f?.tiene === true };
}

function secretoNuevo(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

/**
 * Pone (o quita, con `null`) la URL de aviso. Si no había secreto, lo crea y
 * lo devuelve: es la ÚNICA vez que se ve.
 */
export async function guardarUrlDeAviso(
  agentId: string,
  url: string | null,
  por: string
): Promise<{ url: string | null; secret?: string }> {
  const actual = await ajustesDeAviso(agentId);
  let secreto: string | undefined;
  if (url && !actual.hasSecret) secreto = secretoNuevo();
  const cifrado = secreto ? JSON.stringify(encryptSecret(secreto)) : null;
  await db.execute(sql`
    INSERT INTO agent_notify_settings (agent_id, url, secret, updated_by, updated_at)
    VALUES (${agentId}, ${url}, ${cifrado}::jsonb, ${por}, now())
    ON CONFLICT (agent_id) DO UPDATE
      SET url = EXCLUDED.url,
          secret = COALESCE(EXCLUDED.secret, agent_notify_settings.secret),
          updated_by = EXCLUDED.updated_by,
          updated_at = now()`);
  return { url, ...(secreto ? { secret: secreto } : {}) };
}

/** Rota el secreto (el anterior deja de valer al momento). Se ve una vez. */
export async function rotarSecretoDeAviso(agentId: string, por: string): Promise<string> {
  const secreto = secretoNuevo();
  await db.execute(sql`
    INSERT INTO agent_notify_settings (agent_id, secret, updated_by, updated_at)
    VALUES (${agentId}, ${JSON.stringify(encryptSecret(secreto))}::jsonb, ${por}, now())
    ON CONFLICT (agent_id) DO UPDATE
      SET secret = EXCLUDED.secret, updated_by = EXCLUDED.updated_by, updated_at = now()`);
  return secreto;
}

// ── La entrega (el manejador de la cola) ───────────────────────────────────

interface TrabajoDeAviso {
  agentId: string;
  proposal: VistaDePropuesta;
}

export async function entregarAviso(trabajo: TrabajoDeCola): Promise<void> {
  const { agentId, proposal } = (trabajo.payload ?? {}) as TrabajoDeAviso;
  if (!agentId || !proposal?.id) throw new ErrorPermanente("payload sin agente o sin propuesta");
  // La URL y el secreto se leen AHORA: si el admin la quitó, no se manda.
  const [cfg] = filas(await db.execute(sql`SELECT url, secret FROM agent_notify_settings WHERE agent_id = ${agentId}`));
  const url = cfg?.url as string | null | undefined;
  if (!url) return;
  if (!cfg?.secret) throw new ErrorPermanente("el agente tiene URL de aviso pero no secreto");
  const destino = new URL(url);
  if (motivoDeUrlInvalida(url) || !(await destinoPermitido(destino))) {
    throw new ErrorPermanente("la URL de aviso no es pública o no es https");
  }
  const secreto = decryptSecret(cfg.secret as EncryptedValue);
  const cuerpo = JSON.stringify({
    type: trabajo.nombre,
    deliveryId: trabajo.id,
    createdAt: new Date().toISOString(),
    agentId,
    proposal,
  });
  const res = await fetch(destino, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Kitsuden-Webhooks/1",
      "x-kitsuden-event": trabajo.nombre,
      "x-kitsuden-delivery": trabajo.id,
      "x-kitsuden-signature": firmar(secreto, cuerpo),
    },
    body: cuerpo,
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  // 410 Gone: el receptor ya no quiere avisos. Reintentar no tiene sentido.
  if (res.status === 410) throw new ErrorPermanente("el receptor respondió 410 Gone");
  if (res.status < 200 || res.status >= 300) throw new Error(`el receptor respondió ${res.status}`);
}

/** Registra el manejador de la cola de avisos (lo llama el arranque del worker). */
export function registrarEntregaDeAvisos(): void {
  queue.handle(COLA_DE_WEBHOOKS, entregarAviso, { concurrencia: 4 });
}
