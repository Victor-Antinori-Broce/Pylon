#!/usr/bin/env bun
/**
 * Runner de migraciones SQL
 * ============================================================================
 *
 * POR QUÉ EXISTE
 *
 * Había 31 ficheros de migración y NADA los aplicaba. `db:migrate` era
 * `drizzle-kit migrate`, cuyo journal tiene 2 entradas; las otras 29 vivían en
 * `src/db/migrations/` y solo las leía `pg-mem` para los tests. Es decir: el
 * esquema real se mantenía a mano con `psql`, y CI probaba contra un esquema
 * imaginario.
 *
 * ORDEN
 *
 *   1. drizzle/*.sql            — el esquema base generado por drizzle-kit
 *   2. src/db/migrations/*.sql  — las manuales, que asumen ese base
 *
 * Es el mismo orden que ya usaba `pg-mem-db.ts`, y no es arbitrario: las
 * manuales empiezan en 0002 porque extienden lo que crean 0000 y 0001.
 *
 * LO IMPORTANTE PARA UNA BASE QUE YA EXISTE
 *
 * Tus bases de producción YA tienen estas migraciones aplicadas a mano. Correr
 * el runner sobre ellas intentaría reaplicarlas. Para eso está `--baseline`:
 * marca todo lo presente como aplicado SIN ejecutarlo. Es el primer comando
 * que hay que correr en una base preexistente, y solo una vez.
 *
 * USO
 *   bun run scripts/migrate.ts --status     ver aplicadas y pendientes
 *   bun run scripts/migrate.ts --prune      borrar historial cuyo fichero ya no existe
 *   bun run scripts/migrate.ts --baseline   base existente: marcar sin ejecutar
 *   bun run scripts/migrate.ts --dry-run    qué se ejecutaría
 *   bun run scripts/migrate.ts              aplicar pendientes + RLS
 *   bun run scripts/migrate.ts --no-rls     aplicar solo migraciones
 *   bun run scripts/migrate.ts --kon kon-blog  ademas, las de ese kon instalado
 *                                           aunque no este activo (lo usa
 *                                           `kitsuden kon add`)
 *   bun run scripts/migrate.ts --todos-los-kons
 *                                           TODOS los kons, no solo los
 *                                           habilitados. Para CI: valida
 *                                           cadenas que en un servidor no se
 *                                           aplicarian hasta que alguien
 *                                           active ese kon.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { sql } from "drizzle-orm";

import { db } from "../src/db";
import { detallarError } from "./lib/db-error";
import { aplicarPoliticasRls, comprobarSuperusuario, informarRls, verificarRls } from "./lib/rls";
import { readSqlFile, type SqlFile } from "../src/lib/sql-file";
import { idDeKon, konInstalado, konsInstalados } from "../src/lib/kons-instalados";

const here = dirname(fileURLToPath(import.meta.url));

/** Clave del lock consultivo. Constante fija: no puede cambiar entre versiones. */
const LOCK_KEY = 8_913_442_071_004_501n;

const FUENTES = [
  { source: "drizzle", dir: resolve(here, "../drizzle") },
  { source: "migrations", dir: resolve(here, "../src/db/migrations") },
];

/**
 * Migraciones de los paquetes de `packages/core`.
 *
 * Mismo problema que con los kons y misma solucion: `packages/core/*​/migrations`
 * tiene 5 ficheros .sql que no ejecutaba nadie. El sintoma visible era
 *
 *     Calculated fields table not found. Run migration: 0001_calculated_fields.sql
 *
 * un aviso que pedia ejecutar a mano un fichero que SI existe —en
 * `packages/core/datasets/migrations/`— pero que el runner no miraba.
 *
 * A diferencia de los kons, core va siempre: no es opcional ni depende de la
 * configuracion.
 *
 * ── LA EXCLUSION ───────────────────────────────────────────────────────────
 *
 * `vector-search` se deja fuera a proposito. Su unico fichero,
 * `001_migrate_from_ai_memories.sql`, es una migracion de DATOS de una version
 * antigua: inserta en `vector_index` y `vector_chunks` leyendo de `ai_memories`.
 * Ninguna de esas tres tablas existe en el esquema actual —el vector vive hoy
 * en `vector_documents`— asi que aplicarla falla en la primera sentencia.
 *
 * Ademas su prefijo es de 3 digitos, que la regla de orden de mas abajo
 * rechaza. Se conserva el fichero como registro de aquel cambio; no se ejecuta.
 */
