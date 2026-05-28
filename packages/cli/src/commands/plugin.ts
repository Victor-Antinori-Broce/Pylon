/**
 * PLUGIN Command - Manage grimoire plugins
 */

import chalk from "chalk";
import ora from "ora";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { execa } from "execa";
import fetch from "node-fetch";

// ═══════════════════════════════════════════════════════════════════════════
// PLUGIN REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

const NPM_REGISTRY = "https://registry.npmjs.org";

interface GrimoireInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  license?: string;
  downloads?: number;
  official?: boolean;
  installed?: boolean;
  enabled?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// INSTALL
// ═══════════════════════════════════════════════════════════════════════════

interface InstallOptions {
  version?: string;
  source?: string;
  save?: boolean;
  enable?: boolean;
}

export async function install(packageName: string, options: InstallOptions) {
  console.log(chalk.blue(`\n📦 Installing ${chalk.bold(packageName)}...\n`));

  const spinner = ora("Resolving package...").start();

  try {
    // Resolve package
    const resolvedName = resolvePackageName(packageName);
    
    // Check if already installed
    const projectRoot = findProjectRoot();
    const isInstalled = await checkInstalled(projectRoot, resolvedName);
    
    if (isInstalled) {
      spinner.warn(chalk.yellow(`${resolvedName} is already installed`));
      
      const { reinstall } = await (await import("inquirer")).default.prompt([{
        type: "confirm",
        name: "reinstall",
        message: "Reinstall/Update?",
        default: false,
      }]);
      
      if (!reinstall) {
        console.log(chalk.gray("Cancelled"));
        return;
      }
    }

    spinner.text = "Installing from npm...";

    // Install with npm/pnpm
    const packageManager = detectPackageManager(projectRoot);
    
    if (packageManager === "pnpm") {
      await execa("pnpm", ["add", resolvedName], { 
        cwd: projectRoot, 
        stdio: "ignore" 
      });
    } else if (packageManager === "npm") {
      await execa("npm", ["install", resolvedName], { 
        cwd: projectRoot, 
        stdio: "ignore" 
      });
    } else {
      throw new Error("No package manager found (pnpm or npm required)");
    }

    spinner.text = "Configuring grimoire...";

    // Read grimoire manifest from node_modules
    const manifest = await readGrimoireManifest(projectRoot, resolvedName);
    
    if (!manifest) {
      spinner.warn("No grimoire.json found. Package might not be a valid grimoire.");
    }

    // Update gremius.config.ts if needed
    if (options.save !== false && manifest) {
      await addToConfig(projectRoot, manifest.id || packageName);
    }

    // Register in database (if DB is available)
    try {
      await registerInDatabase(projectRoot, {
        grimoireId: manifest?.id || packageName,
        name: manifest?.name || packageName,
        version: manifest?.version || "1.0.0",
        source: "npm",
        sourceUrl: resolvedName,
        path: join(projectRoot, "node_modules", resolvedName),
        manifest,
        enabled: options.enable !== false,
      });
    } catch {
      // DB might not be ready yet, that's ok
    }

    // Run migrations if available
    spinner.text = "Running migrations...";
    try {
      await execa("pnpm", ["db:push"], { cwd: projectRoot, stdio: "ignore" });
    } catch {
      // Migrations might fail if DB is not running
    }

    spinner.succeed(chalk.green(`Installed ${chalk.bold(resolvedName)}`));

    console.log(chalk.bold("\nNext steps:\n"));
    console.log(chalk.gray("  Restart your development server:"));
    console.log(chalk.gray("  pnpm dev\n"));

  } catch (error: any) {
    spinner.fail(chalk.red(`Installation failed: ${error.message}`));
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UNINSTALL
// ═══════════════════════════════════════════════════════════════════════════

interface UninstallOptions {
  purge?: boolean;
}

export async function uninstall(packageName: string, options: UninstallOptions) {
  console.log(chalk.blue(`\n🗑️  Uninstalling ${chalk.bold(packageName)}...\n`));

  const spinner = ora("Removing package...").start();

  try {
    const projectRoot = findProjectRoot();
    const resolvedName = resolvePackageName(packageName);

    // Uninstall with npm/pnpm
    const packageManager = detectPackageManager(projectRoot);
    
    if (packageManager === "pnpm") {
      await execa("pnpm", ["remove", resolvedName], { 
        cwd: projectRoot, 
        stdio: "ignore" 
      });
    } else if (packageManager === "npm") {
      await execa("npm", ["uninstall", resolvedName], { 
        cwd: projectRoot, 
        stdio: "ignore" 
      });
    }

    // Remove from config
    await removeFromConfig(projectRoot, packageName);

    // Remove from database
    try {
      await unregisterFromDatabase(projectRoot, packageName);
    } catch {
      // Ignore DB errors
    }

    // Purge data if requested
    if (options.purge) {
      spinner.text = "Purging data...";
      // This would require DB connection to drop tables
      // For now, just warn the user
      console.log(chalk.yellow("\n⚠️  Data purging requires manual database cleanup"));
    }

    spinner.succeed(chalk.green(`Uninstalled ${chalk.bold(packageName)}`));

  } catch (error: any) {
    spinner.fail(chalk.red(`Uninstall failed: ${error.message}`));
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LIST
// ═══════════════════════════════════════════════════════════════════════════

interface ListOptions {
  all?: boolean;
  json?: boolean;
}

export async function list(options: ListOptions) {
  const projectRoot = findProjectRoot();
  
  // Read installed from DB
  const installed = await getInstalledGrimoires(projectRoot);

  if (options.json) {
    console.log(JSON.stringify(installed, null, 2));
    return;
  }

  console.log(chalk.bold("\n📦 Installed Grimoires\n"));

  if (installed.length === 0) {
    console.log(chalk.gray("  No grimoires installed.\n"));
    console.log(chalk.gray("  Run 'gremius plugin install <package>' to add one.\n"));
    return;
  }

  for (const g of installed) {
    const statusIcon = g.enabled ? chalk.green("●") : chalk.gray("○");
    const officialBadge = g.source === "npm" && g.sourceUrl?.startsWith("@gremius/") 
      ? chalk.blue("[official]") 
      : "";
    
    console.log(`  ${statusIcon} ${chalk.bold(g.name)} ${chalk.gray(g.version)} ${officialBadge}`);
    if (g.description) {
      console.log(chalk.gray(`    ${g.description}`));
    }
    console.log();
  }

  // Show available if --all
  if (options.all) {
    console.log(chalk.bold("\n📦 Available Grimoires\n"));
    
    const available = await searchNpm("grimoire");
    const notInstalled = available.filter(a => !installed.some(i => i.grimoireId === a.id));
    
    for (const g of notInstalled.slice(0, 10)) {
      console.log(`  ${chalk.gray("○")} ${chalk.bold(g.name)} ${chalk.gray(g.version)}`);
      if (g.description) {
        console.log(chalk.gray(`    ${g.description}`));
      }
      console.log();
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════════════════════════════

interface SearchOptions {
  limit?: string;
}

export async function search(query: string, options: SearchOptions) {
  const limit = parseInt(options.limit || "20");
  
  console.log(chalk.blue(`\n🔍 Searching for "${chalk.bold(query)}"...\n`));

  const spinner = ora("Searching npm registry...").start();

  try {
    // Search npm
    const npmResults = await searchNpm(query, limit);
    
    spinner.stop();

    if (npmResults.length === 0) {
      console.log(chalk.yellow("  No grimoires found.\n"));
      return;
    }

    for (const pkg of npmResults) {
      const officialBadge = pkg.official ? chalk.blue("[official]") : "";
      const installedBadge = pkg.installed ? chalk.green("[installed]") : "";
      
      console.log(`  ${chalk.bold(pkg.name)} ${chalk.gray(pkg.version)} ${officialBadge} ${installedBadge}`);
      if (pkg.description) {
        console.log(chalk.gray(`    ${pkg.description}`));
      }
      if (pkg.downloads) {
        console.log(chalk.gray(`    📥 ${pkg.downloads.toLocaleString()} downloads`));
      }
      console.log();
    }

  } catch (error: any) {
    spinner.fail(chalk.red(`Search failed: ${error.message}`));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ENABLE / DISABLE
// ═══════════════════════════════════════════════════════════════════════════

export async function enable(packageName: string) {
  const projectRoot = findProjectRoot();
  
  await updateGrimoireStatus(projectRoot, packageName, true);
  console.log(chalk.green(`✓ Enabled ${packageName}`));
}

export async function disable(packageName: string) {
  const projectRoot = findProjectRoot();
  
  await updateGrimoireStatus(projectRoot, packageName, false);
  console.log(chalk.yellow(`✓ Disabled ${packageName}`));
}

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE
// ═══════════════════════════════════════════════════════════════════════════

interface UpdateOptions {
  all?: boolean;
}

export async function update(packageName: string | undefined, options: UpdateOptions) {
  if (options.all) {
    console.log(chalk.blue("\n🔄 Updating all grimoires...\n"));
    
    const projectRoot = findProjectRoot();
    const installed = await getInstalledGrimoires(projectRoot);
    
    for (const g of installed) {
      if (g.sourceUrl) {
        await install(g.sourceUrl, { version: "latest" });
      }
    }
  } else if (packageName) {
    await install(packageName, { version: "latest" });
  } else {
    console.log(chalk.red("Specify a package name or use --all"));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function resolvePackageName(name: string): string {
  // If already scoped or prefixed, return as-is
  if (name.startsWith("@") || name.startsWith("grimoire-")) {
    return name;
  }
  
  // Try official @gremius scope first
  return `@gremius/grimoire-${name}`;
}

function findProjectRoot(): string {
  let current = process.cwd();
  
  while (current !== "/") {
    if (existsSync(join(current, "apps", "api", "gremius.config.ts")) ||
        existsSync(join(current, "gremius.config.ts"))) {
      return current;
    }
    current = join(current, "..");
  }
  
  throw new Error("Not in a Gremius project. Run from project root.");
}

function detectPackageManager(projectRoot: string): "pnpm" | "npm" | null {
  if (existsSync(join(projectRoot, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (existsSync(join(projectRoot, "package-lock.json"))) {
    return "npm";
  }
  // Default to pnpm
  return "pnpm";
}

async function checkInstalled(projectRoot: string, packageName: string): Promise<boolean> {
  const nodeModulesPath = join(projectRoot, "node_modules", packageName);
  return existsSync(nodeModulesPath);
}

async function readGrimoireManifest(projectRoot: string, packageName: string): Promise<any> {
  try {
    const grimoireJsonPath = join(projectRoot, "node_modules", packageName, "grimoire.json");
    const content = await readFile(grimoireJsonPath, "utf-8");
    return JSON.parse(content);
  } catch {
    try {
      const pkgJsonPath = join(projectRoot, "node_modules", packageName, "package.json");
      const content = await readFile(pkgJsonPath, "utf-8");
      const pkg = JSON.parse(content);
      return pkg.gremius;
    } catch {
      return null;
    }
  }
}

async function addToConfig(projectRoot: string, grimoireId: string) {
  const configPath = join(projectRoot, "apps", "api", "gremius.config.ts");
  
  try {
    let content = await readFile(configPath, "utf-8");
    
    // Simple regex-based addition (in production, use AST parsing)
    const grimoiresMatch = content.match(/grimoires:\s*\[([^\]]*)\]/);
    
    if (grimoiresMatch) {
      const existing = grimoiresMatch[1];
      if (!existing.includes(grimoireId)) {
        const newGrimoires = existing.trim() 
          ? `${existing.trim()},\n    "${grimoireId}",`
          : `\n    "${grimoireId}",`;
        
        content = content.replace(
          /grimoires:\s*\[[^\]]*\]/,
          `grimoires: [${newGrimoires}\n  ]`
        );
        
        await writeFile(configPath, content);
      }
    }
  } catch {
    // Config update failed, but package is installed
  }
}

async function removeFromConfig(projectRoot: string, grimoireId: string) {
  const configPath = join(projectRoot, "apps", "api", "gremius.config.ts");
  
  try {
    let content = await readFile(configPath, "utf-8");
    
    // Remove from grimoires array
    content = content.replace(
      new RegExp(`\\s*"${grimoireId}",?`, "g"),
      ""
    );
    
    await writeFile(configPath, content);
  } catch {
    // Ignore
  }
}

async function registerInDatabase(_projectRoot: string, _info: any) {
  // This would make an API call to the running server
  // For now, just log it
}

async function unregisterFromDatabase(_projectRoot: string, _grimoireId: string) {
  // This would make an API call
}

async function getInstalledGrimoires(projectRoot: string): Promise<any[]> {
  // Try to read from API or fallback to reading node_modules
  try {
    const response = await fetch("http://localhost:3000/api/admin/grimoires/installed");
    if (response.ok) {
      const data = await response.json() as any[];
      return data;
    }
  } catch {
    // API not running, scan node_modules
  }
  
  // Fallback: scan node_modules for @gremius packages
  const grimoires: any[] = [];
  const nodeModules = join(projectRoot, "node_modules");
  
  try {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(nodeModules);
    
    for (const entry of entries) {
      if (entry.startsWith("grimoire-") || entry.startsWith("@")) {
        const manifest = await readGrimoireManifest(projectRoot, entry);
        if (manifest) {
          grimoires.push({
            grimoireId: manifest.id || entry,
            name: manifest.name || entry,
            version: manifest.version || "unknown",
            description: manifest.description,
            source: "npm",
            sourceUrl: entry,
            enabled: true,
          });
        }
      }
    }
  } catch {
    // Ignore
  }
  
  return grimoires;
}

async function updateGrimoireStatus(_projectRoot: string, grimoireId: string, enabled: boolean) {
  // Make API call to update status
  try {
    const response = await fetch(`http://localhost:3000/api/admin/grimoires/${grimoireId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    
    if (!response.ok) {
      throw new Error("Failed to update status");
    }
  } catch {
    console.log(chalk.yellow("⚠️  Could not connect to API. Make sure the server is running."));
  }
}

async function searchNpm(query: string, limit = 20): Promise<GrimoireInfo[]> {
  const searchQuery = query.includes("grimoire") ? query : `grimoire-${query}`;
  
  try {
    const response = await fetch(
      `${NPM_REGISTRY}/-/v1/search?text=${encodeURIComponent(searchQuery)}&size=${limit}`
    );
    
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json() as any;
    
    return data.objects.map((obj: any) => ({
      id: obj.package.name.replace(/^@gremius\/grimoire-/, "").replace(/^grimoire-/, ""),
      name: obj.package.name,
      description: obj.package.description,
      version: obj.package.version,
      author: obj.package.author?.name,
      downloads: obj.downloads?.weekly,
      official: obj.package.name.startsWith("@gremius/"),
    }));
  } catch {
    return [];
  }
}

// Export all commands
export const pluginCommand = {
  install,
  uninstall,
  list,
  search,
  enable,
  disable,
  update,
};
