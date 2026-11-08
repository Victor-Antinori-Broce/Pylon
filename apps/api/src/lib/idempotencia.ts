/**
 * Idempotencia de escrituras: almacenes y reglas
 * ============================================================================
 *
 * Un agente que no recibe respuesta (timeout, conexión cortada, 503) no sabe
 * si su `POST` se ejecutó. Si reintenta a ciegas, duplica; si no reintenta,
 * pierde. La salida estándar es la cabecera `Idempotency-Key`: el cliente
 * genera una clave por OPERACIÓN y la repite en cada reintento; el servidor
 * ejecuta la primera y a las demás les devuelve la misma respuesta.
 *
 * Este fichero tiene lo que no depende de Hono (almacenes, huellas, qué se
 * guarda y qué no); el middleware está en `middleware/idempotencia.ts`.
 *
 * ── DÓNDE SE GUARDA ────────────────────────────────────────────────────────
 *
 *   1. Valkey (rápido, con TTL nativo): `SET … NX PX` reserva la clave de
 *      forma atómica, y con eso dos peticiones simultáneas no pueden
 *      ejecutarse las dos.
 *   2. Si Valkey no responde: una tabla de Postgres (`kitsuden_idempotencia`),
 *      con `INSERT … ON CONFLICT` como reserva atómica. Se crea sola la
 *      primera vez que hace falta (`CREATE TABLE IF NOT EXISTS`).
 *   3. Si tampoco hay tabla (o la base no responde): ver `modoDeFallo`.
 *
 * Límite conocido: el respaldo es por petición. Si Valkey se cae ENTRE el
 * primer intento y el reintento, el reintento mira la tabla y no ve la
 * reserva hecha en Valkey. Solo ocurre durante una caída, y el cliente que
 * reintenta dentro de esa ventana puede ver la operación ejecutada dos veces.
 *
 * ── QUÉ NO SE GUARDA NUNCA ────────────────────────────────────────────────
 *
 *   - Cabeceras: solo una lista blanca (tipo, ubicación, ETag…). Ni
 *     `Set-Cookie`, ni `Authorization`, ni nada que no esté en la lista.
 *   - Cuerpos con secretos (claves de agente recién creadas, tokens,
 *     contraseñas): no se guarda la respuesta. Se guarda solo que la
 *     operación YA se hizo, y el reintento recibe 409
 *     `KITSUDEN_E_IDEMPOTENCY_NOT_REPLAYABLE` en vez de ejecutarse otra vez.
 *   - Respuestas de más de `IDEMPOTENCY_MAX_RESPONSE_BYTES`: igual que arriba.
 *
 * ── QUÉ SE REPITE Y QUÉ NO ────────────────────────────────────────────────
 *
 *   - 2xx, 3xx y los 4xx deterministas (400, 404, 422…): se guardan y se
 *     repiten tal cual.
 *   - 5xx, 401, 403, 408, 409, 423, 425, 429: NO se guardan; se libera la
 *     clave y el reintento se ejecuta de nuevo. Son fallos de estado
 *     (sesión, permisos, carga, el mundo cambió) que un reintento puede
 *     resolver, y la operación no llegó a hacerse.
 */
import { createHash, randomUUID } from "node:crypto";

// ── Configuración ───────────────────────────────────────────────────────────

export type ModoDeFallo = "closed" | "open";

export interface ConfigIdempotencia {
  /** Cuánto se recuerda una respuesta (ms). `IDEMPOTENCY_TTL_SECONDS`, 24 h. */
  vidaMs: number;
  /** Cuánto dura la reserva mientras la petición corre (ms). `IDEMPOTENCY_LOCK_SECONDS`, 60 s. */
  bloqueoMs: number;
  /** Respuesta más grande que se guarda. `IDEMPOTENCY_MAX_RESPONSE_BYTES`, 1 MiB. */
  maxRespuestaBytes: number;
  /** Sin ningún almacén: `closed` (503, por defecto) u `open` (ejecutar sin protección). */
  modoDeFallo: ModoDeFallo;
}