const CORE_EXCLUIDOS = new Set(["vector-search"]);

function fuentesDeCore(): { source: string; dir: string }[] {
  const base = join(RAIZ, "packages", "core");
  if (!existsSync(base)) return [];

  const fuentes: { source: string; dir: string }[] = [];
  for (const paquete of readdirSync(base).sort()) {
    if (CORE_EXCLUIDOS.has(paquete)) continue;
    const dir = join(base, paquete, "migrations");
    if (existsSync(dir)) fuentes.push({ source: `core-${paquete}`, dir });
  }
  return fuentes;
}

/** Raiz del monorepo: `apps/api/scripts` -> dos niveles arriba de `apps/api`. */
const RAIZ = resolve(here, "../../..");

/**
 * Migraciones de los kons habilitados.
 *
 * ── POR QUE ESTO NO EXISTIA Y POR QUE HACE FALTA ───────────────────────────
 *
 * 24 kons traen migraciones —45 ficheros .sql en total— y NADIE las ejecutaba.
 * El runner solo miraba `drizzle/` y `src/db/migrations/`.
 *
 * En su lugar, cada kon creaba sus tablas al arrancar, con un
 * `CREATE TABLE IF NOT EXISTS` desde el propio servicio. Eso tenia tres
 * problemas, y el tercero lo volvio imposible:
 *
 *   1. Sin versionar: ni checksum, ni orden, ni forma de saber que se aplico.
 *   2. Fallaba en silencio. Un `console.warn` entre cientos de lineas de
 *      arranque no detiene a nadie, asi que un kon sin tablas parecia sano.
 *   3. Desde que la API se conecta con un rol sin privilegios —para que RLS se
 *      aplique de verdad— ese rol NO tiene CREATE sobre el esquema. La creacion
 *      en caliente ya no puede funcionar, y esta bien que asi sea: crear tablas
 *      es trabajo de una migracion.
 *
 * El resultado medido: de los 5 kons instalados, 4 no tenian NINGUNA de sus
 * tablas. `kon-crm` declaraba 9 y faltaban las 9.
 *
 * ── QUE KONS ───────────────────────────────────────────────────────────────
 *
 * Los que la configuracion declara habilitados, no los de `installed_kons`: en
 * un arranque limpio esa tabla esta vacia cuando migramos, porque los kons se
 * registran DESPUES. Mirar la configuracion es lo unico que funciona la primera
 * vez, que es justo cuando importa.
 *
 * Van despues de las del nucleo a proposito: las tablas de kon referencian
 * `auth_users` y compania.
 */
