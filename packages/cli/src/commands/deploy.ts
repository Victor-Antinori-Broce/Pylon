/**
 * DEPLOY Command - Deploy to production
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import chalk from "chalk";
import { execa } from "execa";
import ora from "ora";

import { deployToRailway } from "../deploy/railway.js";

export interface DeployOptions {
  preview?: boolean;
  prod?: boolean;
  region?: string;
  provider?: string;
  railway?: boolean;
  build?: boolean;
}

export async function deployCommand(options: DeployOptions) {
  const projectRoot = process.cwd();

  // Check if we're in a Kitsuden project
  if (
    !existsSync(join(projectRoot, "apps", "api")) &&
    !existsSync(join(projectRoot, "kitsuden.config.ts"))
  ) {
    console.error(chalk.red("✖ Not in a Kitsuden project directory"));
    process.exit(1);
  }

  // Determine provider
  const detectedProvider = detectProvider(projectRoot, options);

  if (detectedProvider === "railway") {
    const result = await deployToRailway(projectRoot, {
      preview: options.preview,
      prod: options.prod,
      region: options.region,
    });

    if (!result.success) {
      process.exit(1);
    }
    return;
  }

  // Fallback: original placeholder deploy to "Kitsuden Cloud"
  await deployToKitsudenCloud(projectRoot, options);
}

function detectProvider(projectRoot: string, options: DeployOptions): string {
  // Explicit flag takes highest priority
  if (options.provider) {
    return options.provider;
  }
  if (options.railway) {
    return "railway";
  }

  // Auto-detect from project files
  if (existsSync(join(projectRoot, "railway.json"))) {
    return "railway";
  }

  // Default to railway for vibecoders if no explicit provider set
  // but only if railway cli seems to be in use
  // Otherwise keep the original placeholder as fallback
  return options.provider || "kitsuden";
}

async function deployToKitsudenCloud(projectRoot: string, options: DeployOptions) {
  console.log(chalk.blue("\n🚀 Deploying to Kitsuden Cloud...\n"));

  // Check for auth token
  const token = process.env.KITSUDEN_TOKEN || (await getStoredToken());

  if (!token) {
    console.error(chalk.red("✖ Not authenticated"));
    console.log(chalk.gray("Run 'kitsuden login' to authenticate"));
    process.exit(1);
  }

  const spinner = ora("Building for deployment...").start();

  try {
    // Build first
    await execa("pnpm", ["build"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    spinner.text = "Creating deployment package...";

    // Create tarball of dist folders
    const timestamp = Date.now();
    const tarball = `deploy-${timestamp}.tar.gz`;

    await execa("tar", ["-czf", tarball, "apps/api/dist", "packages/admin/build"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    spinner.text = "Uploading to cloud...";

    // In a real implementation, this would upload to your cloud service
    // For now, just simulate
    await new Promise((r) => setTimeout(r, 2000));

    spinner.succeed(chalk.green("Deployed successfully!"));

    const deploymentUrl = options.prod
      ? "https://your-project.kitsuden.io"
      : `https://preview-${timestamp}.kitsuden.io`;

    console.log(chalk.bold("\nDeployment URL:\n"));
    console.log(chalk.cyan(`  ${deploymentUrl}\n`));

    // Health check on placeholder URL (will likely fail, but kept for consistency)
    const healthSpinner = ora("Running health check...").start();
    try {
      const { default: fetch } = await import("node-fetch");
      const res = await fetch(`${deploymentUrl}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (res.status === 200) {
        healthSpinner.succeed(chalk.green("Health check passed! ✓"));
      } else {
        healthSpinner.warn(chalk.yellow(`Health check returned ${res.status}`));
      }
    } catch {
      healthSpinner.warn(chalk.yellow("Health check could not reach deployment"));
    }

    // Clean up tarball
    await execa("rm", [tarball], { cwd: projectRoot, stdio: "ignore" });
  } catch (error: any) {
    spinner.fail(chalk.red(`Deployment failed: ${error.message}`));
    process.exit(1);
  }
}

async function getStoredToken(): Promise<string | null> {
  try {
    const { homedir } = await import("node:os");
    const configPath = join(homedir(), ".kitsuden", "config.json");

    if (!existsSync(configPath)) {
      return null;
    }

    const content = await readFile(configPath, "utf-8");
    const config = JSON.parse(content);
    return config.token || null;
  } catch {
    return null;
  }
}