export function configDeIdempotencia(
  env: Record<string, string | undefined> = process.env
): ConfigIdempotencia {
  const entero = (valor: string | undefined, porDefecto: number, min: number, max: number) => {
    const n = Number(valor);
    return Number.isInteger(n) && n >= min && n <= max ? n : porDefecto;
  };
  return {
    vidaMs: entero(env.IDEMPOTENCY_TTL_SECONDS, 86_400, 60, 30 * 86_400) * 1000,
    bloqueoMs: entero(env.IDEMPOTENCY_LOCK_SECONDS, 60, 1, 3600) * 1000,
    maxRespuestaBytes: entero(env.IDEMPOTENCY_MAX_RESPONSE_BYTES, 1_048_576, 1024, 16_777_216),
    modoDeFallo: env.IDEMPOTENCY_FAIL_MODE === "open" ? "open" : "closed",
  };
}

// ── Claves y huellas ────────────────────────────────────────────────────────

/** Igual que la que ya validaba kon-ecommerce: opaca, corta, sin caracteres raros. */
export const CLAVE_IDEMPOTENCIA_VALIDA = /^[A-Za-z0-9_.:-]{8,128}$/;

/**
 * Dónde se guarda: el actor + la clave, en hash. Dos actores con la misma
 * clave no se ven entre sí, y la clave no queda en claro en Valkey ni en la
 * tabla.
 */
export function claveDeAlmacen(actor: string, clave: string): string {
  return createHash("sha256").update(`${actor}\n${clave}`).digest("hex");
}

/**
 * Qué se pidió: método + camino + query + tipo + cuerpo. Si un reintento trae
 * otra huella con la misma clave, es un error del cliente (422), no un
 * reintento.
 */
export function huellaDePeticion(p: {
  metodo: string;
  camino: string;
  query: string;
  tipo: string;
  cuerpo: Uint8Array;
}): string {
  return createHash("sha256")
    .update(`${p.metodo.toUpperCase()}\n${p.camino}\n${p.query}\n${p.tipo}\n`)
    .update(p.cuerpo)
    .digest("hex");
}

// ── Registros ───────────────────────────────────────────────────────────────

export interface RespuestaGuardada {
  status: number;
  cabeceras: Array<[string, string]>;
  /** Cuerpo en base64 (puede no ser texto). */
  cuerpoB64: string;
}

export type Registro =
  | { estado: "en-curso"; token: string; huella: string; creado: number }
  | {
      estado: "hecho";
      token: string;
      huella: string;
      creado: number;
      respuesta: RespuestaGuardada;
    }
  | {
      estado: "sin-repeticion";
      token: string;
      huella: string;
      creado: number;
      motivo: "secreto" | "demasiado-grande" | "no-repetible";
    };

export type Reserva =
  | { reservado: true }
  | { reservado: false; existente: Registro };

/** Un sitio donde guardar. Cualquier fallo de infraestructura se LANZA. */
export interface AlmacenIdempotencia {
  readonly nombre: string;
  /** Reserva atómica. Si ya existe un registro vivo, lo devuelve. */
  reservar(clave: string, registro: Registro, ms: number): Promise<Reserva>;
  /** Sustituye la reserva por el resultado, solo si sigue siendo nuestra (token). */
  completar(clave: string, token: string, registro: Registro, ms: number): Promise<void>;
  /** Borra la reserva, solo si sigue siendo nuestra (token). */
  liberar(clave: string, token: string): Promise<void>;
  /**
   * Fase F: lee el registro vivo SIN reservar (`null` si no hay). Lo usan las
   * cuotas para no cobrar una repetición. Opcional: un almacén sin él no
   * permite saberlo antes y la cuota se devuelve después.
   */
  consultar?(clave: string): Promise<Registro | null>;
}

/**
 * ¿La respuesta a ESTA petición (actor + clave + huella) ya está guardada y se
 * va a REPETIR? Decide el primer almacén que responda, como al reservar.
 */
