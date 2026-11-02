/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MAP COMMAND — System Map determinista (sin IA)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   kitsuden map                 # resumen del mapa repo + app
 *   kitsuden map --json          # grafo completo en JSON
 *   kitsuden map --toon          # grafo completo en TOON (vía la API)
 *
 * Config: KITSUDEN_API_URL (default http://localhost:3000), KITSUDEN_API_TOKEN.
 */

import chalk from "chalk";

interface MapOptions {
  json?: boolean;
  toon?: boolean;
}

export async function mapCommand(options: MapOptions = {}): Promise<void> {
  const base = process.env.KITSUDEN_API_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const token = process.env.KITSUDEN_API_TOKEN;
  const format = options.toon ? "?format=toon" : "";

  try {
    const res = await fetch(`${base}/api/map${format}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (options.toon) {
      console.log(await res.text());
      return;
    }

    const map = (await res.json()) as any;

    if (options.json) {
      console.log(JSON.stringify(map, null, 2));
      return;
    }

    const s = map.summary ?? {};
    console.log(chalk.cyan("\n🗺️  System Map\n"));
    console.log(`  Endpoints:     ${s.totalEndpoints ?? 0}`);
    console.log(`  Tablas (repo): ${s.totalRepoTables ?? 0}`);
    console.log(`  Tablas (DB):   ${s.totalDbTables ?? 0}`);
    console.log(`  Kons:        ${s.totalKons ?? 0}`);
    console.log(`  Servicios:     ${s.totalServices ?? 0}`);
    console.log(`  Libs:          ${s.totalLibs ?? 0}`);
    console.log(`  Relaciones FK: ${s.totalRelations ?? 0}`);
    console.log(
      chalk.gray(
        `\n  Grafo: ${map.graph?.nodes?.length ?? 0} nodos, ${map.graph?.edges?.length ?? 0} aristas`
      )
    );
    console.log(chalk.gray("  (usa --json para el grafo completo, --toon para formato TOON)\n"));
  } catch (err) {
    console.error(chalk.red(`Fallo al contactar la API en ${base}: ${(err as Error).message}`));
    console.error(chalk.gray("¿Está corriendo la API? (kitsuden dev / kitsuden start)"));
    process.exit(1);
  }
}
