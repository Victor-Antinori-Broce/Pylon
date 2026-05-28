import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { execa } from 'execa';
import ora from 'ora';
import { findProjectRoot } from '../utils/project.js';
import postgres from 'postgres';

interface InstallOptions {
  dev?: boolean;
  /** Internal: previene loops en dependencias circulares */
  _installChain?: Set<string>;
}

type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun';

/**
 * Detect package manager used in the project.
 * Priority: bun.lockb > pnpm-lock.yaml > yarn.lock > npm
 */
async function detectPackageManager(projectRoot: string): Promise<PackageManager> {
  const checks: Array<{ file: string; pm: PackageManager }> = [
    { file: 'bun.lockb', pm: 'bun' },
    { file: 'bun.lock', pm: 'bun' },
    { file: 'pnpm-lock.yaml', pm: 'pnpm' },
    { file: 'yarn.lock', pm: 'yarn' },
  ];

  for (const { file, pm } of checks) {
    try {
      await fs.access(path.join(projectRoot, file));
      return pm;
    } catch {
      // Continue
    }
  }
  return 'npm';
}

/**
 * Resolve the physical path inside node_modules for a package name.
 * Handles scoped packages: @scope/name → node_modules/@scope/name
 */
function resolvePackagePath(projectRoot: string, pkgName: string): string {
  return path.join(projectRoot, 'node_modules', pkgName);
}

/**
 * Read DATABASE_URL from .env file
 */
async function getDatabaseUrl(projectRoot: string): Promise<string | null> {
  const envPaths = [
    path.join(projectRoot, 'apps', 'api', '.env'),
    path.join(projectRoot, '.env'),
  ];

  for (const envPath of envPaths) {
    try {
      const content = await fs.readFile(envPath, 'utf-8');
      const match = content.match(/DATABASE_URL=(.+)/);
      if (match) return match[1].trim();
    } catch {
      // Continue to next path
    }
  }

  return process.env.DATABASE_URL || null;
}

/**
 * Read grimoire.json from installed package
 */
async function readGrimoireManifest(pkgPath: string): Promise<any | null> {
  try {
    const grimoireJsonPath = path.join(pkgPath, 'grimoire.json');
    const content = await fs.readFile(grimoireJsonPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    // Fallback: package.json with gremius field
    try {
      const pkgJsonPath = path.join(pkgPath, 'package.json');
      const content = await fs.readFile(pkgJsonPath, 'utf-8');
      const pkg = JSON.parse(content);
      if (pkg.gremius?.type === 'grimoire') {
        return {
          id: pkg.gremius.id || pkg.name,
          name: pkg.gremius.name || pkg.name,
          version: pkg.version,
          description: pkg.description,
          dependencies: pkg.gremius.dependencies || { grimoires: [], core: [] },
          ...pkg.gremius,
        };
      }
    } catch {
      // Ignore
    }
  }
  return null;
}

/**
 * Run SQL migrations from a directory
 */
async function runMigrations(migrationsDir: string, dbUrl: string): Promise<number> {
  let client: postgres.Sql | null = null;
  try {
    client = postgres(dbUrl, { max: 1 });
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of sqlFiles) {
      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf-8');
      await client.unsafe(sql);
    }

    await client.end();
    return sqlFiles.length;
  } catch (err) {
    if (client) await client.end();
    throw err;
  }
}

/**
 * Register grimoire in installed_grimoires table
 */
async function registerGrimoireInDb(
  dbUrl: string,
  grimoireId: string,
  name: string,
  version: string,
  source: string,
  manifest: any
): Promise<void> {
  const client = postgres(dbUrl, { max: 1 });
  try {
    await client`
      INSERT INTO installed_grimoires (
        grimoire_id, name, version, source, source_url, path, manifest, enabled
      ) VALUES (
        ${grimoireId},
        ${name},
        ${version},
        'npm',
        ${source},
        ${`node_modules/${source}`},
        ${JSON.stringify(manifest)},
        true
      )
      ON CONFLICT (grimoire_id) DO UPDATE SET
        version = EXCLUDED.version,
        source_url = EXCLUDED.source_url,
        manifest = EXCLUDED.manifest,
        enabled = true,
        updated_at = NOW()
    `;
  } finally {
    await client.end();
  }
}

/**
 * Update gremius.config.ts to enable the newly installed grimoire.
 * Adds an entry to BASE_FEATURE_GRIMOIRES if not already present.
 */
