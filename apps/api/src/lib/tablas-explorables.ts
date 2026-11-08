/**
 * Qué tablas se pueden tocar por el explorador genérico
 * ============================================================================
 *
 * ── EL AGUJERO QUE ESTO CIERRA ─────────────────────────────────────────────
 *
 * `/api/explorer/*` estaba protegido solo con `requireAuth`, que comprueba que
 * existe sesión y NADA MÁS —los roles de este CMS son `admin`, `editor` y
 * `user`—. Y `resolveTable()` caía a introspección dinámica, así que resolvía
 * CUALQUIER tabla de la base. Verificado sobre la instalación real:
 *
 *     kitsuden_secrets      resuelve (13 columnas)
 *     auth_accounts         resuelve (13 columnas)   ← credenciales
 *     api_keys              resuelve (8 columnas)
 *     kitsuden_migrations   resuelve (5 columnas)
 *
 * Con `PATCH`, `POST` y `DELETE` sobre `/:collection/:id` en el mismo router.
 * Es decir: un `editor` podía leer y escribir los secretos, las credenciales y
 * el historial de migraciones. Editar `kitsuden_migrations` desde el navegador
 * desincroniza historial y esquema en silencio — el fallo que costó un día
 * entero de diagnóstico.
 *
 * ── LA REGLA: SE EXPLORA LO QUE ALGUIEN DECLARA ────────────────────────────
 *
 * Lista BLANCA, no negra. Una tabla es explorable si algún kon la declara en su
 * `kon.json` o si está en el registro estático del explorador. Todo lo demás es
 * invisible.
 *
 * Es la forma correcta en esta arquitectura —el kon es dueño de sus datos y
 * decide qué expone— y sobre todo es la que falla del lado seguro: una tabla
 * nueva que alguien añada mañana nace cerrada, sin que nadie tenga que
 * acordarse de prohibirla.
 *
 * ── Y AUN ASÍ, UNA LISTA NEGRA ENCIMA ──────────────────────────────────────
 *
 * Porque el registro estático incluye tablas de plataforma por comodidad
 * (`modules`), y porque un kon podría declarar una tabla sensible por error o
 * a propósito. La lista negra gana siempre, incluso sobre lo declarado.
 *
 * ── ESCRITURA ──────────────────────────────────────────────────────────────
 *
 * Hay tablas que sí conviene poder MIRAR desde el panel pero que no puede
 * modificar cualquiera: `auth_users` (cambiar un rol es escalar privilegios) y
 * `modules` (encender kons). Esas se leen con sesión y solo las escribe un
 * `admin`.
 */

import { TABLAS_SOLO_POR_SU_RUTA } from "./codigo-de-acciones";
import { scanPackages } from "../services/scanner";

/**
 * Nunca, por ninguna vía, con ningún rol.
 *
 * Credenciales, secretos, sesiones, claves y la memoria del sistema. Ninguna de
 * estas tiene sentido detrás de una rejilla genérica: o son secretos, o son el
 * registro interno de algo que se administra por su propia pantalla.
 */
export const TABLAS_PROHIBIDAS = new Set([
  "kitsuden_secrets",
  "auth_accounts",
  "auth_sessions",
  "auth_verifications",
  "api_keys",
  "agent_api_keys",
  "agent_tokens",
  // OAuth para MCP (0055): hashes de códigos y tokens, clientes y concesiones
  "oauth_clients",
  "oauth_authorization_requests",
  "oauth_grants",
  "oauth_codes",
  "oauth_tokens",
  "kitsuden_migrations",
  "rate_limit_logs",
  "member_sessions",
  // Enlaces mágicos de acceso de kon-members: su token_hash abre la sesión de
  // otra persona (2026-10-15, lo vio el agente de kons de usuarios)
  "member_signins",
]);

/**
 * Columnas que guardan un secreto VIVO (token, contraseña, hash de una clave).
 *
 * El explorador es solo admin, pero ni a un admin se le enseñan: un token de
 * baja o de confirmación de `nl_members`, el `password` de `data_sources` o el
 * `ingest_token` de una retransmisión sirven para actuar en nombre de otro, y
 * una pantalla del panel no es sitio para ellos. Por NOMBRE de columna (en
 * snake_case y camelCase), así que vale para tablas que aún no existen.
 * `tokens_in`/`tokens_out` (contadores de un LLM) no casan: no acaban en token.
 */
const COLUMNA_SECRETA = /(^|_|[a-z])(token|password|secret|token_?hash|password_?hash|key_?hash)$/i;

export function esColumnaSecreta(nombre: string): boolean {
  return COLUMNA_SECRETA.test(nombre);
}

/** Copia del valor (fila, lista, sobre de respuesta) sin columnas secretas. */
export function sinColumnasSecretas(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(sinColumnasSecretas);
  if (valor && typeof valor === "object" && !(valor instanceof Date)) {
    const limpio: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      if (esColumnaSecreta(k)) continue;
      limpio[k] = sinColumnasSecretas(v);
    }
    return limpio;
  }
  return valor;
}

/**
 * Se leen con sesión; se escriben solo con rol `admin`.
 *
 * `auth_users` porque cambiar `role` es escalar privilegios. `modules` porque
 * es el interruptor de los kons: encender uno crea tablas y monta rutas.
 */
export const TABLAS_ESCRITURA_ADMIN = new Set(["auth_users", "modules", "installed_kons"]);

