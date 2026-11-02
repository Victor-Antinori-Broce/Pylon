/**
 * Validación estática de la capa de despliegue
 * ============================================================================
 *
 * Los 1.300 tests y el typecheck no miran los Dockerfiles ni los compose. Se
 * descubrió de la peor manera: `Dockerfile.prod` copiaba `packages/orm`, un
 * paquete que no existe desde un refactor, y el build reventaba en la línea 52
 * tras 45 segundos descargando capas. Peor aún, `packages/codegen` —que la API
 * importa en la PRIMERA línea de `routes/codegen.ts`— no se copiaba nunca a la
 * imagen final: el build habría pasado y el contenedor no habría arrancado.
 *
 * Esto comprueba, sin construir nada:
 *
 *   1. Que cada `COPY` apunte a algo que existe.
 *   2. Que cada `pnpm --filter <paquete>` nombre un paquete real del workspace.
 *   3. Que los `dockerfile:` y los montajes de los compose existan.
 *   4. Que las variables marcadas obligatorias (`${VAR:?}`) estén en `.env`.
 *
 * Tarda milisegundos. El build tarda minutos y falla a la mitad.
 *
 *   node scripts/validate-docker.mjs
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const problemas = [];
const aviso = (f, l, m) => problemas.push({ f, l, m });

// ── 1. Cada COPY de cada Dockerfile apunta a algo que existe ────────────────
const dockerfiles = readdirSync("docker").filter((f) => f.startsWith("Dockerfile"));
for (const df of dockerfiles) {
  const ruta = join("docker", df);
  readFileSync(ruta, "utf8")
    .split(/\r?\n/)
    .forEach((linea, i) => {
      const m = /^COPY\s+(?!--from)(.+)$/.exec(linea.trim());
      if (!m) return;
      const partes = m[1].split(/\s+/).filter((p) => !p.startsWith("--"));
      const fuentes = partes.slice(0, -1);
      for (const f of fuentes) {
        if (f.includes("*")) {
          // Glob: se comprueba la parte FIJA anterior al primer comodín.
          const fija = f.slice(0, f.indexOf("*")).replace(/\/$/, "");
          if (fija && !existsSync(fija)) aviso(ruta, i + 1, `glob sin directorio base: ${f}`);
          continue;
        }
        if (!existsSync(f)) aviso(ruta, i + 1, `COPY de algo que NO existe: ${f}`);
      }
    });
}

// ── 2. Cada `pnpm --filter <paquete>` existe en el workspace ────────────────
const nombres = new Set();
for (const base of ["packages", "apps"]) {
  for (const d of readdirSync(base, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const pj = join(base, d.name, "package.json");
    if (existsSync(pj)) nombres.add(JSON.parse(readFileSync(pj, "utf8")).name);
    const sub = join(base, d.name);
    for (const s of readdirSync(sub, { withFileTypes: true })) {
      if (!s.isDirectory()) continue;
      const spj = join(sub, s.name, "package.json");
      if (existsSync(spj)) nombres.add(JSON.parse(readFileSync(spj, "utf8")).name);
    }
  }
}
for (const df of dockerfiles) {
  const ruta = join("docker", df);
  readFileSync(ruta, "utf8")
    .split(/\r?\n/)
    .forEach((linea, i) => {
      const m = /--filter\s+"?(@[\w/*-]+)"?/.exec(linea);
      if (!m) return;
      const n = m[1];
      if (n.includes("*")) return;
      if (!nombres.has(n)) aviso(ruta, i + 1, `--filter a un paquete inexistente: ${n}`);
    });
}

// ── 3. Compose: contexto, dockerfile y montajes ─────────────────────────────
for (const cf of readdirSync(".").filter((f) => /^docker-compose.*\.ya?ml$/.test(f))) {
  const texto = readFileSync(cf, "utf8");
  texto.split(/\r?\n/).forEach((linea, i) => {
    const df = /dockerfile:\s*(\S+)/.exec(linea);
    if (df && !existsSync(df[1])) aviso(cf, i + 1, `dockerfile inexistente: ${df[1]}`);
    const vol = /^\s+-\s+(\.\/[^\s:]+):/.exec(linea);
    if (vol && !existsSync(vol[1])) aviso(cf, i + 1, `montaje inexistente: ${vol[1]}`);
  });

  // Variables obligatorias (`:?`) presentes en .env
  const obligatorias = [...texto.matchAll(/\$\{([A-Z_]+):\?/g)].map((m) => m[1]);
  if (obligatorias.length && existsSync(".env")) {
    const env = readFileSync(".env", "utf8");
    for (const v of new Set(obligatorias)) {
      if (!new RegExp(`^${v}=.+`, "m").test(env))
        aviso(cf, 0, `${v} es obligatoria y falta en .env`);
    }
  }
}

if (problemas.length === 0) {
  console.log("VALIDACION DOCKER: sin problemas");
} else {
  console.log(`VALIDACION DOCKER: ${problemas.length} problema(s)\n`);
  for (const p of problemas) console.log(`  ${p.f}${p.l ? ":" + p.l : ""}  ${p.m}`);
}
