/**
 * Kitsuden — RLS por petición (la pieza común para el núcleo y los kons)
 * ============================================================================
 *
 * Una petición = UNA transacción de Postgres con quién pregunta fijado con
 * `set_config('app.current_user_id' | 'app.current_user_role', …, true)`.
 * `is_local = true`: el contexto muere con la transacción y nunca se queda en
 * una conexión del pool (memoria «rls-contexto-nunca-fijado»).
 *
 * Esto vivía repetido: `withTransactionalRLS()` en el núcleo, tres copias de
 * `contexto-rls.ts` (dms, agile, conta), `comoUsuario()` en payments y un
 * `set_config` suelto en booking, crm y directory. Cada copia con su propia
 * convención para el anónimo. Ahora hay una, sin dependencias del arranque de
 * la API (ni `db` global, ni logger), para que los tests de los kons puedan
 * montarla sobre PGlite exactamente igual que el anfitrión la monta sobre el
 * pool de verdad.
 *
 * ── LAS TRES IDENTIDADES QUE VE POSTGRES ───────────────────────────────────
 *
 *   · Una cuenta:   id de la cuenta, rol de la cuenta (`user` si no trae).
 *   · El anónimo:   id '' y rol `anonymous`.
 *   · El sistema:   id '' y rol '' (o sin fijar). Migraciones, tareas de
 *                   fondo y lo que una ruta haga con `comoSistema()`.
 *
 * Las políticas tratan como sistema SOLO «id Y rol vacíos». El rol no vacío es
 * lo que separa al anónimo del sistema.
 *
 * ── LOS TRES RIESGOS DE «UNA PETICIÓN = UNA TRANSACCIÓN» (2026-10-23) ──────
 *
 * 1. CONSULTAS EN PARALELO. Un `Promise.all` de consultas sobre la misma
 *    transacción manda varias `client.query()` a UNA conexión a la vez. pg 8
 *    las encola por dentro con un aviso de obsolescencia; pg 9 lo quita. Aquí
 *    se serializan ANTES de llegar al driver: cada petición tiene su cola
 *    (`Carril`) y cada consulta espera su turno. Un SAVEPOINT
 *    (`tx.transaction(fn)`) y `comoSistema(fn)` son secciones EXCLUSIVAS:
 *    toman el turno entero y lo de dentro va en una cola hija, así que lo que
 *    corre en paralelo con ellas espera fuera —ni se cuela dentro del
 *    savepoint ni corre como el sistema—.
 *
 * 2. ERRORES DE SQL TRAGADOS. Dentro de una transacción, una sentencia que
 *    falla aborta la transacción entera: lo siguiente falla con «current
 *    transaction is aborted» y, si no hay nada más, Postgres convierte el
 *    COMMIT en ROLLBACK SIN dar error. Lo que se pueda fallar y seguir va en
 *    `conSavepoint()` / `intentarSql()`. Y como red de debajo, este archivo
 *    mira la respuesta al COMMIT: si Postgres contestó ROLLBACK, la escritura
 *    no se guardó; se avisa (`alPerderConfirmacion`) y, si la petición era de
 *    escritura y respondía éxito, sale como 500 en vez de mentir.
 *
 * 3. LLAMADAS LARGAS CON LA TRANSACCIÓN ABIERTA. El rol de la aplicación
 *    tiene `idle_in_transaction_session_timeout = 60s`. Con el pool de pg
 *    envuelto por `conTransaccionesPerezosas()`, la transacción es PEREZOSA:
 *    el BEGIN y el contexto se guardan y no se pide conexión al pool hasta la
 *    PRIMERA consulta. Una ruta que llama fuera antes de tocar la base no
 *    retiene conexión; una que no consulta nada no la pide nunca. Lo que se
 *    llame fuera DESPUÉS de consultar sigue con la transacción abierta: eso
 *    se arregla en la ruta (antes de consultar, `segundoPlano` o un timeout
 *    que quepa). Ver `docs/install/kon-transactions.md`.
 *
 * Con otros drivers (PGlite en los tests de los kons) la transacción se abre
 * al empezar, como antes, y las secciones exclusivas siguen valiendo; la cola
 * por consulta la pone el propio PGlite.
 */

import { AsyncLocalStorage } from "node:async_hooks";

import { sql } from "drizzle-orm";
import type { Context, MiddlewareHandler, Next } from "hono";

import {
  clearRequestTx,
  resolveExecutor,
  runInRequestScope,
  setRequestTx,
  SERVICIO_MEDIDAS_DB,
  useRequest,
} from "./request-scope";

/** Lo mínimo de un usuario que importa a la base. */
export interface UsuarioRls {
  id?: unknown;
  role?: unknown;
}

