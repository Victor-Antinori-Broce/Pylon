/**
 * Aprobación humana de lo que piden los agentes (fase F) — la ejecución
 * ============================================================================
 *
 * El contrato (tipos, configuración de fábrica, la tabla de decisión) está en
 * `@kitsuden/shared` (`aprobaciones.ts`); la guía pública en
 * `docs/agents/approvals.md`. Aquí:
 *
 *   · la CONFIGURACIÓN en caché (se relee cada `APPROVALS_CACHE_SECONDS`, 10
 *     por defecto, y al instante en este proceso cuando un admin la cambia).
 *     Con todo apagado (lo de fábrica) una petición de agente no hace NINGUNA
 *     consulta de más: solo cuesta mirar la caché; la de un humano, ni eso;
 *   · `puertaDeAprobacion()`: el middleware REST. Va tras la autenticación,
 *     las puertas y la `Idempotency-Key` (así el 202 se guarda y un reintento
 *     con la misma clave recibe la MISMA propuesta);
 *   · crear la propuesta (cuerpo sin secretos, diff barato, deduplicada por
 *     clave de idempotencia o por huella mientras está pendiente);
 *   · aprobar (con reserva atómica: dos aprobaciones a la vez ejecutan UNA
 *     vez), rechazar y caducar;
 *   · ejecutar con la identidad del agente (releída de la base: scopes de
 *     AHORA; si se revocó, no se ejecuta) dejando constancia del humano.
 *
 * ── CÓMO SE EJECUTA UNA PROPUESTA APROBADA ────────────────────────────────
 *
 * Por el MISMO camino que la petición original:
 *
 *   rest  la petición (método, camino, cuerpo) vuelve a entrar en la app
 *         (`app.fetch`) con la identidad del agente puesta por el proceso en
 *         el `env` (`MARCA_EJECUCION_INTERNA`, un símbolo: no llega desde la
 *         red). Pasa otra vez por denegaciones, puertas, permiso de la
 *         operación, RLS y handler. Lo único que se salta: esta puerta y las
 *         cuotas (ya se contaron al proponer).
 *   mcp   la herramienta se vuelve a llamar con sus argumentos y una sesión
 *         del agente reconstruida (ver routes/mcp.ts).
 */

import {
  CONFIG_DE_APROBACIONES_POR_DEFECTO,
  buildProblem,
  claveDeHerramientaMcp,
  decidirAprobacion,
  denegacionDeOperacion,
  esMetodoDeEscritura,
  esModoDeAprobacion,
  esSensible,
  esSoloLectura,
  fusionarConfigDeAprobaciones,
  herramientaMcpSensiblePorDefecto,
  huellaDeContextoDeDecision,
  leerConfigDeAprobaciones,
  reglaLegadaCasa,
  scopeFinoDeOperacion,
  type ConfigDeAprobaciones,
  type EstadoDePropuesta,
  type ModoDeAprobacion,
  type MotivoDePropuesta,
} from "@kitsuden/shared";
import { createHash } from "node:crypto";

import { and, asc, desc, eq, gt, inArray, lte, ne, sql, type SQL } from "drizzle-orm";
import type { Context, Next } from "hono";

import { detectarTipoReal } from "../../../../packages/core/media/tipo-real";
import {
  concedeOperacion,
  operacionDeRuta,
  type OperacionDeRuta,
} from "../../../../packages/engine/src/operaciones";
import { db } from "../db";
import {
  agentIdentities,
  agentProposalFiles,
  agentProposals,
  approvalSettings,
  authUsers,
} from "../db/schema";
import {
  RUTAS_SOLO_ADMIN,
  RUTAS_SOLO_ADMIN_TEMPRANAS,
  reglaPara,
} from "../middleware/auth-guard";
import { registrarAccionDeAgente, type AuditAction } from "../services/agent-audit";
import {
  contextoDeAgenteParaAprobacion,
  type AgentAuthContext,
} from "../services/agent-auth";

import { avisarResolucion } from "./avisos-de-propuestas";
import { encolarClasificacion } from "./clasificador-de-inyeccion";
import {
  CLAVE_IDEMPOTENCIA_VALIDA,
  contieneSecreto,
  cuerpoConSecreto,
  huellaDePeticion,
  rutaQueRecibeSecretos,
} from "./idempotencia";
import { logger } from "./logger";

export type Propuesta = typeof agentProposals.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════
// Configuración (en caché)
// ═══════════════════════════════════════════════════════════════════════════

export interface InstantaneaDeAprobaciones {
  config: ConfigDeAprobaciones;
  /** Solo los agentes que NO están en `inherit`. */
  modos: Map<string, ModoDeAprobacion>;
  leida: number;
  actualizadaPor: string | null;
  actualizadaEn: Date | null;
}

const ID_CONFIG = "global";

function vidaDeCacheMs(): number {
  const n = Number(process.env.APPROVALS_CACHE_SECONDS);
  return (Number.isFinite(n) && n >= 0 && n <= 3600 ? n : 10) * 1000;
}

let cache: InstantaneaDeAprobaciones | null = null;
let enVuelo: Promise<InstantaneaDeAprobaciones> | null = null;
let avisadoSinTabla = false;

async function leerDeLaBase(): Promise<InstantaneaDeAprobaciones> {
  try {
    const [fila] = await db
      .select()
      .from(approvalSettings)
      .where(eq(approvalSettings.id, ID_CONFIG))
      .limit(1);
    const filas = await db
      .select({ id: agentIdentities.id, modo: agentIdentities.approvalMode })
      .from(agentIdentities)
      .where(ne(agentIdentities.approvalMode, "inherit"));
    const modos = new Map<string, ModoDeAprobacion>();
    for (const f of filas) if (esModoDeAprobacion(f.modo) && f.modo !== "inherit") modos.set(f.id, f.modo);
    cache = {
      config: leerConfigDeAprobaciones(fila?.value),
      modos,
      leida: Date.now(),
      actualizadaPor: fila?.updatedBy ?? null,
      actualizadaEn: fila?.updatedAt ?? null,
    };
    return cache;
  } catch (err) {
    // Sin la migración 0048 (o sin base): la última conocida; sin ninguna, la
    // de fábrica (apagada), que es exactamente el comportamiento de antes.
    if (!avisadoSinTabla) {
      avisadoSinTabla = true;
      logger.warn({ err }, "[aprobaciones] no se pudo leer la configuración; se usa la última conocida o la de fábrica");
    }
    if (cache) return { ...cache, leida: Date.now() };
    return {
      config: { ...CONFIG_DE_APROBACIONES_POR_DEFECTO },
      modos: new Map(),
      leida: Date.now(),
      actualizadaPor: null,
      actualizadaEn: null,
    };
  }
}

export async function instantaneaDeAprobaciones(): Promise<InstantaneaDeAprobaciones> {
  if (cache && Date.now() - cache.leida < vidaDeCacheMs()) return cache;
  if (!enVuelo) enVuelo = leerDeLaBase().finally(() => (enVuelo = null));
  return enVuelo;
}

/** Tras un cambio: la próxima petición relee (en este proceso, al instante). */
export function invalidarConfigDeAprobaciones(): void {
  cache = null;
}

/**
 * ¿Hay algo encendido? Si no, la puerta no mira nada más. El global es el
 * interruptor MAESTRO: apagado, nadie pide aprobación (tampoco `propose`).
 */
export function todoApagado(i: InstantaneaDeAprobaciones): boolean {
  return !i.config.enabled;
}

export async function guardarConfigDeAprobaciones(
  cambio: Partial<Record<keyof ConfigDeAprobaciones, unknown>>,
  quien: string
): Promise<{ antes: ConfigDeAprobaciones; despues: ConfigDeAprobaciones }> {
  invalidarConfigDeAprobaciones();
  const antes = (await leerDeLaBase()).config;
  const despues = fusionarConfigDeAprobaciones(antes, cambio); // lanza con el motivo
  await db
    .insert(approvalSettings)
    .values({ id: ID_CONFIG, value: despues, updatedBy: quien, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: approvalSettings.id,
      set: { value: despues, updatedBy: quien, updatedAt: new Date() },
    });
  invalidarConfigDeAprobaciones();
  await auditar({
    agentId: null,
    action: "approval_settings_changed",
    resource: "approval_settings",
    details: { by: quien, before: antes, after: despues },
  });
  return { antes, despues };
}

