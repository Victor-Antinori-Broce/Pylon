/**
 * `Idempotency-Key` en todas las escrituras de `/api/*`
 * ============================================================================
 *
 * Opcional para el cliente: sin la cabecera, nada cambia. Con ella, en
 * POST/PUT/PATCH/DELETE:
 *
 *   - primera vez: se reserva la clave, se ejecuta, se guarda la respuesta;
 *   - reintento con la MISMA petición: se repite la respuesta guardada
 *     (estado, cabeceras de la lista blanca y cuerpo) con
 *     `Idempotent-Replayed: true`, sin ejecutar nada;
 *   - misma clave con OTRA petición (método, camino, query o cuerpo): 422
 *     `KITSUDEN_E_IDEMPOTENCY_KEY_REUSED`;
 *   - misma clave mientras la primera sigue corriendo: 409
 *     `KITSUDEN_E_IDEMPOTENCY_IN_PROGRESS` con `Retry-After: 1`;
 *   - sin almacén (Valkey caído y sin tabla): 503
 *     `KITSUDEN_E_IDEMPOTENCY_UNAVAILABLE` SIN ejecutar (fail-closed; ver
 *     abajo).
 *
 * La clave se guarda por ACTOR (agente, usuario o, sin sesión, la IP del
 * cliente): la misma clave de dos actores son dos operaciones distintas, y
 * nadie puede leer la respuesta de otro adivinando su clave.
 *
 * ── FAIL-CLOSED POR DEFECTO ────────────────────────────────────────────────
 *
 * Quien manda `Idempotency-Key` está diciendo «esta escritura no puede
 * hacerse dos veces» (un cobro, un pedido, un envío). Si no hay dónde
 * apuntarla, ejecutarla igual (fail-open) rompe justo esa promesa en silencio:
 * el reintento del agente la duplicaría. Un 503 reintentable, en cambio, no
 * hace daño: la operación no se hizo y el agente sabe que debe reintentar con
 * la misma clave. Y solo afecta a las peticiones que traen la cabecera.
 * `IDEMPOTENCY_FAIL_MODE=open` existe para quien prefiera disponibilidad.
 *
 * ── LO QUE QUEDA FUERA ─────────────────────────────────────────────────────
 *
 *   - `/api/auth/*`: inicios de sesión y altas ponen cookies de sesión; repetir
 *     esa respuesta sería repartir una sesión.
 *   - `/api/mcp`: es un transporte JSON-RPC con sesión; la idempotencia de las
 *     herramientas MCP irá con la declaración de operaciones (fase B).
 *   - Respuestas en streaming (`text/event-stream`).
 *   - Las rutas montadas en `index.ts` ANTES de este middleware (`/api/system`,
 *     `/api/sistema`, solo admin).
 *
 * kon-ecommerce mantiene además su propia idempotencia de pedidos en la base
 * (atada al email del comprador y sin caducidad): es la red durable debajo de
 * esta, que caduca a las 24 h.
 */
import { buildProblem } from "@kitsuden/shared";
import type { Context, Next } from "hono";

import {
  AlmacenNoDisponible,
  CLAVE_IDEMPOTENCIA_VALIDA,
  cabecerasRepetibles,
  claveDeAlmacen,
  configDeIdempotencia,
  cuerpoConSecreto,
  huellaDePeticion,
  nuevoToken,
  reservarEnCadena,
  seGuardaElEstado,
  type AlmacenIdempotencia,
  type ConfigIdempotencia,
  type Registro,
} from "../lib/idempotencia";
import { ipDelCliente } from "../lib/ip-del-cliente";

import { responderProblema } from "./problemas-http";

const METODOS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const EXCLUIDAS_DE_IDEMPOTENCIA = ["/api/auth", "/api/mcp"];

function excluida(camino: string, excluidas: string[]): boolean {
  return excluidas.some((p) => camino === p || camino.startsWith(`${p}/`));
}

