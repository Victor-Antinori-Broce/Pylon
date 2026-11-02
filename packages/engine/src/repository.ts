/**
 * Kitsuden — Repository: Drizzle con azúcar chainable
 * ============================================================================
 *
 * La DECISIÓN de ORM: no imitamos Django (QuerySet mágico) ni Laravel (Active
 * Record acoplado). Drizzle es la base (data-mapper, type-safe, sin magia); esto
 * es solo azúcar de DX chainable encima — la ergonomía de un QuerySet sin
 * sacrificar el modelo limpio ni la seguridad.
 *
 * SEGURO POR DEFECTO: el repositorio ejecuta sobre el executor que le pasas. Si
 * le pasas el `tx` de withTransactionalRLS (c.get("tx")), TODAS las queries
 * respetan RLS de PostgreSQL. No hay un camino que "salte" la seguridad.
 *
 *   // Dentro de una ruta con RLS transaccional:
 *   const posts = await repo(blogPosts, { db: c.get("tx") })
 *     .filter({ status: "published" })
 *     .orderBy("-createdAt")
 *     .page(1, 20)
 *     .all();
 *
 *   const post = await repo(blogPosts).find(id);
 *   const { docs, total, pages } = await repo(blogPosts).paginate(2, 20);
 *   await repo(blogPosts, { db: tx }).create({ title: "Hola", ... });
 */

import { and, asc, desc, eq, getTableName, sql, type SQL } from "drizzle-orm";

import { db as defaultDb } from "../../../apps/api/src/db";

import { comprobarBloqueo, type BloqueoAnotado } from "./caja-de-cristal";
import { resolveExecutor } from "./request-scope";

// Executor = db o tx de Drizzle (misma API de query builder).
type Executor = typeof defaultDb;

/**
 * Constraint ESTRUCTURAL (no la marca `PgTable`): evita la fricción de doble
 * versión de drizzle en el monorepo (un kon y el engine pueden resolver copias
 * distintas de `PgTable`; el tipo estructural las trata igual y conserva la
 * inferencia de tipos vía $inferSelect/$inferInsert).
 */
type TableLike = {
  $inferSelect: Record<string, unknown>;
  $inferInsert: Record<string, unknown>;
};

type InferSelect<T extends TableLike> = T["$inferSelect"];
type InferInsert<T extends TableLike> = T["$inferInsert"];

/** Campo de orden: "createdAt" (asc) o "-createdAt" (desc). */
type OrderField<T extends TableLike> = keyof InferSelect<T> | `-${string & keyof InferSelect<T>}`;

