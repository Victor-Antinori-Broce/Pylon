/**
 * REALM Command - Manage realms (starters)
 */

import chalk from "chalk";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { execa } from "execa";

interface RealmInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  grimoires: string[];
  official: boolean;
}

const OFFICIAL_REALMS = [
  { id: "default", name: "Default", description: "Core functionality" },
  { id: "esports", name: "Esports", description: "Gaming & tournaments" },
  { id: "blog", name: "Blog", description: "Content publishing" },
  { id: "corporate", name: "Corporate", description: "Company website" },
  { id: "lms", name: "LMS", description: "Online courses" },
];

export async function listRealms() {
  console.log(chalk.bold("\n🏰 Available Realms (Starters)\n"));

  const projectRoot = process.cwd();
  const realmsDir = join(projectRoot, "packages", "realms");
  
  const localRealms: RealmInfo[] = [];
  
  // Scan local realms
  if (existsSync(realmsDir)) {
    try {
      const entries = await readdir(realmsDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith("realm-")) {
          const realmJsonPath = join(realmsDir, entry.name, "realm.json");
          
          if (existsSync(realmJsonPath)) {
            const content = await readFile(realmJsonPath, "utf-8");
            const manifest = JSON.parse(content);
            
            localRealms.push({
              id: manifest.id,
              name: manifest.name,
              description: manifest.description,
              version: manifest.version,
              grimoires: manifest.grimoires || [],
              official: false,
            });
          }
        }
      }
    } catch {
      // Ignore errors
    }
  }

  // Show official realms
  for (const realm of OFFICIAL_REALMS) {
    const isLocal = localRealms.some(r => r.id === realm.id);
    const icon = isLocal ? chalk.green("●") : chalk.gray("○");
    
    console.log(`  ${icon} ${chalk.bold(realm.name)} ${chalk.gray(`(${realm.id})`)}`);
    console.log(chalk.gray(`     ${realm.description}`));
    if (isLocal) {
      console.log(chalk.green(`     ✓ Installed`));
    }
    console.log();
  }

  // Show custom local realms
  const customRealms = localRealms.filter(r => !OFFICIAL_REALMS.some(o => o.id === r.id));
  
  if (customRealms.length > 0) {
    console.log(chalk.bold("\n🏰 Custom Realms\n"));
    
    for (const realm of customRealms) {
      console.log(`  ${chalk.green("●")} ${chalk.bold(realm.name)} ${chalk.gray(`(${realm.id})`)}`);
      console.log(chalk.gray(`     ${realm.description}`));
      console.log(chalk.gray(`     Grimoires: ${realm.grimoires.length}`));
      console.log();
    }
  }

  console.log(chalk.gray("Use 'gremius new <name> --realm <realm>' to create a project\n"));
}

export async function switchRealm(realmId: string) {
  console.log(chalk.blue(`\n🏰 Switching to realm: ${chalk.bold(realmId)}...\n`));

  const projectRoot = process.cwd();
  const realmPath = join(projectRoot, "packages", "realms", `realm-${realmId}`, "realm.json");

  if (!existsSync(realmPath)) {
    console.error(chalk.red(`✖ Realm "${realmId}" not found`));
    console.log(chalk.gray(`Run 'gremius realm list' to see available realms`));
    process.exit(1);
  }

  try {
    // Read realm manifest
    const content = await readFile(realmPath, "utf-8");
    const manifest = JSON.parse(content);

    // Update gremius.config.ts
    const configPath = join(projectRoot, "apps", "api", "gremius.config.ts");
    let config = await readFile(configPath, "utf-8");

    // Update grimoires list
    const grimoiresList = manifest.grimoires.map((g: string) => `    "${g}",`).join("\n");
    
    config = config.replace(
      /grimoires:\s*\[[^\]]*\]/s,
      `grimoires: [\n${grimoiresList}\n  ]`
    );

    await execa("writeFile", [configPath, config]);

    console.log(chalk.green(`✓ Switched to realm: ${manifest.name}`));
    console.log(chalk.gray(`  Grimoires: ${manifest.grimoires.join(", ")}`));
    
    console.log(chalk.bold("\nNext steps:\n"));
    console.log(chalk.gray("  pnpm db:push    # Update database schema"));
    console.log(chalk.gray("  pnpm dev        # Start development server\n"));

  } catch (error: any) {
    console.error(chalk.red(`✖ Failed to switch realm: ${error.message}`));
    process.exit(1);
  }
}

export async function realmInfo(realmId?: string) {
  const projectRoot = process.cwd();
  
  // If no realm specified, get current from config
  if (!realmId) {
    try {
      const configPath = join(projectRoot, "apps", "api", "gremius.config.ts");
      const config = await readFile(configPath, "utf-8");
      
      // Try to detect active realm from config
      const realmMatch = config.match(/activeRealm[:\s]*["']([^"']+)["']/);
      if (realmMatch) {
        realmId = realmMatch[1];
      }
    } catch {
      // Ignore
    }
  }

  if (!realmId) {
    console.log(chalk.yellow("No active realm detected."));
    return;
  }

  const realmPath = join(projectRoot, "packages", "realms", `realm-${realmId}`, "realm.json");

  if (!existsSync(realmPath)) {
    console.error(chalk.red(`✖ Realm "${realmId}" not found`));
    return;
  }

  try {
    const content = await readFile(realmPath, "utf-8");
    const manifest = JSON.parse(content);

    console.log(chalk.bold(`\n🏰 ${manifest.name}\n`));
    console.log(chalk.gray(`ID:          ${manifest.id}`));
    console.log(chalk.gray(`Version:     ${manifest.version}`));
    console.log(chalk.gray(`Description: ${manifest.description}`));
    
    if (manifest.author) {
      console.log(chalk.gray(`Author:      ${manifest.author}`));
    }

    console.log(chalk.bold("\n📦 Grimoires:\n"));
    for (const g of manifest.grimoires || []) {
      console.log(`  • ${g}`);
    }

    if (manifest.optional_grimoires?.length > 0) {
      console.log(chalk.bold("\n📦 Optional Grimoires:\n"));
      for (const g of manifest.optional_grimoires) {
        console.log(chalk.gray(`  • ${g}`));
      }
    }

    console.log();

  } catch (error: any) {
    console.error(chalk.red(`✖ Failed to read realm: ${error.message}`));
  }
}
