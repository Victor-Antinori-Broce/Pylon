/**
 * Los tokens de color del admin se nombran por su papel, no por su tono
 * ============================================================================
 *
 * El acento del admin era cian y los tokens se llamaban `--kitsuden-cyan` /
 * `text-kitsuden-cyan`. Al cambiar la paleta a violeta, el nombre pasó a
 * describir un color que ya no existía: quien leía `text-kitsuden-cyan`
 * esperaba cian y obtenía morado.
 *
 * Se renombraron a `accent` y `accent-2` — 1.238 sustituciones en 90 ficheros.
 * Esta prueba impide que el nombre vuelva a atarse a un tono concreto.
 *
 * ── LO QUE ESE RENOMBRADO ENSEÑÓ ───────────────────────────────────────────
 *
 * No fue una sustitución limpia, y por eso hay dos comprobaciones y no una:
 *
 *   · Las CLAVES de Tailwind se llamaban `cyan:` a secas, sin el prefijo
 *     `kitsuden-`, así que la sustitución no las tocó. El marcado pedía
 *     `bg-kitsuden-accent` y la configuración seguía ofreciendo
 *     `bg-kitsuden-cyan`. Nada falló al escribir: falló al construir, con
 *     «The `bg-kitsuden-accent` class does not exist».
 *
 *   · `theme.svelte.ts` YA definía un `--kitsuden-accent` propio, alias de
 *     `--kitsuden-purple`. Al renombrar, las dos claves colisionaron en el
 *     mismo objeto literal y JavaScript se queda con la última: el acento
 *     habría pasado a ser morado en cada tema, sin aviso.
 *
 * De ahí que la prueba mire las tres piezas —variables, claves de Tailwind y
 * marcado— y no solo una: cada una falló por su cuenta.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const ADMIN = join(RAIZ, "packages", "admin");

/**
 * Nombres de tono prohibidos como token de acento.
 *
 * `green`, `amber`, `yellow` y `purple` NO están: ahí el tono ES el
 * significado (verde = correcto, ámbar = aviso), y renombrarlos no aportaría
 * nada. Lo que se prohíbe es llamar por su color al acento de marca, que es
 * justo lo que cambia cuando alguien rediseña.
 */
const TONOS_PROHIBIDOS = ["cyan", "pink", "magenta", "teal", "violet"];

/** Todos los ficheros de fuente del admin. */
function ficheros(): string[] {
  const salida: string[] = [];
  const extensiones = [".svelte", ".ts", ".js", ".css"];

  function recorrer(dir: string): void {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const ruta = join(dir, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name === "node_modules" || entrada.name === "build") continue;
        recorrer(ruta);
      } else if (extensiones.some((e) => entrada.name.endsWith(e))) {
        salida.push(ruta);
      }
    }
  }

  recorrer(join(ADMIN, "src"));
  return salida;
}