export async function repeticionGuardada(
  almacenes: AlmacenIdempotencia[],
  actor: string,
  clave: string,
  huella: string
): Promise<boolean> {
  const k = claveDeAlmacen(actor, clave);
  for (const almacen of almacenes) {
    if (!almacen.consultar) return false;
    try {
      const r = await almacen.consultar(k);
      return Boolean(r && r.huella === huella && (r.estado === "hecho" || r.estado === "sin-repeticion"));
    } catch {
      /* el siguiente almacén */
    }
  }
  return false;
}

export function nuevoToken(): string {
  return randomUUID();
}

// ── Qué se guarda de una respuesta ──────────────────────────────────────────

/** Estados que NO se guardan: un reintento puede salir distinto y la operación no se hizo. */
const NO_SE_GUARDAN = new Set([401, 403, 408, 409, 423, 425, 429]);

export function seGuardaElEstado(status: number): boolean {
  return status < 500 && !NO_SE_GUARDAN.has(status);
}

/**
 * Lista BLANCA de cabeceras que se repiten. Lo demás (`Set-Cookie`,
 * `Authorization`, `X-Agent-Id`, cabeceras de traza de la petición original…)
 * no se guarda.
 */
const CABECERAS_REPETIBLES = new Set([
  "content-type",
  "content-language",
  "content-location",
  "location",
  "etag",
  "last-modified",
  "link",
  "cache-control",
  "vary",
  "deprecation",
  "sunset",
  "x-total-count",
  "x-kitsuden-format",
]);

export function cabecerasRepetibles(cabeceras: Headers): Array<[string, string]> {
  const salida: Array<[string, string]> = [];
  cabeceras.forEach((valor, nombre) => {
    if (CABECERAS_REPETIBLES.has(nombre.toLowerCase())) salida.push([nombre.toLowerCase(), valor]);
  });
  return salida;
}

/** Nombres de campo que llevan un secreto (la lista exacta de siempre). */
const CAMPO_SECRETO =
  /^(token|access_?token|refresh_?token|id_?token|session_?token|secret|client_?secret|password|passwd|api_?key|apikey|raw_?key|plain_?key|private_?key|secret_?key|signing_?key|webhook_?secret)$/i;
/** Valores que son claves de Kitsuden, se llamen como se llamen. */
const VALOR_SECRETO = /^(kitsuden_agent_|kitsuden_sk_|grm_agent_|kitsuden_oat_|kitsuden_ort_|kcs_)[A-Za-z0-9_-]{8,}/;

/**
 * Valores que tienen forma de credencial ajena (auditoría 2026-11-04, F79): cabeceras
 * `Bearer`/`Basic`, claves de proveedores conocidos, claves privadas PEM.
 */
