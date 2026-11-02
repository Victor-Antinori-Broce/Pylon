/**
 * Kitsuden — Embeddings de los modelos con búsqueda semántica (kitsuden2.md D5)
 * ============================================================================
 *
 * El host conecta dos cosas a la costura del engine (engine/src/semantica.ts):
 *
 *   1. El PROVEEDOR: `services/embeddings.ts` (por prioridad: un servicio
 *      local compatible con OpenAI en `EMBEDDINGS_URL`, OpenAI, Ollama; sin
 *      ninguno, un vector determinista de pruebas que NO sirve para buscar de
 *      verdad, con aviso).
 *   2. El WORKER de la cola `kitsuden-embeddings`: lee los campos de texto de
 *      la fila, calcula su embedding y lo guarda en la columna `embedding`.
 *      Con la conexión del SISTEMA y FUERA de la transacción del trabajo: el
 *      trabajo ya se autorizó al encolarlo, la fila puede ser de otro dueño, y
 *      la llamada al proveedor no debe retener una transacción abierta (regla
 *      3 de kon-transactions.md). Idempotente: recalcular da lo mismo.
 */

import { sql } from "drizzle-orm";

import { ErrorPermanente, queue, type TrabajoDeCola } from "../../../../packages/engine/src/cola";
import { segundoPlano } from "../../../../packages/engine/src/rls-peticion";
import {
  COLA_DE_EMBEDDINGS,
  configurarEmbeddings,
  literalDeVector,
  type TrabajoDeEmbedding,
} from "../../../../packages/engine/src/semantica";
import { db } from "../db";
import { generateEmbedding } from "../services/embeddings";

const IDENTIFICADOR = /^[a-z_][a-z0-9_]{0,62}$/;
const q = (id: string) => `"${id}"`;

/** Conecta el proveedor de embeddings del host (al arrancar, haya o no worker). */
export function configurarEmbeddingsDeModelos(): void {
  configurarEmbeddings((texto, dimensiones) => generateEmbedding(texto, { dimensions: dimensiones }));
}

export async function calcularEmbeddingDeFila(trabajo: TrabajoDeCola): Promise<void> {
  const t = trabajo.payload as TrabajoDeEmbedding;
  if (
    !t?.id ||
    !IDENTIFICADOR.test(t.tabla ?? "") ||
    !Array.isArray(t.columnas) ||
    t.columnas.length === 0 ||
    !t.columnas.every((c) => IDENTIFICADOR.test(c))
  ) {
    throw new ErrorPermanente("trabajo de embedding mal formado");
  }
  const tabla = sql.raw(q(t.tabla));
  const texto = sql.raw(`concat_ws(' ', ${t.columnas.map(q).join(", ")})`);
  // Request-scope vacío: nada resuelve a la transacción del trabajo.
  await segundoPlano(async () => {
    const r = (await db.execute(sql`SELECT ${texto} AS texto FROM ${tabla} WHERE id = ${t.id}::uuid`)) as {
      rows: Array<{ texto: string | null }>;
    };
    const fila = r.rows[0];
    if (!fila) return; // borrada mientras esperaba: nada que hacer
    const contenido = (fila.texto ?? "").trim();
    const valor = contenido
      ? sql`${literalDeVector(await generateEmbedding(contenido.slice(0, 8000), { dimensions: t.dimensiones }))}::vector`
      : sql`NULL`;
    await db.execute(sql`UPDATE ${tabla} SET "embedding" = ${valor} WHERE id = ${t.id}::uuid`);
  });
}

/** Registra el manejador de la cola de embeddings (lo llama el arranque del worker). */
export function registrarEmbeddingsDeModelos(): void {
  queue.handle(COLA_DE_EMBEDDINGS, calcularEmbeddingDeFila, { concurrencia: 2 });
}