async function fuentesDeKons(todos?: boolean): Promise<{ source: string; dir: string }[]> {
  // ── --todos-los-kons ──────────────────────────────────────────────────────
  //
  // Aplica la cadena de TODOS los kons del repositorio, esten habilitados o no.
  //
  // Existe para CI, y es la respuesta a como se colaron a produccion cadenas de
  // migracion que no aplicaban. Los kons rotos que se encontraron —dms sin
  // migracion de arranque, esports y games con `ALTER TYPE IF EXISTS` (sintaxis
  // que no existe), booking renombrando una tabla a su propio nombre— estaban
  // TODOS apagados de fabrica.
  //
  // Es decir: CI migraba los seis kons encendidos, salia en verde, y la cadena
  // de los otros veintitantos no la ejecutaba nadie hasta que un usuario
  // activaba uno desde el panel. En ese momento, y solo en ese momento, se
  // descubria que el SQL ni siquiera parseaba.
  //
  // En un servidor NO se usa: aplicaria tablas de kons que nadie ha pedido.
  if (todos ?? process.argv.includes("--todos-los-kons")) {
    return todosLosKons();
  }

  let habilitados: string[] = [];
  try {
    const config = await import(resolve(here, "../kitsuden.config.ts"));
    const estatica = config.staticConfig ?? config.default ?? config;
    habilitados = estatica.kons ?? estatica.modules ?? [];
  } catch (err) {
    // Sin configuracion no se inventa nada: se avisa y se sigue con el nucleo.
    console.warn(
      `  ⚠  No se pudo leer kitsuden.config.ts (${err instanceof Error ? err.message : err}).
` + `     No se aplicaran migraciones de kons.`
    );
    return [];
  }

  // Y los que el PANEL haya activado. Sin esto, activar un kon desde el admin y
  // reconstruir el contenedor devolvia el kon a "habilitado y sin tablas": el
  // fichero de configuracion decia `enabled: false` y el runner lo saltaba,
  // mientras la tabla `modules` decia lo contrario.
  //
  // Dos fuentes de verdad para "que kons hay" es el problema de fondo; mientras
  // existan las dos, migrar la UNION es lo unico que no rompe a nadie: aplicar
  // una migracion de mas cuesta un CREATE TABLE idempotente, y aplicar una de
  // menos cuesta una pantalla rota.
  for (const id of await konsActivadosEnLaBase()) {
    if (!habilitados.includes(id)) habilitados.push(id);
  }

  // `--kon <id>` (repetible): lo usa `kitsuden kon add` para migrar el kon que
  // acaba de instalar aunque todavía no esté activo en la base.
  for (const id of konsPedidosPorArgumento()) {
    if (!habilitados.includes(id)) habilitados.push(id);
  }

  // Solo lo INSTALADO: un kon activo en la base que ya no está instalado no
  // tiene ficheros que aplicar (y se avisa, en vez de saltarlo en silencio).
  const fuentes: { source: string; dir: string }[] = [];
  const vistos = new Set<string>();
  for (const id of habilitados) {
    const kon = konInstalado(id);
    if (kon?.origen === "nucleo") continue; // van por fuentesDeCore()
    if (!kon?.ruta) {
      console.warn(`  ⚠  ${idDeKon(id)} está activo pero no instalado: no se migra (kitsuden kon add ${idDeKon(id).replace(/^kon-/, "")})`);
      continue;
    }
    if (vistos.has(kon.id)) continue;
    vistos.add(kon.id);
    const fuente = fuenteDeKon(kon.ruta);
    if (fuente) fuentes.push(fuente);
  }
  return fuentes;
}

/**
 * La fuente de migraciones de un kon instalado. El nombre en el historial es
 * `<carpeta>/<fichero>`, con la carpeta REAL del kon (`kon-blog`), igual que
 * cuando los kons vivían en packages/kons: así una base ya migrada reconoce lo
 * aplicado aunque el kon venga ahora de otro sitio.
 */
function fuenteDeKon(ruta: string): { source: string; dir: string } | null {
  const dir = join(ruta, "migrations");
  return existsSync(dir) ? { source: basename(ruta), dir } : null;
}

/** Los ids pasados con `--kon <id>` (o `--kon=<id>`). */
function konsPedidosPorArgumento(): string[] {
  const salida: string[] = [];
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--kon" && args[i + 1]) salida.push(idDeKon(args[++i]));
    else if (args[i].startsWith("--kon=")) salida.push(idDeKon(args[i].slice(6)));
  }
  return salida;
}

/**
 * Kons marcados como activos en la tabla `modules`.
 *
 * Puede no existir todavia —primer arranque, antes de la primera migracion— y
 * eso NO es un error: se devuelve una lista vacia y manda la configuracion.
 */
