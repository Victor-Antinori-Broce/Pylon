/**
 * La conexión de la API no puede ser superusuario
 * ============================================================================
 *
 * Postgres **ignora las políticas RLS cuando quien consulta es superusuario**.
 * No las desactiva ni avisa: las evalúa como si no existieran. Una instalación
 * con todas las políticas correctamente aplicadas —`RLS activo en 3 tablas
 * (3 con FORCE)`— no aísla absolutamente nada si la API se conecta con esa
 * cuenta.
 *
 * Es la peor forma de fallo de seguridad: todo funciona. Las consultas
 * devuelven datos, los tests pasan, el healthcheck da 200. Lo único que no
 * ocurre es el aislamiento, y eso no se ve hasta que un tenant lee lo de otro.
 *
 * ── POR QUÉ AQUÍ Y NO EN LAS MIGRACIONES ───────────────────────────────────
 *
 * Migrar SÍ necesita superusuario: crear extensiones, tablas y roles. Por eso
 * `docker/start-with-check.sh` usa dos conexiones —`DATABASE_ADMIN_URL` para
 * administrar y `DATABASE_URL` para servir— y esta comprobación mira solo la
 * segunda, que es la que atiende peticiones.
 *
 * ── POR QUÉ FALLA EN VEZ DE AVISAR ─────────────────────────────────────────
 *
 * Porque avisar ya se probó. El arranque imprimía el aviso, en rojo y con
 * todas las letras, y pasó desapercibido durante todo el despliegue: entre
 * cientos de líneas de migraciones y carga de kons, un warning no detiene a
 * nadie. En producción esto para el arranque; fuera de producción sigue siendo
 * un aviso, porque en desarrollo conectarse como superusuario es cómodo y no
 * hay datos de nadie.
 */

import { sql } from "drizzle-orm";

/** Lo mínimo que necesitamos de la conexión: ejecutar una consulta. */
type Conexion = { execute: (query: never) => Promise<unknown> };

/** Extrae filas del resultado, que varía entre drivers de drizzle. */
function filasDe(resultado: unknown): Record<string, unknown>[] {
  if (Array.isArray(resultado)) return resultado as Record<string, unknown>[];
  const conRows = resultado as { rows?: unknown };
  return Array.isArray(conRows?.rows) ? (conRows.rows as Record<string, unknown>[]) : [];
}

export interface EstadoConexion {
  usuario: string | null;
  esSuperusuario: boolean;
  /** `BYPASSRLS`: not a superuser, and the policies are just as ignored. */
  saltaRls: boolean;
}

/** Pregunta a Postgres con qué rol estamos conectados y si es superusuario. */
export async function estadoDeConexion(db: Conexion): Promise<EstadoConexion> {
  const resultado = await db.execute(
    sql`SELECT current_user AS usuario, usesuper AS superusuario, usebypassrls AS salta_rls
        FROM pg_user WHERE usename = current_user` as never
  );
  const fila = filasDe(resultado)[0];
  return {
    usuario: (fila?.usuario as string) ?? null,
    // Postgres devuelve booleanos como `true` o como `"t"` según el driver.
    esSuperusuario: fila?.superusuario === true || fila?.superusuario === "t",
    saltaRls: fila?.salta_rls === true || fila?.salta_rls === "t",
  };
}

export interface OpcionesGuardia {
  /** `true` en producción: en vez de avisar, se lanza. */
  estricto: boolean;
}

/**
 * Comprueba la conexión y decide qué hacer.
 *
 * Devuelve el estado para que quien llame pueda registrarlo. Lanza solo en
 * modo estricto, y con un mensaje que dice qué hacer, no solo qué pasa.
 */
export async function verificarConexionRls(
  db: Conexion,
  { estricto }: OpcionesGuardia
): Promise<EstadoConexion> {
  let estado: EstadoConexion;
  try {
    estado = await estadoDeConexion(db);
  } catch (err) {
    // Fuera de producción, si no sabemos si es superusuario, avisamos y seguimos.
    // In production an unverifiable connection is a refusal: RLS would be silently
    // off, and the README promises the API does not start like that.
    const motivo = err instanceof Error ? err.message : String(err);
    if (estricto) throw new Error(`Could not verify the role of the API connection (${motivo}).`);
    console.warn(`  ⚠  No se pudo comprobar el rol de conexión (${motivo}).`);
    return { usuario: null, esSuperusuario: false, saltaRls: false };
  }

  if (!estado.esSuperusuario && !estado.saltaRls) return estado;

  const explicacion =
    `La API está conectada como '${estado.usuario}', que es ${estado.esSuperusuario ? "SUPERUSUARIO" : "BYPASSRLS"}.\n` +
    `Postgres ignora las políticas RLS para ese rol: el aislamiento\n` +
    `entre tenants NO se aplica, por muy bien definidas que estén.\n\n` +
    `Solución: deja POSTGRES_USER para administrar (migraciones) y define\n` +
    `APP_DB_USER / APP_DB_PASSWORD para la API. El rol se crea solo al\n` +
    `arrancar, con los permisos justos. Ver docker/start-with-check.sh.`;

  if (estricto) throw new Error(`RLS inaplicable.\n\n${explicacion}`);

  console.warn(`\n  ⚠  ${explicacion}\n`);
  return estado;
}
