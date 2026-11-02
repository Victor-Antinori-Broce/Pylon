#!/usr/bin/env node
/**
 * Compare benchmark results written by bench.mjs.
 *
 *   node scripts/bench/compare.mjs before.json after.json
 *   node scripts/bench/compare.mjs --a=before-r1.json,before-r2.json --b=after-r1.json,after-r2.json
 *
 * With several files per side, each figure is the MEDIAN over the files
 * (repeat runs interleaved A, B, A, B on the same machine to tell a change from
 * noise). Prints a Markdown table: req/s, p50, p95, p99 and errors per scenario
 * and connection count, with the change in percent.
 */

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = Object.fromEntries(
  args.filter((a) => a.startsWith("--")).map((a) => {
    const [k, ...v] = a.slice(2).split("=");
    return [k, v.join("=")];
  })
);
const sueltos = args.filter((a) => !a.startsWith("--"));
const ladoA = (opt.a ? opt.a.split(",") : [sueltos[0]]).filter(Boolean);
const ladoB = (opt.b ? opt.b.split(",") : [sueltos[1]]).filter(Boolean);
if (!ladoA.length || !ladoB.length) {
  console.error("usage: compare.mjs A.json B.json | --a=a1.json,a2.json --b=b1.json,b2.json");
  process.exit(2);
}

const mediana = (xs) => {
  const v = xs.filter((x) => typeof x === "number").sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

function cargar(ficheros) {
  const porClave = new Map();
  for (const f of ficheros) {
    for (const r of JSON.parse(readFileSync(f, "utf8")).resultados) {
      if (r.omitido || r.fallo) continue;
      const clave = `${r.nombre}@${r.conexiones}`;
      if (!porClave.has(clave)) porClave.set(clave, []);
      porClave.get(clave).push(r);
    }
  }
  const salida = new Map();
  for (const [clave, rs] of porClave) {
    salida.set(clave, {
      rps: mediana(rs.map((r) => r.rps)),
      p50: mediana(rs.map((r) => r.p50)),
      p95: mediana(rs.map((r) => r.p95)),
      p99: mediana(rs.map((r) => r.p99)),
      errores: mediana(rs.map((r) => r.errores)),
      cpu: mediana(rs.map((r) => r.servidor?.cpuPercent)),
      n: rs.length,
    });
  }
  return salida;
}

const A = cargar(ladoA);
const B = cargar(ladoB);
const cambio = (a, b, masEsMejor) => {
  if (a == null || b == null || a === 0) return "";
  const p = ((b - a) / a) * 100;
  const signo = p > 0 ? "+" : "";
  const mejor = masEsMejor ? p > 0 : p < 0;
  return ` (${signo}${p.toFixed(0)} %${Math.abs(p) >= 10 ? (mejor ? ", better" : ", worse") : ""})`;
};
const f = (x) => (x == null ? "–" : Number.isInteger(x) ? String(x) : x.toFixed(1));

console.log("| scenario | conn | req/s A → B | p50 ms A → B | p95 ms A → B | p99 ms A → B | errors A → B |");
console.log("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
for (const clave of [...new Set([...A.keys(), ...B.keys()])]) {
  const [nombre, conn] = clave.split("@");
  const a = A.get(clave) ?? {};
  const b = B.get(clave) ?? {};
  console.log(
    `| ${nombre} | ${conn} | ${f(a.rps)} → ${f(b.rps)}${cambio(a.rps, b.rps, true)} | ${f(a.p50)} → ${f(b.p50)}${cambio(a.p50, b.p50, false)} | ${f(a.p95)} → ${f(b.p95)}${cambio(a.p95, b.p95, false)} | ${f(a.p99)} → ${f(b.p99)}${cambio(a.p99, b.p99, false)} | ${f(a.errores)} → ${f(b.errores)} |`
  );
}
console.log(`\nA: ${ladoA.join(", ")}\nB: ${ladoB.join(", ")}  (median of ${Math.max(ladoA.length, ladoB.length)} run(s) per side)`);
