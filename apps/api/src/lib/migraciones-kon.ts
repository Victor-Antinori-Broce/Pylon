/**
 * Migraciones de un kon, en caliente
 * ============================================================================
 *
 * ── EL FALLO QUE ESTO SUSTITUYE ────────────────────────────────────────────
 *
 * Activar un kon desde el panel NUNCA creó una tabla. Ni una vez.
 *
 * `runKonMigrations` buscaba exactamente un fichero: `migrations/init.sql`.
 * Ningún kon del repo se llama así — todos usan `0000_initial.sql`,
 * `0001_members.sql`, `0003_diagrams.sql`. La función no encontraba nada, salía
 * sin hacer ruido, y quien la llamaba marcaba el kon como habilitado igual:
 *
 *     try { await runModuleMigrations(key); }
 *     catch (err) { console.error(...); }        // ← y seguía adelante
 *     await db.update(modules).set({ enabled: true });
 *
 * El resultado medido en la base: cinco kons con `enabled = true` y CERO de sus
 * tablas. Academy declaraba once y no existía ninguna. Desde el panel eso se
 * veía como «No fields available» y como 500 en cada pantalla del kon — nunca
 * como «esto no está instalado», que es lo que pasaba de verdad.
 *
 * ── UNA SOLA IMPLEMENTACIÓN ────────────────────────────────────────────────
 *
 * Había dos formas de «aplicar las migraciones de un kon»: esta y la del
 * runner de arranque (`scripts/migrate.ts`). Solo una se ejercitaba, y la otra
 * se pudrió sin que nada lo notara.
 *
 * Ahora las dos comparten el descubrimiento, el troceado (`readSqlFile`) y el
 * historial (`kitsuden_migrations`), y con el MISMO nombre por fichero
 * —`kon-booking/0000_initial.sql`—, así que ninguna reaplica lo que hizo la
 * otra.
 *
 * ── POR QUÉ HACE FALTA UNA CONEXIÓN APARTE ─────────────────────────────────
 *
 * La API se conecta como `kitsuden_app`, un rol SIN privilegio CREATE sobre el
 * esquema. Es deliberado: es lo que hace que RLS se aplique de verdad (Postgres
 * se salta las políticas con un superusuario). Un `CREATE TABLE` con ese rol
 * falla, y debe fallar.
 *
 * Por eso las migraciones se aplican por una conexión propia, que se abre y se
 * cierra en la misma operación: la del rol de DDL LIMITADO (`DATABASE_DDL_URL`)
 * si existe, si no la de administración (ver lib/conexion-ddl.ts: desde
 * 2026-10-26 la imagen de producción ya no deja el superusuario a la API). Si no está definida, se intenta con la conexión normal y el
 * error de permisos se propaga con una explicación en vez de convertirse en un
 * kon medio instalado.
 */

import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import { db } from "../db";

import { PISTA_SIN_DDL, conexionDdlConfigurada, type TipoDeConexionDdl } from "./conexion-ddl";
import { readSqlFile, type SqlFile } from "./sql-file";
import { konInstalado, rutaDeKon } from "./kons-instalados";

/** Funciones SQL de agente del núcleo (ver el fichero): antes de las de un kon. */
const FUNCIONES_DE_AGENTE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../db/funciones-de-agente.sql"
);

const { Pool } = pg;

/** Ejecutor mínimo: sirve tanto la conexión de la app como una de administración. */
interface Ejecutor {
  execute(consulta: ReturnType<typeof sql.raw>): Promise<unknown>;
}

export interface ResultadoMigracion {
  konId: string;
  /** Ficheros aplicados en esta llamada. */
  aplicadas: string[];
  /** Ficheros que ya constaban en el historial. */
  yaEstaban: string[];
  /** Tablas que el manifiesto declara y siguen sin existir después de migrar. */
  tablasQueFaltan: string[];
  /** Con qué rol se aplicaron. Para el mensaje de diagnóstico. */
  conexion: TipoDeConexionDdl;
}

