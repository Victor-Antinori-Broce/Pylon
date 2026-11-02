/**
 * Todo icono declarado por un kon tiene que estar en el mapa del admin
 * ============================================================================
 *
 * Los manifiestos (`kon.json`) y `getDefaultIcon` del registro declaran el
 * icono como el NOMBRE de un componente de lucide: `Gamepad2`, `FileText`,
 * `ScanText`… El admin lo traduce a componente con un mapa estático en
 * `KonIcon.svelte`.
 *
 * ── POR QUÉ UN MAPA, Y POR QUÉ ESTA PRUEBA ─────────────────────────────────
 *
 * El primer intento fue resolverlo con un import dinámico:
 *
 *     import(/* @vite-ignore *​/ `lucide-svelte/icons/${nombre}`)
 *
 * y falló de la peor manera posible: `@vite-ignore` significa «no analices
 * esto», así que Vite no empaquetaba NINGÚN icono y al navegador le llegaba un
 * especificador desnudo que no sabe resolver. Todas las importaciones fallaban,
 * todas las tarjetas mostraban el icono de respaldo, y la pantalla tenía
 * exactamente el mismo aspecto que si el diseño fuera así.
 *
 * El mapa estático arregla eso, pero introduce el riesgo contrario: en cuanto
 * alguien escriba un kon con un icono nuevo, el mapa se queda corto. Y el fallo
 * vuelve a ser silencioso — un icono genérico en lugar del suyo.
 *
 * Esta prueba cierra ese hueco: compara lo declarado con lo mapeado.
 *
 * ── LOS ALIAS ──────────────────────────────────────────────────────────────
 *
 * Tres nombres —`CheckCircle`, `HelpCircle`, `UserCircle`— ya no existen en
 * lucide: se renombraron a `CircleCheck`, `CircleHelp` y `CircleUser`. Los
 * manifiestos siguen usando el nombre viejo, así que el mapa los traduce. Por
 * eso se comprueban las CLAVES del mapa y no los imports.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { HAY_KONS_INSTALADOS } from "./helpers/kons-conocidos";

const RAIZ = join(__dirname, "..", "..");
// El mapa vive en `lib/iconos.ts`, no en el componente: lo usan tanto las
// tarjetas de la lista como el menu lateral, y dos copias se habrian separado.
const MAPA = join(RAIZ, "packages", "admin", "src", "lib", "iconos.ts");
const KON_ICON = join(RAIZ, "packages", "admin", "src", "lib", "components", "KonIcon.svelte");

/** Nombres de icono que declaran los manifiestos de kons y grimoires. */
function iconosDeclarados(): Map<string, string[]> {
  const encontrados = new Map<string, string[]>();

  const carpetas = [join(RAIZ, "packages", "kons"), join(RAIZ, "packages", "grimoires")];

  for (const base of carpetas) {
    if (!existsSync(base)) continue;
    for (const entrada of readdirSync(base, { withFileTypes: true })) {
      if (!entrada.isDirectory()) continue;
      for (const nombre of ["kon.json", "grimoire.json", "kitsuden.json"]) {
        const p = join(base, entrada.name, nombre);
        if (!existsSync(p)) continue;
        const texto = readFileSync(p, "utf-8");
        for (const m of texto.matchAll(/"icon"\s*:\s*"([A-Z][A-Za-z0-9]*)"/g)) {
          const icono = m[1]!;
          const lista = encontrados.get(icono) ?? [];
          lista.push(`${entrada.name}/${nombre}`);
          encontrados.set(icono, lista);
        }
      }
    }
  }

  return encontrados;
}

/** Claves del mapa `ICONOS` de KonIcon.svelte. */
function iconosMapeados(): Set<string> {
  const fuente = readFileSync(MAPA, "utf-8");
  const bloque = fuente.match(/const ICONOS[^{]*\{([\s\S]*?)\n\s*\};/);
  if (!bloque) return new Set();

  const claves = new Set<string>();
  for (const linea of bloque[1]!.split("\n")) {
    // Admite `Nombre,` y `Nombre: OtroNombre,`; ignora comentarios.
    const m = linea.match(/^\s*([A-Z][A-Za-z0-9]*)\s*[,:]/);
    if (m) claves.add(m[1]!);
  }
  return claves;
}

describe("iconos de los kons", () => {
  const declarados = iconosDeclarados();
  const mapeados = iconosMapeados();

  it.skipIf(!HAY_KONS_INSTALADOS)("se han encontrado iconos declarados", () => {
    // Sin esto, un cambio de formato en los manifiestos dejaría la lista vacía
    // y la comprobación de abajo pasaría sin mirar nada.
    expect(declarados.size).toBeGreaterThan(20);
  });

  it("el mapa de iconos se ha podido leer", () => {
    expect(mapeados.size).toBeGreaterThan(20);
  });

  it("todos los declarados estan en el mapa", () => {
    const ausentes = [...declarados.entries()]
      .filter(([icono]) => !mapeados.has(icono))
      .map(([icono, donde]) => `${icono}  (${donde.slice(0, 3).join(", ")})`);

    expect(
      ausentes,
      `Estos iconos los declara algún kon y KonIcon.svelte no los conoce:\n\n` +
        `${ausentes.join("\n")}\n\n` +
        `Se mostrarán con el icono genérico, sin ningún aviso. Añádelos al mapa ` +
        `de packages/admin/src/lib/components/KonIcon.svelte con su import ` +
        `correspondiente (el fichero de lucide va en kebab-case: ` +
        `Gamepad2 → lucide-svelte/icons/gamepad-2).`
    ).toEqual([]);
  });

  it("KonIcon no usa import dinamico con @vite-ignore", () => {
    /**
     * El modo de fallo que motivó el mapa: con `@vite-ignore`, Vite no empaqueta
     * los iconos y el navegador recibe un especificador que no puede resolver.
     * No da error de compilación — simplemente no se ve ningún icono.
     */
    const fuente = readFileSync(MAPA, "utf-8") + readFileSync(KON_ICON, "utf-8");
    const codigo = fuente
      .replace(/\/\*\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("*") && !l.trimStart().startsWith("//"))
      .join("\n");

    expect(
      /import\(\s*\/\*\s*@vite-ignore/.test(codigo),
      "KonIcon vuelve a resolver los iconos con un import dinámico marcado " +
        "@vite-ignore. Vite no los empaqueta y el navegador no puede resolver " +
        "el especificador: ningún icono se mostraría, y sin ningún error."
    ).toBe(false);
  });
});