/** Lo mínimo de una conexión Drizzle: ejecutar y abrir transacciones. */
export interface ConexionTransaccional {
  execute(consulta: unknown): Promise<unknown>;
  /** El `tx` (o el savepoint) del driver; aquí solo se le pasa de mano en mano. */
  transaction<R>(fn: (tx: ConexionTransaccional) => Promise<R>, config?: unknown): Promise<R>;
}

/** ¿Es una conexión Drizzle (lo que se publica como `tx` en el request-scope)? */
function esConexionTransaccional(valor: unknown): valor is ConexionTransaccional {
  return (
    typeof campo(valor, "execute") === "function" &&
    typeof campo(valor, "transaction") === "function"
  );
}

/** Qué id y qué rol ve Postgres para un usuario (o para nadie). */
export function contextoRlsDe(user: UsuarioRls | null | undefined): {
  userId: string;
  userRole: string;
} {
  if (user?.id === undefined || user?.id === null || user.id === "") {
    return { userId: "", userRole: "anonymous" };
  }
  const rol = typeof user.role === "string" && user.role ? user.role : "user";
  return { userId: String(user.id), userRole: rol };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. UNA CONSULTA CADA VEZ: la cola de la petición
// ═══════════════════════════════════════════════════════════════════════════

const nada = () => undefined;

/**
 * Una cola FIFO de turnos. Cada petición tiene la suya (la raíz) y cada
 * sección exclusiva abre una hija mientras retiene el turno de la madre.
 */
class Carril {
  private cola: Promise<unknown> = Promise.resolve();
  /** Al acabar su sección, una cola hija deriva lo que llegue tarde a la madre. */
  cerrado = false;

  constructor(readonly madre?: Carril) {}

  turno<T>(fn: () => Promise<T>): Promise<T> {
    const resultado = this.cola.then(fn);
    this.cola = resultado.then(nada, nada);
    return resultado;
  }

  /** Espera a que se vacíe lo encolado hasta ahora. */
  vaciar(): Promise<unknown> {
    return this.cola;
  }
}

/** Lo que una petición transaccional necesita recordar. */
interface EstadoPeticion {
  raiz: Carril;
  /** Mientras `db.transaction()` pide su conexión al pool (ver `conTransaccionesPerezosas`). */
  pidiendoConexion: boolean;
  /** La conexión perezosa, si el pool está envuelto. */
  conexion?: ConexionPerezosa;
  /** Para la «caja de cristal» (caja-de-cristal.ts): lo que la petición pidió a la base. */
  medidas?: { consultas: number; ms: number; filas: number };
}

const COMANDOS_DE_ESCRITURA = new Set(["INSERT", "UPDATE", "DELETE", "MERGE"]);

/**
 * Las medidas de la petición, en el request-scope (las mismas que lee
 * `medidasDeLaPeticion()`). Sin request-scope, ninguna.
 */
function medidasPublicadas(): EstadoPeticion["medidas"] {
  const scope = useRequest();
  if (!scope) return undefined;
  scope.services ??= {};
  return (scope.services[SERVICIO_MEDIDAS_DB] ??= { consultas: 0, ms: 0, filas: 0 }) as EstadoPeticion["medidas"];
}

/** En qué cola está el código que corre ahora (dentro de una sección, la hija). */
const carrilEnCurso = new AsyncLocalStorage<{ estado: EstadoPeticion; carril: Carril }>();

function carrilDe(estado: EstadoPeticion): Carril {
  const enCurso = carrilEnCurso.getStore();
  let carril = enCurso?.estado === estado ? enCurso.carril : estado.raiz;
  while (carril.cerrado && carril.madre) carril = carril.madre;
  return carril;
}

/**
 * Sección exclusiva: toma un turno de la cola en curso y lo retiene hasta que
 * `fn` acaba; las consultas de `fn` van por una cola hija.
 *
 * Lo único que la puede atascar es que `fn` ESPERE a algo de fuera que, a su
 * vez, necesite consultar en la cola de fuera (una promesa creada antes y
 * esperada dentro que aún tenga consultas pendientes). Dentro, solo lo suyo.
 */
async function seccion<T>(estado: EstadoPeticion, fn: () => Promise<T>): Promise<T> {
  const madre = carrilDe(estado);
  return madre.turno(async () => {
    const hija = new Carril(madre);
    try {
      return await carrilEnCurso.run({ estado, carril: hija }, fn);
    } finally {
      hija.cerrado = true;
      await hija.vaciar();
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. LA CONEXIÓN PEREZOSA (pool de pg)
// ═══════════════════════════════════════════════════════════════════════════

/** Lo que Drizzle (node-postgres) usa de un cliente del pool. */
interface ClienteDelPool {
  query(...args: unknown[]): Promise<unknown>;
  release(err?: unknown): void;
}

/** Un campo de un valor desconocido (un error, un resultado de pg), sin suponer su forma. */
function campo(valor: unknown, nombre: string): unknown {
  return typeof valor === "object" && valor !== null && nombre in valor
    ? Reflect.get(valor, nombre)
    : undefined;
}

function resultadoVacio() {
  return { command: "", rowCount: 0, oid: 0, rows: [], fields: [] };
}

function textoDe(args: unknown[]): string {
  const primero = args[0];
  const texto = typeof primero === "string" ? primero : campo(primero, "text");
  return typeof texto === "string" ? texto.trim().toLowerCase() : "";
}

const esFinDeTransaccion = (args: unknown[]) => {
  const texto = textoDe(args);
  return texto === "commit" || texto === "rollback";
};

/** ¿Un error que deja la conexión inservible (y hay que destruirla, no devolverla)? */
function esErrorDeConexion(err: unknown): boolean {
  const codigo = campo(err, "code");
  if (typeof codigo !== "string" || !/^[0-9A-Z]{5}$/.test(codigo)) return true;
  return codigo.startsWith("08") || codigo.startsWith("57P") || codigo === "25P03";
}

/**
 * Un cliente del pool que no existe hasta que hace falta.
 *
 * Drizzle lo recibe de `pool.connect()` dentro de `db.transaction()` y lo usa
 * como a cualquier `PoolClient`: `query()` y, al acabar, `release()`.
 *
 *   · Fase `preparando`: lo que manda el middleware (BEGIN, `set_config`) se
 *     guarda y se responde con un resultado vacío.
 *   · Primera consulta de verdad: pide la conexión al pool, repite lo
 *     guardado y sigue. Todas las consultas pasan por la cola de la petición.
 *   · COMMIT/ROLLBACK sin conexión abierta: no hay nada que cerrar.
 *   · Después de cerrar, una consulta falla con un mensaje claro en vez de ir
 *     a una conexión que ya sirve a otra persona.
 *
 * El nombre de la clase no puede contener «Pool»: Drizzle decide por él si
 * lo que tiene es un pool (y entonces pediría otra conexión).
 */
class ConexionPerezosa implements ClienteDelPool {
  private real: ClienteDelPool | null = null;
  private apertura: Promise<ClienteDelPool> | null = null;
  private diferidas: unknown[][] = [];
  private fase: "preparando" | "activa" | "cerrando" | "cerrada" = "preparando";
  private revertir = false;
  private terminada = false;
  private errorDeConexion: unknown;
  /** Se mandó COMMIT y Postgres contestó ROLLBACK: la transacción estaba abortada. */
  confirmacionPerdida = false;
  /** El primer error de SQL de la petición (para el aviso). */
  primerError: { code?: string; message: string } | undefined;

  constructor(
    private readonly abrirReal: () => Promise<ClienteDelPool>,
    private readonly estado: EstadoPeticion
  ) {}

  /** ¿Llegó a pedir conexión al pool? */
  get abierta(): boolean {
    return this.real !== null || this.apertura !== null;
  }

  /** El middleware terminó de preparar: lo siguiente ya son consultas de verdad. */
  activar(): void {
    if (this.fase === "preparando") this.fase = "activa";
  }

  /** El middleware va a cerrar (`revertir`: ROLLBACK a propósito). */
  cerrar(revertir: boolean): void {
    this.fase = "cerrando";
    this.revertir = revertir;
  }

  query(...args: unknown[]): Promise<unknown> {
    const ultimo = args[args.length - 1];
    const callback = typeof ultimo === "function" ? ultimo : undefined;
    const promesa = this.encolar(callback ? args.slice(0, -1) : args);
    if (callback) {
      promesa.then(
        (res) => callback(null, res),
        (err) => callback(err)
      );
    }
    return promesa;
  }

  private encolar(args: unknown[]): Promise<unknown> {
    if (this.fase === "cerrada") return Promise.reject(errorCerrada());
    if (this.fase === "preparando" && !this.abierta) {
      this.diferidas.push(args);
      return Promise.resolve(resultadoVacio());
    }
    const cierre = this.fase === "cerrando" && esFinDeTransaccion(args);
    return carrilDe(this.estado).turno(async () => {
      if (this.terminada) throw errorCerrada();
      if (cierre) {
        this.terminada = true;
        // Nadie consultó: no hay transacción que cerrar ni conexión que pedir.
        if (!this.abierta) return resultadoVacio();
      }
      const real = await this.abrir();
      try {
        const inicio = performance.now();
        const res = await real.query(...args);
        const medidas = this.estado.medidas;
        if (medidas && !cierre) {
          medidas.consultas++;
          medidas.ms += performance.now() - inicio;
          const comando = campo(res, "command");
          const filas = campo(res, "rowCount");
          if (typeof comando === "string" && COMANDOS_DE_ESCRITURA.has(comando) && typeof filas === "number") {
            medidas.filas += filas;
          }
        }
        if (cierre && !this.revertir && campo(res, "command") === "ROLLBACK") {
          this.confirmacionPerdida = true;
        }
        return res;
      } catch (err) {
        this.anotar(err);
        throw err;
      }
    });
  }

  private anotar(err: unknown): void {
    if (!this.primerError) {
      const code = campo(err, "code");
      const message = campo(err, "message");
      this.primerError = {
        code: typeof code === "string" ? code : undefined,
        message: typeof message === "string" ? message : String(err),
      };
    }
    if (esErrorDeConexion(err)) this.errorDeConexion = err;
  }

  private abrir(): Promise<ClienteDelPool> {
    if (this.real) return Promise.resolve(this.real);
    this.apertura ??= (async () => {
      const real = await this.abrirReal();
      try {
        // BEGIN + contexto en UNA ida y vuelta si se puede; si no, una a una.
        const juntas = diferidasEnUnaSentencia(this.diferidas, real);
        if (juntas !== null) await real.query(juntas);
        else for (const args of this.diferidas) await real.query(...args);
      } catch (err) {
        this.anotar(err);
        real.release(err);
        throw err;
      }
      this.diferidas = [];
      this.real = real;
      return real;
    })();
    return this.apertura;
  }

  release(err?: unknown): void {
    this.fase = "cerrada";
    this.terminada = true;
    const real = this.real;
    this.real = null;
    // Con error, pg-pool destruye la conexión en vez de prestarla otra vez.
    real?.release(err ?? this.errorDeConexion);
  }
}

/**
 * ── BEGIN Y CONTEXTO EN UNA SOLA IDA Y VUELTA (rendimiento, 2026-10-27) ────
 *
 * Lo que el middleware deja guardado antes de la primera consulta es siempre
 * lo mismo: `begin` y uno o dos `SELECT set_config('app.…', $n, true)`. Se
 * mandaba una sentencia cada vez: dos o tres viajes a Postgres antes de la
 * primera consulta de verdad, en CADA petición que toca la base. Aquí se
 * juntan en una sola consulta simple (`begin; SELECT set_config(…)`), con los
 * valores escritos como literales por `escapeLiteral` del propio driver.
 *
 * Solo se juntan si TODAS las guardadas son exactamente de esas dos formas
 * (patrones cerrados abajo) y todos sus valores son cadenas; cualquier otra
 * cosa —otro driver, otra sentencia, un valor que no es texto— se manda una a
 * una como antes. Postgres ejecuta las sentencias de una consulta simple en
 * orden y, si una falla, las siguientes no corren: el mismo efecto que
 * mandarlas sueltas, con la transacción abortada.
 */
const BEGIN_SOLO = /^begin$/i;
const SET_CONFIG_DEL_CONTEXTO =
  /^SELECT set_config\('app\.[a-z_]+', \$\d+, true\)(?:, set_config\('app\.[a-z_]+', \$\d+, true\))*$/;

function textoYValores(args: unknown[]): { texto: string; valores: unknown[] } | null {
  const [primero, segundo] = args;
  if (typeof primero === "string") {
    return { texto: primero, valores: Array.isArray(segundo) ? segundo : [] };
  }
  const texto = campo(primero, "text");
  if (typeof texto !== "string") return null;
  // Opciones que cambian cómo se lee el resultado: no se tocan
  if (campo(primero, "rowMode") !== undefined || campo(primero, "name") !== undefined) return null;
  // Drizzle manda `query(config, params)`; pg también acepta `config.values`
  const valores = Array.isArray(segundo) ? segundo : campo(primero, "values");
  return { texto, valores: Array.isArray(valores) ? valores : [] };
}

export function diferidasEnUnaSentencia(diferidas: unknown[][], cliente: unknown): string | null {
  if (diferidas.length < 2) return null;
  const escapar = campo(cliente, "escapeLiteral");
  if (typeof escapar !== "function") return null;
  const partes: string[] = [];
  for (const args of diferidas) {
    const s = textoYValores(args);
    if (!s) return null;
    const texto = s.texto.trim();
    if (BEGIN_SOLO.test(texto) && s.valores.length === 0) {
      partes.push("begin");
      continue;
    }
    if (!SET_CONFIG_DEL_CONTEXTO.test(texto)) return null;
    if (!s.valores.every((v) => typeof v === "string")) return null;
    let malo = false;
    const conValores = texto.replace(/\$(\d+)/g, (_t, n: string) => {
      const v = s.valores[Number(n) - 1];
      if (typeof v !== "string") {
        malo = true;
        return "NULL";
      }
      return (escapar as (x: string) => string).call(cliente, v);
    });
    if (malo) return null;
    partes.push(conValores);
  }
  return partes.join("; ");
}

function errorCerrada(): Error {
  return new Error(
    "La transacción de esta petición ya se cerró: el trabajo que sobrevive a la respuesta va en segundoPlano()."
  );
}

/** Quién está abriendo su transacción RLS ahora mismo (para `pool.connect`). */
const aperturaEnCurso = new AsyncLocalStorage<EstadoPeticion>();

/** Lo mínimo de pg-pool que hace falta: `connect` con promesa o con callback. */
/**
 * Lo mínimo de pg-pool que hace falta: `connect()` con promesa, o con un
 * callback (lo usa `pool.query` por dentro). Sintaxis de método a propósito:
 * así el `connect` sobrecargado de pg encaja sin moldes.
 */
interface PoolConectable {
  connect(callback?: (...args: never[]) => unknown): unknown;
}

/** ¿Tiene forma de cliente del pool (lo que devuelve `connect()`)? */
function esClienteDelPool(valor: unknown): valor is ClienteDelPool {
  return (
    typeof campo(valor, "query") === "function" && typeof campo(valor, "release") === "function"
  );
}

/**
 * Envuelve `pool.connect` (pg-pool) para que la transacción RLS de cada
 * petición sea perezosa. Solo cambia la conexión que pide `db.transaction()`
 * DESDE `transaccionRls`; cualquier otra (`pool.query`, una transacción
 * propia del sistema) sale del pool como siempre.
 *
 * Mismo patrón que `vigilarPool` (apps/api/src/lib/pool-agotado.ts), que
 * puede ir debajo: la conexión real se pide con el `connect` que hubiera.
 */
export function conTransaccionesPerezosas<P extends PoolConectable>(pool: P): P {
  const original = pool.connect.bind(pool);
  const abrirReal = async (): Promise<ClienteDelPool> => {
    const cliente = await original();
    if (!esClienteDelPool(cliente)) {
      throw new TypeError("pool.connect() no devolvió un cliente con query() y release()");
    }
    return cliente;
  };
  // Se escribe a través del tipo de la restricción: es `connect` lo que se
  // sustituye, no lo que `P` añada.
  const destino: PoolConectable = pool;
  destino.connect = (callback) => {
    const estado = aperturaEnCurso.getStore();
    if (estado?.pidiendoConexion && callback === undefined) {
      estado.pidiendoConexion = false;
      const conexion = new ConexionPerezosa(abrirReal, estado);
      estado.conexion = conexion;
      return Promise.resolve(conexion);
    }
    return original(callback);
  };
  return pool;
}

// ═══════════════════════════════════════════════════════════════════════════
// LA TRANSACCIÓN DE LA PETICIÓN
// ═══════════════════════════════════════════════════════════════════════════

/** El contexto de usuario VIGENTE en cada transacción (para restaurarlo). */
const contextoPorTx = new WeakMap<object, { userId: string; userRole: string }>();
/** De qué petición es cada `tx` publicado (raíz y savepoints). */
const estadoPorTx = new WeakMap<object, EstadoPeticion>();

async function fijar(tx: ConexionTransaccional, userId: string, userRole: string) {
  await tx.execute(
    sql`SELECT set_config('app.current_user_id', ${userId}, true), set_config('app.current_user_role', ${userRole}, true)`
  );
}

/**
 * Fija el contexto de un usuario en una transacción YA abierta y lo recuerda
 * para que `comoSistema()` pueda restaurarlo.
 */
export async function fijarContextoRls(
  tx: ConexionTransaccional,
  user: UsuarioRls | null | undefined
): Promise<{ userId: string; userRole: string }> {
  const contexto = contextoRlsDe(user);
  contextoPorTx.set(tx, contexto);
  await fijar(tx, contexto.userId, contexto.userRole);
  await fijarDatasetsDelAgente(tx, user);
  return contexto;
}

/**
 * Fase E — los SCOPES de un agente, para la RLS de los datasets.
 *
 * Las políticas de `data_entries` solo conocían dueño, rol `admin` y la
 * `policyJson` del dataset: un agente (rol `agent`; no es una cuenta, no tiene
 * filas propias) no veía ni escribía nada en un dataset privado aunque la
 * aplicación se lo concediera con `datasets:<slug>:read`. Se le pasan sus
 * scopes a Postgres en `app.agent_scopes` (local a la transacción) y las
 * políticas `data_entries_agente_*` (rls-policies.sql) los evalúan con
 * `kitsuden_agente_abre_dataset()`: la MISMA regla que shared
 * (permisos-de-agente.ts: comodines y denegaciones), escrita en SQL y
 * comparada con la de TypeScript por un test. Abre SOLO los datasets que esos
 * scopes cubren: un fallo de un handler no puede sacar filas de otro.
 *
 * Sin consultas aquí: con el pool perezoso, lo que se manda antes de la
 * primera consulta real se guarda y se responde vacío.
 */
async function fijarDatasetsDelAgente(
  tx: ConexionTransaccional,
  user: UsuarioRls | null | undefined
): Promise<void> {
  const scopes = (user as { scopes?: unknown } | null | undefined)?.scopes;
  if (!Array.isArray(scopes) || scopes.length === 0) return;
  // Los scopes validados no llevan comas (permisos-de-agente.ts).
  const lista = scopes.filter((s): s is string => typeof s === "string" && !s.includes(","));
  await tx.execute(sql`SELECT set_config('app.agent_scopes', ${lista.join(",")}, true)`);
}

/**
 * El `tx` que se publica: el de Drizzle con `transaction()` convertido en
 * sección exclusiva (a cualquier profundidad). Todo lo demás pasa tal cual.
 */
function envolverTx(tx: ConexionTransaccional, estado: EstadoPeticion): ConexionTransaccional {
  const envuelto = new Proxy(tx, {
    get(objetivo, propiedad) {
      if (propiedad === "transaction") {
        return <R>(fn: (interno: ConexionTransaccional) => Promise<R>, config?: unknown) =>
          seccion(estado, () =>
            objetivo.transaction((interno) => fn(envolverTx(interno, estado)), config)
          );
      }
      const valor: unknown = Reflect.get(objetivo, propiedad, objetivo);
      return typeof valor === "function" && propiedad !== "constructor"
        ? valor.bind(objetivo)
        : valor;
    },
  });
  estadoPorTx.set(envuelto, estado);
  return envuelto;
}

/** Señal interna para revertir la transacción sin propagar un error. */
const REVERTIR = Symbol("revertir-transaccion-rls");

/** Lo que se sabe de una petición cuyo COMMIT Postgres convirtió en ROLLBACK. */
export interface ConfirmacionPerdida {
  metodo: string;
  ruta: string;
  estado: number;
  /** El primer error de SQL de la petición (el que, tragado, abortó la transacción). */
  error?: { code?: string; message: string };
  /** Si la respuesta se cambió por un 500 (escrituras que respondían éxito). */
  respuestaCambiada: boolean;
}

export interface OpcionesTransaccionRls {
  /** Se llama con la transacción ya abierta y el contexto fijado. */
  alAbrir?(c: Context, tx: unknown, contexto: { userId: string; userRole: string }): void;
  /**
   * Se llama cuando la transacción acabó abortada por un error de SQL que la
   * ruta capturó y siguió: Postgres deshizo TODO lo de la petición. Para el
   * log; la respuesta ya se ha corregido si hacía falta.
   */
  alPerderConfirmacion?(c: Context, info: ConfirmacionPerdida): void;
}

const METODOS_DE_LECTURA = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Middleware: envuelve la petición en una transacción RLS sobre `db`.
 *
 * · Idempotente: si la petición ya va en una transacción RLS (dos montajes
 *   que se solapan), no abre otra —sería otra conexión con otro contexto—.
 * · Publica la transacción en el request-scope: `repo()` y el `db` de los
 *   kons (`dbDeLaPeticion`) la usan sin pasarla a mano.
 * · Revierte si la ruta acabó en error o en 5xx. Hono CAPTURA los errores
 *   dentro de `next()` (los pasa a `onError` y deja `c.error`), así que sin
 *   mirarlo una escritura a medias de una ruta fallida se confirmaba igual.
 * · Perezosa si el pool está envuelto (`conTransaccionesPerezosas`).
 * · Una escritura cuyo COMMIT acabó en ROLLBACK no responde éxito.
 */
export function transaccionRls(
  db: ConexionTransaccional | (() => ConexionTransaccional),
  opciones: OpcionesTransaccionRls = {}
): MiddlewareHandler {
  const resolverDb = typeof db === "function" ? db : () => db;

  const middleware = async (c: Context, next: Next): Promise<void> => {
    if (c.get("tx" as never) || useRequest()?.tx) {
      await next();
      return;
    }
    // Sin request-scope (una app que no monta el de telemetría) el `tx` no
    // tendría dónde publicarse y todo caería a la conexión global SIN contexto.
    if (!useRequest()) {
      await runInRequestScope({}, () => middleware(c, next));
      return;
    }

    const user = c.get("user" as never) as UsuarioRls | null | undefined;
    publicarUsuario(c, user);
    const estado: EstadoPeticion = {
      raiz: new Carril(),
      pidiendoConexion: true,
      medidas: medidasPublicadas(),
    };
    try {
      await aperturaEnCurso.run(estado, () =>
        resolverDb().transaction(async (crudo) => {
          // La conexión de esta transacción ya está pedida (o el driver no
          // pasa por el pool): las siguientes, para quien sea, son normales.
          estado.pidiendoConexion = false;
          const tx = envolverTx(crudo, estado);
          const contexto = await fijarContextoRls(tx, user);
          estado.conexion?.activar();
          opciones.alAbrir?.(c, tx, contexto);
          setRequestTx(tx);
          // Si `next()` lanzara (Hono suele capturar antes), se revierte.
          let revertir = true;
          try {
            await next();
            revertir = Boolean(c.error || (c.res && c.res.status >= 500));
          } finally {
            clearRequestTx();
            estado.conexion?.cerrar(revertir);
          }
          if (revertir) throw REVERTIR;
        })
      );
    } catch (err) {
      if (err !== REVERTIR) throw err;
    }

    if (estado.conexion?.confirmacionPerdida) {
      const status = c.res?.status ?? 200;
      const cambiar = !METODOS_DE_LECTURA.has(c.req.method) && status < 400;
      if (cambiar) {
        c.res = new Response(
          JSON.stringify({
            error: "The changes of this request were not saved.",
            code: "KITSUDEN_E_INTERNAL",
            message:
              "A database error inside the request aborted its transaction; nothing was written.",
          }),
          { status: 500, headers: { "content-type": "application/json; charset=utf-8" } }
        );
      }
      opciones.alPerderConfirmacion?.(c, {
        metodo: c.req.method,
        ruta: c.req.path,
        estado: status,
        error: estado.conexion.primerError,
        respuestaCambiada: cambiar,
      });
    }
  };
  return middleware;
}

/**
 * La transacción RLS de una petición, sin petición: para un trabajo de la
 * cola (kitsuden2.md, B1) o cualquier tarea de fondo que deba correr con la
 * RLS de un actor concreto y no como el sistema.
 *
 * Igual que el middleware: perezosa si el pool está envuelto (un trabajo que
 * solo manda un correo no pide conexión), un request-scope propio con el `tx`
 * publicado (`repo()` y `dbDeLaPeticion` lo usan), secciones exclusivas, y
 * ROLLBACK si `fn` lanza. Un COMMIT que Postgres convirtió en ROLLBACK lanza:
 * el trabajo no se hizo y debe reintentarse.
 */
export async function enTransaccionRls<T>(
  db: ConexionTransaccional,
  user: UsuarioRls | null | undefined,
  fn: () => Promise<T>,
  scope: { requestId?: string; traceId?: string } = {}
): Promise<T> {
  const estado: EstadoPeticion = { raiz: new Carril(), pidiendoConexion: true };
  const usuario = (user ?? null) as RequestScopeUser;
  let resultado: T | undefined;
  await runInRequestScope({ ...scope, user: usuario }, () =>
    aperturaEnCurso.run(estado, () =>
      db.transaction(async (crudo) => {
        estado.pidiendoConexion = false;
        const tx = envolverTx(crudo, estado);
        await fijarContextoRls(tx, user);
        estado.conexion?.activar();
        setRequestTx(tx);
        let revertir = true;
        try {
          resultado = await fn();
          revertir = false;
        } finally {
          clearRequestTx();
          estado.conexion?.cerrar(revertir);
        }
      })
    )
  );
  if (estado.conexion?.confirmacionPerdida) {
    const primero = estado.conexion.primerError;
    throw new Error(
      `La transacción se revirtió al confirmar${primero ? `: ${primero.message}` : ""}`
    );
  }
  return resultado as T;
}

type RequestScopeUser = { id?: string; role?: string; scopes?: string[]; keyId?: string } | null;

/**
 * Publica en el request-scope QUIÉN pregunta (si nadie lo hizo antes): lo
 * que `useUser()` devuelve y lo que `queue.dispatch()` guarda como actor del
 * trabajo. Solo id, rol, scopes y la clave del agente: nada de la sesión.
 */
function publicarUsuario(c: Context, user: UsuarioRls | null | undefined): void {
  const scope = useRequest();
  if (!scope || scope.user !== undefined) return;
  const { userId, userRole } = contextoRlsDe(user);
  if (!userId) {
    scope.user = null;
    return;
  }
  const scopes = (user as { scopes?: unknown } | null | undefined)?.scopes;
  const agente = c.get("agent" as never) as { keyId?: unknown } | undefined;
  scope.user = {
    id: userId,
    role: userRole,
    ...(Array.isArray(scopes)
      ? { scopes: scopes.filter((s): s is string => typeof s === "string") }
      : {}),
    ...(typeof agente?.keyId === "string" && agente.keyId ? { keyId: agente.keyId } : {}),
  };
}

/**
 * Ejecuta `fn` como el SISTEMA (id '' y rol '') dentro de la transacción de
 * la petición, y restaura el contexto al acabar.
 *
 * Para lo que una ruta hace en nombre de otros y la RLS de quien pregunta, con
 * razón, no deja: recontar votos ajenos, apuntar a un anónimo, procesar un
 * webhook firmado. SIEMPRE después de autorizar la acción en la aplicación.
 * Fuera de una petición transaccional `fn` se ejecuta tal cual: esa conexión
 * ya es la del sistema.
 *
 * Es una sección exclusiva: lo que se lance en paralelo con `fn` (un
 * `Promise.all` que mezcle) espera a que acabe y corre con el contexto de
 * quien pregunta, no como el sistema. Anidada en otra, restaura el sistema.
 */
export async function comoSistema<T>(fn: () => Promise<T>): Promise<T> {
  const tx = useRequest()?.tx;
  if (!esConexionTransaccional(tx) || !contextoPorTx.has(tx)) return fn();
  const cuerpo = async (): Promise<T> => {
    const previo = contextoPorTx.get(tx);
    if (!previo) return fn();
    const sistema = { userId: "", userRole: "" };
    await fijar(tx, sistema.userId, sistema.userRole);
    contextoPorTx.set(tx, sistema);
    let bien = false;
    try {
      const resultado = await fn();
      bien = true;
      return resultado;
    } finally {
      contextoPorTx.set(tx, previo);
      // Si `fn` falló en SQL la transacción está abortada y restaurar también
      // fallaría, tapando el error de verdad: se intenta y se calla. La
      // transacción se revertirá entera de todos modos.
      const restaurar = fijar(tx, previo.userId, previo.userRole);
      if (bien) await restaurar;
      else await restaurar.catch(() => {});
    }
  };
  const estado = estadoPorTx.get(tx);
  return estado ? seccion(estado, cuerpo) : cuerpo();
}

/**
 * Ejecuta `fn` en un SAVEPOINT de la transacción de la petición: si falla, se
 * deshace solo lo suyo y la transacción sigue viva para lo de después. El
 * error se propaga igual (para eso está `intentarSql`).
 *
 * Fuera de una petición transaccional ejecuta `fn` tal cual: cada sentencia
 * va en su propia transacción y un fallo no envenena a nadie.
 *
 * `fn` puede usar el `db` de siempre (misma conexión, el savepoint es estado
 * de la conexión) o el `sp` que recibe.
 */
export async function conSavepoint<T>(fn: (sp?: ConexionTransaccional) => Promise<T>): Promise<T> {
  const tx = useRequest()?.tx;
  if (!esConexionTransaccional(tx)) return fn(undefined);
  return tx.transaction((sp) => fn(sp));
}

/**
 * «Intentar y seguir» con SQL: `fn` en un SAVEPOINT; si falla, se llama a
 * `alFallar` (para el log) y se devuelve `porDefecto`. El sustituto de
 * `try { await db… } catch {}` dentro de una ruta.
 */
export async function intentarSql<T>(
  fn: (sp?: ConexionTransaccional) => Promise<T>,
  porDefecto: T,
  alFallar?: (err: unknown) => void
): Promise<T> {
  try {
    return await conSavepoint(fn);
  } catch (err) {
    alFallar?.(err);
    return porDefecto;
  }
}

/**
 * Ejecuta `fn` FUERA de la transacción de la petición: un request-scope vacío,
 * así que `dbDeLaPeticion` resuelve a la conexión global (el sistema), y los
 * temporizadores y promesas que `fn` cree heredan ese scope vacío.
 *
 * Para el trabajo que sobrevive a la respuesta (un `void tarea()`, una sesión
 * en vivo, un correo que no hace falta esperar): la transacción de la
 * petición se confirma al responder, y una consulta preparada dentro de ella
 * y ejecutada después iría a una conexión ya devuelta al pool.
 */
export function segundoPlano<T>(fn: () => T): T {
  return runInRequestScope({}, fn);
}

/**
 * Un `db` que, en cada acceso, resuelve al ejecutor de la petición en curso
 * (la transacción RLS) o, fuera de una petición, a `db`.
 *
 * Proxy y no un valor: los kons guardan `ctx.db.instance` en una constante al
 * crear su router, una sola vez. Resolver en cada acceso es lo que hace que
 * esa constante siga apuntando a la transacción de QUIEN pregunta.
 *
 * `instancia.transaction(fn)` dentro de una petición abre un SAVEPOINT de la
 * transacción de la petición (Drizzle lo hace solo): mismo contexto, misma
 * conexión, y si `fn` lanza se deshace solo lo suyo.
 */
export function dbDeLaPeticion<T extends object>(db: T): T {
  return new Proxy(db, {
    get(_objetivo, propiedad) {
      const ejecutor: object = resolveExecutor(db);
      const valor: unknown = Reflect.get(ejecutor, propiedad);
      return typeof valor === "function" ? valor.bind(ejecutor) : valor;
    },
  });
}
