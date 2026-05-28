/**
 * BUILD Command - Build for production
 */

import chalk from "chalk";
import ora from "ora";
import { execa } from "execa";
import { existsSync } from "node:fs";
import { join } from "node:path";

interface BuildOptions {
  analyze?: boolean;
  target?: string;
}

export async function buildCommand(options: BuildOptions) {
  console.log(chalk.blue("\n🔨 Building Gremius for production...\n"));

  const projectRoot = process.cwd();
  
  // Check if we're in a Gremius project
  if (!existsSync(join(projectRoot, "apps", "api"))) {
    console.error(chalk.red("✖ Not in a Gremius project directory"));
    process.exit(1);
  }

  const spinner = ora("Building API...").start();

  try {
    // Build shared first
    spinner.text = "Building shared packages...";
    await execa("pnpm", ["--filter", "@gremius/shared", "build"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    // Build API
    spinner.text = "Building API...";
    await execa("pnpm", ["--filter", "api", "build"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    // Build Admin
    spinner.text = "Building Admin UI...";
    await execa("pnpm", ["--filter", "admin", "build"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    // Build Web (if exists)
    if (existsSync(join(projectRoot, "apps", "web"))) {
      spinner.text = "Building Web...";
      await execa("pnpm", ["--filter", "web", "build"], {
        cwd: projectRoot,
        stdio: "ignore",
      });
    }

    spinner.succeed(chalk.green("Build completed successfully!"));

    console.log(chalk.bold("\nOutput:\n"));
    console.log(chalk.gray("  apps/api/dist    - API server"));
    console.log(chalk.gray("  apps/admin/dist  - Admin UI"));
    if (existsSync(join(projectRoot, "apps", "web"))) {
      console.log(chalk.gray("  apps/web/dist    - Web frontend"));
    }
    console.log();

    if (options.analyze) {
      console.log(chalk.yellow("Bundle analysis not yet implemented\n"));
    }

  } catch (error: any) {
    spinner.fail(chalk.red(`Build failed: ${error.message}`));
    process.exit(1);
  }
}
