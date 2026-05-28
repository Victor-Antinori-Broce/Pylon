import { spawn } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';

interface LogsOptions {
  follow?: boolean;
  service?: string;
}

export async function logsCommand(options: LogsOptions) {
  const spinner = ora('Fetching logs...').start();

  try {
    const projectRoot = process.cwd();
    const hasDockerCompose = await fs.pathExists(path.join(projectRoot, 'docker-compose.yml'));

    if (!hasDockerCompose) {
      spinner.fail(chalk.red('No Gremius project found in current directory.'));
      process.exit(1);
    }

    spinner.stop();

    const args = ['compose', 'logs'];
    
    if (options.follow) {
      args.push('-f');
    }
    
    if (options.service) {
      const serviceMap: Record<string, string> = {
        'api': 'gremius_api',
        'mcp': 'gremius_mcp',
        'admin': 'gremius_admin',
        'db': 'gremius_db',
        'cache': 'gremius_cache'
      };
      args.push(serviceMap[options.service] || options.service);
    }

    console.log(chalk.cyan(`\n📋 Logs ${options.follow ? '(following...)' : ''}\n`));

    spawn('docker', args, {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: true
    });

  } catch (error) {
    spinner.fail(chalk.red('Failed to fetch logs'));
    console.error(error);
    process.exit(1);
  }
}
