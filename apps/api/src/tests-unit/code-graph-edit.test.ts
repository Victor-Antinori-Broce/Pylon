/**
 * Code Graph — Edición semántica (tests deterministas, sin disco ni red)
 * ============================================================================
 * Estas operaciones MODIFICAN código fuente, así que las tres garantías de
 * seguridad se prueban explícitamente:
 *   1. dry-run por defecto (nunca escribe sin `apply: true`)
 *   2. rechazo ante ambigüedad / colisión / referencias vivas
 *   3. verificación sintáctica antes de escribir (todo-o-nada)
 */

import {
  renameSymbol,
  replaceSymbolBody,
  safeDeleteSymbol,
  insertBeforeSymbol,
  buildSemanticIndex,
  semanticSearch,
  indexFiles,
  type SourceFileInput,
  type CodeEmbeddingProvider,
} from "@kitsuden/engine";
import { describe, expect, test } from "bun:test";

const FIXTURES: SourceFileInput[] = [
  {
    path: "src/mailer.ts",
    content: [
      `export function sendMail(to: string): void {`,
      `  formatAddress(to);`,
      `}`,
      ``,
      `function formatAddress(raw: string): string {`,
      `  return raw.trim();`,
      `}`,
      ``,
      `// "sendMail" en un comentario NO debe renombrarse`,
      `const NOTE = "call sendMail here";`,
      ``,
      `export function unusedHelper(): number {`,
      `  return 42;`,
      `}`,
    ].join("\n"),
  },
  {
    path: "src/notify.ts",
    content: [
      `import { sendMail } from "./mailer";`,
      ``,
      `export function notify(to: string) {`,
      `  sendMail(to);`,
      `}`,
    ].join("\n"),
  },
];

describe("renameSymbol", () => {
  test("renombra la declaración y todas sus referencias (dry-run)", async () => {
    const r = await renameSymbol(FIXTURES, "sendMail", "dispatchMail");
    expect(r.ok).toBe(true);
    expect(r.applied).toBe(false); // dry-run por defecto
    expect(r.edits.length).toBe(2); // mailer + notify

    const mailer = r.edits.find((e) => e.path === "src/mailer.ts")!;
    expect(mailer.content).toContain("export function dispatchMail");
    const notify = r.edits.find((e) => e.path === "src/notify.ts")!;
    expect(notify.content).toContain("import { dispatchMail }");
    expect(notify.content).toContain("dispatchMail(to)");
  });

  test("NO toca strings ni comentarios (usa AST, no texto)", async () => {
    const r = await renameSymbol(FIXTURES, "sendMail", "dispatchMail");
    const mailer = r.edits.find((e) => e.path === "src/mailer.ts")!;
    expect(mailer.content).toContain('"call sendMail here"'); // string intacto
    expect(mailer.content).toContain('// "sendMail" en un comentario'); // comentario intacto
  });

  test("rechaza si el nombre nuevo ya existe (colisión)", async () => {
    const r = await renameSymbol(FIXTURES, "sendMail", "formatAddress");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("colisión");
    expect(r.edits).toEqual([]);
  });

  test("rechaza un identificador inválido", async () => {
    const r = await renameSymbol(FIXTURES, "sendMail", "2bad-name");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("no es un identificador válido");
  });

  test("rechaza si el símbolo no existe", async () => {
    const r = await renameSymbol(FIXTURES, "noExiste", "algo");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("No se encontró");
  });

  test("rechaza si el símbolo es ambiguo (declarado en 2 sitios)", async () => {
    const dup: SourceFileInput[] = [
      { path: "a.ts", content: "export function dup(): void {}" },
      { path: "b.ts", content: "export function dup(): void {}" },
    ];
    const r = await renameSymbol(dup, "dup", "unico");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("ambiguo");
  });
});

describe("safeDeleteSymbol", () => {
  test("borra un símbolo sin referencias", async () => {
    const r = await safeDeleteSymbol(FIXTURES, "unusedHelper");
    expect(r.ok).toBe(true);
    expect(r.edits[0].content).not.toContain("unusedHelper");
    // El resto del archivo sobrevive.
    expect(r.edits[0].content).toContain("sendMail");
  });

  test("RECHAZA borrar un símbolo con referencias vivas", async () => {
    const r = await safeDeleteSymbol(FIXTURES, "sendMail");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("referencias activas");
    expect(r.edits).toEqual([]);
  });
});

describe("replaceSymbolBody", () => {
  test("reemplaza la declaración completa", async () => {
    const r = await replaceSymbolBody(
      FIXTURES,
      "formatAddress",
      "function formatAddress(raw: string): string {\n  return raw.trim().toLowerCase();\n}"
    );
    expect(r.ok).toBe(true);
    expect(r.edits[0].content).toContain("toLowerCase()");
    expect(r.edits[0].content).toContain("export function sendMail"); // no toca lo demás
  });

  test("ABORTA si el reemplazo deja sintaxis inválida (todo-o-nada)", async () => {
    const r = await replaceSymbolBody(FIXTURES, "formatAddress", "function roto( {{{ ");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("sintaxis inválida");
    expect(r.applied).toBe(false);
  });
});

describe("insertBeforeSymbol", () => {
  test("inserta código antes de la declaración", async () => {
    const r = await insertBeforeSymbol(FIXTURES, "sendMail", "/** Envía un correo. */");
    expect(r.ok).toBe(true);
    const idxDoc = r.edits[0].content.indexOf("/** Envía un correo. */");
    const idxFn = r.edits[0].content.indexOf("export function sendMail");
    expect(idxDoc).toBeGreaterThanOrEqual(0);
    expect(idxDoc).toBeLessThan(idxFn);
  });
});

describe("búsqueda semántica", () => {
  test("sin proveedor cae al ranking léxico determinista", async () => {
    const graph = await indexFiles(FIXTURES);
    const index = await buildSemanticIndex(graph, FIXTURES);
    expect(index.vectors).toEqual([]);

    const hits = await semanticSearch(index, "send mail");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].mode).toBe("lexical");
    expect(hits[0].symbol.name).toBe("sendMail");
  });

  test("con proveedor usa embeddings y ordena por similitud", async () => {
    // Proveedor determinista: vector por frecuencia de caracteres.
    const provider: CodeEmbeddingProvider = {
      embed: async (texts) =>
        texts.map((t) => {
          const v = new Array(26).fill(0);
          for (const ch of t.toLowerCase()) {
            const i = ch.charCodeAt(0) - 97;
            if (i >= 0 && i < 26) v[i]++;
          }
          return v;
        }),
    };

    const graph = await indexFiles(FIXTURES);
    const index = await buildSemanticIndex(graph, FIXTURES, provider);
    expect(index.vectors.length).toBe(index.documents.length);

    const hits = await semanticSearch(index, "sendMail dispatch email", provider);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].mode).toBe("semantic");
    // Ordenado descendente por score.
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
    }
  });

  test("solo indexa exportados por defecto", async () => {
    const graph = await indexFiles(FIXTURES);
    const index = await buildSemanticIndex(graph, FIXTURES);
    const names = index.documents.map((d) => d.symbol.name);
    expect(names).toContain("sendMail"); // exportado
    expect(names).not.toContain("formatAddress"); // local
  });
});
