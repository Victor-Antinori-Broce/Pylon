/**
 * Code Graph — Tests unitarios (100% deterministas, sin disco ni red)
 * ============================================================================
 * Indexa fixtures en memoria y verifica símbolos, aristas, queries de
 * navegación (find/references/outline/path), clusters y búsqueda.
 */

import {
  indexFiles,
  findSymbol,
  references,
  outline,
  pathBetween,
  communities,
  searchCode,
  type SourceFileInput,
} from "@kitsuden/engine";
import { describe, expect, test } from "bun:test";

const FIXTURES: SourceFileInput[] = [
  {
    path: "packages/engine/src/mailer.ts",
    content: [
      `export interface MailOptions {`,
      `  to: string;`,
      `}`,
      ``,
      `export function sendMail(opts: MailOptions): void {`,
      `  formatAddress(opts.to);`,
      `}`,
      ``,
      `function formatAddress(raw: string): string {`,
      `  return raw.trim();`,
      `}`,
      ``,
      `export const MAILER_VERSION = "1.0";`,
    ].join("\n"),
  },
  {
    path: "apps/api/src/routes/notify.ts",
    content: [
      `import { sendMail } from "../../../../packages/engine/src/mailer";`,
      `import { Hono } from "hono";`,
      ``,
      `export const notify = (to: string) => {`,
      `  sendMail({ to });`,
      `};`,
      ``,
      `export class Notifier {`,
      `  run(to: string) {`,
      `    sendMail({ to });`,
      `  }`,
      `}`,
    ].join("\n"),
  },
  {
    path: "packages/kons/kon-demo/routes.ts",
    content: [`export type DemoConfig = { enabled: boolean };`].join("\n"),
  },
];

describe("code-graph indexer", () => {
  test("extrae símbolos con kind, línea y exported", async () => {
    const graph = await indexFiles(FIXTURES);

    const send = graph.symbols.find((s) => s.name === "sendMail");
    expect(send).toBeDefined();
    expect(send!.kind).toBe("function");
    expect(send!.exported).toBe(true);
    expect(send!.line).toBe(5);

    const fmt = graph.symbols.find((s) => s.name === "formatAddress");
    expect(fmt!.exported).toBe(false);

    const version = graph.symbols.find((s) => s.name === "MAILER_VERSION");
    expect(version!.kind).toBe("const");

    const iface = graph.symbols.find((s) => s.name === "MailOptions");
    expect(iface!.kind).toBe("interface");

    const cls = graph.symbols.find((s) => s.name === "Notifier");
    expect(cls!.kind).toBe("class");
  });

  test("resuelve imports relativos a archivos conocidos", async () => {
    const graph = await indexFiles(FIXTURES);
    const importEdge = graph.edges.find(
      (e) =>
        e.relation === "imports" &&
        e.from === "apps/api/src/routes/notify.ts" &&
        e.to === "packages/engine/src/mailer.ts"
    );
    expect(importEdge).toBeDefined();
  });

  test("imports de paquetes externos quedan como pkg:", async () => {
    const graph = await indexFiles(FIXTURES);
    const pkgEdge = graph.edges.find((e) => e.relation === "imports" && e.to === "pkg:hono");
    expect(pkgEdge).toBeDefined();
  });

  test("detecta llamadas: mismo archivo = direct, cross-file única = inferred", async () => {
    const graph = await indexFiles(FIXTURES);

    const local = graph.edges.find(
      (e) =>
        e.relation === "calls" &&
        e.from === "packages/engine/src/mailer.ts#sendMail" &&
        e.to === "packages/engine/src/mailer.ts#formatAddress"
    );
    expect(local).toBeDefined();
    expect(local!.confidence).toBe("direct");

    const cross = graph.edges.find(
      (e) =>
        e.relation === "calls" &&
        e.from === "apps/api/src/routes/notify.ts#notify" &&
        e.to === "packages/engine/src/mailer.ts#sendMail"
    );
    expect(cross).toBeDefined();
    expect(cross!.confidence).toBe("inferred");
  });

  test("es determinista: misma entrada, misma salida", async () => {
    const a = await indexFiles(FIXTURES);
    const b = await indexFiles([...FIXTURES].reverse());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("code-graph queries", () => {
  test("findSymbol: exacto primero, luego prefijo", async () => {
    const graph = await indexFiles(FIXTURES);
    const matches = findSymbol(graph, "sendMail");
    expect(matches[0].exact).toBe(true);
    expect(matches[0].file).toBe("packages/engine/src/mailer.ts");

    const prefix = findSymbol(graph, "MAIL");
    expect(prefix.some((m) => m.name === "MAILER_VERSION")).toBe(true);
  });

  test("references: quién llama y quién importa", async () => {
    const graph = await indexFiles(FIXTURES);
    const [refs] = references(graph, "sendMail");
    expect(refs.calledBy.map((c) => c.id)).toContain("apps/api/src/routes/notify.ts#notify");
    expect(refs.calledBy.map((c) => c.id)).toContain("apps/api/src/routes/notify.ts#Notifier");
    expect(refs.importedBy).toContain("apps/api/src/routes/notify.ts");
  });

  test("outline: símbolos ordenados por línea", async () => {
    const graph = await indexFiles(FIXTURES);
    const o = outline(graph, "packages/engine/src/mailer.ts");
    expect(o).not.toBeNull();
    expect(o!.symbols.map((s) => s.name)).toEqual([
      "MailOptions",
      "sendMail",
      "formatAddress",
      "MAILER_VERSION",
    ]);
  });

  test("pathBetween: conecta símbolo con símbolo cruzando archivos", async () => {
    const graph = await indexFiles(FIXTURES);
    const path = pathBetween(graph, "Notifier", "formatAddress");
    expect(path).not.toBeNull();
    expect(path![0]).toBe("apps/api/src/routes/notify.ts#Notifier");
    expect(path![path!.length - 1]).toBe("packages/engine/src/mailer.ts#formatAddress");
  });

  test("pathBetween: null si no existe el nodo", async () => {
    const graph = await indexFiles(FIXTURES);
    expect(pathBetween(graph, "noExiste", "sendMail")).toBeNull();
  });

  test("communities: agrupa por paquete y kon", async () => {
    const graph = await indexFiles(FIXTURES);
    const groups = communities(graph).map((c) => c.group);
    expect(groups).toContain("packages/engine");
    expect(groups).toContain("apps/api");
    expect(groups).toContain("packages/kons/kon-demo");
  });

  test("searchCode: hits con archivo y línea", async () => {
    const hits = searchCode(FIXTURES, "sendMail\\(", { maxResults: 10 });
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits[0].file).toBe("apps/api/src/routes/notify.ts");
    expect(hits.every((h) => h.line > 0)).toBe(true);
  });

  test("searchCode: regex inválida degrada a literal", async () => {
    const hits = searchCode(FIXTURES, "sendMail(", {});
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });

  test("god nodes: sendMail entre los más conectados", async () => {
    const graph = await indexFiles(FIXTURES);
    const ids = graph.summary.godNodes.map((g) => g.id);
    expect(ids).toContain("packages/engine/src/mailer.ts#sendMail");
  });
});