/** Quién hace la petición, para separar sus claves de las de los demás. */
export function actorDe(c: Context): string {
  const get = c.get as (k: string) => unknown;
  const agente = get("agent") as { agentId?: string } | undefined;
  if (agente?.agentId) return `agent:${agente.agentId}`;
  const usuario = get("user") as { id?: string } | null | undefined;
  if (usuario?.id) return `user:${usuario.id}`;
  return `anon:${ipDelCliente(c)}`;
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function desdeBase64(texto: string): ArrayBuffer {
  const b = Buffer.from(texto, "base64");
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

export interface OpcionesIdempotencia {
  /** Almacenes en orden de preferencia (por defecto: Valkey → Postgres). */
  almacenes: () => AlmacenIdempotencia[];
  config?: ConfigIdempotencia;
  excluidas?: string[];
  /** Para avisar en el log cuando no hay almacén (sin acoplarse al logger). */
  avisar?: (mensaje: string, datos: Record<string, unknown>) => void;
}

export function idempotencia(opciones: OpcionesIdempotencia) {
  const config = opciones.config ?? configDeIdempotencia();
  const excluidas = opciones.excluidas ?? EXCLUIDAS_DE_IDEMPOTENCIA;

  return async (c: Context, next: Next) => {
    if (!METODOS.has(c.req.method)) return next();
    const camino = c.req.path;
    if (!camino.startsWith("/api/") || excluida(camino, excluidas)) return next();

    const clave = c.req.header("idempotency-key");
    if (clave === undefined) return next();

    const get = c.get as (k: string) => unknown;
    const requestId = (get("requestId") as string | undefined) ?? null;

    if (!CLAVE_IDEMPOTENCIA_VALIDA.test(clave)) {
      return responderProblema(
        c,
        buildProblem({
          code: "KITSUDEN_E_IDEMPOTENCY_KEY_INVALID",
          detail: "The Idempotency-Key header must be 8-128 characters from [A-Za-z0-9_.:-].",
          instance: camino,
          requestId,
          extensions: {
            details: [
              { campo: "Idempotency-Key", problema: "8-128 caracteres: letras, números, _ . : -" },
            ],
          },
        })
      );
    }

    // Se lee una COPIA del cuerpo: el original queda intacto para el handler.
    const cuerpo = new Uint8Array(await c.req.raw.clone().arrayBuffer());
    const url = new URL(c.req.url);
    const huella = huellaDePeticion({
      metodo: c.req.method,
      camino,
      query: url.search,
      tipo: c.req.header("content-type") ?? "",
      cuerpo,
    });
    const almacenClave = claveDeAlmacen(actorDe(c), clave);
    const token = nuevoToken();
    const enCurso: Registro = { estado: "en-curso", token, huella, creado: Date.now() };

    let almacen: AlmacenIdempotencia;
    try {
      const r = await reservarEnCadena(opciones.almacenes(), almacenClave, enCurso, config.bloqueoMs);
      almacen = r.almacen;

      if (!r.reserva.reservado) {
        const existente = r.reserva.existente;
        if (existente.huella !== huella) {
          return responderProblema(
            c,
            buildProblem({
              code: "KITSUDEN_E_IDEMPOTENCY_KEY_REUSED",
              detail:
                "This Idempotency-Key was already used with a different method, path, query or body.",
              instance: camino,
              requestId,
            })
          );
        }
        if (existente.estado === "en-curso") {
          return responderProblema(
            c,
            buildProblem({
              code: "KITSUDEN_E_IDEMPOTENCY_IN_PROGRESS",
              detail: "A request with this Idempotency-Key is still being processed.",
              instance: camino,
              requestId,
            })
          );
        }
        if (existente.estado === "sin-repeticion") {
          return responderProblema(
            c,
            buildProblem({
              code: "KITSUDEN_E_IDEMPOTENCY_NOT_REPLAYABLE",
              detail:
                existente.motivo === "secreto"
                  ? "The original request already succeeded; its response contained a secret and was not stored."
                  : "The original request already succeeded; its response was not stored.",
              instance: camino,
              requestId,
            }),
            { "idempotent-replayed": "true" }
          );
        }
        // Repetición
        const cabeceras = new Headers(existente.respuesta.cabeceras);
        cabeceras.set("idempotent-replayed", "true");
        cabeceras.set("idempotency-key", clave);
        const original = existente.respuesta;
        const cuerpoGuardado = desdeBase64(original.cuerpoB64);
        return new Response(
          [101, 204, 205, 304].includes(original.status) ? null : cuerpoGuardado,
          { status: original.status, headers: cabeceras }
        );
      }
    } catch (err) {
      if (!(err instanceof AlmacenNoDisponible)) throw err;
      opciones.avisar?.("[idempotencia] sin almacén", { causas: err.causas, modo: config.modoDeFallo });
      if (config.modoDeFallo === "open") {
        c.header("idempotency-status", "unavailable");
        return next();
      }
      return responderProblema(
        c,
        buildProblem({
          code: "KITSUDEN_E_IDEMPOTENCY_UNAVAILABLE",
          detail:
            "The idempotency store is unavailable, so the request was not executed. Retry with the same Idempotency-Key.",
          instance: camino,
          requestId,
        })
      );
    }

    // ── Primera vez: ejecutar y guardar ─────────────────────────────────────
    try {
      await next();
    } catch (err) {
      // `onError` ya habrá respondido; esto es por si algo se escapa.
      await almacen.liberar(almacenClave, token).catch(() => {});
      throw err;
    }

    const res = c.res;
    const tipo = res.headers.get("content-type") ?? "";
    try {
      if (!seGuardaElEstado(res.status) || tipo.includes("text/event-stream")) {
        await almacen.liberar(almacenClave, token);
      } else {
        const bytes = new Uint8Array(await res.clone().arrayBuffer());
        let registro: Registro;
        if (bytes.byteLength > config.maxRespuestaBytes) {
          registro = { estado: "sin-repeticion", token, huella, creado: enCurso.creado, motivo: "demasiado-grande" };
        } else if (cuerpoConSecreto(tipo, bytes)) {
          registro = { estado: "sin-repeticion", token, huella, creado: enCurso.creado, motivo: "secreto" };
        } else {
          registro = {
            estado: "hecho",
            token,
            huella,
            creado: enCurso.creado,
            respuesta: {
              status: res.status,
              cabeceras: cabecerasRepetibles(res.headers),
              cuerpoB64: base64(bytes),
            },
          };
        }
        await almacen.completar(almacenClave, token, registro, config.vidaMs);
      }
    } catch (err) {
      // La operación YA se hizo: no se convierte en error por no poder
      // apuntarla. La reserva caduca sola (`IDEMPOTENCY_LOCK_SECONDS`).
      opciones.avisar?.("[idempotencia] no se pudo guardar el resultado", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    c.header("idempotency-key", clave);
  };
}