const VALOR_CREDENCIAL =
  /^(?:(?:Bearer|Basic|Token|Digest)\s+\S{8,}|sk-[A-Za-z0-9_-]{16,}|sk_(?:live|test)_[A-Za-z0-9]{8,}|rk_(?:live|test)_[A-Za-z0-9]{8,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{16,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})/;
const CLAVE_PRIVADA_PEM = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;

/** Trozos de un nombre: `OPENAI_API_KEY`, `apiKey`, `x-api-key` → api, key… */
function trozosDeNombre(nombre: string): string[] {
  return nombre
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Un trozo que por sí solo dice «aquí va un secreto». */
const TROZO_SECRETO = new Set([
  "secret",
  "secrets",
  "password",
  "passwd",
  "pwd",
  "passphrase",
  "token",
  "credential",
  "credentials",
  "authorization",
  "cookie",
  "apikey",
  "privatekey",
  "secretkey",
  "accesskey",
  "signingkey",
  "dsn",
]);
/** `key` con uno de estos al lado: `api_key`, `privateKey`, `STRIPE_SECRET_KEY`… */
const CALIFICA_A_KEY = new Set([
  "api",
  "private",
  "secret",
  "access",
  "signing",
  "client",
  "auth",
  "encryption",
  "master",
  "license",
  "service",
  "webhook",
  "session",
  "ssh",
  "deploy",
  "admin",
  "bot",
  "app",
]);
/**
 * Trozos que convierten el nombre en un DATO SOBRE el secreto, no el secreto:
 * `tokenCount`, `apiKeyId`, `secretName`, `passwordUpdatedAt`, `tokenUrl`.
 */
const TROZO_DESCRIPTIVO = new Set([
  "count",
  "counts",
  "max",
  "min",
  "limit",
  "type",
  "types",
  "usage",
  "consent",
  "expires",
  "expiry",
  "expiration",
  "ttl",
  "length",
  "url",
  "uri",
  "endpoint",
  "id",
  "ids",
  "name",
  "names",
  "hint",
  "policy",
  "label",
  "field",
  "enabled",
  "required",
  "at",
  "prefix",
  "last4",
  "masked",
]);
/** Objetos cuyo contenido entero son valores de entorno o credenciales (`config.envVars`). */
const CONTENEDOR_SECRETO = new Set(["envvars", "env", "environment", "secrets", "credentials"]);

/**
 * ¿Este nombre de campo (o de cabecera, o de variable) lleva un secreto?
 * Más amplio que la lista exacta: cualquier nombre con secret/password/token/
 * credential/authorization/cookie, o `key` calificada (`api`, `private`…), o
 * una variable de entorno `ALGO_KEY`. No: los nombres que describen al secreto
 * (`tokenCount`, `apiKeyId`, `secretName`).
 */
export function nombreDeSecreto(nombre: string): boolean {
  if (typeof nombre !== "string" || !nombre) return false;
  if (CAMPO_SECRETO.test(nombre)) return true;
  const trozos = trozosDeNombre(nombre);
  if (trozos.some((t) => TROZO_DESCRIPTIVO.has(t))) return false;
  if (trozos.some((t) => TROZO_SECRETO.has(t))) return true;
  if (trozos.includes("key") && trozos.some((t) => CALIFICA_A_KEY.has(t))) return true;
  // Variables de entorno: `STRIPE_KEY`, `OPENAI_API_KEY`.
  return /^[A-Z][A-Z0-9_]*_KEY$/.test(nombre);
}

function valorConSecreto(v: string): boolean {
  return VALOR_SECRETO.test(v) || VALOR_CREDENCIAL.test(v) || CLAVE_PRIVADA_PEM.test(v);
}

/** ¿Lleva algún texto no vacío? */
function tieneTexto(valor: unknown, profundidad = 0): boolean {
  if (profundidad > 12 || valor === null || valor === undefined) return false;
  if (typeof valor === "string") return valor.length > 0;
  if (typeof valor === "object") {
    return Object.values(valor as Record<string, unknown>).some((v) => tieneTexto(v, profundidad + 1));
  }
  return false;
}

/** ¿Hay un secreto en este JSON? Recorre a cualquier profundidad (con tope). */
export function contieneSecreto(valor: unknown, profundidad = 0): boolean {
  if (profundidad > 12 || valor === null || valor === undefined) return false;
  if (typeof valor === "string") return valorConSecreto(valor);
  if (Array.isArray(valor)) return valor.some((v) => contieneSecreto(v, profundidad + 1));
  if (typeof valor === "object") {
    const o = valor as Record<string, unknown>;
    // `{ key: "OPENAI_API_KEY", value: "sk-…" }` (el Secrets Manager), `{ name: "Authorization", value: … }`.
    const etiqueta = [o.key, o.name, o.header, o.variable].find((x) => typeof x === "string") as string | undefined;
    if (etiqueta && nombreDeSecreto(etiqueta) && tieneTexto(o.value)) return true;
    for (const [clave, v] of Object.entries(o)) {
      if (nombreDeSecreto(clave) && tieneTexto(v)) return true;
      if (CONTENEDOR_SECRETO.has(clave.toLowerCase()) && v && typeof v === "object" && tieneTexto(v)) return true;
      if (contieneSecreto(v, profundidad + 1)) return true;
    }
  }
  return false;
}

/**
 * Rutas cuyo cuerpo ES un secreto, se llame como se llame el campo: lo que se
 * manda ahí es para guardarlo cifrado y no enseñarlo nunca. Una propuesta
 * guarda el cuerpo para ejecutarlo al aprobarla, así que no se puede retener
 * sin guardar el secreto: se rechaza (F79).
 */
const RUTAS_DE_SECRETOS = [/^\/api\/admin\/secrets(?:\/|$)/, /^\/api\/v1\/admin\/secrets(?:\/|$)/];

export function rutaQueRecibeSecretos(camino: string): boolean {
  const c = String(camino ?? "").split("?")[0]!.replace(/\/{2,}/g, "/");
  return RUTAS_DE_SECRETOS.some((r) => r.test(c));
}

/** ¿El cuerpo (bytes) lleva un secreto? Solo se mira si es JSON o texto. */
export function cuerpoConSecreto(tipo: string, cuerpo: Uint8Array): boolean {
  const t = tipo.toLowerCase();
  if (!t.includes("json") && !t.startsWith("text/")) return false;
  const texto = new TextDecoder().decode(cuerpo);
  if (t.includes("json")) {
    try {
      return contieneSecreto(JSON.parse(texto));
    } catch {
      // JSON roto: se mira como texto
    }
  }
  return (
    /(kitsuden_agent_|kitsuden_sk_|grm_agent_|kitsuden_oat_|kitsuden_ort_|kcs_)[A-Za-z0-9_-]{8,}/.test(texto) ||
    CLAVE_PRIVADA_PEM.test(texto) ||
    /(?:^|\s)(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{16,}/.test(texto)
  );
}

// ── Almacén en memoria (tests y modo «un solo proceso») ─────────────────────

export function almacenEnMemoria(ahora: () => number = Date.now): AlmacenIdempotencia & {
  tamano(): number;
} {
  const datos = new Map<string, { registro: Registro; expira: number }>();
  const vivo = (clave: string) => {
    const e = datos.get(clave);
    if (!e) return null;
    if (e.expira <= ahora()) {
      datos.delete(clave);
      return null;
    }
    return e;
  };
  return {
    nombre: "memoria",
    async reservar(clave, registro, ms) {
      const e = vivo(clave);
      if (e) return { reservado: false, existente: e.registro };
      datos.set(clave, { registro, expira: ahora() + ms });
      return { reservado: true };
    },
    async completar(clave, token, registro, ms) {
      const e = vivo(clave);
      if (!e || e.registro.token !== token) return;
      datos.set(clave, { registro, expira: ahora() + ms });
    },
    async liberar(clave, token) {
      const e = vivo(clave);
      if (e && e.registro.token === token) datos.delete(clave);
    },
    async consultar(clave) {
      return vivo(clave)?.registro ?? null;
    },
    tamano: () => datos.size,
  };
}

// ── Valkey ──────────────────────────────────────────────────────────────────

/** Lo mínimo del cliente de `redis` v5 que se usa (para poder simularlo). */
export interface ClienteValkeyMinimo {
  set(
    clave: string,
    valor: string,
    opciones: { condition: "NX"; expiration: { type: "PX"; value: number } }
  ): Promise<unknown>;
  get(clave: string): Promise<string | null>;
  eval(script: string, opciones: { keys: string[]; arguments: string[] }): Promise<unknown>;
}

const PREFIJO_VALKEY = "kitsuden:idem:";

/**
 * El valor es `<token>|<json>`: así un script Lua puede comprobar que la
 * reserva sigue siendo nuestra sin parsear JSON.
 */
const LUA_COMPLETAR = `
local v = redis.call('GET', KEYS[1])
if v and string.sub(v, 1, string.len(ARGV[1]) + 1) == ARGV[1] .. '|' then
  redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3])
  return 1
end
return 0`;

const LUA_LIBERAR = `
local v = redis.call('GET', KEYS[1])
if v and string.sub(v, 1, string.len(ARGV[1]) + 1) == ARGV[1] .. '|' then
  return redis.call('DEL', KEYS[1])
end
return 0`;

function decodificar(valor: string): Registro | null {
  const corte = valor.indexOf("|");
  if (corte < 0) return null;
  try {
    return JSON.parse(valor.slice(corte + 1)) as Registro;
  } catch {
    return null;
  }
}

export function almacenValkey(cliente: () => Promise<ClienteValkeyMinimo>): AlmacenIdempotencia {
  return {
    nombre: "valkey",
    async reservar(clave, registro, ms) {
      const c = await cliente();
      const k = PREFIJO_VALKEY + clave;
      // Dos vueltas: si la reserva ajena caduca entre el SET y el GET, se
      // vuelve a intentar en vez de devolver «no hay nada».
      for (let i = 0; i < 2; i++) {
        const ok = await c.set(k, `${registro.token}|${JSON.stringify(registro)}`, {
          condition: "NX",
          expiration: { type: "PX", value: ms },
        });
        if (ok) return { reservado: true };
        const actual = await c.get(k);
        const existente = actual ? decodificar(actual) : null;
        if (existente) return { reservado: false, existente };
      }
      throw new Error("Valkey: no se pudo reservar ni leer la clave de idempotencia");
    },
    async completar(clave, token, registro, ms) {
      const c = await cliente();
      await c.eval(LUA_COMPLETAR, {
        keys: [PREFIJO_VALKEY + clave],
        arguments: [token, `${token}|${JSON.stringify(registro)}`, String(ms)],
      });
    },
    async liberar(clave, token) {
      const c = await cliente();
      await c.eval(LUA_LIBERAR, { keys: [PREFIJO_VALKEY + clave], arguments: [token] });
    },
    async consultar(clave) {
      const c = await cliente();
      const v = await c.get(PREFIJO_VALKEY + clave);
      return v ? decodificar(v) : null;
    },
  };
}

// ── Postgres (respaldo) ─────────────────────────────────────────────────────

/** Lo mínimo de `pg`/drizzle que se usa: SQL con parámetros posicionales. */
export type ConsultaSql = (texto: string, parametros: unknown[]) => Promise<Array<Record<string, unknown>>>;

export const TABLA_IDEMPOTENCIA = "kitsuden_idempotencia";

/**
 * DDL de la tabla de respaldo. No es una migración numerada a propósito: el
 * respaldo es opcional y la crea el propio almacén la primera vez que la
 * necesita. Si el rol de la app no puede crear tablas, no hay respaldo (y
 * manda `IDEMPOTENCY_FAIL_MODE`).
 *
 * Sin RLS: guarda respuestas de cualquier actor y solo la lee este módulo,
 * siempre por la clave en hash. No se expone en el explorador de datos.
 */
export const DDL_IDEMPOTENCIA = `
CREATE TABLE IF NOT EXISTS ${TABLA_IDEMPOTENCIA} (
  clave text PRIMARY KEY,
  registro jsonb NOT NULL,
  expira_en timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS ${TABLA_IDEMPOTENCIA}_expira_idx ON ${TABLA_IDEMPOTENCIA} (expira_en);
`;

function esTablaQueNoExiste(err: unknown): boolean {
  for (let e: unknown = err, i = 0; e && i < 5; e = (e as { cause?: unknown }).cause, i++) {
    if ((e as { code?: unknown }).code === "42P01") return true;
    if (/relation .*kitsuden_idempotencia.* does not exist/i.test(String((e as Error).message)))
      return true;
  }
  return false;
}

export function almacenPostgres(consulta: ConsultaSql): AlmacenIdempotencia {
  let tablaLista = false;

  async function conTabla<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (tablaLista || !esTablaQueNoExiste(err)) throw err;
      for (const sentencia of DDL_IDEMPOTENCIA.split(";").map((s) => s.trim()).filter(Boolean)) {
        await consulta(sentencia, []);
      }
      tablaLista = true;
      return fn();
    }
  }

  return {
    nombre: "postgres",
    async reservar(clave, registro, ms) {
      return conTabla(async () => {
        for (let i = 0; i < 2; i++) {
          // Inserta, o pisa SOLO un registro caducado. Atómico: dos peticiones
          // a la vez no pueden obtener las dos una fila devuelta.
          const insertadas = await consulta(
            `INSERT INTO ${TABLA_IDEMPOTENCIA} (clave, registro, expira_en)
             VALUES ($1, $2::jsonb, now() + ($3::bigint * interval '1 millisecond'))
             ON CONFLICT (clave) DO UPDATE
               SET registro = EXCLUDED.registro, expira_en = EXCLUDED.expira_en
               WHERE ${TABLA_IDEMPOTENCIA}.expira_en <= now()
             RETURNING clave`,
            [clave, JSON.stringify(registro), ms]
          );
          if (insertadas.length > 0) {
            // Limpieza perezosa de caducadas: 1 de cada 50 reservas.
            if (Math.random() < 0.02) {
              await consulta(`DELETE FROM ${TABLA_IDEMPOTENCIA} WHERE expira_en <= now()`, []).catch(
                () => {}
              );
            }
            return { reservado: true } as const;
          }
          const filas = await consulta(
            `SELECT registro FROM ${TABLA_IDEMPOTENCIA} WHERE clave = $1 AND expira_en > now()`,
            [clave]
          );
          const fila = filas[0]?.registro;
          if (fila) {
            const existente = (typeof fila === "string" ? JSON.parse(fila) : fila) as Registro;
            return { reservado: false, existente } as const;
          }
        }
        throw new Error("Postgres: no se pudo reservar ni leer la clave de idempotencia");
      });
    },
    async completar(clave, token, registro, ms) {
      await conTabla(() =>
        consulta(
          `UPDATE ${TABLA_IDEMPOTENCIA}
             SET registro = $3::jsonb, expira_en = now() + ($4::bigint * interval '1 millisecond')
           WHERE clave = $1 AND registro->>'token' = $2`,
          [clave, token, JSON.stringify(registro), ms]
        )
      );
    },
    async liberar(clave, token) {
      await conTabla(() =>
        consulta(`DELETE FROM ${TABLA_IDEMPOTENCIA} WHERE clave = $1 AND registro->>'token' = $2`, [
          clave,
          token,
        ])
      );
    },
    async consultar(clave) {
      const filas = await conTabla(() =>
        consulta(`SELECT registro FROM ${TABLA_IDEMPOTENCIA} WHERE clave = $1 AND expira_en > now()`, [clave])
      );
      const fila = filas[0]?.registro;
      if (!fila) return null;
      return (typeof fila === "string" ? JSON.parse(fila) : fila) as Registro;
    },
  };
}

// ── Cadena: Valkey → Postgres ───────────────────────────────────────────────

export class AlmacenNoDisponible extends Error {
  constructor(readonly causas: string[]) {
    super(`Ningún almacén de idempotencia disponible: ${causas.join("; ")}`);
    this.name = "AlmacenNoDisponible";
  }
}

/**
 * Prueba los almacenes en orden. Devuelve también CUÁL reservó: el resultado
 * hay que escribirlo en ese mismo, no en el primero que responda después.
 */
export async function reservarEnCadena(
  almacenes: AlmacenIdempotencia[],
  clave: string,
  registro: Registro,
  ms: number
): Promise<{ almacen: AlmacenIdempotencia; reserva: Reserva }> {
  const causas: string[] = [];
  for (const almacen of almacenes) {
    try {
      return { almacen, reserva: await almacen.reservar(clave, registro, ms) };
    } catch (err) {
      causas.push(`${almacen.nombre}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new AlmacenNoDisponible(causas);
}
