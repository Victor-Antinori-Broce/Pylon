/**
 * kon-notas — a kon made only of models (test-only demo, docs/agents/models.md).
 *
 * `defineKonDeModelos` is `defineKonSdk` with the operations of its models:
 * the module-loader would mount it like any SDK kon (RLS transaction per
 * request, idempotency, problem+json, OpenAPI, MCP tools).
 */
import { defineKonDeModelos } from "@kitsuden/engine";

import { category, note } from "./notas.modelo";

export const kon = defineKonDeModelos({
  id: "kon-notas",
  name: "Notes (defineModelo demo)",
  version: "0.1.0",
  description: "Two models declared once: personal notes and shared categories.",
  mountPath: "/api/notas",
  modelos: [note, category],
});

export default kon;
