/**
 * ============================================================================
 * ENLACES POLIMÓRFICOS ENTRE ENTIDADES
 * ============================================================================
 *
 * La arista que faltaba entre kons. Hasta ahora todas las relaciones eran
 * claves foráneas DENTRO de un kon, así que un contacto del CRM, un jugador de
 * esports y un miembro eran tres filas sin forma de decir "son la misma
 * persona".
 *
 * ── LA REGLA QUE SIGUE ESTE MÓDULO ─────────────────────────────────────────
 *
 * Integración por FORMA, no por import — el patrón que ya inventaste en
 * `kon-members`, donde `grantFromSubscription` acepta un `SubscriptionLike` en
 * vez de importar `kon-payments`.
 *
 * Aquí eso significa que el motor nunca conoce una tabla concreta. Un enlace
 * es un par `{ type, id }` de texto libre, y resolverlo a filas reales lo hace
 * QUIEN LAS TIENE, pasando sus propios cargadores. Así `kon-ecommerce` puede
 * enlazar un pedido a un contacto sin depender de `kon-crm`, y funcionar igual
 * si el CRM no está instalado.
 *
 * ── POR QUÉ SE LEEN LOS DOS SENTIDOS ───────────────────────────────────────
 *
 * `same_person` no tiene dirección. Si al leer solo se mirara `from`, quien
 * guardó la arista al revés obtendría cero resultados sin ningún error — el
 * peor tipo de fallo. `neighbors()` consulta ambos lados y devuelve siempre
 * "el otro extremo", así que quien escribe no tiene que acordarse del sentido.
 *
 * ── HUÉRFANOS ──────────────────────────────────────────────────────────────
 *
 * No hay claves foráneas: Postgres no puede apuntar a un destino cuyo tipo se
 * decide en tiempo de ejecución. Borrar una fila deja sus aristas colgando.
 *
 * Se toleran y se filtran al resolver: si el cargador no devuelve la fila, el
 * vecino desaparece del resultado. Se prefirió esto a poner triggers en cada
 * tabla, porque un trigger olvidado al crear una tabla nueva es una fuga
 * silenciosa, y una arista huérfana solo es basura. Los kons que quieran ser
 * limpios llaman a `unlinkAll()` al borrar.
 */

import { sql } from "drizzle-orm";

import { resolveExecutor } from "./request-scope";

/** Referencia a una fila de cualquier tabla del sistema. */
export interface EntityRef {
  /** Nombre lógico del tipo. Por convención, el de la tabla: `crm_contacts`. */
  type: string;
  id: string;
}

export interface LinkRow extends EntityRef {
  /** Qué significa la arista respecto a la entidad consultada. */
  relation: string;
  metadata: Record<string, unknown>;
  linkId: string;
  createdAt: Date;
}

export interface LinkOptions {
  relation?: string;
  metadata?: Record<string, unknown>;
  /** Dueño, para el aislamiento por RLS. Sin él, el enlace es del sistema. */
  ownerId?: string | null;
  createdBy?: string | null;
}

export interface NeighborQuery {
  /** Filtra por significado de la arista. */
  relation?: string;
  /** Filtra por tipo del otro extremo. */
  type?: string;
  limit?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Executor = { execute: (q: any) => Promise<any> };

function filas<T>(res: unknown): T[] {
  return (Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])) as T[];
}

function exigirRef(r: EntityRef, cual: string): void {
  if (!r?.type || !r?.id) {
    throw new Error(`links: ${cual} necesita { type, id } y llegó ${JSON.stringify(r)}`);
  }
}

/**
 * Crea una arista. Idempotente: repetir la misma no crea duplicados.
 *
 * La unicidad la garantiza un índice, no una comprobación previa — entre el
 * SELECT y el INSERT cabe otra petición, y dos aristas iguales duplican
 * resultados en toda lectura posterior.
 */
export async function link(
  from: EntityRef,
  to: EntityRef,
  options: LinkOptions = {},
  db?: Executor
): Promise<void> {
  exigirRef(from, "from");
  exigirRef(to, "to");

  if (from.type === to.type && from.id === to.id) {
    throw new Error("links: una entidad no puede enlazarse consigo misma");
  }

  const ex = db ?? resolveExecutor<Executor>(undefined as unknown as Executor);
  const relation = options.relation ?? "related";

  await ex.execute(sql`
    INSERT INTO kitsuden_links (from_type, from_id, to_type, to_id, relation, metadata, owner_id, created_by)
    VALUES (${from.type}, ${from.id}, ${to.type}, ${to.id}, ${relation},
            ${JSON.stringify(options.metadata ?? {})}::jsonb,
            ${options.ownerId ?? null}, ${options.createdBy ?? null})
    ON CONFLICT (from_type, from_id, to_type, to_id, relation) DO NOTHING
  `);
}

