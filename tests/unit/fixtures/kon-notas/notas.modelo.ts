/**
 * The demo models (test-only kon `kon-notas`, docs/agents/models.md).
 *
 * Declared ONCE. `kitsuden makemigrations --dir tests/unit/fixtures/kon-notas`
 * wrote migrations/0000_models.sql and migrations/modelos.snapshot.json from
 * this file; tests/unit/modelos-*.test.ts mount the kon on PGlite with that SQL.
 */
import { campo, defineModelo } from "@kitsuden/shared";

/** Personal notes: each account reads and writes its own. */
export const note = defineModelo({
  nombre: "note",
  etiqueta: "Note",
  descripcion: "A personal note. Each account sees only its own.",
  campos: {
    title: campo.texto({ max: 200, requerido: true, etiqueta: "Title" }),
    body: campo.textoLargo({ etiqueta: "Body" }),
    status: campo.enumerado(["draft", "published"], { requerido: true, porDefecto: "draft", etiqueta: "Status" }),
    priority: campo.entero({ min: 0, max: 5, requerido: true, porDefecto: 0, etiqueta: "Priority" }),
    pinned: campo.booleano({ requerido: true, porDefecto: false, etiqueta: "Pinned" }),
    dueAt: campo.fecha({ etiqueta: "Due" }),
    slug: campo.texto({ max: 80, unico: true, etiqueta: "Slug" }),
    meta: campo.json({ etiqueta: "Metadata" }),
  },
  acceso: { leer: "dueno", escribir: "dueno" },
});

/** Shared categories: anyone reads, only staff writes. */
export const category = defineModelo({
  nombre: "category",
  plural: "categories",
  etiqueta: "Category",
  descripcion: "A shared category that anyone can read and only staff can change.",
  campos: {
    name: campo.texto({ max: 80, requerido: true, unico: true, etiqueta: "Name" }),
    color: campo.texto({ max: 20, etiqueta: "Color" }),
  },
  acceso: { leer: "publico", escribir: "staff" },
});
