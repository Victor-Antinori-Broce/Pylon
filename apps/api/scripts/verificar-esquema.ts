/**
 * Verificación de esquema: lo declarado tiene que existir
 * ============================================================================
 *
 * Compara las tablas que declara el código (`src/db/schema-core.ts`) con las
 * que la base tiene de verdad, y falla si falta alguna.
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
 *
 * `auth_accounts` estaba declarada y **ninguna migración la creaba**. Sobre una
 * base limpia eso hacía imposible crear el primer administrador: la pantalla
 * «System Init» devolvía 500 y el log decía `relation "auth_accounts" does not
 * exist`. Peor: better-auth escribe el usuario en `auth_users` y la credencial
 * en `auth_accounts`, así que la operación fallaba a MITAD — el usuario quedaba
 * creado sin contraseña, y reintentar ya no arreglaba nada.
 *
 * No se detectó durante meses porque las instalaciones existentes tenían esas
 * tablas de antes de que el esquema se llevara a migraciones. El fallo solo
 * aparece en una instalación NUEVA — es decir, exactamente en el servidor de
 * producción recién montado, y en el peor momento posible.
 *
 * ── POR QUÉ EN EL ARRANQUE Y NO EN UN TEST ─────────────────────────────────
 *
 * Se intentó con pg-mem, la base en memoria de las pruebas, y no sirve: no
 * entiende parte del SQL de las migraciones —52 sentencias fallaron al
 * parsear— y daba por ausentes tablas que en Postgres existen. Una comprobación
 * con falsos positivos se acaba ignorando.
 *
 * Así que esto corre contra la base REAL, justo después de migrar y antes de
 * servir. Si falta algo, el contenedor no arranca. Un despliegue que no arranca
 * se arregla; uno que arranca a medias se descubre cuando un usuario no puede
 * entrar.
 */

import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";

import { db } from "../src/db";
import * as schemaCore from "../src/db/schema-core";
import { esquemasDeKonsActivos } from "./lib/esquemas-de-kons";

/**
 * Cada tabla declarada, con su nombre en la base y sus columnas.
 *
 * Las columnas importan tanto como la tabla: `auth_sessions` EXISTIA y le
 * faltaba `token`. La primera version de este script solo miraba tablas, dio el
 * esquema por bueno, y el alta del primer administrador siguio devolviendo 500
 * — esta vez con `column "token" of relation "auth_sessions" does not exist`.
 * Media comprobacion es la que deja pasar el fallo con el sello de aprobada.
 */
function tablasDeUnModulo(
  modulo: Record<string, unknown>,
  origen: string
): { codigo: string; tabla: string; columnas: string[] }[] {
  return Object.entries(modulo)
    .filter(([, valor]) => is(valor, PgTable))
    .map(([codigo, valor]) => ({
      codigo: `${origen}: ${codigo}`,
      tabla: getTableName(valor as PgTable),
      columnas: Object.values(getTableColumns(valor as PgTable)).map((c) => c.name),
    }));
}

/**
 * Todo lo declarado: el nucleo y los kons ACTIVOS.
 *
 * ── POR QUE TAMBIEN LOS KONS ───────────────────────────────────────────────
 *
 * Porque la primera version solo miraba `schema-core.ts` y dio el esquema por
 * bueno —«29/29 tablas, 0 con columnas ausentes»— mientras
 * `game_collections` le faltaban DOS columnas que su esquema Drizzle declara
 * desde hace tiempo. La consulta que las pedia respondia
 *
 *     ERROR:  column "description" does not exist
 *
 * en una ruta publica. La verificacion decia que todo estaba bien porque estaba
 * mirando otra cosa.
 *
 * Solo los ACTIVOS: un kon apagado no tiene por que tener sus tablas, y exigir
 * el esquema de los veintitantos que hay en el repo impediria arrancar por algo
 * que nadie usa.
 */
async function tablasDeclaradas(): Promise<
  { codigo: string; tabla: string; columnas: string[] }[]