export async function guardarModoDeAgente(
  agentId: string,
  modo: ModoDeAprobacion,
  quien: string
): Promise<{ antes: string; despues: ModoDeAprobacion } | null> {
  const [a] = await db
    .select({ modo: agentIdentities.approvalMode })
    .from(agentIdentities)
    .where(eq(agentIdentities.id, agentId))
    .limit(1);
  if (!a) return null;
  await db
    .update(agentIdentities)
    .set({ approvalMode: modo, updatedAt: new Date() })
    .where(eq(agentIdentities.id, agentId));
  invalidarConfigDeAprobaciones();
  await auditar({
    agentId,
    action: "approval_mode_changed",
    resource: "approval_mode",
    details: { by: quien, before: a.modo, after: modo },
  });
  return { antes: a.modo, despues: modo };
}

// ═══════════════════════════════════════════════════════════════════════════
// La decisión
// ═══════════════════════════════════════════════════════════════════════════

export interface DecisionDeAprobacion {
  motivo: MotivoDePropuesta;
  sensible: boolean;
  /** Clave de configuración de la operación (`kon:blog:borrar-entrada`), si la hay. */
  clave: string | null;
  deRuta: OperacionDeRuta | null;
}

/** La sensibilidad de una operación del SDK: lo del admin, o lo declarado. */
export function sensibilidadDeOperacion(
  config: ConfigDeAprobaciones,
  konId: string,
  op: OperacionDeRuta["op"]
): { clave: string; sensible: boolean; porDefecto: boolean; cambiada: boolean } {
  const clave = scopeFinoDeOperacion(konId, op.id);
  const porDefecto = esSensible(op);
  const cambiada = Object.prototype.hasOwnProperty.call(config.operations, clave);
  return { clave, sensible: cambiada ? config.operations[clave]! : porDefecto, porDefecto, cambiada };
}

export function modoDeAgente(i: InstantaneaDeAprobaciones, agentId: string): ModoDeAprobacion {
  return i.modos.get(agentId) ?? "inherit";
}

/** ¿Hay que retener esta petición REST de este agente? */
export function evaluarPeticion(
  i: InstantaneaDeAprobaciones,
  agentId: string,
  metodo: string,
  camino: string,
  /** A POST that deletes (see `batchBorra`): for the legacy rules it counts as a DELETE. */
  opciones: { borra?: boolean } = {}
): DecisionDeAprobacion | null {
  const modo = modoDeAgente(i, agentId);
  if (!i.config.enabled || modo === "direct") return null;
  // Lo que no pasa por esta puerta tampoco se retiene por MCP (mismo criterio).
  if (excluida(camino)) return null;
  const deRuta = operacionDeRuta(metodo, camino);
  let sensible: boolean;
  let clave: string | null = null;
  if (deRuta) {
    const s = sensibilidadDeOperacion(i.config, deRuta.konId, deRuta.op);
    sensible = s.sensible;
    clave = s.clave;
  } else {
    const metodoDeRegla = opciones.borra ? "DELETE" : metodo;
    sensible = i.config.legacyRules.some((r) => reglaLegadaCasa(r, metodoDeRegla, camino));
  }
  const motivo = decidirAprobacion({
    modo,
    globalActivo: i.config.enabled,
    sensible,
    escritura: esMetodoDeEscritura(metodo),
    soloLectura: deRuta ? esSoloLectura(deRuta.op) : false,
    retencion: i.config.proposeRetention,
  });
  return motivo ? { motivo, sensible, clave, deRuta } : null;
}

/** ¿Hay que retener esta llamada a una herramienta MCP que NO es del SDK? */
export function evaluarHerramientaDelNucleo(
  i: InstantaneaDeAprobaciones,
  agentId: string,
  nombre: string,
  escribe: boolean
): { motivo: MotivoDePropuesta; clave: string; sensible: boolean } | null {
  const modo = modoDeAgente(i, agentId);
  if (!i.config.enabled || modo === "direct") return null;
  const clave = claveDeHerramientaMcp(nombre);
  const sensible = Object.prototype.hasOwnProperty.call(i.config.operations, clave)
    ? i.config.operations[clave]!
    : herramientaMcpSensiblePorDefecto(nombre);
  const motivo = decidirAprobacion({ modo, globalActivo: i.config.enabled, sensible, escritura: escribe });
  return motivo ? { motivo, clave, sensible } : null;
}

/**
 * ¿Podría el agente hacerlo AHORA? Si no, no se propone: la petición sigue y
 * la ruta responde su 403 de siempre (proponer algo que fallará solo llena la
 * bandeja). Solo se sabe para las operaciones del SDK.
 */
export async function agentePodriaEjecutar(
  deRuta: OperacionDeRuta | null,
  usuario: { id: string; role: string; scopes: string[] }
): Promise<boolean> {
  if (!deRuta) return true;
  if (denegacionDeOperacion(usuario.scopes, deRuta.konId, deRuta.op)) return false;
  if (!deRuta.op.permiso || deRuta.op.permiso.politica?.enHandler) return true;
  return concedeOperacion(deRuta.konId, deRuta.op, usuario);
}

// ═══════════════════════════════════════════════════════════════════════════
// Ejecución interna (la identidad del agente sin su secreto)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Lo pone el PROCESO en el `env` de `app.fetch`: Bun solo pasa
 * `{ ip }` a las peticiones que llegan por la red, así que nadie de fuera
 * puede fabricarlo.
 */
export const MARCA_EJECUCION_INTERNA: unique symbol = Symbol("kitsuden.aprobaciones.ejecucion-interna");

export interface EjecucionInterna {
  agente: AgentAuthContext;
  /** Presente al ejecutar una propuesta aprobada. */
  aprobacion?: { proposalId: string; approvedBy: string };
  /** Lectura auxiliar (el diff): sin efectos. */
  lectura?: boolean;
  /**
   * Llamada del código de una acción desde el sandbox (lib/worker-sandbox.ts).
   * NO es una propuesta ya aprobada: pasa por la puerta de aprobación y por
   * las cuotas como cualquier petición de esa identidad.
   */
  sandbox?: { actionId: string };
}

/**
 * ¿Esta petición interna ya pasó la aprobación y pagó su cuota? Las de una
 * propuesta aprobada y las lecturas del diff, sí; las del sandbox, no.
 */
export function ejecucionYaCobrada(c: Context): boolean {
  const e = ejecucionInternaDe(c);
  return !!e && !e.sandbox;
}

export function ejecucionInternaDe(c: Context): EjecucionInterna | null {
  const env = c.env as Record<string | symbol, unknown> | undefined;
  if (!env || typeof env !== "object") return null;
  const e = env[MARCA_EJECUCION_INTERNA] as EjecucionInterna | undefined;
  return e && typeof e === "object" && e.agente ? e : null;
}

/** El `user` con el que un agente llega a las rutas (la misma forma que en index.ts). */
export function usuarioDeAgente(a: AgentAuthContext) {
  return {
    id: a.agentId,
    name: a.agentName,
    email: `agent@${a.agentId}.kitsuden.local`,
    image: null,
    role: "agent",
    scopes: a.scopes,
    sponsor: a.sponsor ?? null,
  };
}

type FetchDeApp = (req: Request, env: Record<string | symbol, unknown>) => Response | Promise<Response>;
let fetchDeApp: FetchDeApp | null = null;

/** Lo llama index.ts con la app ya montada. */
export function fijarAppDeAprobaciones(fn: FetchDeApp): void {
  fetchDeApp = fn;
}

export interface ResultadoMcpDeAprobacion {
  content?: unknown;
  structuredContent?: unknown;
  isError?: boolean;
}
type EjecutorMcp = (
  herramienta: string,
  args: Record<string, unknown>,
  agente: AgentAuthContext,
  aprobacion: { proposalId: string; approvedBy: string }
) => Promise<ResultadoMcpDeAprobacion>;
let ejecutorMcp: EjecutorMcp | null = null;

/** Lo llama routes/mcp.ts: cómo volver a llamar a una herramienta. */
export function fijarEjecutorMcpDeAprobaciones(fn: EjecutorMcp): void {
  ejecutorMcp = fn;
}

export async function peticionInterna(
  e: EjecucionInterna,
  metodo: string,
  camino: string,
  cuerpo?: unknown,
  tipo?: string | null
): Promise<Response> {
  if (!fetchDeApp) throw new Error("La app no registró su fetch para las aprobaciones");
  const headers: Record<string, string> = { accept: "application/json" };
  let body: string | FormData | undefined;
  if (cuerpo instanceof FormData) {
    // Una subida retenida: el `Request` pone él el `content-type` con su boundary.
    body = cuerpo;
  } else if (cuerpo !== undefined && cuerpo !== null && metodo !== "GET") {
    headers["content-type"] = tipo || "application/json";
    body = JSON.stringify(cuerpo);
  }
  const req = new Request(`http://localhost${camino}`, { method: metodo, headers, body });
  return fetchDeApp(req, { [MARCA_EJECUCION_INTERNA]: e });
}

