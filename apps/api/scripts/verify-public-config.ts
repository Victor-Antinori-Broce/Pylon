/**
 * Paso 0 del arranque: una instalación pública no arranca mal configurada
 * ============================================================================
 *
 * Lo llama `docker/start-with-check.sh` antes de tocar la base. Fallar aquí
 * es barato: todavía no se ha migrado nada ni se ha servido a nadie.
 *
 * La lógica vive en `src/lib/config-publica.ts` para poder probarla sin
 * arrancar nada. Este fichero solo decide si aplica y cómo salir.
 *
 * `process.exit` explícito en los dos caminos: el módulo de correo puede dejar
 * recursos abiertos al importarse, y un proceso que no termina dejaría el
 * arranque colgado en este paso sin decir por qué.
 */

import { problemasDeConfigPublica } from "../src/lib/config-publica";

if (process.env.KITSUDEN_PUBLIC !== "true") {
  console.log(
    "  Modo local (KITSUDEN_PUBLIC no es true): no se exigen URLs públicas ni correo real."
  );
  process.exit(0);
}

const problemas = problemasDeConfigPublica(process.env);

if (problemas.length === 0) {
  console.log("  Configuración pública verificada: https, sin localhost, correo real.");
  process.exit(0);
}

console.error("\n  ✗ Esta instalación está marcada como pública y no está lista:\n");
for (const p of problemas) console.error(`     · ${p.variable}: ${p.motivo}`);
console.error(
  "\n    Corrige .env y vuelve a arrancar. Para uso local, no actives KITSUDEN_PUBLIC.\n"
);
process.exit(1);