/**
 * Raíz del monorepo: la carpeta que contiene `packages/kons`.
 *
 * ── POR QUE NO SE CUENTAN NIVELES ──────────────────────────────────────────
 *
 * Aquí ponía `resolve(dirname(…), "..", "..", "..", "..")`, cuatro niveles
 * arriba desde `apps/api/src/lib`. Y en desarrollo es exacto.
 *
 * En PRODUCCION no: la imagen ejecuta `dist/index.js`, un único fichero
 * empaquetado. Desde `/app/apps/api/dist`, cuatro niveles arriba es `/`, así
 * que buscaba las migraciones en `/packages/kons/<kon>/migrations` — una ruta
 * que no existe. El resultado era este mensaje, con el fichero delante:
 *
 *     'kon-character-builder' no trae ficheros de migración, así que nada crea sus tablas
 *
 * Y era mentira: `0001_builder.sql` estaba en el repo Y dentro de la imagen.
 * Simplemente se miraba donde no estaba. Un fallo que SOLO aparece compilado,
 * que es la peor clase: en desarrollo todo va bien y el kon no se puede activar
 * justo donde importa.
 *
 * ── COMO SE RESUELVE AHORA ─────────────────────────────────────────────────
 *
 * Se sube desde dos puntos de partida —el propio módulo y el directorio de
 * trabajo— hasta encontrar una carpeta que contenga `packages/kons`. Eso vale
 * igual desde el fuente, desde un bundle a cualquier profundidad y desde un
 * script lanzado en un subdirectorio, porque no supone nada sobre la forma del
 * árbol: comprueba.
 *
 * `fileURLToPath(import.meta.url)` y no `import.meta.dir`: lo segundo es de Bun
 * y bajo Node es `undefined`.
 */
let raizCache: string | null = null;

function raizRepo(): string {
  if (raizCache) return raizCache;

  const marcador = (dir: string) => existsSync(join(dir, "packages", "kons"));

  const partidas = [dirname(fileURLToPath(import.meta.url)), process.cwd()];

  for (const partida of partidas) {
    let dir = resolve(partida);
    // El tope es la raíz del sistema: `dirname("/")` devuelve `"/"`.
    for (let i = 0; i < 30; i++) {
      if (marcador(dir)) {
        raizCache = dir;
        return dir;
      }
      const padre = dirname(dir);
      if (padre === dir) break;
      dir = padre;
    }
  }

  /**
   * Sin marcador no se inventa una ruta: se devuelve el directorio de trabajo,
   * que es lo que usa el cargador de kons y lo que era correcto en el
   * contenedor. Y `carpetaDeMigraciones` devolverá `null`, que el llamante ya
   * sabe distinguir de «hay migraciones y fallaron».
   */
  raizCache = process.cwd();
  return raizCache;
}

/** Para las pruebas: olvidar la raíz cacheada. */
export function limpiarCacheDeRaiz(): void {
  raizCache = null;
}

/**
 * Carpeta de migraciones de un kon.
 *
 * Acepta el id con y sin prefijo `kon-` porque los manifiestos no son
 * consistentes: `kon.json` declara `"id": "kon-games"` pero la tabla `modules`
 * guarda `games` para ese mismo kon.
 */
export function carpetaDeMigraciones(konId: string, rutaInstalacion?: string): string | null {
  // Sin ruta explícita, la del kon INSTALADO (kitsuden.kons.json /
  // KITSUDEN_KONS), que puede estar en packages/kons, en node_modules o enlazado
  // desde otro repo. Las dos de packages/kons quedan de respaldo.
  // Los del núcleo (packages/core) los migra el runner con su propio nombre
  // en el historial (`core-<paquete>/…`): aquí no se tocan.
  if (!rutaInstalacion && konInstalado(konId)?.origen === "nucleo") return null;
  const instalada = rutaInstalacion ?? rutaDeKon(konId);
  const candidatas = instalada
    ? [join(instalada, "migrations")]
    : [
        join(raizRepo(), "packages", "kons", konId, "migrations"),
        join(raizRepo(), "packages", "kons", `kon-${konId}`, "migrations"),
      ];

  return candidatas.find((c) => existsSync(c)) ?? null;
}

/**
 * Los `.sql` de un kon, en orden y con el nombre con el que van al historial.
 *
 * El prefijo numérico de 4 dígitos es obligatorio, igual que en el runner de
 * arranque: sin él el orden sería el que dé `readdir`, que no es un orden.
 */