// ═══════════════════════════════════════════════════════════════════════════
// Crear la propuesta
// ═══════════════════════════════════════════════════════════════════════════

/** Cuerpo más grande que se retiene (256 KiB). */
const MAX_CUERPO_BYTES = 256 * 1024;
/** Lo más grande que se guarda de un diff o de un resultado. */
const MAX_GUARDADO_BYTES = 256 * 1024;

export class PropuestaNoAdmitida extends Error {
  constructor(readonly motivo: "secret" | "multipart" | "not_image" | "not_json" | "too_large") {
    super(motivo);
  }
}

// ── Subidas de IMÁGENES retenidas (decisión del propietario, 2026-10-26) ─────
//
// Una subida multipart se puede retener SOLO si cada fichero es una imagen
// cuyo tipo REAL (la firma de sus primeros bytes, `tipo-real.ts` de la
// mediateca) es JPEG, PNG, GIF, WebP o AVIF; cada una cabe en el tamaño máximo
// de la mediateca; y los campos de texto no llevan secretos. Los bytes esperan
// en `agent_proposal_files` (privada; ver la migración 0050), no en `/media`.
// Al aprobarla, el formulario se reconstruye y se ejecuta con la identidad del
// agente, como un cuerpo JSON. Al rechazarla, caducar o ejecutarse, los
// ficheros se borran.

/** Los formatos de IMAGEN de la mediateca que se retienen (sin vídeo ni PDF). */
export const IMAGENES_RETENIBLES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
]);

/** Ficheros por subida retenida: los mismos que acepta la mediateca. */
export const MAX_IMAGENES_RETENIDAS = 20;

/**
 * Tamaño máximo de UNA imagen retenida: `APPROVALS_MAX_UPLOAD_MB` (1-100), y
 * si no se dice, 10 MB, el mismo que la mediateca (`MAX_BYTES_POR_FICHERO`).
 */
export function maxBytesPorImagen(): number {
  const n = Number(process.env.APPROVALS_MAX_UPLOAD_MB);
  return (Number.isFinite(n) && n > 0 && n <= 100 ? n : 10) * 1024 * 1024;
}

/** Lo más que se lee de una petición multipart antes de cortar. */
function maxBytesDeSubida(): number {
  return maxBytesPorImagen() * MAX_IMAGENES_RETENIDAS + MAX_CUERPO_BYTES;
}

export function esMultipart(tipo: string | null | undefined): boolean {
  return (tipo ?? "").toLowerCase().includes("multipart/");
}

/** Tipo con el que se guarda una subida retenida (sin el boundary, que cambia en cada envío). */
export const TIPO_DE_SUBIDA_RETENIDA = "multipart/form-data";

export interface ImagenRetenida {
  campo: string;
  nombre: string;
  mime: string;
  bytes: Uint8Array;
  sha256: string;
}

/** Lo que queda en `agent_proposals.body` de una subida (sin bytes). */
export interface CuerpoDeSubida {
  multipart: true;
  fields: { name: string; value: string }[];
  files: { field: string; filename: string; mimeType: string; size: number; sha256: string }[];
}

export function esCuerpoDeSubida(v: unknown): v is CuerpoDeSubida {
  return !!v && typeof v === "object" && (v as { multipart?: unknown }).multipart === true;
}

/** Lo que se mira de la petición (vale el `Request` de Bun y el de undici). */
interface PeticionLegible {
  headers: { get(nombre: string): string | null };
  body: ReadableStream<Uint8Array> | null;
}

/** Lee el cuerpo con tope: más de `max` bytes → `too_large` sin leer el resto. */
async function leerConTope(req: PeticionLegible, max: number): Promise<Uint8Array> {
  const declarado = Number(req.headers.get("content-length"));
  if (Number.isFinite(declarado) && declarado > max) throw new PropuestaNoAdmitida("too_large");
  if (!req.body) return new Uint8Array();
  const lector = req.body.getReader();
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await lector.cancel().catch(() => undefined);
      throw new PropuestaNoAdmitida("too_large");
    }
    trozos.push(value);
  }
  const salida = new Uint8Array(total);
  let i = 0;
  for (const t of trozos) {
    salida.set(t, i);
    i += t.byteLength;
  }
  return salida;
}

/**
 * La subida multipart, comprobada, para guardarla como propuesta; o lanza
 * `PropuestaNoAdmitida` con el motivo (`not_image`, `too_large`, `secret`,
 * `multipart` si el formulario está roto). `huella` es una forma CANÓNICA
 * (campos + sha256 de cada fichero): el boundary cambia en cada envío y con
 * los bytes crudos un reintento idéntico sería otra petición.
 */
