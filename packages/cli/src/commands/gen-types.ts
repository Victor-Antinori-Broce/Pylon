import path from "path";

import chalk from "chalk";
import fs from "fs-extra";
import ora from "ora";

/**
 * `kitsuden gen types` — tipos TypeScript desde el esquema
 * ============================================================================
 *
 * El equivalente a `supabase gen types typescript`, y la pieza que separa
 * "tengo un SDK" de "escribir el frontend es agradable": la diferencia entre
 * autocompletado en cada consulta y `Record<string, any>` en todas.
 *
 * Lee el esquema por HTTP en vez de conectarse a la base de datos a propósito:
 * así funciona contra un despliegue remoto, no exige credenciales de Postgres
 * en la máquina de quien lo ejecuta, y respeta los permisos de la API.
 */

export interface GenTypesOptions {
  url?: string;
  out?: string;
  exclude?: string;
  databaseName?: string;
}

export async function genTypesCommand(options: GenTypesOptions = {}) {
  const baseUrl = (options.url ?? process.env.KITSUDEN_API_URL ?? "http://localhost:3001").replace(
    /\/$/,
    ""
  );
  const outFile = options.out ?? "src/kitsuden.types.ts";

  const spinner = ora(`Leyendo el esquema de ${baseUrl}…`).start();

  try {
    const listRes = await fetch(`${baseUrl}/api/schema/tables`, {
      credentials: "include",
      headers: { accept: "application/json" },
    });

    if (!listRes.ok) {
      spinner.fail(chalk.red(`No se pudo leer el esquema: HTTP ${listRes.status}`));
      if (listRes.status === 401 || listRes.status === 403) {
        console.log(
          chalk.gray("   La introspección exige sesión. Ejecuta `kitsuden auth` o pasa --url.")
        );
      }
      process.exit(1);
    }

    const payload = (await listRes.json()) as { tables?: unknown };
    const names = normalizeTableNames(payload.tables);

    if (names.length === 0) {
      spinner.warn(chalk.yellow("El esquema no tiene tablas. ¿Faltan migraciones?"));
      process.exit(1);
    }

    spinner.text = `Introspeccionando ${names.length} tablas…`;

    // En serie y no en paralelo: son decenas de tablas y una ráfaga simultánea
    // contra un despliegue pequeño es la forma de que el generador tire la API
    // que está intentando describir.
    const tables = [];
    for (const name of names) {
      const res = await fetch(`${baseUrl}/api/schema/tables/${encodeURIComponent(name)}`, {
        credentials: "include",
        headers: { accept: "application/json" },
      });
      if (!res.ok) continue;
      const body = (await res.json()) as { table?: unknown };
      if (body.table) tables.push(body.table);
    }

    if (tables.length === 0) {
      spinner.fail(chalk.red("Ninguna tabla se pudo introspeccionar."));
      process.exit(1);
    }

    const { generateTypes } = await import("@kitsuden/codegen/generators/types");

    const code = generateTypes(tables as never, {
      exclude: options.exclude
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      databaseTypeName: options.databaseName,
    });

    const target = path.resolve(process.cwd(), outFile);
    await fs.ensureDir(path.dirname(target));

    // Si el contenido no cambia, no se toca el fichero: así regenerar tras cada
    // migración no ensucia el árbol de git ni dispara recompilaciones.
    const previous = (await fs.pathExists(target)) ? await fs.readFile(target, "utf-8") : null;
    if (previous === code) {
      spinner.succeed(chalk.green(`Sin cambios en el esquema — ${outFile} ya está al día`));
      return;
    }

    await fs.writeFile(target, code, "utf-8");
    spinner.succeed(chalk.green(`Tipos generados para ${tables.length} tablas → ${outFile}`));

    console.log();
    console.log(chalk.gray("   Úsalo así:"));
    console.log(
      chalk.gray(`     import type { Database, Row } from "./${path.basename(outFile, ".ts")}";`)
    );
    console.log(
      chalk.gray(`     const client = createClient<Database>({ baseUrl: "${baseUrl}" });`)
    );
    console.log();
    console.log(chalk.gray("   Regenera tras cada migración."));
  } catch (err) {
    spinner.fail(chalk.red("Falló la generación de tipos"));
    console.error(chalk.gray(`   ${err instanceof Error ? err.message : String(err)}`));
    if (err instanceof Error && /fetch failed|ECONNREFUSED/i.test(err.message)) {
      console.log(chalk.gray(`   ¿Está el servidor levantado en ${baseUrl}?`));
    }
    process.exit(1);
  }
}

/**
 * La ruta de tablas puede devolver cadenas o fichas.
 * Se normaliza aquí para que un cambio de forma en la API no rompa el comando
 * con un error indescifrable.
 */
function normalizeTableNames(tables: unknown): string[] {
  if (!Array.isArray(tables)) return [];
  return tables
    .map((t) => (typeof t === "string" ? t : ((t as { name?: string })?.name ?? null)))
    .filter((n): n is string => typeof n === "string" && n.length > 0);
}