async function konsActivadosEnLaBase(): Promise<string[]> {
  try {
    const res = await db.execute(sql.raw(`SELECT key FROM modules WHERE enabled = true`));
    const filas =
      (res as unknown as { rows?: { key: string }[] }).rows ??
      (res as unknown as { key: string }[]);
    return (filas ?? []).map((f) => f.key);
  } catch {
    return [];
  }
}

/**
 * Todos los kons INSTALADOS que traen migraciones (`--todos-los-kons`).
 *
 * Antes eran todos los de la carpeta `packages/kons` del repositorio; desde
 * que los kons viven en kitsuden-kons, son los declarados en la instalación
 * (`kitsuden.kons.json` + `KITSUDEN_KONS`). Para CI de los kons, se declaran
 * todos.
 *
 * El orden entre kons es alfabetico por carpeta. Un kon cuya cadena dependa de
 * la de OTRO kon es un acoplamiento que este runner no puede resolver, y que no
 * deberia existir: un kon declara sus propias tablas.
 */
function todosLosKons(): { source: string; dir: string }[] {
  const fuentes: { source: string; dir: string }[] = [];
  for (const kon of konsInstalados()) {
    if (kon.origen === "nucleo" || !kon.ruta) continue;
    const fuente = fuenteDeKon(kon.ruta);
    if (fuente) fuentes.push(fuente);
  }
  return fuentes.sort((a, b) => a.source.localeCompare(b.source));
}

/**
 * Funciones de agente del núcleo (`kitsuden_admin_efectivo`, …) que las
 * migraciones de los kons pueden usar en sus políticas. Idempotente: se aplica
 * ANTES de las migraciones pendientes (y otra vez con la RLS). Ver el fichero.
 */
const FUNCIONES_DE_AGENTE = resolve(here, "../src/db/funciones-de-agente.sql");

/** RLS: se aplica DESPUÉS de las migraciones y es idempotente por diseño. */
const RLS_FILES = [
  FUNCIONES_DE_AGENTE,
  resolve(here, "../src/db/rls-policies.sql"),
  resolve(here, "../src/db/rls-owned-tables.sql"),
  // Núcleo: secretos, credenciales, auditoría y auth_users (2026-10-15)
  resolve(here, "../src/db/rls-solo-sistema.sql"),
];

// ── Descubrimiento ──────────────────────────────────────────────────────────

async function descubrir(todos?: boolean): Promise<SqlFile[]> {
  const ficheros: SqlFile[] = [];

  for (const { source, dir } of [...FUENTES, ...fuentesDeCore(), ...(await fuentesDeKons(todos))]) {
    if (!existsSync(dir)) continue;
    const sqls = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      // Orden lexicográfico sobre nombres con prefijo numérico de 4 dígitos.
      // Es estable mientras el prefijo se mantenga; un fichero sin prefijo se
      // ordenaría al final y por eso se rechaza más abajo.
      .sort();

    for (const f of sqls) {
      ficheros.push(readSqlFile(join(dir, f), `${source}/${f}`));
    }
  }

  const sinPrefijo = ficheros.filter((f) => !/\/\d{4}_/.test(f.name));
  if (sinPrefijo.length > 0) {
    // Sin prefijo no hay orden determinista, y el orden es lo único que hace
    // reproducible una cadena de migraciones.
    throw new Error(
      `Migraciones sin prefijo numérico de 4 dígitos (el orden sería arbitrario):\n` +
        sinPrefijo.map((f) => `  ${f.name}`).join("\n")
    );
  }

  return ficheros;
}

// ── Comprobación previa de extensiones ──────────────────────────────────────

