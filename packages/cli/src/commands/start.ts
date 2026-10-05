import { spawn, execSync } from "child_process";
import path from "path";

import chalk from "chalk";
import fs from "fs-extra";
import ora from "ora";

interface StartOptions {
  detach?: boolean;
  port?: string;
  mcp?: boolean;
  admin?: boolean;
}

export async function startCommand(options: StartOptions) {
  const spinner = ora("Checking project...").start();

  try {
    // Check if we're in a Kitsuden project
    const projectRoot = process.cwd();
    const hasDockerCompose = await fs.pathExists(path.join(projectRoot, "docker-compose.yml"));
    const hasKitsudenConfig = await fs.pathExists(path.join(projectRoot, "kitsuden.config.ts"));

    if (!hasDockerCompose && !hasKitsudenConfig) {
      spinner.fail(chalk.red('No Kitsuden project found. Run "kitsuden init" first.'));
      process.exit(1);
    }

    spinner.text = "Starting Kitsuden services...";

    // Build the docker compose command
    const composeArgs = ["compose", "up"];

    if (options.detach) {
      composeArgs.push("-d");
    }

    // Select services to start
    const services: string[] = [];

    // Always start core services
    services.push("kitsuden_db", "kitsuden_cache", "kitsuden_api");

    if (options.admin !== false) {
      services.push("kitsuden_admin");
    }

    if (options.mcp || (await isMcpEnabled(projectRoot))) {
      services.push("kitsuden_mcp");
    }

    // Check if Docker is running
    try {
      execSync("docker info", { stdio: "ignore" });
    } catch {
      spinner.fail(chalk.red("Docker is not running. Please start Docker first."));
      console.log(chalk.yellow("\n💡 Tips:"));
      console.log("  - Docker Desktop: https://www.docker.com/products/docker-desktop");
      console.log("  - Or install Docker Engine for your OS");
      process.exit(1);
    }

    spinner.stop();

    console.log(chalk.cyan("\n🚀 Starting Kitsuden services:\n"));

    if (options.admin !== false) {
      console.log(chalk.green("  ✓ Admin Panel") + chalk.gray("   → http://localhost:3001"));
    }
    console.log(chalk.green("  ✓ API Server") + chalk.gray("    → http://localhost:3000"));
    console.log(
      chalk.green("  ✓ API Docs") + chalk.gray("      → http://localhost:3000/api/swagger")
    );
    if (options.mcp || (await isMcpEnabled(projectRoot))) {
      console.log(chalk.green("  ✓ MCP Server") + chalk.gray("    → http://localhost:3002"));
    }
    console.log(chalk.green("  ✓ Database") + chalk.gray("      → localhost:5432"));
    console.log(chalk.green("  ✓ Cache") + chalk.gray("         → localhost:6379"));

    console.log(chalk.cyan("\n⏳ Starting containers...\n"));

    // Start services
    void spawn("docker", composeArgs, {
      cwd: projectRoot,
      stdio: options.detach ? "ignore" : "inherit",
      shell: true,
    });

    if (options.detach) {
      console.log(chalk.green("✅ Services started in detached mode"));
      console.log(chalk.cyan("\n📋 Useful commands:"));
      console.log(chalk.white("  kitsuden logs -f     # View logs"));
      console.log(chalk.white("  kitsuden stop        # Stop services"));
      console.log(chalk.white("  kitsuden status      # Check status\n"));
    } else {
      // Wait for startup
      setTimeout(async () => {
        console.log(chalk.green("\n✅ Kitsuden is running!\n"));
        console.log(chalk.cyan("🔗 Access your services:"));
        if (options.admin !== false) {
          console.log(chalk.white("  Admin:    http://localhost:3001"));
        }
        console.log(chalk.white("  API:      http://localhost:3000"));
        console.log(chalk.white("  Swagger:  http://localhost:3000/api/swagger"));
        if (options.mcp || (await isMcpEnabled(projectRoot))) {
          console.log(chalk.white("  MCP:      http://localhost:3002"));
        }
        console.log(chalk.gray("\nPress Ctrl+C to stop\n"));
      }, 5000);
    }
  } catch (error) {
    spinner.fail(chalk.red("Failed to start Kitsuden"));
    console.error(error);
    process.exit(1);
  }
}

async function isMcpEnabled(projectRoot: string): Promise<boolean> {
  try {
    const configPath = path.join(projectRoot, "kitsuden.config.ts");
    if (!(await fs.pathExists(configPath))) return true; // Default to enabled

    const configContent = await fs.readFile(configPath, "utf-8");
    // Simple check - if mcp: { enabled: false } is present, disable it
    return !configContent.includes("enabled: false");
  } catch {
    return true;
  }
}