export function migracionesDe(konId: string, rutaInstalacion?: string): SqlFile[] {
  const dir = carpetaDeMigraciones(konId, rutaInstalacion);
  if (!dir) return [];

  // El nombre en el historial usa SIEMPRE la carpeta real, no el id, para que
  // coincida con lo que escribe `scripts/migrate.ts`.
  const carpeta = dir.split(/[\\/]/).at(-2)!;

  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => {
      if (!/^\d{4}_/.test(f)) {
        throw new Error(
          `${carpeta}/${f} no tiene prefijo numérico de 4 dígitos. Sin él, el ` +
            `orden de aplicación sería arbitrario y no reproducible.`
        );
      }
      return readSqlFile(join(dir, f), `${carpeta}/${f}`);
    });
}

async function crearTablaHistorial(ejecutor: Ejecutor): Promise<void> {
  await ejecutor.execute(
    sql.raw(`
      CREATE TABLE IF NOT EXISTS kitsuden_migrations (
        name        TEXT PRIMARY KEY,
        checksum    TEXT NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        duration_ms INTEGER,
        baselined   BOOLEAN NOT NULL DEFAULT false
      )
    `)
  );
}

async function yaAplicadas(ejecutor: Ejecutor): Promise<Set<string>> {
  const res = (await ejecutor.execute(
    sql.raw(`SELECT name FROM kitsuden_migrations`)
  )) as unknown as { rows?: { name: string }[] } | { name: string }[];
  const filas = Array.isArray(res) ? res : (res.rows ?? []);
  return new Set(filas.map((f) => f.name));
}

/**
 * ¿Qué tablas de esta lista existen ya?
 *
 * Se consulta con la conexión NORMAL a propósito: lo que importa es si la API
 * —con su rol— puede ver la tabla. Una tabla creada por el administrador y sin
 * permisos para `kitsuden_app` está tan rota como una que no existe, y este es
 * el único sitio donde esa diferencia se nota antes de que la vea el usuario.
 */
