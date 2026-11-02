/**
 * Aplicación y verificación de políticas RLS.
 * ============================================================================
 *
 * Vive aquí, y no dentro de `apply-rls.ts`, porque ahora lo usan dos sitios:
 * el script manual y el runner de migraciones. RLS tiene que aplicarse en cada
 * despliegue, no cuando alguien se acuerde de ejecutar un script.
 */

import { existsSync } from "node:fs";

import { sql } from "drizzle-orm";

import { db } from "../../src/db";
import { detallarError } from "./db-error";
import { readSqlFile } from "../../src/lib/sql-file";

export interface RlsResultado {
  aplicados: number;
  omitidos: number;
  tablasConRls: number;
  tablasConForce: number;
  sinForce: string[];
}

/** Ejecuta los ficheros de política. Idempotente: se corre tras cada migración. */
export async function aplicarPoliticasRls(ficheros: string[]): Promise<void> {
  for (const path of ficheros) {
    if (!existsSync(path)) continue;
    const f = readSqlFile(path, path.split(/[\\/]/).pop()!);

    for (const stmt of f.statements) {
      try {
        await db.execute(sql.raw(stmt));
      } catch (error) {
        const msg = detallarError(error);
        // "ya existe" es el resultado normal de reaplicar; cualquier otra cosa
        // es un fallo de verdad y no se traga.
        if (/already exists|duplicate/i.test(msg)) continue;
        throw new Error(`RLS ${f.name}: ${msg}\n  en: ${stmt.slice(0, 120)}…`);
      }
    }
  }
}

/**
 * Comprueba contra el catálogo de Postgres qué quedó realmente activo.
 *
 * ENABLE sin FORCE es una política DECORATIVA: el rol dueño de la tabla —que
 * suele ser el propio rol de la app— queda exento y la lee entera. Es el fallo
 * más caro de este terreno porque no da ningún error: simplemente no aísla.
 */
export async function verificarRls(): Promise<RlsResultado> {
  const res = await db.execute(sql`
    SELECT c.relname, c.relforcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relrowsecurity = true
    ORDER BY c.relname
  `);

  const filas = (Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])) as Array<{
    relname: string;
    relforcerowsecurity: boolean;
  }>;

  const sinForce = filas.filter((r) => !r.relforcerowsecurity).map((r) => r.relname);

  return {
    aplicados: 0,
    omitidos: 0,
    tablasConRls: filas.length,
    tablasConForce: filas.length - sinForce.length,
    sinForce,
  };
}

/**
 * RLS es decorativo si la app se conecta como superusuario: Postgres se salta
 * las políticas para ese rol, con FORCE y todo. Merece un aviso ruidoso, no
 * una nota en un README que nadie lee.
 */
export async function comprobarSuperusuario(): Promise<string | null> {
  try {
    const res = await db.execute(sql`
      SELECT current_user AS usuario, usesuper AS es_super
      FROM pg_user WHERE usename = current_user
    `);
    const filas = (Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])) as Array<{
      usuario: string;
      es_super: boolean;
    }>;
    return filas[0]?.es_super ? filas[0].usuario : null;
  } catch {
    // pg_user no siempre es legible (PGlite, roles restringidos). No aborta.
    return null;
  }
}

export function informarRls(r: RlsResultado, superusuario: string | null): void {
  console.log(`  RLS activo en ${r.tablasConRls} tablas (${r.tablasConForce} con FORCE).`);

  if (r.sinForce.length > 0) {
    console.warn(
      `  ⚠  ${r.sinForce.length} tabla(s) con ENABLE sin FORCE — el rol dueño las ignora:`
    );
    for (const t of r.sinForce) console.warn(`     · ${t}`);
  }

  if (superusuario) {
    /**
     * Aplicar las politicas SI necesita superusuario, y migrar tambien. Lo que
     * no puede ser superusuario es la conexion con la que la API SIRVE
     * peticiones: Postgres ignora RLS para superusuarios.
     *
     * Por eso el mensaje distingue los dos casos. Cuando existe una conexion de
     * aplicacion aparte (`DATABASE_ADMIN_URL` definida), esto es lo esperado, y
     * darlo como alarma seria mentir. Un aviso que grita cuando no pasa nada
     * ensena a ignorar los avisos — y asi fue como el problema de verdad, una
     * sola cuenta de superusuario para todo, paso desapercibido un despliegue
     * entero.
     *
     * Quien de verdad decide es `src/lib/rls-connection-guard.ts`: comprueba la
     * conexion de la API al arrancar y, en produccion, la detiene.
     */
    const hayRolDeAplicacion = Boolean(process.env.DATABASE_ADMIN_URL);

    if (hayRolDeAplicacion) {
      console.log(
        `  - Migrado como '${superusuario}' (superusuario), que es lo correcto:\n` +
          `    crear extensiones y roles lo exige. La API servira con el rol de\n` +
          `    aplicacion, asi que las politicas RLS si se aplicaran.`
      );
    } else {
      console.warn(
        `\n  !  La conexion usa '${superusuario}', que es SUPERUSUARIO, y no hay\n` +
          `     DATABASE_ADMIN_URL definida: la API servira con esta MISMA cuenta.\n` +
          `     Postgres ignora RLS para superusuarios, asi que las politicas\n` +
          `     quedan decorativas y el aislamiento entre tenants NO se aplica.\n` +
          `     Define APP_DB_USER / APP_DB_PASSWORD y DATABASE_ADMIN_URL.`
      );
    }
  }
}
