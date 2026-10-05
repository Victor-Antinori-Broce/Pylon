import { spawn } from "child_process";
import path from "path";

import chalk from "chalk";
import fs from "fs-extra";
import ora from "ora";

interface LogsOptions {
  follow?: boolean;
  service?: string;
}

export async function logsCommand(options: LogsOptions) {
  const spinner = ora("Fetching logs...").start();

  try {
    const projectRoot = process.cwd();
    const hasDockerCompose = await fs.pathExists(path.join(projectRoot, "docker-compose.yml"));

    if (!hasDockerCompose) {
      spinner.fail(chalk.red("No Kitsuden project found in current directory."));
      process.exit(1);
    }

    spinner.stop();

    const args = ["compose", "logs"];

    if (options.follow) {
      args.push("-f");
    }

    if (options.service) {
      const serviceMap: Record<string, string> = {
        api: "kitsuden_api",
        mcp: "kitsuden_mcp",
        admin: "kitsuden_admin",
        db: "kitsuden_db",
        cache: "kitsuden_cache",
      };
      args.push(serviceMap[options.service] || options.service);
    }

    console.log(chalk.cyan(`\n📋 Logs ${options.follow ? "(following...)" : ""}\n`));

    spawn("docker", args, {
      cwd: projectRoot,
      stdio: "inherit",
      shell: true,
    });
  } catch (error) {
    spinner.fail(chalk.red("Failed to fetch logs"));
    console.error(error);
    process.exit(1);
  }
}
