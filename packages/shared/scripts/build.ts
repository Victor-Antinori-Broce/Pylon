/**
 * Build de `@kitsuden/shared` para publicación
 * ============================================================================
 *
 * POR QUÉ NO `tsc` A SECAS: con ESM, Node exige la extensión explícita en los
 * imports relativos (`./constants.js`). `tsc` emite lo que dice el fuente
 * (`./constants`), así que el paquete publicado fallaba al importarse con
 * ERR_MODULE_NOT_FOUND — solo funcionaba bajo bundlers y bajo Bun, que sí
 * resuelven sin extensión.
 *
 * Bundlear a un único `dist/index.js` elimina el problema de raíz: no quedan
 * imports relativos que resolver. `zod` queda externo (es dependencia real).
 *
 * Los tipos siguen generándose con `tsc --emitDeclarationOnly`.
 */

import { existsSync, rmSync, watch } from "node:fs";
import { join } from "node:path";

const PKG_DIR = join(import.meta.dir, "..");
const SRC = join(PKG_DIR, "src");
const OUT = join(PKG_DIR, "dist");
const WATCH = process.argv.includes("--watch");

async function build(): Promise<boolean> {
  rmSync(OUT, { recursive: true, force: true });

  const result = await Bun.build({
    entrypoints: [join(SRC, "index.ts")],
    outdir: OUT,
    target: "node",
    format: "esm",
    external: ["zod", "hono", "hono/*", "drizzle-orm", "drizzle-orm/*", "node:*"],
    naming: "index.[ext]",
  });

  if (!result.success) {
    console.error("❌ Falló el build de @kitsuden/shared:");
    for (const log of result.logs) console.error("  ", log.message);
    return false;
  }

  // Declaraciones de tipos (tsc solo emite .d.ts, sin JS).
  const tsc = Bun.spawnSync(
    ["bunx", "tsc", "--emitDeclarationOnly", "--declaration", "--outDir", "dist"],
    { cwd: PKG_DIR, stdout: "pipe", stderr: "pipe" }
  );
  /**
   * Fallar aqui, no avisar.
   *
   * Esto era un `console.warn` que dejaba seguir al build, y salio caro: el
   * `package.json` promete `types: ./dist/index.d.ts`, asi que sin ese fichero
   * los ocho paquetes que resuelven `@kitsuden/shared` contra `dist` reciben
   * `any` IMPLICITO en todo lo que importan de aqui. No es que dejen de
   * compilar: es que compilan sin comprobar nada, que es peor.
   *
   * El aviso ademas salia VACIO, porque `tsc` escribe sus diagnosticos en
   * **stdout**, no en stderr. Nadie llego a ver nunca la causa.
   *
   * Y se comprueba el FICHERO, no solo el codigo de salida: con un `noEmit`
   * heredado del tsconfig raiz, `tsc` sale con 0 y no escribe absolutamente nada.
   */
  const declaracion = join(PKG_DIR, "dist", "index.d.ts");
  if (tsc.exitCode !== 0 || !existsSync(declaracion)) {
    const salida = [tsc.stdout, tsc.stderr]
      .map((b) => new TextDecoder().decode(b).trim())
      .filter(Boolean)
      .join("\n");
    console.error("@kitsuden/shared se construyo SIN declaraciones de tipos.");
    console.error(salida || `tsc salio con ${tsc.exitCode} y no escribio ${declaracion}.`);
    console.error("Sin .d.ts, quien importe este paquete recibe `any` en silencio.");
    return false;
  }

  const kb = (result.outputs.reduce((n, o) => n + o.size, 0) / 1024).toFixed(0);
  console.log(`✅ @kitsuden/shared — ${kb} KB`);
  return true;
}

const ok = await build();

if (!WATCH) {
  process.exit(ok ? 0 : 1);
}

/**
 * Modo watch.
 *
 * Existe porque `dist/` desactualizado es una fuente recurrente de errores que
 * no se parecen en nada a su causa: al tocar `src/` sin reconstruir, quien
 * consume el paquete revienta con "X is not a function". Con `pnpm dev` en
 * marcha, ese desfase deja de ser posible.
 *
 * (Los tests unitarios ya no dependen de esto: `tests/unit/vitest.config.ts`
 * resuelve `@kitsuden/shared` a la fuente. El watch es para el resto.)
 */
console.log("👀 @kitsuden/shared — vigilando src/…");

let rebuilding = false;
let pending = false;

async function rebuild() {
  if (rebuilding) {
    pending = true; // agrupa la ráfaga de eventos de un guardado
    return;
  }
  rebuilding = true;
  try {
    await build();
  } catch (err) {
    console.error("❌ Error reconstruyendo:", err);
  } finally {
    rebuilding = false;
    if (pending) {
      pending = false;
      await rebuild();
    }
  }
}

watch(SRC, { recursive: true }, (_event, filename) => {
  if (filename && /\.(ts|tsx)$/.test(filename)) void rebuild();
});