export async function subidaParaPropuesta(
  req: PeticionLegible,
  tipo: string
): Promise<{ cuerpo: CuerpoDeSubida; imagenes: ImagenRetenida[]; huella: Uint8Array }> {
  const crudo = await leerConTope(req, maxBytesDeSubida());
  let form: FormData;
  try {
    form = (await new Response(crudo as unknown as ConstructorParameters<typeof Response>[0], { headers: { "content-type": tipo } }).formData()) as unknown as FormData;
  } catch {
    throw new PropuestaNoAdmitida("multipart");
  }
  const fields: CuerpoDeSubida["fields"] = [];
  const imagenes: ImagenRetenida[] = [];
  let bytesDeTexto = 0;
  const maxImagen = maxBytesPorImagen();
  for (const [nombre, entrada] of form.entries()) {
    const valor = entrada as unknown as string | File;
    if (typeof valor === "string") {
      bytesDeTexto += nombre.length + valor.length;
      fields.push({ name: nombre, value: valor });
      continue;
    }
    if (imagenes.length >= MAX_IMAGENES_RETENIDAS) throw new PropuestaNoAdmitida("too_large");
    if (valor.size > maxImagen) throw new PropuestaNoAdmitida("too_large");
    const bytes = new Uint8Array(await valor.arrayBuffer());
    const real = detectarTipoReal(bytes);
    // El tipo que dice el cliente y la extensión no cuentan: solo la firma.
    if (!real || !IMAGENES_RETENIBLES.has(real.mime)) throw new PropuestaNoAdmitida("not_image");
    imagenes.push({
      campo: nombre,
      nombre: String(valor.name || "imagen").normalize("NFKC").slice(0, 255),
      mime: real.mime,
      bytes,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  if (bytesDeTexto > MAX_CUERPO_BYTES) throw new PropuestaNoAdmitida("too_large");
  // Secretos: en los campos de texto (por nombre o por valor) y en los nombres de fichero.
  const comoObjeto: Record<string, unknown> = {};
  for (const f of fields) comoObjeto[f.name] = f.value;
  if (
    contieneSecreto(comoObjeto) ||
    contieneSecreto(fields.map((f) => f.value)) ||
    contieneSecreto(imagenes.map((i) => i.nombre))
  ) {
    throw new PropuestaNoAdmitida("secret");
  }
  const cuerpo: CuerpoDeSubida = {
    multipart: true,
    fields,
    files: imagenes.map((i) => ({
      field: i.campo,
      filename: i.nombre,
      mimeType: i.mime,
      size: i.bytes.byteLength,
      sha256: i.sha256,
    })),
  };
  return { cuerpo, imagenes, huella: new TextEncoder().encode(JSON.stringify(cuerpo)) };
}

/** Los ficheros retenidos de una propuesta, sin los bytes (para el panel). */
export async function ficherosDePropuesta(proposalId: string) {
  return db
    .select({
      id: agentProposalFiles.id,
      field: agentProposalFiles.field,
      filename: agentProposalFiles.filename,
      mimeType: agentProposalFiles.mimeType,
      size: agentProposalFiles.size,
    })
    .from(agentProposalFiles)
    .where(eq(agentProposalFiles.proposalId, proposalId))
    .orderBy(asc(agentProposalFiles.position));
}

/** Un fichero retenido con sus bytes (la miniatura del panel). */
export async function ficheroDePropuesta(proposalId: string, fileId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(fileId) || !/^[0-9a-f-]{36}$/i.test(proposalId)) return null;
  const [f] = await db
    .select()
    .from(agentProposalFiles)
    .where(and(eq(agentProposalFiles.proposalId, proposalId), eq(agentProposalFiles.id, fileId)))
    .limit(1);
  return f ?? null;
}

/** Borra los ficheros retenidos de estas propuestas (rechazadas, caducadas o ejecutadas). */
export async function borrarFicherosDePropuestas(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const borrados = await db
    .delete(agentProposalFiles)
    .where(inArray(agentProposalFiles.proposalId, ids))
    .returning({ id: agentProposalFiles.id });
  return borrados.length;
}

/** El formulario de una subida retenida, reconstruido para ejecutarla. */
async function formularioDePropuesta(p: Propuesta): Promise<FormData> {
  if (!esCuerpoDeSubida(p.body)) throw new Error("La propuesta no es una subida");
  const filas = await db
    .select()
    .from(agentProposalFiles)
    .where(eq(agentProposalFiles.proposalId, p.id))
    .orderBy(asc(agentProposalFiles.position));
  if (filas.length !== p.body.files.length) throw new Error("files_missing");
  const form = new FormData();
  for (const f of p.body.fields) form.append(f.name, f.value);
  for (const f of filas) {
    const bytes = new Uint8Array(f.content);
    // Lo mismo que se propuso: si los bytes no casan con su huella, no se ejecuta.
    if (createHash("sha256").update(bytes).digest("hex") !== f.sha256) throw new Error("files_tampered");
    form.append(f.field, new File([bytes], f.filename, { type: f.mimeType }));
  }
  return form;
}

export class ClaveDeIdempotenciaReutilizada extends Error {}

function recortar(valor: unknown, max = MAX_GUARDADO_BYTES): unknown {
  if (valor === undefined) return null;
  const texto = JSON.stringify(valor);
  if (texto === undefined) return null;
  if (texto.length <= max) return valor;
  return { truncated: true, bytes: texto.length, preview: texto.slice(0, 2000) };
}

function desenvolver(cuerpo: unknown): Record<string, unknown> | null {
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return null;
  const o = cuerpo as Record<string, unknown>;
  // `{ data: {...} }` y `{ post: {...} }`: lo de dentro es el recurso.
  const claves = Object.keys(o);
  if (claves.length <= 3) {
    for (const k of ["data", "item", "entry", "post", "record"]) {
      const v = o[k];
      if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
    }
  }
  return o;
}

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * El diff BARATO: una lectura del recurso con la identidad del agente (lo que
 * él podría ver; nada más) y la comparación campo a campo con lo propuesto.
 * Si no se puede leer, se dice y no pasa nada.
 */
export async function calcularDiff(
  agente: AgentAuthContext,
  metodo: string,
  camino: string,
  cuerpo: unknown
): Promise<unknown> {
  const m = metodo.toUpperCase();
  if (m === "POST") return { kind: "create", proposed: recortar(cuerpo, 64 * 1024) };
  if (m !== "PATCH" && m !== "PUT" && m !== "DELETE") return null;
  const sinQuery = camino.split("?")[0]!;
  let actual: Record<string, unknown> | null = null;
  let leido: number | string = "skipped";
  try {
    const res = await Promise.race([
      peticionInterna({ agente, lectura: true }, "GET", sinQuery),
      new Promise<never>((_, rechazar) => setTimeout(() => rechazar(new Error("timeout")), 3000)),
    ]);
    leido = res.status;
    if (res.ok && (res.headers.get("content-type") ?? "").includes("json")) {
      actual = desenvolver(await res.json());
    }
  } catch (err) {
    leido = err instanceof Error ? err.message : "error";
  }
  if (m === "DELETE") {
    return actual
      ? { kind: "delete", current: recortar(actual, 64 * 1024) }
      : { kind: "delete", current: null, currentUnavailable: leido };
  }
  const propuesto = desenvolver(cuerpo) ?? {};
  if (!actual) {
    return { kind: m === "PUT" ? "replace" : "update", proposed: recortar(propuesto, 64 * 1024), currentUnavailable: leido };
  }
  const changes = Object.keys(propuesto)
    .filter((k) => !igual(actual![k], propuesto[k]))
    .map((k) => ({ field: k, before: recortar(actual![k], 8 * 1024), after: recortar(propuesto[k], 8 * 1024) }));
  return { kind: m === "PUT" ? "replace" : "update", changes };
}

export interface DatosDePropuesta {
  agente: AgentAuthContext;
  canal: "rest" | "mcp";
  metodo: string;
  camino: string;
  cuerpo: unknown;
  tipo: string | null;
  huella: string;
  idempotencyKey: string | null;
  motivo: MotivoDePropuesta;
  konId?: string | null;
  operacionId?: string | null;
  clave?: string | null;
  herramienta?: string | null;
  /** Camino para leer el estado actual (diff); `null` = sin diff de lectura. */
  caminoDeDiff?: string | null;
  diff?: unknown;
  /** Las imágenes de una subida multipart retenida (se guardan aparte, privadas). */
  imagenes?: ImagenRetenida[];
}

/**
 * Guarda la propuesta, o devuelve la que ya existe:
 *   · con la misma clave de idempotencia y la misma huella → esa (cualquier
 *     estado: el agente ve en qué quedó); con otra huella → error 422;
 *   · sin clave: una PENDIENTE con la misma huella → esa (no se duplica la
 *     bandeja porque el agente reintente).
 */
export async function crearPropuesta(d: DatosDePropuesta): Promise<{ propuesta: Propuesta; nueva: boolean }> {
  const agentId = d.agente.agentId;
  // El último filtro antes de la base (F79): pase por donde pase (REST, MCP,
  // subida), una propuesta no guarda un secreto. Al aprobarla se ejecuta el
  // cuerpo GUARDADO, así que no se puede guardar censurado: se rechaza.
  if (cuerpoConSecretoParaPropuesta(d.camino, d.cuerpo) || (d.diff !== undefined && contieneSecreto(d.diff))) {
    throw new PropuestaNoAdmitida("secret");
  }
  if (d.idempotencyKey) {
    const [previa] = await db
      .select()
      .from(agentProposals)
      .where(and(eq(agentProposals.agentId, agentId), eq(agentProposals.idempotencyKey, d.idempotencyKey)))
      .limit(1);
    if (previa) {
      if (previa.fingerprint !== d.huella) throw new ClaveDeIdempotenciaReutilizada();
      return { propuesta: previa, nueva: false };
    }
  } else {
    const [previa] = await db
      .select()
      .from(agentProposals)
      .where(
        and(
          eq(agentProposals.agentId, agentId),
          eq(agentProposals.fingerprint, d.huella),
          eq(agentProposals.status, "pending"),
          gt(agentProposals.expiresAt, new Date())
        )
      )
      .limit(1);
    if (previa) return { propuesta: previa, nueva: false };
  }

  const { config } = await instantaneaDeAprobaciones();
  const diffCalculado =
    d.diff !== undefined
      ? d.diff
      : d.caminoDeDiff
        ? await calcularDiff(d.agente, d.metodo, d.caminoDeDiff, d.cuerpo)
        : null;
  // El diff solo informa: si la lectura del estado actual trae un secreto, no se guarda.
  const diff = diffCalculado && contieneSecreto(diffCalculado) ? { omitted: "secret" } : diffCalculado;
  // La propuesta y sus imágenes, juntas: o las dos o ninguna.
  const insertadas = await db.transaction(async (tx) => {
    const filas = await tx
    .insert(agentProposals)
    .values({
      agentId,
      keyId: d.agente.keyId || null,
      channel: d.canal,
      method: d.metodo.toUpperCase(),
      path: d.camino,
      konId: d.konId ?? null,
      operationId: d.operacionId ?? null,
      operationKey: d.clave ?? null,
      tool: d.herramienta ?? null,
      body: (d.cuerpo ?? null) as never,
      contentType: d.tipo,
      fingerprint: d.huella,
      idempotencyKey: d.idempotencyKey,
      scopes: d.agente.scopes,
      reason: d.motivo,
      diff: (diff ?? null) as never,
      status: "pending",
      // Fase F: el firmante humano del agente al proponer (se actualiza al ejecutar).
      sponsorUserId: d.agente.sponsor?.userId ?? null,
      expiresAt: new Date(Date.now() + config.ttlHours * 3_600_000),
    })
    .onConflictDoNothing()
    .returning();
    const nueva = filas[0];
    if (nueva && d.imagenes?.length) {
      await tx.insert(agentProposalFiles).values(
        d.imagenes.map((img, position) => ({
          proposalId: nueva.id,
          position,
          field: img.campo,
          filename: img.nombre,
          mimeType: img.mime,
          size: img.bytes.byteLength,
          sha256: img.sha256,
          content: Buffer.from(img.bytes),
        }))
      );
    }
    return filas;
  });
  let propuesta = insertadas[0];
  if (!propuesta) {
    // Carrera con otra petición con la misma clave: la suya gana.
    const [otra] = await db
      .select()
      .from(agentProposals)
      .where(and(eq(agentProposals.agentId, agentId), eq(agentProposals.idempotencyKey, d.idempotencyKey ?? "")))
      .limit(1);
    if (!otra) throw new Error("No se pudo guardar la propuesta");
    if (otra.fingerprint !== d.huella) throw new ClaveDeIdempotenciaReutilizada();
    return { propuesta: otra, nueva: false };
  }
  await auditar({
    agentId,
    keyId: d.agente.keyId || undefined,
    action: "proposal_created",
    resource: `${propuesta.method} ${propuesta.path}`,
    resourceId: propuesta.id,
    details: {
      channel: d.canal,
      reason: d.motivo,
      operation: d.clave ?? null,
      tool: d.herramienta ?? null,
      idempotencyKey: d.idempotencyKey ? true : false,
      sponsor: d.agente.sponsor?.userId ?? null,
      files: d.imagenes?.length ?? 0,
    },
  });
  // D5: segunda opinión de un clasificador de inyección, si hay (no decide nada).
  await encolarClasificacion(propuesta.id);
  return { propuesta, nueva: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// Lo que ve el agente
// ═══════════════════════════════════════════════════════════════════════════

export function urlDeEstado(id: string): string {
  return `/api/proposals/${id}`;
}

/** La propuesta tal como la ve SU agente (sin quién decidió ni el diff). */
export function vistaParaAgente(p: Propuesta) {
  const terminada = p.status === "executed" || p.status === "failed";
  return {
    id: p.id,
    status: p.status as EstadoDePropuesta,
    reason: p.reason,
    channel: p.channel,
    method: p.method,
    path: p.path,
    tool: p.tool,
    operation: p.operationKey,
    createdAt: p.createdAt,
    expiresAt: p.expiresAt,
    decidedAt: p.decidedAt,
    comment: p.decisionComment,
    executedAt: p.executedAt,
    statusUrl: urlDeEstado(p.id),
    ...(terminada
      ? {
          result: {
            status: p.resultStatus,
            contentType: p.resultContentType,
            body: p.resultBody,
            error: p.resultError,
          },
        }
      : {}),
  };
}

/** El cuerpo del 202 (problem+json con la propuesta). */
export function problemaDePropuesta(p: Propuesta, instance: string, requestId?: string | null) {
  return buildProblem({
    code: "KITSUDEN_E_APPROVAL_REQUIRED",
    status: 202,
    detail:
      p.status === "pending"
        ? `This request needs human approval. It was stored as proposal ${p.id} and has NOT been executed.`
        : `This request was already stored as proposal ${p.id} (status: ${p.status}).`,
    instance,
    requestId,
    extensions: { proposal: vistaParaAgente(p) },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// La puerta REST
// ═══════════════════════════════════════════════════════════════════════════

/** Lo que no pasa por esta puerta: MCP (tiene la suya), auth y las propias rutas. */
export const EXCLUIDAS_DE_APROBACION = [
  "/api/auth",
  "/api/mcp",
  "/api/approvals",
  "/api/proposals",
  // Fase I: la promoción de código tiene su propia puerta humana (un borrador
  // ya ES una propuesta). Retener el envío del borrador sería pedir dos veces.
  "/api/promotion",
  // Los planes se proponen a sí mismos: su POST crea la propuesta; retenerlo
  // sería pedir aprobación para pedir aprobación.
  "/api/agent/plans",
];

function excluida(camino: string): boolean {
  return EXCLUIDAS_DE_APROBACION.some((p) => camino === p || camino.startsWith(`${p}/`));
}

function problemaNoAdmitida(motivo: PropuestaNoAdmitida["motivo"], instance: string, requestId?: string | null) {
  const que: Record<PropuestaNoAdmitida["motivo"], string> = {
    secret:
      "its body carries a secret (a token, password, key, credential header or a value for the secrets store), and proposals never store secrets; a human or an agent in direct mode has to send it",
    multipart: "the multipart form could not be read",
    not_image:
      "only image uploads (JPEG, PNG, GIF, WebP or AVIF, checked by their content) can be held as proposals; any other file has to be uploaded by a human or an agent in direct mode",
    not_json: "only JSON bodies and image uploads can be held as proposals",
    too_large: `the body is larger than ${MAX_CUERPO_BYTES / 1024} KiB of JSON or text, or an upload has more than ${MAX_IMAGENES_RETENIDAS} images or one larger than ${maxBytesPorImagen() / 1024 / 1024} MB`,
  };
  return buildProblem({
    code: "KITSUDEN_E_APPROVAL_UNSUPPORTED",
    detail: `This request needs human approval but cannot be stored as a proposal: ${que[motivo]}.`,
    instance,
    requestId,
    extensions: { reason: motivo },
  });
}

function problemaDeClaveReutilizada(instance: string, requestId?: string | null) {
  return buildProblem({
    code: "KITSUDEN_E_IDEMPOTENCY_KEY_REUSED",
    detail: "This Idempotency-Key already belongs to a different proposal of this agent.",
    instance,
    requestId,
  });
}

function responderJson(c: Context, cuerpo: unknown, estado: number, tipo = "application/problem+json") {
  return c.body(JSON.stringify(cuerpo), estado as never, { "Content-Type": tipo });
}

/**
 * ¿Lleva secreto este cuerpo, para esta ruta? Por contenido (`contieneSecreto`)
 * o por destino: lo que va al almacén de secretos (`/api/admin/secrets`) ES un
 * secreto aunque el campo se llame `value` (F79).
 */
export function cuerpoConSecretoParaPropuesta(camino: string, cuerpo: unknown): boolean {
  const vacio =
    cuerpo === null ||
    cuerpo === undefined ||
    cuerpo === "" ||
    (typeof cuerpo === "object" && !Array.isArray(cuerpo) && Object.keys(cuerpo as object).length === 0);
  if (!vacio && rutaQueRecibeSecretos(camino)) return true;
  return contieneSecreto(cuerpo);
}

/** El cuerpo de la petición, para guardarlo (JSON y sin secretos), o lanza. */
export function cuerpoParaPropuesta(tipo: string, bytes: Uint8Array, camino?: string): unknown {
  if (bytes.byteLength === 0) return null;
  // Al almacén de secretos: el cuerpo es el secreto, se llame como se llame el campo.
  if (camino && rutaQueRecibeSecretos(camino)) throw new PropuestaNoAdmitida("secret");
  const t = tipo.toLowerCase();
  if (t.includes("multipart/")) throw new PropuestaNoAdmitida("multipart");
  if (bytes.byteLength > MAX_CUERPO_BYTES) throw new PropuestaNoAdmitida("too_large");
  if (!t.includes("json")) throw new PropuestaNoAdmitida("not_json");
  if (cuerpoConSecreto(t, bytes)) throw new PropuestaNoAdmitida("secret");
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new PropuestaNoAdmitida("not_json");
  }
}

/**
 * El middleware REST. Para un AGENTE cuya petición necesita aprobación: NO se
 * ejecuta; se guarda la propuesta y se responde 202. Todo lo demás pasa.
 */
/**
 * Does this `POST /api/datasets/batch` delete anything? The gate looks at method
 * and path, and a batch `delete` is a POST: it escaped the rule that holds every
 * DELETE. A body that cannot be read counts as deleting (the route will refuse it).
 */
export async function batchBorra(c: Context, metodo: string, camino: string): Promise<boolean> {
  if (metodo !== "POST" || camino.replace(/\/+$/, "") !== "/api/datasets/batch") return false;
  try {
    const cuerpo = (await c.req.raw.clone().json()) as { operations?: Array<{ op?: unknown }> };
    return !Array.isArray(cuerpo.operations) || cuerpo.operations.some((o) => o?.op === "delete");
  } catch {
    return true;
  }
}

export function puertaDeAprobacion() {
  return async (c: Context, next: Next) => {
    if (ejecucionYaCobrada(c)) return next();
    const agente = (c.get as (k: string) => unknown)("agent") as AgentAuthContext | undefined;
    if (!agente?.agentId) return next();
    const metodo = c.req.method.toUpperCase();
    if (metodo === "OPTIONS" || metodo === "HEAD") return next();
    const camino = c.req.path;
    if (!camino.startsWith("/api/") || excluida(camino)) return next();

    const i = await instantaneaDeAprobaciones();
    if (todoApagado(i)) return next();
    const decision = evaluarPeticion(i, agente.agentId, metodo, camino, {
      borra: await batchBorra(c, metodo, camino),
    });
    if (!decision) return next();
    const usuario = { id: agente.agentId, role: "agent", scopes: agente.scopes ?? [] };
    if (!(await agentePodriaEjecutar(decision.deRuta, usuario))) return next();

    const requestId = ((c.get as (k: string) => unknown)("requestId") as string | undefined) ?? null;
    const url = new URL(c.req.url);
    const tipo = c.req.header("content-type") ?? "";
    let cuerpo: unknown;
    let imagenes: ImagenRetenida[] | undefined;
    // Lo que entra en la huella: los bytes JSON, o la forma canónica de la subida.
    let paraHuella: Uint8Array;
    let tipoGuardado: string | null;
    let tipoDeHuella = tipo;
    try {
      if (esMultipart(tipo)) {
        const s = await subidaParaPropuesta(c.req.raw.clone() as unknown as PeticionLegible, tipo);
        cuerpo = s.cuerpo;
        imagenes = s.imagenes;
        paraHuella = s.huella;
        tipoGuardado = TIPO_DE_SUBIDA_RETENIDA;
        tipoDeHuella = TIPO_DE_SUBIDA_RETENIDA;
      } else {
        const bytes = new Uint8Array(await c.req.raw.clone().arrayBuffer());
        cuerpo = cuerpoParaPropuesta(tipo, bytes, camino);
        paraHuella = bytes;
        tipoGuardado = bytes.byteLength > 0 ? tipo : null;
      }
    } catch (err) {
      if (err instanceof PropuestaNoAdmitida) return responderJson(c, problemaNoAdmitida(err.motivo, camino, requestId), 403);
      throw err;
    }
    const clave = c.req.header("idempotency-key");
    try {
      const { propuesta } = await crearPropuesta({
        agente,
        canal: "rest",
        metodo,
        camino: `${camino}${url.search}`,
        cuerpo,
        tipo: tipoGuardado,
        huella: huellaDePeticion({ metodo, camino, query: url.search, tipo: tipoDeHuella, cuerpo: paraHuella }),
        imagenes,
        idempotencyKey: clave && CLAVE_IDEMPOTENCIA_VALIDA.test(clave) ? clave : null,
        motivo: decision.motivo,
        konId: decision.deRuta?.konId ?? null,
        operacionId: decision.deRuta?.op.id ?? null,
        clave: decision.clave,
        caminoDeDiff: camino,
      });
      c.header("Location", urlDeEstado(propuesta.id));
      return responderJson(c, problemaDePropuesta(propuesta, camino, requestId), 202, "application/json");
    } catch (err) {
      if (err instanceof ClaveDeIdempotenciaReutilizada) {
        return responderJson(c, problemaDeClaveReutilizada(camino, requestId), 422);
      }
      if (err instanceof PropuestaNoAdmitida) {
        return responderJson(c, problemaNoAdmitida(err.motivo, camino, requestId), 403);
      }
      throw err;
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Decidir: aprobar, rechazar, caducar
// ═══════════════════════════════════════════════════════════════════════════

async function auditar(e: {
  agentId: string | null;
  keyId?: string;
  action: AuditAction;
  resource?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  success?: boolean;
  errorMessage?: string;
}): Promise<void> {
  try {
    await registrarAccionDeAgente({ ...e, success: e.success ?? true });
  } catch (err) {
    logger.error({ err, action: e.action }, "[aprobaciones] no se pudo escribir la auditoría");
    throw err;
  }
}

/** Marca como caducadas las pendientes que ya pasaron su fecha (y lo audita). */
export async function caducarPropuestas(): Promise<number> {
  const caducadas = await db
    .update(agentProposals)
    .set({ status: "expired" })
    .where(and(eq(agentProposals.status, "pending"), lte(agentProposals.expiresAt, new Date())))
    .returning({ id: agentProposals.id, agentId: agentProposals.agentId, method: agentProposals.method, path: agentProposals.path });
  // Una subida caducada no espera a nadie: sus imágenes se borran ya.
  await borrarFicherosDePropuestas(caducadas.map((p) => p.id));
  for (const p of caducadas) {
    await auditar({
      agentId: p.agentId,
      action: "proposal_expired",
      resource: `${p.method} ${p.path}`,
      resourceId: p.id,
    }).catch(() => undefined);
    // B3: el agente se entera (SSE y, si tiene URL de aviso, webhook firmado).
    const completa = await propuestaPorId(p.id).catch(() => null);
    if (completa) await avisarResolucion(completa.agentId, vistaParaAgente(completa)).catch(() => undefined);
  }
  return caducadas.length;
}

let barrido: ReturnType<typeof setInterval> | null = null;
/** Barre las caducadas cada 5 minutos (sin retener el proceso). */
export function arrancarBarridoDePropuestas(): void {
  if (barrido) return;
  barrido = setInterval(() => {
    caducarPropuestas().catch(() => undefined);
  }, 5 * 60_000);
  (barrido as { unref?: () => void }).unref?.();
}

export async function propuestaPorId(id: string): Promise<Propuesta | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [p] = await db.select().from(agentProposals).where(eq(agentProposals.id, id)).limit(1);
  return p ?? null;
}

/**
 * La huella de LO QUE SE VE en la bandeja de decisión: cuerpo, diff, ficheros
 * retenidos (con su sha256) y scopes del agente. Se guarda en la auditoría al
 * decidir: fija qué contexto exacto aprobó o rechazó el humano (si cualquiera
 * de eso cambia, la huella cambia).
 */
export async function huellaDelContextoDe(p: Propuesta): Promise<string> {
  const ficheros = await db
    .select({
      field: agentProposalFiles.field,
      filename: agentProposalFiles.filename,
      sha256: agentProposalFiles.sha256,
      size: agentProposalFiles.size,
    })
    .from(agentProposalFiles)
    .where(eq(agentProposalFiles.proposalId, p.id))
    .orderBy(asc(agentProposalFiles.position));
  return huellaDeContextoDeDecision({
    method: p.method,
    path: p.path,
    tool: p.tool,
    operationKey: p.operationKey,
    body: p.body,
    diff: p.diff,
    files: ficheros,
    scopes: p.scopes,
  });
}

export interface Humano {
  id: string;
  role: string;
}

/** El rol de AHORA (de la base, no de la caché en cookie de la sesión). */
export async function humanoFresco(id: string): Promise<Humano | null> {
  const [u] = await db.select({ id: authUsers.id, role: authUsers.role }).from(authUsers).where(eq(authUsers.id, id)).limit(1);
  return u ? { id: u.id, role: (u.role as string | null) ?? "user" } : null;
}

/**
 * ¿Puede ESTE humano aprobarla? Solo lo que él mismo podría hacer:
 *
 *   · `admin`: todo.
 *   · `editor`: las operaciones del SDK que su rol le concede (scopes ∪ roles
 *     ∪ política del kon, la misma comprobación que la ruta) y las rutas
 *     legadas detrás de una puerta de equipo («staff»). Nunca lo que exige
 *     admin (`/api/admin/*`, las puertas de admin), ni una ruta legada sin
 *     puerta (no se sabe qué comprueba por dentro), ni una herramienta MCP
 *     del núcleo.
 *   · cualquier otro: nada.
 *
 * Devuelve el CÓDIGO del motivo del «no» (`MOTIVOS_PARA_NO_APROBAR`), o
 * `null` si puede.
 */
export type MotivoParaNoAprobar = "not_staff" | "core_mcp_tool" | "admin_route" | "role_cannot" | "legacy_without_gate";

/** El texto (inglés) de cada motivo; el panel traduce el código. */
export const MOTIVOS_PARA_NO_APROBAR: Record<MotivoParaNoAprobar, string> = {
  not_staff: "Only admins and editors can decide proposals",
  core_mcp_tool: "Only an admin can approve a core MCP tool",
  admin_route: "Only an admin can approve a request to an admin-only route",
  role_cannot: "Your role cannot perform this operation, so you cannot approve it",
  legacy_without_gate: "Only an admin can approve a legacy route without a staff gate",
};

export async function motivoParaNoAprobar(h: Humano, p: Propuesta): Promise<MotivoParaNoAprobar | null> {
  if (h.role === "admin") return null;
  if (h.role !== "editor") return "not_staff";
  // Un PLAN lo puede aprobar un editor solo si TODOS sus pasos son operaciones
  // del SDK que él mismo podría ejecutar; si hay rutas legadas, admin.
  if (p.method === "PLAN") {
    const plan = pasosDePlan(p.body);
    if (!plan) return "legacy_without_gate";
    for (const paso of plan.steps) {
      const deRuta = operacionDeRuta(paso.method, paso.path.split("?")[0]!);
      if (!deRuta) return "legacy_without_gate";
      if (!deRuta.op.permiso) continue;
      const puede = await concedeOperacion(deRuta.konId, deRuta.op, { id: h.id, role: h.role });
      if (!puede) return "role_cannot";
    }
    return null;
  }
  if (p.channel === "mcp" && !p.konId) return "core_mcp_tool";
  const camino = p.path.split("?")[0]!;
  if (camino === "/api/admin" || camino.startsWith("/api/admin/")) return "admin_route";
  const regla = reglaPara([...RUTAS_SOLO_ADMIN_TEMPRANAS, ...RUTAS_SOLO_ADMIN], p.method, camino);
  if (regla && regla.rol !== "staff") return "admin_route";
  const deRuta = operacionDeRuta(p.method, camino);
  if (deRuta) {
    if (!deRuta.op.permiso) return null;
    const puede = await concedeOperacion(deRuta.konId, deRuta.op, { id: h.id, role: h.role });
    return puede ? null : "role_cannot";
  }
  return regla ? null : "legacy_without_gate";
}

export type ResultadoDeDecision =
  | { ok: true; propuesta: Propuesta }
  | { ok: false; estado: 403 | 404 | 409; motivo: string; propuesta?: Propuesta };

async function guardarResultado(
  id: string,
  estado: "executed" | "failed",
  r: {
    status: number | null;
    contentType?: string | null;
    body?: unknown;
    error?: string | null;
    /** El firmante con el que se ejecutó (undefined = no cambia). */
    sponsorUserId?: string | null;
  }
): Promise<Propuesta> {
  const [p] = await db
    .update(agentProposals)
    .set({
      ...(r.sponsorUserId !== undefined ? { sponsorUserId: r.sponsorUserId } : {}),
      status: estado,
      executedAt: new Date(),
      resultStatus: r.status,
      resultContentType: r.contentType ?? null,
      resultBody: (r.body === undefined ? null : r.body) as never,
      resultError: r.error ?? null,
    })
    .where(eq(agentProposals.id, id))
    .returning();
  return p!;
}

async function leerResultadoHttp(res: Response): Promise<{ body: unknown; contentType: string | null }> {
  const tipo = res.headers.get("content-type");
  if (res.status === 204) return { body: null, contentType: tipo };
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (cuerpoConSecreto(tipo ?? "", bytes)) return { body: { omitted: "secret" }, contentType: tipo };
  const texto = new TextDecoder().decode(bytes);
  if ((tipo ?? "").includes("json")) {
    try {
      return { body: recortar(JSON.parse(texto)), contentType: tipo };
    } catch {
      /* como texto */
    }
  }
  return { body: recortar({ text: texto.slice(0, 64 * 1024) }), contentType: tipo };
}

/**
 * Aprueba y EJECUTA. Una sola vez: la propuesta se reserva con un UPDATE
 * atómico (`pending → executing`); la segunda aprobación (o una a la vez)
 * recibe 409 con el estado actual. Si el agente ya no puede (desactivado,
 * clave revocada o caducada, permiso retirado), queda `failed` sin ejecutarse.
 */
export async function aprobarPropuesta(id: string, humano: Humano, comentario?: string | null): Promise<ResultadoDeDecision> {
  const p = await propuestaPorId(id);
  if (!p) return { ok: false, estado: 404, motivo: "Proposal not found" };
  if (p.status === "pending" && p.expiresAt <= new Date()) await caducarPropuestas();
  const actual = (await propuestaPorId(id))!;
  if (actual.status !== "pending") {
    return { ok: false, estado: 409, motivo: `Proposal is ${actual.status}`, propuesta: actual };
  }
  const motivo = await motivoParaNoAprobar(humano, actual);
  if (motivo) return { ok: false, estado: 403, motivo: MOTIVOS_PARA_NO_APROBAR[motivo] };

  const [reservada] = await db
    .update(agentProposals)
    .set({
      status: "executing",
      decidedBy: humano.id,
      decidedAt: new Date(),
      decisionComment: comentario?.trim() ? comentario.trim().slice(0, 2000) : null,
    })
    .where(and(eq(agentProposals.id, id), eq(agentProposals.status, "pending"), gt(agentProposals.expiresAt, new Date())))
    .returning();
  if (!reservada) {
    const otra = (await propuestaPorId(id))!;
    return { ok: false, estado: 409, motivo: `Proposal is ${otra.status}`, propuesta: otra };
  }
  // Lo que el humano tuvo delante al firmar: queda fijado en la auditoría.
  const contextHash = await huellaDelContextoDe(reservada).catch((err) => {
    logger.error({ err, proposalId: id }, "[aprobaciones] no se pudo calcular la huella del contexto");
    return null;
  });
  await auditar({
    agentId: reservada.agentId,
    action: "proposal_approved",
    resource: `${reservada.method} ${reservada.path}`,
    resourceId: reservada.id,
    details: { by: humano.id, sponsor: reservada.sponsorUserId ?? null, comment: reservada.decisionComment, contextHash },
  });

  const final = await ejecutarReservada(reservada, humano, contextHash);
  return { ok: true, propuesta: final };
}

async function ejecutarReservada(p: Propuesta, humano: Humano, contextHash: string | null = null): Promise<Propuesta> {
  const aprobacion = { proposalId: p.id, approvedBy: humano.id };
  let final: Propuesta;
  try {
    // 1. El agente, releído de la base (scopes de AHORA).
    const ctx = await contextoDeAgenteParaAprobacion(p.agentId, p.keyId);
    if (!ctx.ok) {
      final = await guardarResultado(p.id, "failed", { status: null, error: `not_executed: ${ctx.motivo}` });
    } else {
      // 2. ¿Sigue pudiendo? (operación del SDK: denegación y permiso).
      const camino = p.path.split("?")[0]!;
      const deRuta = p.konId ? operacionDeRuta(p.method, camino) : null;
      const usuario = { id: ctx.context.agentId, role: "agent", scopes: ctx.context.scopes };
      if (deRuta && !(await agentePodriaEjecutar(deRuta, usuario))) {
        final = await guardarResultado(p.id, "failed", {
          status: 403,
          error: "not_executed: agent_permission_revoked",
        });
      } else if (p.method === "PLAN") {
        // Un plan aprobado: sus pasos se ejecutan SECUENCIALMENTE con la
        // identidad del agente (releída), sin volver a pagar la puerta: la
        // aprobación humana cubre el plan entero.
        final = await ejecutarPlanAprobado(p, ctx.context, aprobacion);
      } else if (p.channel === "mcp" && p.tool) {
        if (!ejecutorMcp) throw new Error("MCP no registró su ejecutor");
        const args = (p.body && typeof p.body === "object" ? p.body : {}) as Record<string, unknown>;
        const r = await ejecutorMcp(p.tool, args, ctx.context, aprobacion);
        const sc = r.structuredContent as { status?: unknown } | undefined;
        const estado = typeof sc?.status === "number" ? sc.status : r.isError ? 400 : 200;
        const sinSecretos = contieneSecreto(r) ? { omitted: "secret" } : recortar(r);
        final = await guardarResultado(p.id, r.isError ? "failed" : "executed", {
          sponsorUserId: ctx.context.sponsor?.userId ?? null,
          status: estado,
          contentType: "application/json",
          body: sinSecretos,
        });
      } else {
        // Una subida retenida vuelve a ser el formulario que mandó el agente.
        const cuerpo = esMultipart(p.contentType) ? await formularioDePropuesta(p) : p.body;
        const res = await peticionInterna({ agente: ctx.context, aprobacion }, p.method, p.path, cuerpo, p.contentType);
        const leido = await leerResultadoHttp(res);
        final = await guardarResultado(p.id, res.status < 400 ? "executed" : "failed", {
          sponsorUserId: ctx.context.sponsor?.userId ?? null,
          status: res.status,
          contentType: leido.contentType,
          body: leido.body,
        });
      }
    }
  } catch (err) {
    logger.error({ err, proposalId: p.id }, "[aprobaciones] fallo ejecutando una propuesta aprobada");
    final = await guardarResultado(p.id, "failed", { status: 500, error: "execution_error" });
  }
  // Ejecutada (o fallida: no se reintenta): lo retenido ya está en su sitio o sobra.
  await borrarFicherosDePropuestas([p.id]).catch((err) => {
    logger.error({ err, proposalId: p.id }, "[aprobaciones] no se pudieron borrar los ficheros retenidos");
  });
  await auditar({
    agentId: final.agentId,
    action: final.status === "executed" ? "proposal_executed" : "proposal_failed",
    resource: `${final.method} ${final.path}`,
    resourceId: final.id,
    // Agente (agentId), firmante y aprobador: los tres (decisión del propietario).
    details: { by: humano.id, sponsor: final.sponsorUserId ?? null, status: final.resultStatus, error: final.resultError, contextHash },
    success: final.status === "executed",
    errorMessage: final.resultError ?? undefined,
  }).catch(() => undefined);
  // B3: ejecutada o fallida, el agente se entera sin consultar.
  await avisarResolucion(final.agentId, vistaParaAgente(final)).catch(() => undefined);
  return final;
}

/**
 * El plan guardado en el cuerpo de una propuesta PLAN, validado; o `null`.
 * La propiedad `body` de cada paso se vuelve a enviar tal cual al ejecutar.
 */
export function pasosDePlan(cuerpo: unknown): { goal: string; steps: PasoDePlan[] } | null {
  const plan = (cuerpo as { plan?: unknown } | null)?.plan;
  if (!plan || typeof plan !== "object") return null;
  const { goal, steps } = plan as { goal?: unknown; steps?: unknown };
  if (typeof goal !== "string" || !goal.trim() || !Array.isArray(steps) || steps.length === 0) {
    return null;
  }
  const limpios: PasoDePlan[] = [];
  for (const crudo of steps) {
    const s = crudo as Partial<PasoDePlan> | null;
    const method = String(s?.method ?? "").toUpperCase();
    const path = String(s?.path ?? "");
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method) || !path.startsWith("/api/")) {
      return null;
    }
    limpios.push({
      method: method as PasoDePlan["method"],
      path,
      body: s?.body,
      comment: typeof s?.comment === "string" ? s.comment : undefined,
      continueOnError: s?.continueOnError === true,
    });
  }
  return { goal: goal.trim(), steps: limpios };
}

/** Un paso de un plan de agente (K1: Plan/Act). */
export interface PasoDePlan {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  comment?: string;
  /** Si es true, un fallo de este paso no detiene el plan. */
  continueOnError?: boolean;
}

/**
 * Ejecuta un plan aprobado: sus pasos, en orden, con la identidad del agente.
 * Un paso que falla detiene el plan (salvo `continueOnError`); el resultado
 * agregado queda en `resultBody` con el estado de cada paso.
 */
async function ejecutarPlanAprobado(
  p: Propuesta,
  agente: AgentAuthContext,
  aprobacion: { proposalId: string; approvedBy: string }
): Promise<Propuesta> {
  const plan = pasosDePlan(p.body);
  if (!plan) {
    return guardarResultado(p.id, "failed", { status: 400, error: "not_executed: invalid_plan_body" });
  }
  const resultados: Record<string, unknown>[] = [];
  let fallo: { index: number; status: number; body: unknown } | null = null;
  for (let i = 0; i < plan.steps.length; i++) {
    const paso = plan.steps[i]!;
    const inicio = Date.now();
    try {
      const res = await peticionInterna(
        { agente, aprobacion },
        paso.method,
        paso.path,
        paso.body,
        "application/json"
      );
      const leido = await leerResultadoHttp(res);
      resultados.push({
        index: i,
        method: paso.method,
        path: paso.path,
        status: res.status,
        durationMs: Date.now() - inicio,
        body: leido.body,
      });
      if (res.status >= 400 && !paso.continueOnError) {
        fallo = { index: i, status: res.status, body: leido.body };
        break;
      }
    } catch (err) {
      resultados.push({
        index: i,
        method: paso.method,
        path: paso.path,
        status: 0,
        durationMs: Date.now() - inicio,
        error: err instanceof Error ? err.message : "error",
      });
      if (!paso.continueOnError) {
        fallo = { index: i, status: 0, body: null };
        break;
      }
    }
  }
  const cuerpo = recortar({ kind: "plan", goal: plan.goal, results: resultados });
  if (fallo) {
    return guardarResultado(p.id, "failed", {
      status: fallo.status || 502,
      body: cuerpo,
      error: `plan_step_failed: step ${fallo.index}`,
    });
  }
  return guardarResultado(p.id, "executed", { status: 200, contentType: "application/json", body: cuerpo });
}

/** Rechaza: no se ejecuta NUNCA. */
export async function rechazarPropuesta(id: string, humano: Humano, comentario?: string | null): Promise<ResultadoDeDecision> {
  const p = await propuestaPorId(id);
  if (!p) return { ok: false, estado: 404, motivo: "Proposal not found" };
  if (p.status === "pending" && p.expiresAt <= new Date()) await caducarPropuestas();
  if (!["admin", "editor"].includes(humano.role)) {
    return { ok: false, estado: 403, motivo: "Only admins and editors can decide proposals" };
  }
  const [rechazada] = await db
    .update(agentProposals)
    .set({
      status: "rejected",
      decidedBy: humano.id,
      decidedAt: new Date(),
      decisionComment: comentario?.trim() ? comentario.trim().slice(0, 2000) : null,
    })
    .where(and(eq(agentProposals.id, id), eq(agentProposals.status, "pending")))
    .returning();
  if (!rechazada) {
    const otra = (await propuestaPorId(id))!;
    return { ok: false, estado: 409, motivo: `Proposal is ${otra.status}`, propuesta: otra };
  }
  // Primero la huella (los ficheros aún están: es parte de lo que se vio),
  // luego se borran: rechazada no se ejecuta nunca.
  const contextHash = await huellaDelContextoDe(rechazada).catch((err) => {
    logger.error({ err, proposalId: id }, "[aprobaciones] no se pudo calcular la huella del contexto");
    return null;
  });
  await borrarFicherosDePropuestas([rechazada.id]);
  await auditar({
    agentId: rechazada.agentId,
    action: "proposal_rejected",
    resource: `${rechazada.method} ${rechazada.path}`,
    resourceId: rechazada.id,
    details: { by: humano.id, comment: rechazada.decisionComment, contextHash },
  });
  await avisarResolucion(rechazada.agentId, vistaParaAgente(rechazada)).catch(() => undefined);
  return { ok: true, propuesta: rechazada };
}

// ═══════════════════════════════════════════════════════════════════════════
// Listados (panel y agente)
// ═══════════════════════════════════════════════════════════════════════════

export async function listarPropuestas(f: {
  status?: string | null;
  agentId?: string | null;
  limit?: number;
  offset?: number;
}): Promise<{ proposals: (Propuesta & { agentName: string | null })[]; total: number }> {
  const condiciones: SQL[] = [];
  if (f.status) condiciones.push(eq(agentProposals.status, f.status));
  if (f.agentId) condiciones.push(eq(agentProposals.agentId, f.agentId));
  const donde = condiciones.length ? and(...condiciones) : undefined;
  const filas = await db
    .select({ p: agentProposals, agentName: agentIdentities.name })
    .from(agentProposals)
    .leftJoin(agentIdentities, eq(agentProposals.agentId, agentIdentities.id))
    .where(donde)
    .orderBy(desc(agentProposals.createdAt))
    .limit(Math.min(Math.max(f.limit ?? 50, 1), 200))
    .offset(Math.max(f.offset ?? 0, 0));
  const [total] = await db.select({ n: sql<number>`count(*)::int` }).from(agentProposals).where(donde);
  return { proposals: filas.map((r) => ({ ...r.p, agentName: r.agentName })), total: total?.n ?? 0 };
}

export async function contarPendientes(): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(agentProposals)
    .where(and(eq(agentProposals.status, "pending"), gt(agentProposals.expiresAt, new Date())));
  return r?.n ?? 0;
}

/** Nombres de las cuentas que aparecen en una lista (para enseñar quién decidió). */
export async function nombresDeUsuarios(ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => typeof x === "string" && x.length > 0))];
  if (unicos.length === 0) return {};
  const filas = await db
    .select({ id: authUsers.id, name: authUsers.name, email: authUsers.email })
    .from(authUsers)
    .where(inArray(authUsers.id, unicos));
  return Object.fromEntries(filas.map((u) => [u.id, u.name || u.email || u.id]));
}
