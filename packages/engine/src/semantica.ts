/**
 * Kitsuden — Búsqueda semántica de los modelos (kitsuden2.md D5)
 * ============================================================================
 *
 * `defineModelo({ …, semantica: { campos: ["title", "content"] } })`:
 *
 *   · Al crear o actualizar una fila, `operacionesDeModelo` encola en la cola
 *     de Postgres (`kitsuden-embeddings`, en la MISMA transacción) el cálculo
 *     de su embedding. El host lo calcula y lo guarda en la columna
 *     `embedding vector(N)` que `makemigrations` añadió.
 *   · `search-<plural>` (`GET /<plural>/search?q=`) calcula el embedding de la
 *     consulta y ordena por distancia coseno, con el mismo filtro de dueño y
 *     la misma RLS que listar.
 *
 * El embedding lo da el host (`configurarEmbeddings`): OpenAI, Ollama o un
 * servicio local de embeddings compatible con OpenAI (`EMBEDDINGS_URL`). El
 * engine no sabe cuál; solo pide un vector de N dimensiones.
 */

import { AppError, ErrorCode } from "./errors";

export const COLA_DE_EMBEDDINGS = "kitsuden-embeddings";

export type Embebedor = (texto: string, dimensiones: number) => Promise<number[]>;

let embebedor: Embebedor | null = null;

/** El host conecta su proveedor de embeddings (una vez, al arrancar). */
export function configurarEmbeddings(fn: Embebedor | null): void {
  embebedor = fn;
}

/** El embedding de un texto. 503 si el host no configuró ningún proveedor. */
export async function embeber(texto: string, dimensiones: number): Promise<number[]> {
  if (!embebedor) {
    throw new AppError(ErrorCode.INTERNAL, "Semantic search is not configured on this server", {
      status: 503,
      expose: true,
    });
  }
  const v = await embebedor(texto, dimensiones);
  if (!Array.isArray(v) || v.length !== dimensiones || v.some((x) => !Number.isFinite(x))) {
    throw new Error(`El proveedor de embeddings devolvió ${Array.isArray(v) ? v.length : "algo que no es un vector"}; se esperaban ${dimensiones} dimensiones`);
  }
  return v;
}

/** Un vector como literal de pgvector (`[0.1,0.2,…]`). */
export function literalDeVector(v: number[]): string {
  return `[${v.map((x) => Number(x).toString()).join(",")}]`;
}

/** Lo que viaja en el trabajo de la cola. */
export interface TrabajoDeEmbedding {
  tabla: string;
  id: string;
  columnas: string[];
  dimensiones: number;
}
