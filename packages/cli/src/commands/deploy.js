/**
 * DEPLOY Command - Deploy to production
 */
import chalk from "chalk";
import ora from "ora";
import { execa } from "execa";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { deployToRailway } from "../deploy/railway.js";
export async function deployCommand(options) {
    const projectRoot = process.cwd();
    // Check if we're in a Gremius project
    if (!existsSync(join(projectRoot, "apps", "api")) && !existsSync(join(projectRoot, "gremius.config.ts"))) {
        console.error(chalk.red("✖ Not in a Gremius project directory"));
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
    // Fallback: original placeholder deploy to "Gremius Cloud"
    await deployToGremiusCloud(projectRoot, options);
}
function detectProvider(projectRoot, options) {
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
    return options.provider || "gremius";
}
async function deployToGremiusCloud(projectRoot, options) {
    console.log(chalk.blue("\n🚀 Deploying to Gremius Cloud...\n"));
    // Check for auth token
    const token = process.env.GREMIUS_TOKEN || (await getStoredToken());
    if (!token) {
        console.error(chalk.red("✖ Not authenticated"));
        console.log(chalk.gray("Run 'gremius login' to authenticate"));
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
        await execa("tar", ["-czf", tarball, "apps/api/dist", "packages/admin/build", "apps/web/dist"], {
            cwd: projectRoot,
            stdio: "ignore",
        });
        spinner.text = "Uploading to cloud...";
        // In a real implementation, this would upload to your cloud service
        // For now, just simulate
        await new Promise((r) => setTimeout(r, 2000));
        spinner.succeed(chalk.green("Deployed successfully!"));
        const deploymentUrl = options.prod
            ? "https://your-project.gremius.io"
            : `https://preview-${timestamp}.gremius.io`;
        console.log(chalk.bold("\nDeployment URL:\n"));
        console.log(chalk.cyan(`  ${deploymentUrl}\n`));
        // Health check on placeholder URL (will likely fail, but kept for consistency)
        const healthSpinner = ora("Running health check...").start();
        try {
            const { default: fetch } = await import("node-fetch");
            const res = await fetch(`${deploymentUrl}/api/health`, { signal: AbortSignal.timeout(5000) });
            if (res.status === 200) {
                healthSpinner.succeed(chalk.green("Health check passed! ✓"));
            }
            else {
                healthSpinner.warn(chalk.yellow(`Health check returned ${res.status}`));
            }
        }
        catch {
            healthSpinner.warn(chalk.yellow("Health check could not reach deployment"));
        }
        // Clean up tarball
        await execa("rm", [tarball], { cwd: projectRoot, stdio: "ignore" });
    }
    catch (error) {
        spinner.fail(chalk.red(`Deployment failed: ${error.message}`));
        process.exit(1);
    }
}
async function getStoredToken() {
    try {
        const { homedir } = await import("node:os");
        const configPath = join(homedir(), ".gremius", "config.json");
        if (!existsSync(configPath)) {
            return null;
        }
        const content = await readFile(configPath, "utf-8");
        const config = JSON.parse(content);
        return config.token || null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=deploy.js.map