async function updateGremiusConfig(
  projectRoot: string,
  grimoireId: string,
  grimoireName: string
): Promise<boolean> {
  const configPath = path.join(projectRoot, 'apps', 'api', 'gremius.config.ts');
  try {
    await fs.access(configPath);
  } catch {
    // Config file not found, skip
    return false;
  }

  try {
    let content = await fs.readFile(configPath, 'utf-8');

    // Check if already present
    if (content.includes(`"${grimoireId}"`) || content.includes(`'${grimoireId}'`)) {
      return false; // Already referenced
    }

    // Find the BASE_FEATURE_GRIMOIRES array and append before the closing ]
    const arrayRegex = /(const BASE_FEATURE_GRIMOIRES = \[)([\s\S]*?)(\];)/;
    const match = content.match(arrayRegex);
    if (!match) return false;

    const indent = '  ';
    const newEntry = `{ id: "${grimoireId}", enabled: true },`;

    // Insert before the closing ]
    const beforeClose = match[2];
    const updatedArray = `${match[1]}${beforeClose}${indent}${newEntry}\n${match[3]}`;
    content = content.replace(arrayRegex, updatedArray);

    await fs.writeFile(configPath, content, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Install a grimoire from npm and register it.
 *
 * Flow:
 *   1. Detect project root & package manager
 *   2. npm install <grimoireName>
 *   3. Read grimoire.json / package.json#gremius
 *   4. Recursively install grimoire dependencies (with cycle detection)
 *   5. Run SQL migrations
 *   6. Register in installed_grimoires table
 *   7. Update gremius.config.ts to enable it
 */
export async function installCommand(
  grimoireName: string,
  options: InstallOptions = {}
): Promise<void> {
  const installChain = options._installChain || new Set<string>();

  // Prevent circular dependencies
  if (installChain.has(grimoireName)) {
    console.log(chalk.gray(`  ⏩ ${grimoireName} already in install chain, skipping`));
    return;
  }
  installChain.add(grimoireName);

  console.log(chalk.blue(`🔮 Installing grimoire: ${grimoireName}`));

  // 1. Validate project
  const spinner = ora('Detecting project...').start();
  const projectRoot = await findProjectRoot();
  spinner.succeed(`Project root: ${projectRoot}`);

  // 2. Detect package manager
  const pm = await detectPackageManager(projectRoot);
  console.log(chalk.gray(`  📦 Package manager: ${pm}`));

  // 3. Install package
  const installSpinner = ora(`Installing ${grimoireName} via ${pm}...`).start();
  try {
    const installArgs = pm === 'pnpm'
      ? ['add', grimoireName]
      : pm === 'yarn'
        ? ['add', grimoireName]
        : pm === 'bun'
          ? ['add', grimoireName]
          : ['install', grimoireName];

    if (options.dev) installArgs.push('--save-dev');

    await execa(pm, installArgs, { cwd: projectRoot, stdio: 'pipe' });
    installSpinner.succeed(`${grimoireName} installed`);
  } catch (err: any) {
    installSpinner.fail(`Failed to install ${grimoireName}: ${err.message}`);
    process.exit(1);
  }

  // 4. Read manifest
  const pkgPath = resolvePackagePath(projectRoot, grimoireName);
  const manifest = await readGrimoireManifest(pkgPath);

  if (!manifest) {
    console.log(chalk.yellow(`⚠️  No grimoire.json found in ${grimoireName}`));
    console.log(chalk.gray('   The package was installed but may not be a valid grimoire.'));
    return;
  }

  console.log(chalk.green(`  ✅ Manifest: ${manifest.id} (${manifest.name})`));

  // 5. Install grimoire dependencies recursively
  const deps: string[] = manifest.dependencies?.grimoires || [];
  if (deps.length > 0) {
    console.log(chalk.blue(`  📎 Grimoire dependencies: ${deps.join(', ')}`));
    for (const dep of deps) {
      await installCommand(dep, { ...options, _installChain: installChain });
    }
  }

  // 6. Run migrations
  const migrationsDir = path.join(pkgPath, 'migrations');
  try {
    await fs.access(migrationsDir);
    const dbUrl = await getDatabaseUrl(projectRoot);
    if (!dbUrl) {
      console.log(chalk.yellow('  ⚠️  DATABASE_URL not found. Skipping migrations.'));
    } else {
      const migrationSpinner = ora('Running migrations...').start();
      try {
        const count = await runMigrations(migrationsDir, dbUrl);
        migrationSpinner.succeed(`${count} migration(s) applied`);
      } catch (err: any) {
        migrationSpinner.fail(`Migration failed: ${err.message}`);
        process.exit(1);
      }
    }
  } catch {
    // No migrations directory
    console.log(chalk.gray('  ⏩ No migrations to run'));
  }

  // 7. Register in database
  const dbUrl = await getDatabaseUrl(projectRoot);
  if (dbUrl) {
    const regSpinner = ora('Registering grimoire...').start();
    try {
      await registerGrimoireInDb(
        dbUrl,
        manifest.id || grimoireName,
        manifest.name || grimoireName,
        manifest.version || '0.0.0',
        grimoireName,
        manifest
      );
      regSpinner.succeed('Registered in installed_grimoires');
    } catch (err: any) {
      regSpinner.fail(`Registration failed: ${err.message}`);
    }
  } else {
    console.log(chalk.yellow('  ⚠️  DATABASE_URL not found. Skipping DB registration.'));
  }

  // 8. Update gremius.config.ts
  const configSpinner = ora('Updating gremius.config.ts...').start();
  const configUpdated = await updateGremiusConfig(
    projectRoot,
    manifest.id || grimoireName,
    manifest.name || grimoireName
  );
  if (configUpdated) {
    configSpinner.succeed('Added to gremius.config.ts (enabled)');
  } else {
    configSpinner.info('Skipped config update (already present or not found)');
  }

  // 9. Done
  console.log(chalk.green(`\n🎉 Grimoire ${manifest.name || grimoireName} installed successfully!`));
  console.log(chalk.gray(`   Restart your Gremius API to activate: gremius start`));
}
