#!/usr/bin/env node
/**
 * Repo público NUEVO, sin historial (kitsuden2.md, B2 — el paso después del inventario)
 * ============================================================================
 *
 *   node scripts/exportar-repo-publico.mjs                       # simulacro: qué copiaría
 *   node scripts/exportar-repo-publico.mjs --destino=../kitsuden --ejecutar \
 *        --autor="Kitsuden <noreply@example.com>"
 *
 * Copia lo que el .gitignore público deja entrar (`git ls-files` + no
 * ignorados), MENOS la documentación interna (docs/internal, docs/notes,
 * docs/archive, docs/progress y los informes sueltos de docs/), a un
 * directorio nuevo, y allí hace `git init` y UN commit con el autor que se le
 * diga. El historial actual no viaja: lleva commits con el correo corporativo
 * y un token de agente (nota «Publicar como CMS», 2026-10-18).
 *
 * Se niega a ejecutar si:
 *   · el destino existe y no está vacío;
 *   · no se da `--autor` (no se hereda el user.email del repo actual);
 *   · el inventario encuentra credenciales de gravedad ALTA en lo que se va a
 *     copiar (`--forzar` lo salta, a sabiendas).
 *
 * No hace push ni crea remotos: publicar sigue siendo decisión del propietario.
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { PRODUCTO } from "./raiz-del-producto.mjs";

const RAIZ = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const flag = (n) => process.argv.includes(`--${n}`);

const INTERNOS = [
  /^docs\/(internal|notes|archive|progress)\//,
  /^docs\/[A-Z_0-9]+\.md$/,
  /^apps\/api\/src\/tests\/(TEST_RESULTS|DYNAMIC_GRIMOIRES_TEST_GUIDE)\.md$/,
  /^\.claude\//,
  /^gamedata\//,
  /^\.env(\.test)?$/,
];

/**
 * Las pruebas que IMPORTAN un kon no tienen qué probar sin él, y el público no
 * lleva kons (viven en kitsuden-kons): fuera, o `tsc` falla en un clon limpio.
 * En tests/unit vitest ya las salta al ejecutar (tests/unit/vitest.config.ts),
 * pero el `tsc` de la raíz las compila igual. Se respeta la misma marca.
 */
const IMPORTA_UN_KON = /from\s+["'][^"']*packages\/kons\/kon-[a-z0-9-]+/;
const esPruebaDeKon = (f) => {
  if (!/^(apps\/api\/src\/tests|tests\/unit)\/.+\.test\.ts$/.test(f)) return false;
  const texto = readFileSync(join(RAIZ, f), "utf8");
  return !texto.includes("kitsuden-test: no-necesita-kons") && IMPORTA_UN_KON.test(texto);
};

const candidatos = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: RAIZ, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }
)
  .split("\0")
  .filter(Boolean)
  .filter((f) => existsSync(join(RAIZ, f)))
  .filter((f) => !INTERNOS.some((r) => r.test(f)))
  // De la raíz solo entra lo que es producto: los restos sueltos (check-db.mjs,
  // volcados .sql, planes .md) se quedan en el repo privado.
  .filter((f) => PRODUCTO.has(f.split("/")[0]));
const pruebasDeKons = candidatos.filter(esPruebaDeKon);
const ficheros = candidatos.filter((f) => !pruebasDeKons.includes(f));

const porCarpeta = {};
for (const f of ficheros) {
  const c = f.includes("/") ? f.split("/").slice(0, 2).join("/") : "(raíz)";
  porCarpeta[c] = (porCarpeta[c] ?? 0) + 1;
}

console.log(`Ficheros que entrarían en el repo público nuevo: ${ficheros.length}`);
if (pruebasDeKons.length) console.log(`Pruebas que necesitan un kon (fuera): ${pruebasDeKons.length}`);
console.log("");
for (const [c, n] of Object.entries(porCarpeta).sort((a, b) => b[1] - a[1]).slice(0, 40)) {
  console.log(`  ${String(n).padStart(5)}  ${c}`);
}

if (!flag("ejecutar")) {
  console.log("\nSimulacro: no se ha copiado nada. Añade --destino, --autor y --ejecutar.");
  process.exit(0);
}

const destino = arg("destino");
const autor = arg("autor");
if (!destino || !autor || !/^[^<>]+<[^<>@\s]+@[^<>\s]+>$/.test(autor)) {
  console.error('Faltan --destino=DIR y --autor="Nombre <correo>".');
  process.exit(2);
}
const absDestino = resolve(destino);
if (existsSync(absDestino) && readdirSync(absDestino).length > 0) {
  console.error(`El destino ${absDestino} existe y no está vacío.`);
  process.exit(2);
}

if (!flag("forzar")) {
  const informe = execFileSync("node", [join(RAIZ, "scripts/inventario-publicacion.mjs")], {
    cwd: RAIZ,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const seccion = informe.split("### ALTA en lo que entraría en el repo público")[1]?.split("###")[0] ?? "";
  const lineas = seccion.split("\n").filter((l) => l.startsWith("- "));
  const enLaCopia = lineas.filter((l) => {
    const f = l.match(/`([^`:]+):\d+`/)?.[1];
    return f && ficheros.includes(f);
  });
  if (enLaCopia.length > 0) {
    console.error(`\nEl inventario encuentra ${enLaCopia.length} credenciales ALTA en lo que se copiaría:`);
    for (const l of enLaCopia.slice(0, 20)) console.error(`  ${l}`);
    console.error("Resuélvelas (o usa --forzar sabiendo lo que haces).");
    process.exit(1);
  }
}

mkdirSync(absDestino, { recursive: true });
for (const f of ficheros) {
  const a = join(absDestino, f);
  mkdirSync(dirname(a), { recursive: true });
  copyFileSync(join(RAIZ, f), a);
}
const [, nombre, correo] = autor.match(/^([^<]+?)\s*<([^>]+)>$/) ?? [];
const git = (...a) => execFileSync("git", a, { cwd: absDestino, stdio: "inherit" });
git("init", "-b", "main");
git("add", "-A");
// Desde Windows todo entraría como 100644, y en un clon de Linux `./install.sh`
// respondería «Permission denied».
git("update-index", "--chmod=+x", ...ficheros.filter((f) => f.endsWith(".sh")));
git(
  "-c", `user.name=${nombre}`, "-c", `user.email=${correo}`,
  "commit", "-m", "Kitsuden: primera versión pública"
);
console.log(`\nRepo nuevo en ${absDestino}: ${ficheros.length} ficheros, un commit, sin remoto.`);
