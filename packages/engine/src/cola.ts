/**
 * Kitsuden — La cola de trabajos (la costura del engine)
 * ============================================================================
 *
 *   await queue.dispatch("kitsuden-email", "system.welcome", { to, name });
 *
 *   queue.handle("informes", async (trabajo) => {
 *     await generarInforme(trabajo.payload);       // idempotente
 *   }, { concurrencia: 2 });
 *
 * Un solo motor: Postgres (kitsuden2.md, B1; BullMQ se retiró el 2026-10-28).
 * El host (apps/api/src/lib/queue.ts) lo conecta con `configurarCola()` al
 * arrancar. No hay sistema de drivers a propósito: esto es la costura por si
 * algún día hiciera falta otro, no una invitación a escribirlo.
 *
 * ── LO QUE PROMETE ─────────────────────────────────────────────────────────
 *
 *   · ATOMICIDAD. Dentro de una petición, `dispatch` escribe en la MISMA
 *     transacción RLS: si la petición acaba en ROLLBACK, el trabajo no existe;
 *     si confirma, queda listo. Fuera de una petición, se confirma al momento.
 *   · AL MENOS UNA VEZ. Un worker que se cae a mitad deja el trabajo con el
 *     arriendo vencido y el barrido lo devuelve a la cola: el handler puede
 *     correr dos veces. Los handlers deben ser IDEMPOTENTES.
 *   · EL ACTOR SE RELEE. Se guarda quién lo encoló (persona o agente); al
 *     ejecutar se releen sus permisos, y el handler corre con la RLS de ese
 *     actor tal y como está AHORA. Revocado o borrado: el trabajo muere sin
 *     ejecutarse.
 *   · REINTENTOS Y «DEAD LETTER». Un handler que lanza se reintenta con
 *     espera exponencial hasta `intentos` (3 por defecto). Agotados, o con un
 *     `ErrorPermanente`, el trabajo queda `dead` con su error, visible en el
 *     panel (`/api/admin/queue`) para reintentarlo o descartarlo.
 *
 * Las registraciones (`handle`) se guardan aquí aunque el host aún no haya
 * arrancado su worker: un kon puede registrar al cargarse.
 */

/** Quién encoló el trabajo, tal y como se ve AL EJECUTAR (releído). */
export interface ActorDeTrabajo {
  /** Id de la cuenta o del agente. */
  id: string;
  /** `agent` para un agente; el rol de la cuenta (releído) para una persona. */
  role: string;
  /** Scopes vigentes de un agente. */
  scopes?: string[];
}

export interface TrabajoDeCola<T = unknown> {
  id: string;
  cola: string;
  /** Nombre del trabajo dentro de la cola (el Mailable, en la de correo). */
  nombre: string;
  payload: T;
  /** Intento en curso, desde 1. */
  intento: number;
  maxIntentos: number;
  /** `null` = lo encoló el sistema (sin petición, cron, arranque). */
  actor: ActorDeTrabajo | null;
  requestId: string | null;
}

export type ManejadorDeCola<T = unknown> = (trabajo: TrabajoDeCola<T>) => Promise<unknown>;

export interface OpcionesDeDespacho {
  /** Intentos máximos (1–25). Por defecto 3. */
  intentos?: number;
  /** No ejecutar antes de este retraso. */
  retrasoMs?: number;
}

export interface OpcionesDeManejador {
  /** Trabajos de esta cola a la vez en este proceso. Por defecto 3. */
  concurrencia?: number;
}

/** Lo que el host pone detrás de `queue.dispatch()`. */
export interface MotorDeCola {
  despachar(
    cola: string,
    nombre: string,
    payload: unknown,
    opciones: OpcionesDeDespacho
  ): Promise<{ id: string }>;
  /** Se llama al registrar un manejador (para que el worker lo recoja). */
  alRegistrar?(cola: string): void;
}

/**
 * Lánzalo desde un handler para NO reintentar: el trabajo pasa a `dead` al
 * momento (datos inválidos, destinatario inexistente…).
 */
export class ErrorPermanente extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorPermanente";
  }
}

const NOMBRE_VALIDO = /^[A-Za-z0-9_.:\-]{1,120}$/;

let motor: MotorDeCola | null = null;
const manejadores = new Map<string, { fn: ManejadorDeCola; concurrencia: number }>();

/** El host conecta su implementación (una vez, al arrancar). */
export function configurarCola(nuevo: MotorDeCola | null): void {
  motor = nuevo;
  if (nuevo) for (const cola of manejadores.keys()) nuevo.alRegistrar?.(cola);
}

/** Los manejadores registrados (para el worker del host). */
export function manejadoresDeCola(): ReadonlyMap<
  string,
  { fn: ManejadorDeCola; concurrencia: number }
> {
  return manejadores;
}

function validarNombre(tipo: string, valor: string): void {
  if (!NOMBRE_VALIDO.test(valor)) {
    throw new TypeError(`${tipo} de cola inválido: "${valor}" (letras, números y _.:- hasta 120)`);
  }
}

export const queue = {
  /**
   * Encola un trabajo. Dentro de una petición va en su transacción (ver la
   * cabecera); el payload tiene que ser JSON.
   */
  async dispatch<T>(
    cola: string,
    nombre: string,
    payload: T,
    opciones: OpcionesDeDespacho = {}
  ): Promise<{ id: string }> {
    validarNombre("Nombre", cola);
    validarNombre("Trabajo", nombre);
    if (!motor) {
      throw new Error(
        "La cola no está configurada: el host debe llamar a configurarCola() al arrancar"
      );
    }
    const intentos = opciones.intentos ?? 3;
    if (!Number.isInteger(intentos) || intentos < 1 || intentos > 25) {
      throw new RangeError("`intentos` debe ser un entero entre 1 y 25");
    }
    return motor.despachar(cola, nombre, payload, { ...opciones, intentos });
  },

  /** Registra el manejador de una cola (uno por cola y proceso). */
  handle<T>(cola: string, fn: ManejadorDeCola<T>, opciones: OpcionesDeManejador = {}): void {
    validarNombre("Nombre", cola);
    const concurrencia = Math.max(1, Math.min(50, Math.floor(opciones.concurrencia ?? 3)));
    manejadores.set(cola, { fn: fn as ManejadorDeCola, concurrencia });
    motor?.alRegistrar?.(cola);
  },

  /** ¿Hay un motor conectado? */
  configurada(): boolean {
    return motor !== null;
  },
};