/**
 * Verifica que las extensiones que pide la cadena existen en el servidor ANTES
 * de aplicar nada.
 *
 * Sin esto, una extensión ausente no se nota hasta el statement que usa su
 * tipo: la cadena aplica seis migraciones, revienta a mitad de la séptima con
 * `type "vector" does not exist`, y hay que deducir que el problema estaba en
 * el servidor y no en el SQL. Comprobarlo antes convierte media hora en un
 * mensaje.
 *
 * `CREATE EXTENSION IF NOT EXISTS` no protege: no falla si la extensión no
 * está DISPONIBLE, solo si ya está creada.
 */
async function comprobarExtensiones(ficheros: SqlFile[]): Promise<void> {
  const pedidas = new Set<string>();
  for (const f of ficheros) {
    for (const m of f.raw.matchAll(/CREATE EXTENSION\s+(?:IF NOT EXISTS\s+)?"?([a-z_]+)"?/gi)) {
      pedidas.add(m[1].toLowerCase());
    }
  }
  if (pedidas.size === 0) return;

  let disponibles: Set<string>;
  try {
    const res = await db.execute(sql.raw(`SELECT name FROM pg_available_extensions`));
    const filas = (Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])) as Array<{
      name: string;
    }>;
    disponibles = new Set(filas.map((r) => r.name.toLowerCase()));
  } catch {
    // Si el catálogo no es legible, no se puede comprobar: se sigue y que
    // falle la migración con su propio error.
    return;
  }

  const faltan = [...pedidas].filter((e) => !disponibles.has(e));
  if (faltan.length > 0) {
    throw new Error(
      `Faltan extensiones de Postgres que la cadena necesita: ${faltan.join(", ")}\n\n` +
        `    En Docker, usa una imagen que las traiga — para pgvector:\n` +
        `      image: pgvector/pgvector:pg16\n\n` +
        `    En modo lite (PGlite) 'vector' NO está disponible: las funciones de\n` +
        `    brain y búsqueda semántica no pueden migrarse ahí.`
    );
  }
}

// ── Historial ───────────────────────────────────────────────────────────────

