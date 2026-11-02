#!/usr/bin/env bun
/**
 * Siembra y reconciliación de `modules` desde `kitsuden.config.ts`
 * ============================================================================
 *
 * La API siembra sola en cada arranque: rellena en la tabla `modules` los kons
 * que la configuración declara y la base todavía no conoce, sin tocar ninguna
 * fila existente. Este script hace lo mismo a mano, y añade lo que el arranque
 * NO hace por su cuenta.
 *
 * ── POR QUÉ EXISTE `--forzar` ──────────────────────────────────────────────
 *
 * Porque hay dos formas legítimas de operar esto y no quería elegir por ti:
 *
 *   · La normal — la base manda. Enciendes y apagas kons desde el panel, y el
 *     fichero solo dice qué viene de fábrica en una instalación nueva.
 *   · La de git — el estado deseado vive en el repositorio. Editas el fichero,
 *     despliegas, y quieres que la base se ajuste a él.
 *
 * `--forzar` es la segunda, PEDIDA. Sobrescribe `enabled` en la base con lo que
 * diga el fichero. Se hace explícito y nunca en el arranque porque hacerlo
 * automáticamente es exactamente el fallo que este reparto vino a corregir:
 * apagabas un kon en el panel y el fichero lo volvía a encender sin decir nada.
 *
 * ── USO ────────────────────────────────────────────────────────────────────
 *
 *   bun run scripts/sembrar-modulos.ts            rellenar huecos (lo del arranque)
 *   bun run scripts/sembrar-modulos.ts --dry-run  qué haría, sin tocar nada
 *   bun run scripts/sembrar-modulos.ts --forzar   imponer el fichero sobre la base
 */

import { sembrarModulos } from "../src/lib/sembrar-modulos";

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const forzar = args.has("--forzar");
  const simulacro = args.has("--dry-run");

  if (simulacro) {
    // Sembrar en seco no tiene un modo propio: se hace la lectura y se informa
    // sin escribir. Se implementa aquí y no en `sembrarModulos` para que esa
    // función siga teniendo una sola responsabilidad.
    const { db } = await import("../src/db");
    const { sql } = await import("drizzle-orm");
    const config = await import("../kitsuden.config");
    const estatica = config.staticConfig ?? config.default;

    const res = (await db.execute(sql.raw(`SELECT key, enabled FROM modules`))) as unknown as {
      rows?: { key: string; enabled: boolean }[];
    };
    const filas = Array.isArray(res) ? res : (res.rows ?? []);
    // Misma normalizacion que la siembra: la base guarda `games` y la
    // configuracion dice `kon-games`. Comparar en crudo mentiria dos veces.
    const canonica = (id: string) => id.replace(/^kon-/, "");
    const enLaBase = new Map(filas.map((f) => [canonica(f.key), f.enabled]));

    const todas = [
      ...(estatica.core ?? []).map((k) => ({ id: k.id, enabled: k.enabled })),
      ...(estatica.features ?? []).map((k) => ({ id: k.id, enabled: k.enabled })),
    ];

    console.log(`\nSemillas en la configuración: ${todas.length}\n`);
    for (const s of todas) {
      const actual = enLaBase.get(canonica(s.id));
      if (actual === undefined) {
        console.log(`  SEMBRARÍA   ${s.id}  →  enabled=${s.enabled}`);
      } else if (actual !== s.enabled) {
        console.log(
          `  DIFIERE     ${s.id}  →  base=${actual}, fichero=${s.enabled}` +
            `  (solo cambia con --forzar)`
        );
      }
    }
    console.log("\n  (--dry-run: no se ha escrito nada)\n");
    return;
  }

  const r = await sembrarModulos({ forzar });

  console.log("");
  if (r.sembrados.length > 0) console.log(`  sembrados   ${r.sembrados.join(", ")}`);
  if (r.impuestos.length > 0) console.log(`  impuestos   ${r.impuestos.join(", ")}`);
  if (r.sembrados.length === 0 && r.impuestos.length === 0) {
    console.log(`  Nada que hacer: ${r.respetados.length} kon(s) ya en la base.`);
  } else {
    console.log(`  ${r.respetados.length} kon(s) sin tocar: la base ya tenía su propia opinión.`);
  }
  console.log("");
}

// Salir SIEMPRE: `db` deja abierto un pool y el proceso no terminaría solo.
// Ver tests/unit/scripts-arranque-terminan.test.ts.
main()
  .catch((err) => {
    console.error(`\n  ✗ ${err instanceof Error ? err.message : err}\n`);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