export interface PaginatedResult<R> {
  docs: R[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface RepositoryOptions {
  /** Executor: pasa el `tx` de RLS para queries seguras. Default: db global. */
  db?: Executor;
}

class Repository<T extends TableLike> {
  private conditions: SQL[] = [];
  private orderings: SQL[] = [];
  private _limit?: number;
  private _offset?: number;
  /** El `id` por el que se filtró, si se filtró por él (para la caja de cristal). */
  private idFiltrado?: unknown;

  constructor(
    private readonly table: T,
    private readonly executor: Executor
  ) {}

  private col(name: string): unknown {
    return (this.table as unknown as Record<string, unknown>)[name];
  }

  // ── Filtros (chainable) ──────────────────────────────────────────────────

  /** Filtro estilo Django: igualdad por cada campo (AND). */
  filter(match: Partial<InferSelect<T>>): this {
    for (const [key, value] of Object.entries(match)) {
      this.conditions.push(eq(this.col(key) as never, value as never));
      if (key === "id") this.idFiltrado = value;
    }
    return this;
  }

  /** Condición Drizzle cruda (para operadores avanzados: gt, like, inArray…). */
  where(condition: SQL): this {
    this.conditions.push(condition);
    return this;
  }

  orderBy(...fields: OrderField<T>[]): this {
    for (const f of fields) {
      const desc_ = typeof f === "string" && f.startsWith("-");
      const name = desc_ ? (f as string).slice(1) : (f as string);
      this.orderings.push((desc_ ? desc : asc)(this.col(name) as never));
    }
    return this;
  }

  limit(n: number): this {
    this._limit = n;
    return this;
  }

  offset(n: number): this {
    this._offset = n;
    return this;
  }

  /** Paginación conveniente: setea limit/offset a partir de page (1-based). */
  page(page: number, pageSize = 20): this {
    this._limit = pageSize;
    this._offset = (Math.max(1, page) - 1) * pageSize;
    return this;
  }

  private whereClause(): SQL | undefined {
    if (this.conditions.length === 0) return undefined;
    return this.conditions.length === 1 ? this.conditions[0] : and(...this.conditions);
  }

  // ── Ejecución (terminales) ───────────────────────────────────────────────

  async all(): Promise<InferSelect<T>[]> {
    let q = this.executor.select().from(this.table as never) as any;
    const where = this.whereClause();
    if (where) q = q.where(where);
    if (this.orderings.length) q = q.orderBy(...this.orderings);
    if (this._limit !== undefined) q = q.limit(this._limit);
    if (this._offset !== undefined) q = q.offset(this._offset);
    return (await q) as InferSelect<T>[];
  }

  async first(): Promise<InferSelect<T> | null> {
    this._limit = 1;
    const rows = await this.all();
    return rows[0] ?? null;
  }

  /**
   * Busca por primary key `id`.
   *
   * ── UN ID IMPOSIBLE ES «NO EXISTE», NO UN ERROR DEL SERVIDOR ──────────────
   *
   * Si la columna es `uuid` y llega algo que no lo es —`"null"`, `"undefined"`,
   * un slug, un id de otra tabla—, Postgres no devuelve cero filas: lanza
   *
   *     invalid input syntax for type uuid: "null"        (SQLSTATE 22P02)
   *
   * y el manejador de errores lo convierte en un **500**. Medido en la
   * instalación real: el panel de MOBA llamaba a
   * `POST /games/null/ingest/start` cuando no había partida seleccionada, y la
   * pantalla enseñaba «HTTP 500» — como si el servidor estuviera roto, cuando
   * lo único que pasaba es que el id no podía existir.
   *
   * ── POR QUE SE ARREGLA AQUI Y NO EN CADA RUTA ────────────────────────────
   *
   * Porque son ~240 rutas con `:id` repartidas en 24 ficheros de kons, y una
   * sola las validaba. Pedirle a cada una que compruebe el formato antes de
   * consultar es pedir que 240 sitios se acuerden de lo mismo; el que se olvide
   * —que es el caso general— devuelve un 500 por una URL mal escrita.
   *
   * ── POR QUE SE CAPTURA EL ERROR EN VEZ DE VALIDAR ANTES ──────────────────
   *
   * Porque NO todas las claves primarias son uuid: `builder_definitions.id` es
   * `TEXT`, y rechazar ahí lo que no parezca un uuid rompería un kon entero.
   * Capturar `22P02` es exacto: solo salta cuando la columna de verdad exige un
   * uuid y el valor de verdad no puede serlo. En ese caso, ninguna fila puede
   * coincidir — así que `null` no es una suposición, es la respuesta.
   *
   * Cualquier otro error se propaga: un fallo de conexión o de permisos NO
   * puede disfrazarse de «no encontrado».
   */
  async find(id: string | number): Promise<InferSelect<T> | null> {
    try {
      return await this.filter({ id } as Partial<InferSelect<T>>).first();
    } catch (e: unknown) {
      if (esSintaxisDeEntradaInvalida(e)) return null;
      throw e;
    }
  }

  async count(): Promise<number> {
    let q = this.executor
      .select({ c: sql<number>`count(*)::int` })
      .from(this.table as never) as any;
    const where = this.whereClause();
    if (where) q = q.where(where);
    const [row] = (await q) as { c: number }[];
    return row?.c ?? 0;
  }

  async exists(): Promise<boolean> {
    return (await this.count()) > 0;
  }

  /** Devuelve página + metadata (docs, total, pages, hasNext…). */
  async paginate(page = 1, pageSize = 20): Promise<PaginatedResult<InferSelect<T>>> {
    const total = await this.count();
    const docs = await this.page(page, pageSize).all();
    const pages = Math.max(1, Math.ceil(total / pageSize));
    return {
      docs,
      total,
      page,
      pageSize,
      pages,
      hasNext: page < pages,
      hasPrev: page > 1,
    };
  }

  // ── Mutaciones ────────────────────────────────────────────────────────────

  async create(data: InferInsert<T>): Promise<InferSelect<T>> {
    const [row] = (await (this.executor.insert(this.table as never) as any)
      .values(data)
      .returning()) as InferSelect<T>[];
    return row;
  }

  async createMany(data: InferInsert<T>[]): Promise<InferSelect<T>[]> {
    if (data.length === 0) return [];
    return (await (this.executor.insert(this.table as never) as any)
      .values(data)
      .returning()) as InferSelect<T>[];
  }

  /** Actualiza las filas que matcheen los filtros acumulados. */
  async update(data: Partial<InferInsert<T>>): Promise<InferSelect<T>[]> {
    const where = this.whereClause();
    let q = (this.executor.update(this.table as never) as any).set(data);
    if (where) q = q.where(where);
    const filas = (await q.returning()) as InferSelect<T>[];
    if (filas.length === 0) await this.anotarSiBloqueado("update");
    return filas;
  }

  /** Borra las filas que matcheen los filtros acumulados. Devuelve el conteo. */
  async delete(): Promise<number> {
    const where = this.whereClause();
    let q = this.executor.delete(this.table as never) as any;
    if (where) q = q.where(where);
    const rows = (await q.returning()) as unknown[];
    if (rows.length === 0) await this.anotarSiBloqueado("delete");
    return rows.length;
  }

  /**
   * Una escritura por `id` que no tocó nada: ¿no existe, o el filtro de dueño
   * o la RLS la apartaron? Se mira como el sistema y va SOLO a la traza
   * (caja-de-cristal.ts); lo que la ruta responda no cambia.
   */
  private async anotarSiBloqueado(operacion: BloqueoAnotado["operacion"]): Promise<void> {
    const idCol = this.col("id");
    if (this.idFiltrado === undefined || !idCol) return;
    const id = this.idFiltrado;
    await comprobarBloqueo(getTableName(this.table as never), operacion, async () => {
      const r = (await (this.executor.select({ uno: sql`1` }) as any)
        .from(this.table as never)
        .where(eq(idCol as never, id as never))
        .limit(1)) as unknown[];
      return r.length > 0;
    });
  }
}

/**
 * Punto de entrada.
 *   - `repo(table)` dentro de un request con RLS transaccional → usa el `tx`
 *     del request-scope automáticamente (RLS aplicado, sin pasar nada).
 *   - `repo(table)` fuera de un request → usa la db global.
 *   - `repo(table, { db })` → fuerza un executor explícito (override).
 */
/**
 * ¿Es un «invalid input syntax» de Postgres (SQLSTATE 22P02)?
 *
 * El código real viaja en `cause`, no en `message`: Drizzle envuelve el error
 * en un `DrizzleQueryError` cuyo mensaje es «Failed query: …». Buscar la pista
 * solo en el mensaje de arriba no encuentra nada — es la misma lección que el
 * diagnóstico de las migraciones.
 */
/**
 * ¿Es «el id que me diste no tiene la forma de esta columna»?
 *
 * Se exporta porque el mismo caso aparece fuera del repositorio: cualquier ruta
 * que meta un parámetro de URL en una comparación contra una columna `uuid`
 * puede recibir «x» y provocar un 22P02, que sin capturar sale como 500. Una
 * URL mal escrita no es un fallo del servidor.
 */
export function esSintaxisDeEntradaInvalida(e: unknown): boolean {
  const codigos: unknown[] = [];
  let actual: unknown = e;

  // Se recorre la cadena de causas por si hay más de un envoltorio.
  for (let i = 0; i < 5 && actual; i++) {
    const err = actual as { code?: unknown; message?: unknown; cause?: unknown };
    codigos.push(err.code);
    if (typeof err.message === "string" && /invalid input syntax for type/i.test(err.message)) {
      return true;
    }
    actual = err.cause;
  }

  return codigos.includes("22P02");
}

export function repo<T extends TableLike>(
  table: T,
  options: RepositoryOptions = {}
): Repository<T> {
  const executor = options.db ?? resolveExecutor(defaultDb);
  return new Repository(table, executor);
}

export type { Repository };
