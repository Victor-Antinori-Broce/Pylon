import type { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
// @ts-ignore - NodePgTransaction is the correct export name but TS complains
import type {
  NodePgDatabase,
  NodePgTransaction,
  NodePgQueryResultHKT,
} from "drizzle-orm/node-postgres";
import pg from "pg";

// Deep import del submódulo puro (no la fachada del engine, que importa este db).
import { conTransaccionesPerezosas } from "../../../../packages/engine/src/rls-peticion";
import { enPruebas } from "../lib/entorno";
import { configuracionDelPool, vigilarPool } from "../lib/pool-agotado";

import * as coreSchema from "./schema-core";

const { Pool } = pg;

/**
 * MODO LITE (`KITSUDEN_LITE=true` o `DATABASE_URL=lite`)
 * ─────────────────────────────────────────────────────────────────────────────
 * Arranca con PostgreSQL EMBEBIDO (PGlite/WASM) — cero instalación, cero Docker.
 * Es lo que permite `npx create-kitsuden my-app && kitsuden dev` en 30 segundos.
 *
 * Por qué PGlite y NO SQLite: el aislamiento de Kitsuden se apoya en Row-Level
 * Security, que SQLite no tiene. PGlite ES Postgres, así que el MISMO schema,
 * las MISMAS migraciones y las MISMAS políticas RLS funcionan sin reescribir
 * nada — pasar de lite a producción es solo cambiar DATABASE_URL.
 *
 * Los datos persisten en `.kitsuden/data` (configurable con KITSUDEN_LITE_DIR).
 */
export const isLiteMode =
  process.env.KITSUDEN_LITE === "true" || process.env.DATABASE_URL === "lite";

const connectionString = process.env.DATABASE_URL;
if (!connectionString && !isLiteMode) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and configure your PostgreSQL connection, " +
      "or run in lite mode (KITSUDEN_LITE=true) to use the embedded database — no Docker required."
  );
}

let _mergedSchema: any;
let _dbInstance: NodePgDatabase<any> | null = null;
export let isPgMem = false;
/** El pool de pg del camino normal (dev/prod); `null` en tests, lite y pg-mem. */
let _pool: pg.Pool | null = null;

/**
 * Cómo está el pool AHORA (para `/metrics` y los benchmarks): conexiones
 * abiertas, libres y peticiones esperando una. `null` sin pool de pg.
 */
export function estadoDelPool(): { total: number; idle: number; waiting: number; max: number } | null {
  if (!_pool) return null;
  return {
    total: _pool.totalCount,
    idle: _pool.idleCount,
    waiting: _pool.waitingCount,
    max: _pool.options.max ?? 10,
  };
}

/**
 * Determine which database backend to use for tests.
 *
 * - KITSUDEN_TEST_DB=memory (default) → pg-mem in-memory
 * - KITSUDEN_TEST_DB=postgres         → Real PostgreSQL
 */
function getTestDbMode(): "postgres" | "memory" {
  const mode = process.env.KITSUDEN_TEST_DB?.toLowerCase();
  if (mode === "postgres") return "postgres";
  return "memory";
}

/**
 * ¿Es esta cadena de conexión, evidentemente, una base de TESTS?
 * ─────────────────────────────────────────────────────────────────────────────
 * La suite no se limita a leer: `clearTestData()` hace `DELETE FROM data_entries`
 * y `DELETE FROM data_sets` **sin WHERE**. Y la base a la que apunta no la elige
 * la suite, sino el `DATABASE_URL` que haya en el entorno — que en una máquina
 * de desarrollo es, con toda naturalidad, la base real del proyecto.
 *
 * Es decir: `pnpm test:api` con el `.env` de siempre cargado vaciaba el
 * contenido del sitio. No pasó de milagro, porque esa base no estaba levantada.
 *
 * Así que el nombre tiene que declararse como de pruebas. Es una convención
 * barata (`kitsuden_test`, `gremius_test`) y el coste de equivocarse no tiene
 * vuelta atrás. Con `KITSUDEN_ALLOW_UNSAFE_TEST_DB=1` se puede saltar, para
 * quien de verdad tenga una base de pruebas con otro nombre.
 */
