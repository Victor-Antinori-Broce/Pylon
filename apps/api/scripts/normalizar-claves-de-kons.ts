/**
 * Normaliza las claves de `modules` a la forma `kon-<id>`
 * ============================================================================
 *
 * ── EL PROBLEMA ────────────────────────────────────────────────────────────
 *
 * La tabla `modules` guarda el estado de cada kon (encendido, ajustes,
 * grimoire) bajo una `key`. Conviven dos formas de la misma clave:
 *
 *     blog        ← forma antigua, de antes del prefijo
 *     kon-blog    ← forma actual
 *
 * Y eso rompe de dos maneras distintas, las dos silenciosas:
 *
 *   1. El panel enseñaba DOS tarjetas del mismo kon, una por clave.
 *   2. El estado se ORFANA. `kon-games` no tenía fila; la suya se llamaba
 *      `games` y decía `enabled=false`. Mientras la API desplegada era vieja
 *      el valor se ignoraba y el kon servía igual; al desplegar la API al día,
 *      games empezó a responder «Kon no activado» sin que nadie lo hubiera
 *      apagado.
 *
 * Ese segundo caso es el que hace que esto no sea cosmético: una fila con la
 * clave equivocada es un ajuste que no se aplica y que nadie ve.
 *
 * ── QUE HACE ───────────────────────────────────────────────────────────────
 *
 * Para cada fila cuya clave no lleva el prefijo:
 *
 *   · si NO existe la fila prefijada → se renombra.
 *   · si SÍ existe → se FUSIONA y se borra la antigua. Fusionar y no pisar:
 *     `enabled` se queda en `true` si alguna de las dos lo estaba, porque
 *     apagar un kon que alguien encendió es la única de las dos direcciones
 *     que rompe algo. Los ajustes de la fila prefijada mandan; los que solo
 *     estén en la antigua se conservan.
 *
 * Es idempotente: pasarlo dos veces no cambia nada la segunda.
 *
 *     bun scripts/normalizar-claves-de-kons.ts            (informa)
 *     bun scripts/normalizar-claves-de-kons.ts --aplicar  (escribe)
 */

import { sql } from "drizzle-orm";

import { db } from "../src/db";

const aplicar = process.argv.includes("--aplicar");

interface Fila {
  key: string;
  name: string | null;
  enabled: boolean;
  settings: unknown;
  grimoire_id: string | null;
}

function filasDe<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  const c = r as { rows?: unknown };
  return Array.isArray(c?.rows) ? (c.rows as T[]) : [];
}

const todas = filasDe<Fila>(
  await db.execute(sql`SELECT key, name, enabled, settings, grimoire_id FROM modules ORDER BY key`)
);

const porClave = new Map(todas.map((f) => [f.key, f]));
const sinPrefijo = todas.filter((f) => !f.key.startsWith("kon-"));

console.log(`\nFilas en \`modules\`: ${todas.length}`);
console.log(
  `Claves sin prefijo:  ${sinPrefijo.length}${sinPrefijo.length ? "" : "  (nada que hacer)"}\n`
);

if (sinPrefijo.length === 0) {
  console.log("Ya está todo normalizado.\n");
  process.exit(0);
}

let renombradas = 0;
let fusionadas = 0;

for (const vieja of sinPrefijo) {
  const nuevaClave = `kon-${vieja.key}`;
  const existente = porClave.get(nuevaClave);

  if (!existente) {
    console.log(`  renombrar  ${vieja.key}  →  ${nuevaClave}   (enabled=${vieja.enabled})`);
    if (aplicar) {
      await db.execute(sql`UPDATE modules SET key = ${nuevaClave} WHERE key = ${vieja.key}`);
    }
    renombradas++;
    continue;
  }

  // Encendido si CUALQUIERA de las dos lo estaba: apagar es la dirección que
  // rompe cosas, y la fila vieja puede llevar el «sí» que alguien dio hace
  // meses.
  const encendido = existente.enabled || vieja.enabled;

  console.log(
    `  fusionar   ${vieja.key} + ${nuevaClave}  →  ${nuevaClave}   ` +
      `(enabled: ${vieja.enabled} | ${existente.enabled}  →  ${encendido})`
  );

  if (aplicar) {
    await db.execute(sql`
      UPDATE modules
         SET enabled = ${encendido},
             grimoire_id = COALESCE(grimoire_id, ${vieja.grimoire_id}),
             settings = COALESCE(NULLIF(settings, '{}'::jsonb), ${JSON.stringify(vieja.settings ?? {})}::jsonb)
       WHERE key = ${nuevaClave}
    `);
    await db.execute(sql`DELETE FROM modules WHERE key = ${vieja.key}`);
  }
  fusionadas++;
}

console.log(
  `\n${aplicar ? "Aplicado" : "Simulacro"}: ${renombradas} renombrada(s), ${fusionadas} fusionada(s).`
);
if (!aplicar) console.log("Vuelve a ejecutarlo con --aplicar para escribir.\n");
else console.log("");

process.exit(0);