describe("los tokens de color del admin", () => {
  const fuentes = ficheros();

  it("hay ficheros que inspeccionar", () => {
    // Sin esto, un fallo al recorrer dejaría la lista vacía y todo pasaría.
    expect(fuentes.length).toBeGreaterThan(50);
  });

  for (const tono of TONOS_PROHIBIDOS) {
    it(`ningun token se llama '${tono}'`, () => {
      const culpables: string[] = [];
      for (const f of fuentes) {
        // Se ignoran los comentarios a propósito: la regla prohíbe USAR el
        // token, no MENCIONARLO. Documentar por qué se renombró —y que
        // `text-kitsuden-cyan` ya no existe— es justo lo que evita que alguien
        // lo reintroduzca por no conocer la historia.
        const codigo = readFileSync(f, "utf-8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .split("\n")
          .filter((l) => !/^\s*(\/\/|\*)/.test(l))
          .join("\n");

        if (codigo.includes(`kitsuden-${tono}`)) {
          culpables.push(f.slice(ADMIN.length + 1).replace(/\\/g, "/"));
        }
      }

      expect(
        culpables,
        `Estos ficheros usan 'kitsuden-${tono}' como token de color:\n\n` +
          `${culpables.slice(0, 12).join("\n")}\n\n` +
          `Nombra los tokens por su PAPEL (accent, accent-2, danger), no por su ` +
          `tono. Un nombre por el tono caduca en cuanto alguien cambia el tono, ` +
          `y deja el código diciendo una cosa y pintando otra.`
      ).toEqual([]);
    });
  }

  it("no queda el color antiguo escrito a mano, en ninguna grafia", () => {
    /**
     * Los valores viejos: cian `0 229 255` y rosa `255 42 109`.
     *
     * Se comprueban aquí porque un color escrito a mano NO pasa por los tokens
     * y por tanto no se repinta al cambiar la paleta: se queda como estaba,
     * chillando al lado del acento nuevo.
     *
     * Y se comprueba con un patrón tolerante a la grafía porque hicieron falta
     * CUATRO barridos para acabar con ellos, y cada uno falló por asumir una
     * forma concreta:
     *
     *   · `rgba(0, 229, 255, .1)`   comas con espacio  — el primero
     *   · `rgb(0 229 255 / .1)`     espacios y barra   — 2 ficheros
     *   · `rgba(0,229,255,0.1)`     sin espacios       — dentro de una clase
     *                                                    Tailwind arbitraria
     *   · `text-cyan-400`           paleta NATIVA de Tailwind, ajena a nuestros
     *                               tokens y por tanto cian de verdad
     */
    const PROHIBIDOS = [
      { nombre: "cian", patron: /rgba?\([^)]*\b0\s*[, ]\s*229\s*[, ]\s*255\b/ },
      { nombre: "rosa antiguo", patron: /rgba?\([^)]*\b255\s*[, ]\s*42\s*[, ]\s*109\b/ },
      { nombre: "cian hex", patron: /#00e5ff/i },
      { nombre: "rosa hex antiguo", patron: /#ff2a6d/i },
      { nombre: "paleta cyan de Tailwind", patron: /\b[a-z]+-cyan-\d+\b/ },
    ];

    /**
     * Excepción: paletas CATEGÓRICAS.
     *
     * `types/blocks.ts` asigna un color a cada tipo de bloque —12 tonos
     * distintos— para distinguirlos de un vistazo en el selector. Ahí el cian y
     * el rosa no son el acento de marca: son dos entradas de una gama, igual
     * que las series de un gráfico. Repintarlas al color de acento haría que
     * dos tipos de bloque dejaran de distinguirse.
     *
     * Esta prueba llegó a marcarlas, y hacerle caso habría empeorado el
     * producto. La regla es sobre el ACENTO, no sobre todo lo que sea cian.
     */
    const PALETAS_CATEGORICAS = ["src/types/blocks.ts"];

    const culpables: string[] = [];
    for (const f of fuentes) {
      const relativa = f.slice(ADMIN.length + 1).replace(/\\/g, "/");
      if (PALETAS_CATEGORICAS.includes(relativa)) continue;

      const texto = readFileSync(f, "utf-8");
      for (const { nombre, patron } of PROHIBIDOS) {
        if (patron.test(texto)) culpables.push(`${relativa} (${nombre})`);
      }
    }

    expect(
      culpables,
      `Estos ficheros llevan el color antiguo escrito a mano:\n\n` +
        `${culpables.slice(0, 12).join("\n")}\n\n` +
        `Un color a mano no pasa por los tokens, así que no se repinta al ` +
        `cambiar la paleta. Usa var(--kitsuden-accent) o las clases ` +
        `kitsuden-accent / kitsuden-accent-2.`
    ).toEqual([]);
  });

  it("las claves de Tailwind coinciden con las variables CSS", () => {
    /**
     * La trampa que rompió el build: las claves de `tailwind.config.js` no
     * llevan el prefijo `kitsuden-`, así que un renombrado sobre
     * `kitsuden-cyan` las deja intactas. El marcado pide una clase que la
     * configuración ya no define, y eso no se ve hasta compilar el CSS.
     */
    const config = readFileSync(join(ADMIN, "tailwind.config.js"), "utf-8");

    // Cada línea `clave: "rgb(var(--kitsuden-XXX) / <alpha-value>)"`.
    const pares = [...config.matchAll(/"?([\w-]+)"?:\s*"rgb\(var\(--kitsuden-([\w-]+)\)/g)];

    expect(pares.length, "no se han encontrado colores en tailwind.config.js").toBeGreaterThan(5);

    const desalineados = pares
      .filter(([, clave, variable]) => clave !== variable)
      .map(([, clave, variable]) => `clave '${clave}' -> variable '--kitsuden-${variable}'`);

    expect(
      desalineados,
      `En tailwind.config.js hay claves que no coinciden con su variable:\n\n` +
        `${desalineados.join("\n")}\n\n` +
        `La clase se llama por la CLAVE (bg-kitsuden-<clave>) y toma el valor de ` +
        `la VARIABLE. Si divergen, el marcado pide una clase que no existe y el ` +
        `build falla con "The \`bg-kitsuden-...\` class does not exist" — o peor, ` +
        `la clase existe y pinta el color equivocado.`
    ).toEqual([]);
  });

  it("theme.svelte.ts no declara dos veces la misma variable", () => {
    /**
     * Un objeto literal con la clave repetida no da error en JavaScript: se
     * queda con la última, en silencio. Aquí eso significaba que el acento de
     * cada tema pasaba a ser el valor del morado.
     */
    const p = join(ADMIN, "src", "lib", "theme.svelte.ts");
    if (!existsSync(p)) return;

    const texto = readFileSync(p, "utf-8");
    const bloques = [...texto.matchAll(/cssVars:\s*\{([\s\S]*?)\n\s*\}/g)];

    expect(bloques.length, "no se han encontrado bloques cssVars").toBeGreaterThan(0);

    const repetidas: string[] = [];
    for (const [, cuerpo] of bloques) {
      const vistas = new Set<string>();
      for (const [, nombre] of cuerpo!.matchAll(/"(--kitsuden-[\w-]+)":/g)) {
        if (vistas.has(nombre!)) repetidas.push(nombre!);
        vistas.add(nombre!);
      }
    }

    expect(
      [...new Set(repetidas)],
      `theme.svelte.ts repite variables dentro de un mismo bloque cssVars. ` +
        `JavaScript se queda con la última sin avisar, así que el tema aplica un ` +
        `color y el código parece decir otro.`
    ).toEqual([]);
  });
});
