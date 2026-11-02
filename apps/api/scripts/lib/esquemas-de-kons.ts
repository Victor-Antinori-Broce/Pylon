/**
 * Los esquemas Drizzle de los kons que están ACTIVOS
 * ============================================================================
 *
 * Sirve al verificador de esquema del arranque, que hasta ahora solo miraba
 * `schema-core.ts` y por eso no vio que a `game_collections` le faltaban dos
 * columnas declaradas.
 *
 * ── QUÉ CUENTA COMO «ACTIVO» ───────────────────────────────────────────────
 *
 * La unión de dos fuentes, porque en este repo hay dos y no coinciden:
 *
 *   · `kitsuden.config.ts` — lo que trae la instalación de fábrica.
 *   · la tabla `modules`   — lo que el usuario encendió desde el panel.
 *
 * Mirar solo la primera fue el origen del estado que motivó todo esto: cinco
 * kons encendidos desde el panel, ninguno migrado, porque el runner de
 * arranque leía el fichero y el panel escribía en la base.
 *
 * ── POR QUÉ SE IMPORTA EL FICHERO Y NO SE LEE COMO TEXTO ───────────────────
 *
 * Porque lo que hace falta son los objetos `pgTable` con sus columnas, y eso
 * solo lo da el módulo evaluado. Importar el esquema de un kon es barato: son
 * definiciones, no conexiones.
 *
 * Un import que falla NO detiene el arranque. El esquema de un kon puede
 * depender de algo que no está disponible en este contexto, y quedarse sin
 * verificar es peor que no arrancar por una comprobación.
 */

import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { sql } from "drizzle-orm";

import { db } from "../../src/db";
import { konInstalado, konsInstalados } from "../../src/lib/kons-instalados";

const AQUI = dirname(fileURLToPath(import.meta.url));

export interface EsquemaDeKon {
  kon: string;
  modulo: Record<string, unknown>;
}

/** Kons marcados como activos en la tabla `modules`, si esa tabla ya existe. */
async function activadosEnLaBase(): Promise<string[]> {
  try {
    const res = await db.execute(sql.raw(`SELECT key FROM modules WHERE enabled = true`));
    const filas =
      (res as unknown as { rows?: { key: string }[] }).rows ??
      (res as unknown as { key: string }[]);
    return (filas ?? []).map((f) => f.key);
  } catch {
    // Primer arranque: la tabla aún no existe. No es un error.
    return [];
  }
}

/** Kons que la configuración declara habilitados. */
async function activadosEnLaConfiguracion(): Promise<string[]> {
  try {
    const config = await import(resolve(AQUI, "..", "..", "kitsuden.config.ts"));
    const estatica = config.staticConfig ?? config.default ?? config;
    return estatica.kons ?? estatica.modules ?? [];
  } catch {
    return [];
  }
}

/**
 * El fichero de esquema de un kon.
 *
 * No hay una convención única —`dms.schema.ts`, `members.schema.ts`,
 * `src/schema.ts`—, así que se busca por patrón en vez de construir el nombre.
 * Construirlo habría fallado en silencio para todos los que no encajaran, que
 * es exactamente el modo de fallo que esta comprobación existe para cerrar.
 */
function ficheroDeEsquema(carpeta: string): string | null {
  const candidatos = [
    ...readdirSync(carpeta)
      .filter((f) => f.endsWith(".schema.ts"))
      .map((f) => join(carpeta, f)),
    join(carpeta, "src", "schema.ts"),
    join(carpeta, "schema.ts"),
  ];
  return candidatos.find((c) => existsSync(c)) ?? null;
}

/**
 * Todos los kons del repositorio, activos o no.
 *
 * Para CI, junto con `migrate.ts --todos-los-kons`. Un kon apagado tiene su
 * cadena de migraciones sin ejecutar por nadie hasta que un usuario lo activa
 * en un servidor — que es donde se descubrieron los tres kons cuyo esquema
 * SQL no existia y los dos cuyo SQL ni siquiera parseaba.
 */
function todosLosKons(): string[] {
  // Los INSTALADOS (kitsuden.kons.json + KITSUDEN_KONS), no la carpeta.
  return konsInstalados()
    .filter((k) => k.origen !== "nucleo" && k.ruta)
    .map((k) => k.id);
}

export async function esquemasDeKonsActivos(): Promise<EsquemaDeKon[]> {
  const activos = new Set(
    process.argv.includes("--todos-los-kons")
      ? todosLosKons()
      : [...(await activadosEnLaConfiguracion()), ...(await activadosEnLaBase())]
  );

  const esquemas: EsquemaDeKon[] = [];

  for (const id of activos) {
    const kon = konInstalado(id);
    if (!kon || kon.origen === "nucleo" || !kon.ruta) continue;
    const carpeta = kon.ruta;

    const fichero = ficheroDeEsquema(carpeta);
    if (!fichero) continue;

    try {
      const modulo = (await import(fichero)) as Record<string, unknown>;
      esquemas.push({ kon: id, modulo });
    } catch (err) {
      console.warn(
        `   ⚠  No se pudo leer el esquema de ${id} ` +
          `(${err instanceof Error ? err.message : err}). Sus tablas no se verifican.`
      );
    }
  }

  return esquemas;
}