// Los manifiestos no cambian mientras el proceso vive, pero se refresca por si
// se instala un kon en caliente. Barato: es una lectura de ficheros ya cacheada
// por el propio scanner.
let declaradasCache: Set<string> | null = null;
let declaradasSello = 0;
const TTL_MS = 60_000;

/** Tablas que algún kon del disco declara en su manifiesto. */
async function declaradasPorKons(): Promise<Set<string>> {
  if (declaradasCache && Date.now() - declaradasSello < TTL_MS) return declaradasCache;

  const declaradas = new Set<string>();
  try {
    for (const kon of await scanPackages("kons")) {
      const tablas = (kon as { tables?: (string | { name?: string })[] }).tables ?? [];
      for (const t of tablas) {
        const nombre = typeof t === "string" ? t : t?.name;
        if (nombre) declaradas.add(nombre);
      }
      const vistas = (kon as { admin?: { views?: { table?: string }[] } }).admin?.views ?? [];
      for (const v of vistas) if (v.table) declaradas.add(v.table);
    }
  } catch {
    // Si el escaneo falla NO se abre la puerta: se devuelve lo que hubiera, y si
    // no había nada, nada. Un fallo al leer el disco no puede traducirse en
    // "permite todo" — que es como se escriben los agujeros.
    return declaradasCache ?? new Set();
  }

  declaradasCache = declaradas;
  declaradasSello = Date.now();
  return declaradas;
}

export interface VeredictoTabla {
  permitida: boolean;
  /** Solo cuando se deniega: por qué, para el log. Nunca se envía al cliente. */
  motivo?: "prohibida" | "no-declarada";
}

/**
 * ¿Se puede explorar esta tabla?
 *
 * `registroEstatico` son las claves del registro del propio explorador, que el
 * llamante conoce y este módulo no.
 */
export async function tablaEsExplorable(
  nombre: string,
  registroEstatico: Iterable<string>
): Promise<VeredictoTabla> {
  if (TABLAS_PROHIBIDAS.has(nombre)) return { permitida: false, motivo: "prohibida" };

  for (const clave of registroEstatico) if (clave === nombre) return { permitida: true };

  const declaradas = await declaradasPorKons();
  if (declaradas.has(nombre)) return { permitida: true };

  return { permitida: false, motivo: "no-declarada" };
}

/** ¿Modificar esta tabla exige rol `admin`? */
export function escrituraExigeAdmin(nombre: string): boolean {
  return TABLAS_ESCRITURA_ADMIN.has(nombre);
}

/**
 * ── TABLAS NATIVAS POR LAS VÍAS GENÉRICAS (auditoría 2026-11-04) ───────────
 *
 * GraphQL, las relaciones en línea y `POST /api/datasets/query/:tabla`
 * resolvían cualquier tabla del esquema fusionado —o de `information_schema`—
 * sin consultar la lista negra: un admin (o una clave con `admin`) leía los
 * hashes de `auth_accounts` y reescribía una credencial. La regla es la de MCP
 * (`services/mcp-tools.ts`), en un solo sitio:
 *
 *   · `TABLAS_PROHIBIDAS` y todo `auth_*` salvo `auth_users` no se leen ni se
 *     escriben por ninguna de esas vías, con ningún rol.
 *   · `TABLAS_SOLO_POR_SU_RUTA` no se escriben por ellas (tienen su ruta).
 *   · `TABLAS_ESCRITURA_ADMIN` solo las escribe un admin HUMANO: una clave de
 *     agente con `admin` no se cambia el rol ni enciende kons por aquí.
 *   · Las columnas secretas (`esColumnaSecreta`) no salen, no se escriben y no
 *     se filtran ni se ordenan por ellas (un filtro es un oráculo).
 */
export function tablaNativaProhibida(nombre: string): boolean {
  return TABLAS_PROHIBIDAS.has(nombre) || (nombre.startsWith("auth_") && nombre !== "auth_users");
}

export type MotivoSinEscritura = "prohibida" | "solo-por-su-ruta" | "exige-admin-humano";

/**
 * ¿Por qué no se puede escribir esta tabla por una vía genérica? `null` si se
 * puede. `adminHumano`: sesión de persona con rol `admin` (no una clave).
 */
export function motivoParaNoEscribirTablaNativa(
  nombre: string,
  adminHumano: boolean
): MotivoSinEscritura | null {
  if (tablaNativaProhibida(nombre)) return "prohibida";
  if (TABLAS_SOLO_POR_SU_RUTA.has(nombre)) return "solo-por-su-ruta";
  if (escrituraExigeAdmin(nombre) && !adminHumano) return "exige-admin-humano";
  return null;
}

/** ¿Es la petición de una PERSONA con rol `admin`? Una clave de agente no lo es. */
export function esAdminHumano(c: { get: unknown }): boolean {
  const get = (c.get as (k: string) => unknown).bind(c);
  if (get("agent")) return false;
  return (get("user") as { role?: string } | null | undefined)?.role === "admin";
}

/** Las claves de `valor` que son columnas secretas (para rechazar una escritura). */
export function columnasSecretasEn(valor: Record<string, unknown> | null | undefined): string[] {
  return valor ? Object.keys(valor).filter(esColumnaSecreta) : [];
}

/** Para las pruebas: olvidar lo cacheado. */
export function limpiarCacheDeclaradas(): void {
  declaradasCache = null;
}