async function crearTablaHistorial() {
  await db.execute(
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

interface Aplicada {
  name: string;
  checksum: string;
  baselined: boolean;
}

async function leerAplicadas(): Promise<Map<string, Aplicada>> {
  const res = await db.execute(
    sql.raw(`SELECT name, checksum, baselined FROM kitsuden_migrations`)
  );
  const filas = (res as unknown as { rows?: Aplicada[] }).rows ?? (res as unknown as Aplicada[]);
  return new Map((filas ?? []).map((r) => [r.name, r]));
}

/**
 * ¿El checksum del historial corresponde a este fichero?
 *
 * Se compara también con el fichero en LF y en CRLF, porque el mismo commit
 * produce bytes distintos según dónde se saque: `.gitattributes` tiene
 * `* text=auto`, así que en Windows (autocrlf) muchas migraciones llegan con
 * CRLF y en un clon de Linux con LF. La base local se migró desde Windows: su
 * historial guarda checksums de ficheros CRLF (41 de 110 lo son). Comparando
 * solo los bytes, el primer arranque en un servidor Linux con esa base
 * restaurada pararía con «cambiaron DESPUÉS de aplicarse» sin que nadie haya
 * tocado una línea.
 *
 * Un fin de línea no cambia el SQL que se ejecuta; cualquier otro cambio sí
 * sigue contando como deriva.
 */
function mismoContenido(registrado: string, f: SqlFile): boolean {
  if (registrado === f.checksum) return true;
  const lf = f.raw.replace(/\r\n/g, "\n");
  const huella = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
  return registrado === huella(lf) || registrado === huella(lf.replace(/\n/g, "\r\n"));
}

// ── Ejecución ───────────────────────────────────────────────────────────────

async function aplicar(f: SqlFile): Promise<number> {
  const t0 = Date.now();

  // Un fichero = una transacción. Si un statement falla, la migración entera
  // se deshace y el historial no la registra: no quedan medias migraciones.
  await db.transaction(async (tx) => {
    for (const [i, stmt] of f.statements.entries()) {
      try {
        await tx.execute(sql.raw(stmt));
      } catch (e) {
        const linea = stmt.split("\n")[0].slice(0, 90);
        throw new Error(
          `${f.name} falló en el statement ${i + 1}/${f.statements.length}\n` +
            `  ${linea}…\n  ${detallarError(e)}`
        );
      }
    }
  });

  const ms = Date.now() - t0;
  await db.execute(
    sql.raw(
      `INSERT INTO kitsuden_migrations (name, checksum, duration_ms)
       VALUES ('${f.name}', '${f.checksum}', ${ms})
       ON CONFLICT (name) DO UPDATE SET checksum = EXCLUDED.checksum`
    )
  );
  return ms;
}

// ── Comandos ────────────────────────────────────────────────────────────────

async function conLock<T>(fn: () => Promise<T>): Promise<T> {
  let tomado = false;
  try {
    await db.execute(sql.raw(`SELECT pg_advisory_lock(${LOCK_KEY})`));
    tomado = true;
  } catch {
    // PGlite es de una sola conexión; sin locks no hay carrera que evitar.
  }
  try {
    return await fn();
  } finally {
    if (tomado) {
      try {
        await db.execute(sql.raw(`SELECT pg_advisory_unlock(${LOCK_KEY})`));
      } catch {
        /* la conexión se cierra igual */
      }
    }
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const baseline = args.has("--baseline");
  const status = args.has("--status");
  const sinRls = args.has("--no-rls");
  const permitirDeriva = args.has("--allow-drift");

  const ficheros = await descubrir();
  await crearTablaHistorial();
  const aplicadas = await leerAplicadas();

  // Solo cuando se va a ejecutar algo: `--status` y `--baseline` tienen que
  // funcionar en un servidor al que le falte una extensión.
  if (!status && !baseline && !dryRun) {
    await comprobarExtensiones(ficheros.filter((f) => !aplicadas.has(f.name)));
  }

  const pendientes = ficheros.filter((f) => !aplicadas.has(f.name));
  const derivadas = ficheros.filter((f) => {
    const a = aplicadas.get(f.name);
    return a && !a.baselined && !mismoContenido(a.checksum, f);
  });

  /**
   * Entradas del historial que ya no tienen fichero.
   *
   * Sin esto, "69 en disco, 79 aplicadas" parece corrupción y casi nunca lo es:
   * `descubrir()` solo mira los kons HABILITADOS, así que las migraciones de un
   * kon apagado están aplicadas y no aparecen en la cuenta.
   *
   * Distinguirlo importa porque las dos cosas piden lo contrario: la de un kon
   * apagado hay que DEJARLA —borrarla haría que sus migraciones se reapliquen
   * el día que se encienda, contra tablas que ya existen— y la de un kon
   * borrado de verdad sí sobra. Por eso se descubre TODO para decidir.
   */
  const enDisco = new Set(
    (args.has("--todos-los-kons") ? ficheros : await descubrir(true)).map((f) => f.name)
  );
  const huerfanas = [...aplicadas.keys()].filter((n) => !enDisco.has(n));
  const deKonsApagados = aplicadas.size - ficheros.filter((f) => aplicadas.has(f.name)).length;

  if (status) {
    console.log(`\nMigraciones: ${ficheros.length} en disco, ${aplicadas.size} aplicadas\n`);
    for (const f of ficheros) {
      const a = aplicadas.get(f.name);
      const marca = !a ? "PENDIENTE" : a.baselined ? "baseline " : "aplicada ";
      console.log(`  ${marca}  ${f.name}`);
    }
    const apagadas = deKonsApagados - huerfanas.length;
    if (apagadas > 0) {
      console.log(
        `\n  ${apagadas} aplicada(s) son de kons no habilitados y no se listan.` +
          `\n     Para verlas: --todos-los-kons`
      );
    }
    if (huerfanas.length > 0) {
      // Hoy no rompe nada: es historia de algo que se borró. El riesgo llega si
      // vuelve un fichero con ESE nombre y otro contenido — el runner lo daría
      // por aplicado y no lo ejecutaría nunca.
      console.log(`\n  ⚠  ${huerfanas.length} aplicada(s) sin fichero en ninguna parte:`);
      for (const n of huerfanas) console.log(`       ${n}`);
      console.log(`     Si ese kon se borró de verdad, límpialas con --prune.`);
    }
    if (derivadas.length > 0) {
      console.log(`\n  ⚠  ${derivadas.length} migración(es) cambiaron tras aplicarse.`);
    }
    return;
  }

  if (args.has("--prune")) {
    if (huerfanas.length === 0) {
      console.log("Nada que limpiar: toda entrada del historial tiene su fichero.");
      return;
    }
    console.log(`\nBorrando ${huerfanas.length} entrada(s) de historial sin fichero:\n`);
    for (const n of huerfanas) {
      console.log(`  ${n}`);
      await db.execute(sql`DELETE FROM kitsuden_migrations WHERE name = ${n}`);
    }
    console.log(
      `\nHecho. Si alguno de esos ficheros vuelve, se aplicará de nuevo — que es\n` +
        `lo correcto solo si sus tablas tampoco están.`
    );
    return;
  }

  if (derivadas.length > 0 && !permitirDeriva) {
    // Una migración ya aplicada que cambia de contenido significa que la base
    // y el repo dicen cosas distintas. Editarla no reaplica nada: hay que
    // añadir una nueva. Fallar aquí es más barato que descubrirlo en producción.
    console.error(
      `\n  ✗ Estas migraciones cambiaron DESPUÉS de aplicarse:\n` +
        derivadas.map((f) => `      ${f.name}`).join("\n") +
        `\n\n    Una migración aplicada es historia: editarla no la reaplica.\n` +
        `    Añade una migración nueva, o usa --allow-drift si sabes lo que haces.\n`
    );
    process.exit(1);
  }

  if (baseline) {
    if (pendientes.length === 0) {
      console.log("Nada que marcar: el historial ya está al día.");
      return;
    }
    console.log(`\nMarcando ${pendientes.length} migración(es) como aplicadas SIN ejecutarlas.`);
    console.log("Úsalo solo en una base que YA tiene este esquema.\n");
    for (const f of pendientes) {
      await db.execute(
        sql.raw(
          `INSERT INTO kitsuden_migrations (name, checksum, baselined)
           VALUES ('${f.name}', '${f.checksum}', true)
           ON CONFLICT (name) DO NOTHING`
        )
      );
      console.log(`  baseline  ${f.name}`);
    }
    return;
  }

  if (pendientes.length === 0) {
    console.log(`Esquema al día (${aplicadas.size} migraciones).`);
  } else if (dryRun) {
    console.log(`\n${pendientes.length} migración(es) pendientes:\n`);
    for (const f of pendientes) {
      console.log(`  ${f.name}  (${f.statements.length} statements)`);
    }
    return;
  } else {
    console.log(`\nAplicando ${pendientes.length} migración(es):\n`);
    await aplicarPoliticasRls([FUNCIONES_DE_AGENTE]);
    for (const f of pendientes) {
      const ms = await aplicar(f);
      console.log(`  ok  ${f.name}  (${f.statements.length} statements, ${ms}ms)`);
    }
  }

  if (!sinRls) {
    if (dryRun) {
      console.log("\n  (--dry-run: RLS no aplicado)");
    } else {
      console.log("\nAplicando políticas RLS:");
      await aplicarPoliticasRls(RLS_FILES);
      informarRls(await verificarRls(), await comprobarSuperusuario());
    }
  }
}

await conLock(main).catch((e) => {
  console.error(`\n  ✗ ${(e as Error).message}\n`);
  process.exit(1);
});

process.exit(0);