function looksLikeTestDatabase(url: string | undefined): boolean {
  if (!url) return false;
  if (process.env.KITSUDEN_ALLOW_UNSAFE_TEST_DB === "1") return true;
  try {
    const name = new URL(url).pathname.replace(/^\//, "");
    return /test/i.test(name);
  } catch {
    return false;
  }
}

async function initDb(): Promise<NodePgDatabase<any>> {
  const isTest = enPruebas();

  if (isTest) {
    const mode = getTestDbMode();

    if (mode === "memory") {
      console.log("📋 Test mode: KITSUDEN_TEST_DB=memory — using pg-mem");
      const { getPgMemDb } = await import("../tests/pg-mem-db");
      isPgMem = true;
      return await getPgMemDb();
    }

    // --- PostgreSQL real (default for tests) ---
    if (!looksLikeTestDatabase(connectionString)) {
      console.warn("🛑 DATABASE_URL no parece una base de PRUEBAS — no se conecta.");
      console.warn(
        "   La suite borra tablas enteras sin WHERE; contra esa base sería destructivo."
      );
      console.warn("   Usa una base cuyo nombre contenga 'test' (p. ej. kitsuden_test),");
      console.warn("   arranca 'pnpm test:db:up', o fuerza con KITSUDEN_ALLOW_UNSAFE_TEST_DB=1.");
      console.log("📋 Test mode: fallback seguro — using pg-mem");
      const { getPgMemDb } = await import("../tests/pg-mem-db");
      isPgMem = true;
      return await getPgMemDb();
    }

    // Perezosa como en producción: la suite prueba el mismo camino.
    const testPool = conTransaccionesPerezosas(
      new Pool({
        connectionString,
        max: 5,
        idleTimeoutMillis: 5000,
        connectionTimeoutMillis: 3000,
      })
    );

    try {
      await testPool.query("SELECT 1");
      console.log("📋 Test mode: KITSUDEN_TEST_DB=postgres — using real PostgreSQL");
      // eslint-disable-next-line import/no-cycle -- lazy a propósito: rompe el ciclo db↔schema-merger en carga estática
      const { buildMergedSchema } = await import("../lib/schema-merger");
      _mergedSchema = await buildMergedSchema();
      return drizzle(testPool, { schema: _mergedSchema as Record<string, unknown> });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("⚠️  PostgreSQL test database not reachable, falling back to pg-mem");
      console.warn("   Expected at:", connectionString);
      console.warn("   Error:", message);
      console.warn(
        "   Tip: Run 'pnpm test:db:up' for real PostgreSQL, or set KITSUDEN_TEST_DB=memory explicitly"
      );
    }

    // Fallback to pg-mem when PostgreSQL is unavailable
    console.log("📋 Test mode: fallback — using pg-mem");
    const { getPgMemDb } = await import("../tests/pg-mem-db");
    isPgMem = true;
    return await getPgMemDb();
  }

  // --- Modo LITE: PostgreSQL embebido (PGlite), sin Docker ---
  if (isLiteMode) {
    const dataDir = process.env.KITSUDEN_LITE_DIR ?? ".kitsuden/data";
    console.log(`⚡ Modo lite: PostgreSQL embebido (PGlite) en ${dataDir}`);

    // PGlite no crea directorios intermedios: si `.kitsuden/data` no existe con
    // todos sus padres, falla con ENOENT en un proyecto recién creado.
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dataDir, { recursive: true });

    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");

    // PGlite no trae ninguna extensión por defecto: hay que cargar el módulo
    // al construir. Sin esto, `CREATE EXTENSION` de la cadena de migraciones
    // falla y con él la búsqueda por similitud y todo lo vectorial.
    //
    // EL TECHO DEL MODO LITE: SIN pgvector
    //
    // El módulo `vector` (pgvector compilado a WASM) existe en PGlite 0.2 y
    // 0.3, y desapareció a partir de 0.4. Con 0.5.x, el modo lite no puede
    // crear una sola columna VECTOR: brain, la búsqueda semántica y la caché
    // semántica no se pueden migrar aquí.
    //
    // SE PROBÓ bajar a 0.3.16: pgvector funciona (con hnsw e ivfflat) y la
    // cadena de migraciones aplica ENTERA. Pero la bajada desplaza la
    // resolución de tipos de drizzle en el monorepo y produce **100 errores
    // de TypeScript** en la capa de consultas (query, translator, brain).
    // El coste supera al beneficio, así que se revirtió.
    //
    // Para recuperarlo hay dos caminos, ninguno gratis: esperar a que PGlite
    // reponga el módulo, o alinear drizzle-orm en todo el monorepo y absorber
    // esos 100 errores de una vez.
    const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
    const client = await PGlite.create({ dataDir, extensions: { pg_trgm } });

    const { buildMergedSchema } = await import("../lib/schema-merger");
    _mergedSchema = await buildMergedSchema();

    // El driver de PGlite expone la misma API de Drizzle que node-postgres;
    // el cast mantiene un único tipo `db` en todo el código.
    return drizzlePglite(client, {
      schema: _mergedSchema as Record<string, unknown>,
    }) as unknown as NodePgDatabase<any>;
  }

  // --- Normal path (dev / prod) ---
  // Tamaño y esperas por entorno (DB_POOL_*); un pool agotado responde 503 +
  // Retry-After en vez de 500 (ver lib/pool-agotado.ts).
  //
  // La transacción RLS de cada petición es PEREZOSA (`conTransaccionesPerezosas`):
  // no pide conexión hasta la primera consulta, así que una ruta que llama
  // fuera antes de tocar la base, o que no la toca, no retiene ninguna.
  const pool = conTransaccionesPerezosas(
    vigilarPool(
      new Pool({
        connectionString,
        ...configuracionDelPool(),
      })
    )
  );
  _pool = pool;

  const { buildMergedSchema } = await import("../lib/schema-merger");
  console.log("📋 Building merged schema...");
  _mergedSchema = await buildMergedSchema();
  return drizzle(pool, { schema: _mergedSchema as Record<string, unknown> });
}

/**
 * Lazily initialize the database singleton.
 * This avoids re-initialization when multiple test files import `../db`.
 */
async function getDbInstance(): Promise<NodePgDatabase<any>> {
  if (!_dbInstance) {
    _dbInstance = await initDb();
  }
  return _dbInstance;
}

export const db = await getDbInstance();
export const mergedSchema = _mergedSchema ?? coreSchema;

export type Database = typeof db;

// Type for database transactions
// @ts-ignore - NodePgTransaction type arguments vary by drizzle-orm version
export type DatabaseTransaction = NodePgTransaction<
  NodePgQueryResultHKT,
  Record<string, unknown>,
  ExtractTablesWithRelations<Record<string, unknown>>
>;
