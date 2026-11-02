/**
 * brain_notes con pgvector (migración 0045).
 *
 * El trigger de 0024 hacía `NEW.embedding::VECTOR(384)` y Postgres no tiene
 * cast de jsonb a vector: con pgvector TODO insert en brain_notes fallaba,
 * incluso sin embedding. Sin pgvector (o con pg-mem) este fichero no comprueba
 * nada: el fallo solo existe con la extensión y la columna `embedding_vector`.
 */
import { describe, it, expect, afterAll } from "bun:test";
import { sql } from "drizzle-orm";

import { db } from "../db";

import { isDatabaseAvailable } from "./setup";

type Fila = Record<string, unknown>;
const filas = (r: unknown) => ((r as { rows?: Fila[] }).rows ?? []) as Fila[];

async function hayPgvector(): Promise<boolean> {
  if (!(await isDatabaseAvailable())) return false;
  const r = await db.execute(sql`
    SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')
       AND EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'brain_notes' AND column_name = 'embedding_vector') AS si
  `);
  return filas(r)[0]?.si === true;
}

const conPgvector = await hayPgvector();
const PREFIJO = `pgvector-0045-${Date.now()}`;

describe("brain_notes con pgvector", () => {
  afterAll(async () => {
    if (conPgvector) await db.execute(sql`DELETE FROM brain_notes WHERE title LIKE ${PREFIJO + "%"}`);
  });

  it.skipIf(!conPgvector)("un insert sin embedding funciona y deja embedding_vector a NULL", async () => {
    const r = await db.execute(sql`
      INSERT INTO brain_notes (title, content) VALUES (${PREFIJO + "-vacia"}, 'x')
      RETURNING embedding_vector IS NULL AS nulo
    `);
    expect(filas(r)[0]?.nulo).toBe(true);
  });

  it.skipIf(!conPgvector)("un embedding de 384 dimensiones se copia a embedding_vector", async () => {
    const embedding = JSON.stringify(Array.from({ length: 384 }, (_, i) => i / 384));
    const r = await db.execute(sql`
      INSERT INTO brain_notes (title, content, embedding)
      VALUES (${PREFIJO + "-384"}, 'x', ${embedding}::jsonb)
      RETURNING vector_dims(embedding_vector) AS dims
    `);
    expect(Number(filas(r)[0]?.dims)).toBe(384);
  });

  it.skipIf(!conPgvector)("un embedding de otra dimensión no tumba la escritura", async () => {
    const r = await db.execute(sql`
      INSERT INTO brain_notes (title, content, embedding)
      VALUES (${PREFIJO + "-3"}, 'x', '[1,2,3]'::jsonb)
      RETURNING embedding_vector IS NULL AS nulo
    `);
    expect(filas(r)[0]?.nulo).toBe(true);
  });
});
