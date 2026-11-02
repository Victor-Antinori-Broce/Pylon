#!/usr/bin/env node
/**
 * Instala en la imagen los kons declarados en KITSUDEN_KONS (fase C).
 *
 *   node docker/instalar-kons.mjs <carpeta-del-origen>
 *
 * Lo llama docker/Dockerfile.prod con el contexto de build adicional `kons`
 * montado en <carpeta-del-origen> (por defecto la etapa vacía `kons`; el
 * despliegue que quiera kons lo apunta a un checkout de kitsuden-kons):
 *
 *   docker compose build --build-arg KITSUDEN_KONS="blog,wiki" …
 *   (additional_contexts: kons: ../kitsuden-kons)
 *
 * Hace lo mismo que `kitsuden kon add` sin pnpm ni migraciones (esas van en
 * el `pnpm install` de la imagen y en el arranque del contenedor):
 *
 *   · copia cada kon a /app/packages/kons/<id>/ (sin node_modules ni dist);
 *   · comprueba que sus dependencias de kon también están en la lista (un
 *     kon que falta en la imagen no se puede añadir después sin reconstruir);
 *   · escribe /app/kitsuden.kons.json, que es lo que la API lee para saber
 *     qué está instalado. Sin kons, el fichero queda vacío: la API arranca
 *     solo con el núcleo.
 *
 * Sin dependencias: corre con el node de la imagen base antes de `pnpm install`.
 */
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const origen = process.argv[2];
const raiz = process.cwd();
const NUCLEO = new Set(["kon-datasets", "kon-media", "kon-blocks"]);
const NO_SE_COPIA = new Set(["node_modules", "dist", ".git", "coverage"]);

const idDeKon = (n) => {
  const limpio = n.trim().replace(/^@kitsuden\//, "");
  return limpio.startsWith("kon-") ? limpio : `kon-${limpio}`;
};

function fallar(mensaje) {
  console.error(`instalar-kons: ${mensaje}`);
  process.exit(1);
}

function leerJson(ruta) {
  try {
    return JSON.parse(readFileSync(ruta, "utf8"));
  } catch {
    return null;
  }
}

function manifiesto(dir) {
  const k = leerJson(join(dir, "kon.json"));
  if (k?.id) return k;
  const pkg = leerJson(join(dir, "package.json"));
  if (pkg?.kitsuden) return { ...pkg.kitsuden, id: pkg.kitsuden.id || pkg.name, version: pkg.version };
  return null;
}

function carpetaDe(id) {
  for (const c of [join(origen, "kons", id), join(origen, id), join(origen, "packages", "kons", id)]) {
    if (existsSync(c) && manifiesto(c)) return c;
  }
  return null;
}

function dependencias(dir, m) {
  const deps = new Set();
  const d = m.dependencies;
  for (const lista of Array.isArray(d) ? [d] : [d?.kons, d?.required]) {
    if (Array.isArray(lista)) for (const x of lista) if (typeof x === "string" && x.startsWith("kon-")) deps.add(x);
  }
  const pkg = leerJson(join(dir, "package.json")) ?? {};
  for (const campo of ["dependencies", "peerDependencies"]) {
    for (const n of Object.keys(pkg[campo] ?? {})) if (n.startsWith("@kitsuden/kon-")) deps.add(idDeKon(n));
  }
  return [...deps].filter((x) => !NUCLEO.has(x) && x !== m.id);
}

const pedidos = [...new Set((process.env.KITSUDEN_KONS ?? "").split(/[,\s]+/).filter(Boolean).map(idDeKon))]
  .filter((id) => !NUCLEO.has(id));

const kons = {};
if (pedidos.length) {
  if (!origen || !existsSync(origen)) fallar(`KITSUDEN_KONS pide kons pero no hay origen (${origen}).`);
  const planes = [];
  for (const id of pedidos) {
    const dir = carpetaDe(id);
    if (!dir) fallar(`${id} no está en el contexto \`kons\` (${origen}). ¿additional_contexts apunta a kitsuden-kons?`);
    planes.push({ id, dir, m: manifiesto(dir) });
  }
  const faltan = [];
  for (const p of planes) {
    for (const dep of dependencias(p.dir, p.m)) if (!pedidos.includes(dep)) faltan.push(`${p.id} → ${dep}`);
  }
  if (faltan.length) fallar(`faltan dependencias en KITSUDEN_KONS: ${faltan.join(", ")}`);

  for (const p of planes) {
    const destino = join(raiz, "packages", "kons", p.id);
    cpSync(p.dir, destino, {
      recursive: true,
      filter: (src) => !NO_SE_COPIA.has(basename(src)) && !src.endsWith(".tsbuildinfo"),
    });
    const pkg = leerJson(join(p.dir, "package.json")) ?? {};
    kons[p.id] = {
      source: "docker:kons",
      ...(pkg.version || p.m.version ? { version: pkg.version || p.m.version } : {}),
      ...(typeof p.m.sdk === "number" ? { sdk: p.m.sdk } : {}),
      mode: "copy",
    };
    console.log(`instalar-kons: ${p.id}${pkg.version ? `@${pkg.version}` : ""}`);
  }
}

writeFileSync(
  join(raiz, "kitsuden.kons.json"),
  JSON.stringify(
    {
      $comment: "Generated at image build by docker/instalar-kons.mjs from KITSUDEN_KONS.",
      // ordenado: dos builds con la misma lista dan el mismo fichero
      kons: Object.fromEntries(Object.entries(kons).sort(([a], [b]) => a.localeCompare(b))),
    },
    null,
    2
  ) + "\n"
);
console.log(`instalar-kons: ${Object.keys(kons).length} kon(s) en la imagen`);
