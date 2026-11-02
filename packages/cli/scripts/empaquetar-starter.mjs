/**
 * prepack: mete el starter neutro en templates/starter-basic para que
 * `kitsuden new` funcione con el CLI instalado desde npm, fuera del monorepo.
 *
 * Usa el MISMO filtro que `kitsuden new` (dist/utils/copiar-starter.js): sin
 * node_modules, dist, .astro ni .env. templates/starter-basic está en el
 * .gitignore del paquete: es un artefacto de empaquetado, no fuente.
 */

import { existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { copiarStarter, esStarter } from "../dist/utils/copiar-starter.js";

const cli = resolve(import.meta.dirname, "..");
const origen = resolve(cli, "..", "starters", "kitsuden-starter-basic");
const destino = join(cli, "templates", "starter-basic");

if (!esStarter(origen)) {
  console.error(`starter not found at ${origen}`);
  process.exit(1);
}
if (existsSync(destino)) rmSync(destino, { recursive: true, force: true });
await copiarStarter(origen, destino);
console.log(`starter copied to ${destino}`);
