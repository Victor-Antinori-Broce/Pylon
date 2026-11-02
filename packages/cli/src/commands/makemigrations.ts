import { exec } from "child_process";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";

import chalk from "chalk";

import { postProcessSqlForIdempotency } from "../migrations/detector.js";
import { findProjectRoot } from "../utils/project.js";

import { makemigrationsDeModelos } from "./modelos.js";

const execAsync = promisify(exec);

export interface MakemigrationsOptions {
  name?: string;
  dryRun?: boolean;
  kon?: string;
  dir?: string;
  allowDestructive?: boolean;
  /** El generador de antes (drizzle-kit export del schema.ts de cada kon). */
  drizzle?: boolean;
}

/**
 * `kitsuden makemigrations`: por defecto, el diff de los modelos declarados
 * con `defineModelo` (fase H3, ver modelos.ts). Con `--drizzle`, el generador
 * de antes (drizzle-kit export del esquema entero de cada kon, con nombre por
 * marca de tiempo): queda por compatibilidad.
 */
export async function makemigrationsCommand(options: MakemigrationsOptions) {
  if (!options.drizzle) {
    console.log(chalk.blue("🔍 Models (defineModelo) → migrations\n"));
    try {
      await makemigrationsDeModelos({
        kon: options.kon,
        dir: options.dir,
        name: options.name,
        dryRun: options.dryRun,
        allowDestructive: options.allowDestructive,
      });
    } catch (error) {
      console.error(chalk.red(`✖ ${(error as Error).message}`));
      process.exit(1);
    }
    return;
  }
  console.log(chalk.blue("🔍 Detectando schemas de kons...\n"));

  try {
    const projectRoot = await findProjectRoot();
    const konsPath = path.join(projectRoot, "packages", "kons");
    const kons = await fs.readdir(konsPath);
    let totalChanges = 0;

    for (const kon of kons) {
      const konPath = path.join(konsPath, kon);
      const stat = await fs.stat(konPath).catch(() => null);
      if (!stat || !stat.isDirectory()) continue;

      // Buscar schema.ts o [kon].schema.ts
      let schemaPath: string | null = null;
      const candidates = [
        path.join(konPath, "schema.ts"),
        path.join(konPath, `${kon.replace(/^kon-/, "")}.schema.ts`),
        path.join(konPath, `${kon}.schema.ts`),
      ];

      for (const candidate of candidates) {
        try {
          await fs.access(candidate);
          schemaPath = candidate;
          break;
        } catch {
          // sigue buscando
        }
      }

      if (!schemaPath) {
        console.log(chalk.gray(`  ${kon}: No schema found`));
        continue;
      }

      console.log(
        chalk.yellow(`  ${kon}: Schema found at ${path.relative(process.cwd(), schemaPath)}`)
      );

      // Generar SQL usando drizzle-kit export
      const sql = await generateSqlWithDrizzleKit(konPath, schemaPath);
      if (!sql || !sql.trim()) {
        console.log(chalk.gray(`    → No SQL generated`));
        continue;
      }

      const idempotentSql = postProcessSqlForIdempotency(sql);
      totalChanges++;

      if (options.dryRun) {
        console.log(chalk.cyan("\n📄 Migration file (dry run):\n"));
        console.log(idempotentSql);
        continue;
      }

      // Guardar archivo
      const migrationsDir = path.join(konPath, "migrations");
      await fs.mkdir(migrationsDir, { recursive: true });

      const timestamp = Date.now();
      const migrationName = options.name || "auto";
      const filename = `${timestamp}_${migrationName}.sql`;
      const filepath = path.join(migrationsDir, filename);

      await fs.writeFile(filepath, idempotentSql + "\n");
      console.log(chalk.green(`  ✓ Created: ${path.relative(process.cwd(), filepath)}\n`));
    }

    if (totalChanges === 0) {
      console.log(chalk.green("\n✅ No schemas with changes found."));
    } else {
      console.log(chalk.green(`\n✅ Created ${totalChanges} migration file(s).`));
      console.log(chalk.gray('Run "kitsuden migrate" to apply them.'));
    }
  } catch (error) {
    console.error(chalk.red("❌ Error:"), error);
    process.exit(1);
  }
}

async function generateSqlWithDrizzleKit(konPath: string, schemaPath: string): Promise<string> {
  const tempSchema = path.join(konPath, "__drizzle_schema.ts");
  const tempConfig = path.join(konPath, "__drizzle_config.ts");

  const relativeSchema = path.relative(konPath, schemaPath).replace(/\\/g, "/");

  try {
    await fs.writeFile(tempSchema, `export * from './${relativeSchema.replace(/\.ts$/, "")}';\n`);

    const configContent = `import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  schema: './__drizzle_schema.ts',
  out: './__drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://localhost/kitsuden'
  }
});
`;
    await fs.writeFile(tempConfig, configContent);

    const { stdout, stderr } = await execAsync(
      "npx drizzle-kit export --config __drizzle_config.ts --sql",
      {
        cwd: konPath,
        env: { ...process.env, NODE_ENV: "development" },
        timeout: 60000,
      }
    );

    if (stderr && !stderr.includes("Reading config file")) {
      console.warn(chalk.yellow(`    drizzle-kit warning: ${stderr.trim()}`));
    }

    return stdout.trim();
  } catch (error: any) {
    console.error(
      chalk.red(`    drizzle-kit export failed for ${path.basename(konPath)}:`),
      error?.stderr || error?.message || error
    );
    return "";
  } finally {
    // Limpiar temporales
    await fs.unlink(tempSchema).catch(() => {});
    await fs.unlink(tempConfig).catch(() => {});
    await fs.rm(path.join(konPath, "__drizzle"), { recursive: true, force: true }).catch(() => {});
  }
}
