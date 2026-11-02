/**
 * KITSUDEN Brain — Layer 1: Sources (raw, immutable corpus)
 * ============================================================================
 *
 * Método Karpathy, capa 1: documentos crudos que la IA LEE pero NUNCA edita.
 * Todo lo que ingieres vive aquí sin tocarse; la wiki (Layer 2) es
 * interpretación derivada. Las fuentes son la verdad auditable.
 *
 * Determinismo:
 *   - El hash (SHA-256) del contenido identifica la fuente. Ingerir el mismo
 *     contenido dos veces es idempotente (devuelve la fuente existente).
 *   - No existe `updateSource` por diseño. Una fuente cambiada = fuente nueva.
 */

import { createHash } from "node:crypto";

import { desc, eq } from "drizzle-orm";

import { brainSources } from "../../../../apps/api/src/db/schema-core";

import type { BrainDb } from "./notes";

export type BrainSourceType = "url" | "file" | "text" | "note";

export interface BrainSourceInput {
  title: string;
  content: string;
  sourceType?: BrainSourceType;
  uri?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface BrainSource {
  id: string;
  title: string;
  content: string;
  contentHash: string;
  sourceType: string;
  uri: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
}

/** Hash determinista del contenido (SHA-256 hex). */
export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Ingesta una fuente cruda (idempotente por hash de contenido).
 * Si ya existe una fuente con el mismo contenido, la devuelve sin duplicar.
 */
export async function captureSource(
  db: BrainDb,
  input: BrainSourceInput
): Promise<{ source: BrainSource; deduped: boolean }> {
  const contentHash = hashContent(input.content);

  const existing = await db
    .select()
    .from(brainSources)
    .where(eq(brainSources.contentHash, contentHash))
    .limit(1);

  if (existing.length > 0) {
    return { source: existing[0] as BrainSource, deduped: true };
  }

  const [created] = await db
    .insert(brainSources)
    .values({
      title: input.title,
      content: input.content,
      contentHash,
      sourceType: input.sourceType ?? "text",
      uri: input.uri ?? null,
      tags: input.tags ?? [],
      metadata: input.metadata ?? {},
    })
    .returning();

  return { source: created as BrainSource, deduped: false };
}

/** Lista fuentes (más recientes primero). */
export async function listSources(db: BrainDb, limit = 100): Promise<BrainSource[]> {
  const rows = await db
    .select()
    .from(brainSources)
    .orderBy(desc(brainSources.createdAt))
    .limit(limit);
  return rows as BrainSource[];
}

/** Obtiene una fuente por id. */
export async function getSource(db: BrainDb, id: string): Promise<BrainSource | null> {
  const rows = await db.select().from(brainSources).where(eq(brainSources.id, id)).limit(1);
  return (rows[0] as BrainSource) ?? null;
}

/**
 * Borra una fuente. Es la ÚNICA mutación permitida sobre Layer 1 (no update):
 * o la fuente existe intacta, o se elimina por completo.
 */
export async function deleteSource(db: BrainDb, id: string): Promise<boolean> {
  const deleted = await db.delete(brainSources).where(eq(brainSources.id, id)).returning();
  return deleted.length > 0;
}
