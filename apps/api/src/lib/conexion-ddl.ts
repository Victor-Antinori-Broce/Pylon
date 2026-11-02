/**
 * Con qué cuenta hace la API el DDL que necesita en caliente
 * ============================================================================
 *
 * Dos cosas de la API en marcha crean tablas: activar un kon desde el panel
 * (sus migraciones, `lib/migraciones-kon.ts`) y el Vault (`services/vault.ts`,
 * colecciones como tablas reales). El rol de la app NO puede: no tiene CREATE,
 * y es a propósito (Postgres se salta la RLS para un superusuario y el dueño
 * de una tabla puede quitársela).
 *
 * Hasta 2026-10-26 la respuesta era `DATABASE_ADMIN_URL` —el SUPERUSUARIO— en
 * el entorno del proceso de la API. Es decir: cualquier fallo de la API, o
 * código de usuario que escapara del sandbox, era dueño de la base entera
 * (`COPY … FROM PROGRAM` incluido: del servidor de Postgres también).
 *
 * Ahora, por orden:
 *
 *   1. `DATABASE_DDL_URL`: un rol LIMITADO (`start-with-check.sh` lo crea):
 *      NOSUPERUSER, NOBYPASSRLS, sin CREATEROLE ni CREATEDB, con CREATE en el
 *      esquema `public` y nada más. Es dueño solo de lo que él crea (tablas
 *      de kons activados en caliente, colecciones del Vault). No puede tocar
 *      las tablas del núcleo, ni leer saltándose la RLS, ni ejecutar programas.
 *   2. `DATABASE_ADMIN_URL`, si sigue en el entorno: desarrollo, pruebas, o un
 *      despliegue que la conserva a propósito (`KITSUDEN_API_KEEP_ADMIN_URL`).
 *      En la imagen de producción el arranque la QUITA antes de lanzar la API.
 *   3. Ninguna: se usa la conexión de la app y el error de permisos se explica.
 *
 * Ver docs/agents/sandbox.md («Database credentials»).
 */

export type TipoDeConexionDdl = "ddl" | "admin" | "app";

export function conexionDdlConfigurada(): { url: string; tipo: "ddl" | "admin" } | null {
  const app = process.env.DATABASE_URL;
  const ddl = process.env.DATABASE_DDL_URL;
  if (ddl && ddl !== app) return { url: ddl, tipo: "ddl" };
  const admin = process.env.DATABASE_ADMIN_URL;
  if (admin && admin !== app) return { url: admin, tipo: "admin" };
  return null;
}

/** Texto común para «no hay con qué crear tablas». */
export const PISTA_SIN_DDL =
  `\n\n  La API se conecta con un rol SIN privilegio CREATE sobre el esquema,` +
  `\n  que es lo que hace efectivo el aislamiento por RLS.` +
  `\n\n  Para crear tablas en caliente (activar kons, Vault), define` +
  `\n  DATABASE_DDL_URL: un rol limitado que el arranque crea solo` +
  `\n  (docker/start-with-check.sh). O aplica las migraciones fuera de la API:` +
  `\n\n      bun run scripts/migrate.ts --kon <id>   (o reinicia el contenedor)\n`;
