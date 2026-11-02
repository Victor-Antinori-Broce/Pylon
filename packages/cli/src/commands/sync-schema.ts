/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SYNC-SCHEMA — Regenera el agregado de schemas de kons
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   kitsuden sync-schema
 *
 * Escanea el bloque `schema` de cada kon.json y regenera
 * apps/api/src/db/schema-kons.generated.ts (el agregado que consume
 * drizzle-kit). Reemplaza la edición MANUAL de schema-all.ts.
 *
 * Estrategias por kon (kon.json → "schema"):
 *   - "drizzle": tablas gestionadas por drizzle-kit → entran al agregado.
 *   - "sql":     el kon auto-migra por SQL propio → se EXCLUYE (solo tipos).
 *   - "authoritative": true → sus símbolos ganan sobre schema-core al colisionar.
 */

import { exec } from "child_process";
import path from "path";
import { promisify } from "util";

import chalk from "chalk";

import { findProjectRoot } from "../utils/project.js";

const execAsync = promisify(exec);

export async function syncSchemaCommand(): Promise<void> {
  try {
    const projectRoot = await findProjectRoot();
    const script = path.join(projectRoot, "apps", "api", "scripts", "sync-kon-schema.ts");

    console.log(chalk.blue("🔄 Regenerando agregado de schemas de kons...\n"));

    const { stdout, stderr } = await execAsync(`bun run "${script}"`, {
      cwd: projectRoot,
      env: process.env,
    });

    // El script imprime el resumen (archivo + kons + colisiones).
    const noise = /Config|Kons directory/;
    for (const line of `${stdout}${stderr}`.split("\n")) {
      if (line.trim() && !noise.test(line)) console.log(line);
    }

    console.log(chalk.gray("\nSiguiente: kitsuden makemigrations && kitsuden migrate"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red("❌ sync-schema falló:"), msg);
    process.exit(1);
  }
}
