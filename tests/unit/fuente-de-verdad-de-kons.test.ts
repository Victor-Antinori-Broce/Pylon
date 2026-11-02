/**
 * `kitsuden.config.ts` siembra; la tabla `modules` manda
 * ============================================================================
 *
 * Hubo dos sitios diciendo qué kons están activos, y no se limitaban a
 * duplicarse: el fichero PISABA a la base.
 *
 *     // Core infrastructure flags from kitsuden.config.ts take precedence
 *     const configFlag = CORE_FLAG_MAP[m.key];
 *     const enabled = configFlag !== undefined ? configFlag : stored.enabled;
 *
 * Con `kon-media` en ese mapa, apagarlo desde el panel se guardaba en la base y
 * `/api/modules` seguía respondiendo lo que decía el fichero: el interruptor
 * volvía solo al recargar. El panel mentía sobre el estado del sistema.
 *
 * ── EL REPARTO QUE ESTA PRUEBA SOSTIENE ────────────────────────────────────
 *
 *   · `kitsuden.config.ts` es la SEMILLA — qué viene encendido de fábrica.
 *     Su único consumidor en ejecución es `lib/sembrar-modulos.ts`.
 *   · la tabla `modules` es la VERDAD — lo que mande el panel.
 *
 * Por eso se vigilan dos cosas distintas:
 *
 *   1. Que los lectores en caliente —el cargador de kons y las rutas del
 *      panel— no vuelvan a consultar el fichero.
 *   2. Que la siembra no pise: rellena huecos, nunca sobrescribe, salvo con
 *      `--forzar` pedido a mano.
 *
 * ── LO QUE SÍ PUEDE SEGUIR LEYENDO EL FICHERO ──────────────────────────────
 *
 * El runner de migraciones, a propósito. Ahí se aplica la UNIÓN de fichero y
 * base porque un superconjunto es la elección segura: aplicar una migración que
 * no hacía falta cuesta un `CREATE TABLE` idempotente, y no aplicar una que sí
 * cuesta una pantalla rota. Es una decisión, no un descuido, y por eso está
 * excluida abajo.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { sinComentarios } from "./helpers/comentarios";

const RAIZ = join(__dirname, "..", "..");

// Mencionar el fichero en un comentario no es leerlo: estos mismos ficheros
// documentan el reparto que se vigila. El limpiador vive en `helpers/` porque
// la versión ingenua de este regex borraba 23 KB de `index.ts` confundiendo las
// rutas comodín (`"/api/v1/*"`) con aperturas de comentario.
const codigo = sinComentarios;

/**
 * Lectores en caliente: deciden qué se carga o qué se responde AHORA.
 *
 * `scripts/migrate.ts` y `scripts/lib/esquemas-de-kons.ts` no están: usan la
 * unión a propósito (ver cabecera).
 */
const LECTORES_EN_CALIENTE = [
  "apps/api/src/lib/module-loader.ts",
  "apps/api/src/routes/modules.ts",
];

describe("una sola fuente de verdad para los kons activos", () => {
  for (const relativo of LECTORES_EN_CALIENTE) {
    it(`${relativo} no consulta kitsuden.config.ts`, () => {
      const fuente = codigo(readFileSync(join(RAIZ, relativo), "utf-8"));

      expect(
        /kitsuden\.config/.test(fuente),
        `${relativo} vuelve a leer kitsuden.config.ts para decidir qué está ` +
          `activo.\n\n` +
          `El fichero solo SIEMBRA la base (lib/sembrar-modulos.ts, en el ` +
          `arranque). A partir de ahí manda la tabla 'modules'; si no, lo que ` +
          `el usuario toque en el panel se revierte solo y el interruptor ` +
          `miente — que es como estaba kon-media.`
      ).toBe(false);
    });
  }

  it("la siembra no sobrescribe salvo que se le pida", () => {
    const fuente = readFileSync(join(RAIZ, "apps/api/src/lib/sembrar-modulos.ts"), "utf-8");

    // Solo puede haber UN UPDATE de `enabled`, y tiene que estar detrás de
    // `forzar`. Un UPDATE incondicional convertiría la siembra en la imposición
    // que se acaba de quitar.
    const updates = [...codigo(fuente).matchAll(/UPDATE modules SET enabled/g)];
    expect(updates.length, "más de un UPDATE de enabled en la siembra").toBe(1);

    const antesDelUpdate = codigo(fuente).slice(0, updates[0]!.index);
    expect(
      /opciones\.forzar/.test(antesDelUpdate),
      "el UPDATE de `enabled` no está protegido por `opciones.forzar`: la " +
        "siembra volvería a imponer el fichero sobre lo que decida el usuario."
    ).toBe(true);
  });

  it("el arranque siembra antes de cargar los kons", () => {
    /**
     * El orden importa y no es evidente: desde que el cargador lee SOLO la
     * base, una instalación nueva arrancaría sin ningún kon si la siembra
     * corriera después. Sería un sistema vacío sin ningún error.
     */
    const fuente = codigo(readFileSync(join(RAIZ, "apps/api/src/index.ts"), "utf-8"));
    const siembra = fuente.indexOf("sembrarModulos");
    const carga = fuente.indexOf("loadModules(app)");

    expect(siembra, "index.ts ya no siembra los módulos").toBeGreaterThan(-1);
    expect(carga, "index.ts ya no carga los kons").toBeGreaterThan(-1);
    expect(
      siembra < carga,
      "la siembra tiene que ir ANTES de loadModules(app): el cargador lee la " +
        "base, y en una instalación nueva la base está vacía hasta que se siembra."
    ).toBe(true);
  });
});