> {
  const todas = [
    ...tablasDeUnModulo(schemaCore as Record<string, unknown>, "schema-core.ts"),
    ...(await esquemasDeKonsActivos()).flatMap(({ kon, modulo }) => tablasDeUnModulo(modulo, kon)),
  ];

  // Un mismo nombre de tabla puede declararse en dos sitios (el nucleo y un kon
  // que la reexporta). Se queda la declaracion con MAS columnas: es la que
  // impone el requisito mas fuerte, y aceptar la mas laxa dejaria pasar la
  // deriva que esto busca.
  const porTabla = new Map<string, { codigo: string; tabla: string; columnas: string[] }>();
  for (const d of todas) {
    const previa = porTabla.get(d.tabla);
    if (!previa || d.columnas.length > previa.columnas.length) porTabla.set(d.tabla, d);
  }

  return [...porTabla.values()].sort((a, b) => a.tabla.localeCompare(b.tabla));
}

/** Filas de un resultado de drizzle, que varían según el driver. */
function filasDe(resultado: unknown): Record<string, unknown>[] {
  if (Array.isArray(resultado)) return resultado as Record<string, unknown>[];
  const conRows = resultado as { rows?: unknown };
  return Array.isArray(conRows?.rows) ? (conRows.rows as Record<string, unknown>[]) : [];
}

async function main(): Promise<void> {
  const declaradas = await tablasDeclaradas();

  const resultado = await db.execute(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'` as never
  );
  const existentes = new Set(filasDe(resultado).map((f) => String(f.tablename)));

  const ausentes = declaradas.filter((d) => !existentes.has(d.tabla));

  // Columnas reales, en una sola consulta: preguntar tabla por tabla serian 29
  // idas y vueltas en cada arranque.
  const columnasReales = await db.execute(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public'` as never
  );
  const porTabla = new Map<string, Set<string>>();
  for (const fila of filasDe(columnasReales)) {
    const tabla = String(fila.table_name);
    if (!porTabla.has(tabla)) porTabla.set(tabla, new Set());
    porTabla.get(tabla)!.add(String(fila.column_name));
  }

  const columnasAusentes: { tabla: string; columnas: string[] }[] = [];
  for (const d of declaradas) {
    const reales = porTabla.get(d.tabla);
    if (!reales) continue; // la tabla entera falta; ya sale arriba
    const faltan = d.columnas.filter((c) => !reales.has(c));
    if (faltan.length > 0) columnasAusentes.push({ tabla: d.tabla, columnas: faltan });
  }

  console.log(
    `   Esquema: ${declaradas.length - ausentes.length}/${declaradas.length} tablas, ` +
      `${columnasAusentes.length} con columnas ausentes`
  );

  if (ausentes.length === 0 && columnasAusentes.length === 0) return;

  if (columnasAusentes.length > 0) {
    console.error("");
    console.error("ERROR: hay columnas declaradas en el codigo que la base NO tiene.");
    console.error("");
    for (const c of columnasAusentes) {
      console.error(`   · ${c.tabla}: ${c.columnas.join(", ")}`);
    }
    console.error("");
    console.error("  La tabla existe, asi que nada falla al arrancar: falla la primera");
    console.error("  consulta que use esa columna. Con `auth_sessions.token` eso era");
    console.error("  iniciar sesion, o sea el alta del primer administrador.");
    process.exitCode = 1;
  }

  if (ausentes.length === 0) return;

  console.error("");
  console.error("ERROR: hay tablas declaradas en el codigo que la base NO tiene.");
  console.error("");
  for (const a of ausentes) {
    console.error(`   · ${a.tabla}   (${a.codigo})`);
  }
  console.error("");
  console.error("  Ninguna migracion las crea. La API arrancaria y fallaria con");
  console.error("  'relation \"...\" does not exist' la primera vez que alguien las use,");
  console.error("  que suele ser al crear el primer usuario.");
  console.error("");
  console.error("  Anade una migracion en src/db/migrations/ que las cree, copiando");
  console.error("  las columnas de schema-core.ts. Ver 0036_auth_tables_faltantes.sql");
  console.error("  como ejemplo.");
  console.error("");
  process.exitCode = 1;
}

// Salir SIEMPRE, tambien por el camino bueno: `db` deja abierto un pool de
// Postgres y el proceso no terminaria solo. Es el mismo fallo que colgo el paso
// [5/6] del arranque; ver tests/unit/scripts-arranque-terminan.test.ts.
main()
  .catch((err) => {
    console.error("ERROR verificando el esquema:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