/** Borra una arista concreta, en cualquiera de los dos sentidos. */
export async function unlink(
  a: EntityRef,
  b: EntityRef,
  relation?: string,
  db?: Executor
): Promise<void> {
  exigirRef(a, "a");
  exigirRef(b, "b");
  const ex = db ?? resolveExecutor<Executor>(undefined as unknown as Executor);

  await ex.execute(sql`
    DELETE FROM kitsuden_links
    WHERE (
      (from_type = ${a.type} AND from_id = ${a.id} AND to_type = ${b.type} AND to_id = ${b.id})
      OR
      (from_type = ${b.type} AND from_id = ${b.id} AND to_type = ${a.type} AND to_id = ${a.id})
    )
    ${relation ? sql`AND relation = ${relation}` : sql``}
  `);
}

/**
 * Borra TODAS las aristas de una entidad, en ambos sentidos.
 *
 * Es lo que un kon debe llamar al borrar una fila si no quiere dejar huérfanos.
 * No es obligatorio —el sistema los tolera— pero es barato y evita que la tabla
 * crezca con basura.
 */
export async function unlinkAll(entity: EntityRef, db?: Executor): Promise<void> {
  exigirRef(entity, "entity");
  const ex = db ?? resolveExecutor<Executor>(undefined as unknown as Executor);

  await ex.execute(sql`
    DELETE FROM kitsuden_links
    WHERE (from_type = ${entity.type} AND from_id = ${entity.id})
       OR (to_type = ${entity.type} AND to_id = ${entity.id})
  `);
}

/**
 * Vecinos de una entidad, mirando los DOS sentidos y devolviendo siempre el
 * otro extremo.
 *
 * Quien guardó la arista no tiene que acordarse de en qué dirección lo hizo.
 */
export async function neighbors(
  entity: EntityRef,
  query: NeighborQuery = {},
  db?: Executor
): Promise<LinkRow[]> {
  exigirRef(entity, "entity");
  const ex = db ?? resolveExecutor<Executor>(undefined as unknown as Executor);

  // El CASE invierte cada fila para que el resultado sea homogéneo: siempre
  // "lo que hay al otro lado", venga guardado como venga.
  const res = await ex.execute(sql`
    SELECT
      id AS "linkId",
      CASE WHEN from_type = ${entity.type} AND from_id = ${entity.id}
           THEN to_type ELSE from_type END AS "type",
      CASE WHEN from_type = ${entity.type} AND from_id = ${entity.id}
           THEN to_id ELSE from_id END AS "id",
      relation,
      metadata,
      created_at AS "createdAt"
    FROM kitsuden_links
    WHERE (
      (from_type = ${entity.type} AND from_id = ${entity.id})
      OR (to_type = ${entity.type} AND to_id = ${entity.id})
    )
    ${query.relation ? sql`AND relation = ${query.relation}` : sql``}
    ORDER BY created_at DESC
    LIMIT ${query.limit ?? 500}
  `);

  const todos = filas<LinkRow>(res);
  // El filtro por tipo va después del CASE: en SQL habría que repetir la
  // condición para los dos sentidos y se vuelve ilegible por un ahorro nulo a
  // estas cardinalidades.
  return query.type ? todos.filter((l) => l.type === query.type) : todos;
}

/**
 * Resuelve vecinos a filas reales usando cargadores que aporta quien llama.
 *
 * El motor NO conoce ninguna tabla: recibe un cargador por tipo. Un tipo sin
 * cargador se omite —es un kon que no está instalado, no un error— y una fila
 * que el cargador no devuelve desaparece, que es como se filtran los huérfanos
 * y como el RLS de la tabla destino sigue mandando: si no puedes verla, el
 * cargador no te la da.
 */
export async function resolveNeighbors<T>(
  vecinos: LinkRow[],
  cargadores: Record<string, (ids: string[]) => Promise<Array<{ id: string } & T>>>
): Promise<Array<LinkRow & { entity: T }>> {
  const porTipo = new Map<string, string[]>();
  for (const v of vecinos) {
    if (!cargadores[v.type]) continue;
    porTipo.set(v.type, [...(porTipo.get(v.type) ?? []), v.id]);
  }

  const cargado = new Map<string, Map<string, T>>();
  await Promise.all(
    [...porTipo.entries()].map(async ([tipo, ids]) => {
      const rows = await cargadores[tipo](ids);
      cargado.set(tipo, new Map(rows.map((r) => [String(r.id), r as unknown as T])));
    })
  );

  const salida: Array<LinkRow & { entity: T }> = [];
  for (const v of vecinos) {
    const entity = cargado.get(v.type)?.get(v.id);
    if (entity === undefined) continue; // huérfano, o sin permiso para verla
    salida.push({ ...v, entity });
  }
  return salida;
}
