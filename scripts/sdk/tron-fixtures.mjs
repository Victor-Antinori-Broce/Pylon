#!/usr/bin/env node
/**
 * TRON fixtures for the SDK decoders (TypeScript and Python)
 * ============================================================================
 *
 * Encodes a set of values with the SAME library and version the API uses
 * (`@tron-format/tron`, pinned in apps/api) and keeps the cases whose round
 * trip with the reference parser gives the value back (the API only sends
 * TRON in that case). Writes `{ tron, json }` pairs to
 *
 *   packages/sdk/tests/fixtures/tron-cases.json
 *   packages/sdk-python/tests/fixtures/tron-cases.json
 *
 * Both SDK test suites decode every case with their own decoder and compare.
 *
 *   node scripts/sdk/tron-fixtures.mjs           # write
 *   node scripts/sdk/tron-fixtures.mjs --check   # exit 1 if the files differ
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const requerir = createRequire(join(RAIZ, "apps/api/package.json"));
const ruta = requerir.resolve("@tron-format/tron");
const { stringify, parse } = await import(pathToFileURL(ruta).href);
const version = JSON.parse(readFileSync(join(dirname(ruta), "..", "package.json"), "utf8")).version;

const fila = (i) => ({
  id: `0c6e1c2e-0000-4000-8000-00000000000${i}`,
  name: `Item ${i}`,
  price: i * 1.5,
  active: i % 2 === 0,
  tags: ["a", `t${i}`],
  meta: { rank: i, note: null },
});

const VALORES = [
  null,
  true,
  false,
  0,
  -12,
  3.25,
  1e21,
  "plain",
  'with "quotes", commas, colons: and\nnewlines\ttabs \\ backslash',
  "unicode: ñandú, 日本語, emoji 😀",
  "",
  [],
  {},
  [1, 2, 3],
  ["x", null, true, 1.5, { a: 1 }],
  { a: 1, b: "two", c: [true, false], d: { e: null } },
  { docs: [fila(1), fila(2), fila(3)], totalDocs: 3, page: 1, limit: 10, hasNextPage: false },
  [fila(1), fila(2), fila(3), fila(4)],
  {
    data: [
      { x: 1, y: 2 },
      { y: 3, x: 4 },
      { x: 5, y: 6, z: 7 },
    ],
    meta: { total: 3 },
  },
  { nested: { level: { deeper: [{ k: "v", n: [1, [2, [3]]] }] } } },
  { "key with spaces": 1, "kebab-key": 2, 123: 3, ünïcode: 4 },
  [{ a: 1, b: 2 }, { a: 3, b: 4 }, { a: 5 }, { b: 6 }],
  { empty: { obj: {}, arr: [], str: "" } },
  { big: Array.from({ length: 25 }, (_, i) => ({ id: i, label: `row ${i}`, ok: i % 3 === 0 })) },
];

const casos = [];
for (const v of VALORES) {
  let texto;
  try {
    texto = stringify(v);
  } catch {
    continue;
  }
  let vuelta;
  try {
    vuelta = parse(texto);
  } catch {
    continue;
  }
  if (JSON.stringify(ordenar(vuelta)) !== JSON.stringify(ordenar(JSON.parse(JSON.stringify(v)))))
    continue;
  casos.push({ tron: texto, json: JSON.parse(JSON.stringify(v)) });
}

function ordenar(v) {
  if (Array.isArray(v)) return v.map(ordenar);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, ordenar(v[k])])
    );
  return v;
}

const salida = `${JSON.stringify({ library: `@tron-format/tron@${version}`, cases: casos }, null, 2)}\n`;
const destinos = [
  join(RAIZ, "packages/sdk/tests/fixtures/tron-cases.json"),
  join(RAIZ, "packages/sdk-python/tests/fixtures/tron-cases.json"),
];
if (process.argv.includes("--check")) {
  const malos = destinos.filter(
    (d) => !existsSync(d) || readFileSync(d, "utf8").replaceAll("\r\n", "\n") !== salida
  );
  if (malos.length) {
    console.error(`[tron-fixtures] stale: ${malos.join(", ")}`);
    process.exit(1);
  }
  process.exit(0);
}
for (const d of destinos) {
  mkdirSync(dirname(d), { recursive: true });
  writeFileSync(d, salida);
}
console.error(
  `[tron-fixtures] ${casos.length}/${VALORES.length} cases (${version}) → ${destinos.length} files`
);
