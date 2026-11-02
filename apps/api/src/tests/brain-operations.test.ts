/**
 * Second Brain — Operations integration tests (requires real PostgreSQL)
 * ============================================================================
 *
 * Ejercen el pipeline determinista end-to-end contra la base de datos:
 * capture (Layer 1 → Layer 2), dedup de fuentes, sync idempotente y lint.
 * Usa el autor `instruction` (offline, determinista) → sin red.
 *
 * Se salta con pg-mem. Levantar con:
 *   pnpm test:db:up && KITSUDEN_TEST_DB=postgres bun test src/tests/brain-operations.test.ts
 */

import { capture, captureSource, lint, syncBrain, createInstructionAuthor } from "@kitsuden/engine";
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";

import { db } from "../db";

import { isDatabaseAvailable, generateTestId } from "./setup";

let dbAvailable = false;

// Con pgvector, el trigger de 0024 rompía todo INSERT en brain_notes; lo
// arregla la migración 0045. Estos tests corren igual con o sin pgvector.
const itNotas = it;
const RUN = `brainop-${generateTestId()}`;
const author = createInstructionAuthor();

async function cleanup() {
  // Borra notas/fuentes creadas por esta corrida (por título único).
  await db.execute(
    sql`DELETE FROM brain_connections WHERE source_note_id IN
        (SELECT id FROM brain_notes WHERE title LIKE ${`${RUN}%`})
        OR target_note_id IN (SELECT id FROM brain_notes WHERE title LIKE ${`${RUN}%`})`
  );
  await db.execute(sql`DELETE FROM brain_notes WHERE title LIKE ${`${RUN}%`}`);
  await db.execute(sql`DELETE FROM brain_sources WHERE title LIKE ${`${RUN}%`}`);
}

describe("Second Brain — Operations (integración)", () => {
  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (dbAvailable) await cleanup();
  });

  afterAll(async () => {
    if (dbAvailable) await cleanup();
  });

  it("captureSource es idempotente por hash de contenido", async () => {
    if (!dbAvailable) return;
    const input = {
      title: `${RUN}-src`,
      content: "El RLS de PostgreSQL aisla datos por owner. TOON ahorra tokens.",
    };
    const first = await captureSource(db, input);
    const second = await captureSource(db, input);
    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
    expect(second.source.id).toBe(first.source.id);
  });

  itNotas("capture deriva una página de wiki desde una fuente (Layer 1 → Layer 2)", async () => {
    if (!dbAvailable) return;
    const result = await capture(
      db,
      {
        title: `${RUN}-toon`,
        content:
          "TOON declara las claves de un array una vez y lista filas CSV. " +
          "Reduce el consumo de tokens en respuestas de LLM. Es determinista.",
      },
      author
    );
    expect(result.sourceId).toBeDefined();
    expect(result.noteId).toBeDefined();
    expect(result.authoredBy).toBe("instruction");
    expect(result.pendingAgent).toBe(true);

    // La nota existe y referencia su fuente.
    const rows = await db.execute<{ metadata: any; content: string }>(
      sql`SELECT metadata, content FROM brain_notes WHERE id = ${result.noteId}`
    );
    const note = rows.rows?.[0];
    expect(note?.metadata?.sourceId).toBe(result.sourceId);
    expect(note?.content).toContain("AGENT-TASK");
  });

  it("sync es idempotente: no recrea páginas ya al día", async () => {
    if (!dbAvailable) return;
    // Ya capturamos 2 fuentes arriba; sync no debería crear nuevas.
    const first = await syncBrain(db, { author });
    const second = await syncBrain(db, { author });
    // En la segunda pasada, todo lo de esta corrida está al día.
    expect(second.notesCreated).toBeLessThanOrEqual(first.notesCreated);
    expect(second.sourcesTotal).toBe(first.sourcesTotal);
  });

  itNotas("lint detecta páginas pendientes (pendingAgent) de forma determinista", async () => {
    if (!dbAvailable) return;
    const report = await lint(db);
    // La página derivada con instruction author quedó con AGENT-TASK → stale.
    const staleTitles = report.staleNotes.map((n) => n.title);
    expect(staleTitles.some((t) => t.startsWith(RUN))).toBe(true);
  });

  itNotas("lint detecta backlinks rotos", async () => {
    if (!dbAvailable) return;
    // Insertamos una nota con un backlink a un título inexistente.
    await db.execute(sql`
      INSERT INTO brain_notes (title, content, source, category)
      VALUES (${`${RUN}-broken`}, ${"Ver [[Titulo Inexistente XYZ]] para más."}, 'user', 'general')
    `);
    const report = await lint(db);
    const broken = report.brokenLinks.find((b) => b.title === `${RUN}-broken`);
    expect(broken).toBeDefined();
    expect(broken?.target).toBe("Titulo Inexistente XYZ");
  });
});
