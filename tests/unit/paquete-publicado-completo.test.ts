/**
 * Lo que un kon PUBLICA incluye todo lo que su `index.ts` importa
 * ============================================================================
 *
 * ── EL FALLO QUE ESTO PERSIGUE ─────────────────────────────────────────────
 *
 * `files[]` del `package.json` decide qué entra en el tarball de npm. Nada lo
 * comprueba contra el código: se escribe a mano el día que se crea el kon y se
 * queda quieto mientras el kon crece.
 *
 * El resultado es un paquete que instala un `index.ts` que importa ficheros
 * que no se enviaron. Y no falla aquí: falla en la máquina de quien lo
 * instala, con un `Cannot find module`, después de publicar.
 *
 * Medido cuando se escribió esto: `kon-broadcast` publicaba sus siete ficheros
 * planos y dejaba fuera `broadcast.sections.ts` y los subsistemas `live/` y
 * `clasificaciones/` enteros — 16 ficheros, la mitad del kon. `kon-cardsim` y
 * el character builder dejaban fuera su `.dataset.ts`, añadido después.
 *
 * Los tres comparten la forma: el fichero llegó DESPUÉS de la lista.
 *
 * ── POR QUÉ EL CIERRE TRANSITIVO Y NO SOLO LOS IMPORTS DE `index.ts` ───────
 *
 * Porque `index.ts` importaba `live/routes.ts` a través de otro fichero, no
 * directamente. Mirar un solo nivel decía que faltaban 10; siguiendo la cadena
 * eran 16.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize, posix } from "node:path";

import { describe, expect, it } from "vitest";
import { HAY_KONS_INSTALADOS } from "./helpers/kons-conocidos";

const KONS = join(__dirname, "..", "..", "packages", "kons");

/** Todo fichero local alcanzable desde `index.ts`, siguiendo los imports. */
function alcanzablesDesdeIndex(dir: string): string[] {
  const visto = new Set<string>();
  const cola = ["index.ts"];

  while (cola.length > 0) {
    const f = cola.pop()!;
    if (visto.has(f)) continue;
    const ruta = join(dir, f);
    if (!existsSync(ruta)) continue;
    visto.add(f);

    const fuente = readFileSync(ruta, "utf-8");
    const refs = [
      ...fuente.matchAll(/from "(\.[^"]+)"/g),
      ...fuente.matchAll(/import "(\.[^"]+)"/g),
    ].map((m) => m[1]);

    for (const ref of refs) {
      // El código se escribe con `.js` (ESM) y en disco es `.ts`.
      const base = normalize(join(dirname(f), ref.replace(/\.js$/, ".ts")))
        .split("\\")
        .join("/");
      const opciones = base.endsWith(".ts") ? [base] : [`${base}.ts`, `${base}/index.ts`];
      const encontrado = opciones.find((o) => existsSync(join(dir, o)));
      if (encontrado) cola.push(encontrado);
    }
  }
  return [...visto].sort();
}

/** `files[]` acepta un fichero exacto o una carpeta que lo contenga. */
function loCubre(patrones: string[], fichero: string): boolean {
  return patrones.some(
    (p) => p === fichero || fichero.startsWith(`${posix.normalize(p).replace(/\/$/, "")}/`)
  );
}

const kons = readdirSync(KONS).filter(
  (d) => d.startsWith("kon-") && existsSync(join(KONS, d, "package.json"))
);

describe("el tarball de cada kon lleva lo que su index.ts importa", () => {
  it.skipIf(!HAY_KONS_INSTALADOS)("hay kons que revisar", () => {
    expect(kons.length).toBeGreaterThan(20);
  });

  for (const kon of kons) {
    const dir = join(KONS, kon);

    it(`${kon}`, () => {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8"));

      // Sin `files[]`, npm publica todo el directorio. No es este fallo.
      if (!Array.isArray(pkg.files)) return;
      if (!existsSync(join(dir, "index.ts"))) return;

      const faltan = alcanzablesDesdeIndex(dir).filter((f) => !loCubre(pkg.files, f));

      expect(
        faltan,
        `\`${kon}\` publicaría un index.ts que importa ${faltan.length} fichero(s) ` +
          `que no van en el tarball:\n  ${faltan.join("\n  ")}\n` +
          `Añádelos a \`files[]\` (basta con el nombre de la carpeta para un subsistema entero).`
      ).toEqual([]);
    });
  }
});