export async function tablasExistentes(nombres: string[]): Promise<Set<string>> {
  if (nombres.length === 0) return new Set();

  const lista = nombres.map((n) => `'${n.replace(/'/g, "''")}'`).join(",");
  const res = (await db.execute(
    sql.raw(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN (${lista})`
    )
  )) as unknown as { rows?: { table_name: string }[] } | { table_name: string }[];
  const filas = Array.isArray(res) ? res : (res.rows ?? []);
  return new Set(filas.map((f) => f.table_name));
}

/**
 * Abre una conexión de administración si el entorno la ofrece.
 *
 * Devuelve también cómo cerrarla: dejar un pool abierto por cada instalación de
 * kon agota las conexiones del servidor, y el síntoma aparecería mucho después
 * y en otra parte.
 */
function conexionParaMigrar(): {
  ejecutor: Ejecutor;
  cerrar: () => Promise<void>;
  tipo: TipoDeConexionDdl;
} {
  // Rol de DDL limitado antes que superusuario: ver lib/conexion-ddl.ts.
  const configurada = conexionDdlConfigurada();

  if (!configurada) {
    return { ejecutor: db as unknown as Ejecutor, cerrar: async () => {}, tipo: "app" };
  }

  const pool = new Pool({ connectionString: configurada.url, max: 1 });
  const conexion = drizzle(pool);
  return {
    ejecutor: conexion as unknown as Ejecutor,
    cerrar: () => pool.end(),
    tipo: configurada.tipo,
  };
}

/**
 * Explica un «permission denied» en vez de dejarlo desnudo.
 *
 * Vive aparte porque la primera versión metía esta pista SOLO dentro del bucle
 * de statements, y el fallo más probable ocurre ANTES: creando la tabla de
 * historial. Sin `DATABASE_ADMIN_URL`, activar un kon devolvía
 *
 *     Failed query: CREATE TABLE IF NOT EXISTS kitsuden_migrations (…)
 *
 * que es técnicamente ruidoso y no dice nada: ni qué falta, ni qué hacer. Un
 * error sin salida es casi tan caro como un fallo silencioso.
 */
function conDiagnostico(e: unknown, tipo: TipoDeConexionDdl, contexto: string): Error {
  /**
   * El motivo REAL está en `cause`, no en `message`.
   *
   * Drizzle envuelve el error de Postgres y su `message` es solo
   * `Failed query: CREATE TABLE …` — el `permission denied for schema public`
   * y el código `42501` viven en `cause`. Buscar la pista únicamente en
   * `message` no encontraba nada y el diagnóstico no llegaba a aparecer, que es
   * como se descubrió esto.
   */
  const causa = (e as { cause?: { message?: string; code?: string } })?.cause;
  const detalle = e instanceof Error ? e.message : String(e);
  const motivo = [detalle, causa?.message].filter(Boolean).join(" — ");
  const codigo = causa?.code ?? (e as { code?: string })?.code;

  const sinPermiso = codigo === "42501" || /permission denied|must be owner/i.test(motivo);
  const pista = !sinPermiso
    ? ""
    : tipo === "app"
      ? PISTA_SIN_DDL
      : tipo === "ddl"
        ? `\n\n  El rol de DDL limitado (DATABASE_DDL_URL) solo crea objetos nuevos: esta` +
          `\n  migración toca algo que no es suyo (una tabla del núcleo, una extensión).` +
          `\n  Aplícala con la cuenta de administración, fuera del proceso de la API:` +
          `\n\n      bun run scripts/migrate.ts --kon <id>   (o reinicia el contenedor)\n`
        : "";

  return new Error(`${contexto}\n  ${motivo}${pista}`);
}

/**
 * Aplica las migraciones pendientes de un kon.
 *
 * Lanza si alguna falla. Quien llama NO debe tragarse ese error: un kon cuyas
 * migraciones fallaron no está instalado, y marcarlo como habilitado produce
 * justo el estado que motivó este fichero.
 */
export async function aplicarMigracionesDeKon(
  konId: string,
  opciones: { rutaInstalacion?: string; tablasDeclaradas?: string[] } = {}
): Promise<ResultadoMigracion> {
  const ficheros = migracionesDe(konId, opciones.rutaInstalacion);
  const { ejecutor, cerrar, tipo } = conexionParaMigrar();

  const aplicadas: string[] = [];
  const yaEstaban: string[] = [];

  try {
    let historial: Set<string>;
    try {
      await crearTablaHistorial(ejecutor);
      historial = await yaAplicadas(ejecutor);
    } catch (e) {
      throw conDiagnostico(
        e,
        tipo,
        `No se pudo preparar el historial de migraciones para instalar '${konId}'.`
      );
    }

    let funcionesListas = false;
    for (const f of ficheros) {
      if (historial.has(f.name)) {
        yaEstaban.push(f.name);
        continue;
      }

      // Las funciones de agente del núcleo, antes de la primera migración del
      // kon que se aplique: sus políticas pueden usarlas (arreglos fase D).
      // Con el rol de DDL limitado no se rehacen: las crea el arranque (migrate.ts,
      // superusuario) y su dueño es otro; un CREATE OR REPLACE daría «must be owner».
      if (!funcionesListas && tipo !== "ddl") {
        for (const stmt of readSqlFile(FUNCIONES_DE_AGENTE, "funciones-de-agente.sql").statements) {
          try {
            await ejecutor.execute(sql.raw(stmt));
          } catch (e) {
            throw conDiagnostico(e, tipo, `funciones-de-agente.sql falló antes de migrar '${konId}'`);
          }
        }
        funcionesListas = true;
      }

      const t0 = Date.now();
      for (const [i, stmt] of f.statements.entries()) {
        try {
          await ejecutor.execute(sql.raw(stmt));
        } catch (e) {
          const primera = stmt.split("\n")[0]!.slice(0, 90);
          throw conDiagnostico(
            e,
            tipo,
            `${f.name} falló en el statement ${i + 1}/${f.statements.length}\n  ${primera}…`
          );
        }
      }

      await ejecutor.execute(
        sql.raw(
          `INSERT INTO kitsuden_migrations (name, checksum, duration_ms)
             VALUES ('${f.name}', '${f.checksum}', ${Date.now() - t0})
           ON CONFLICT (name) DO UPDATE SET checksum = EXCLUDED.checksum`
        )
      );
      aplicadas.push(f.name);
    }
  } finally {
    await cerrar();
  }

  // Migrar sin error no garantiza que el kon tenga sus tablas: puede no traer
  // migraciones, o traerlas incompletas. Se comprueba contra lo que declara el
  // manifiesto, que es la única promesa explícita que hace el kon.
  const declaradas = opciones.tablasDeclaradas ?? [];
  const existen = await tablasExistentes(declaradas);
  const tablasQueFaltan = declaradas.filter((t) => !existen.has(t));

  return { konId, aplicadas, yaEstaban, tablasQueFaltan, conexion: tipo };
}
