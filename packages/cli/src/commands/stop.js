import { execSync } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
export async function stopCommand() {
    const spinner = ora('Stopping Gremius services...').start();
    try {
        const projectRoot = process.cwd();
        const hasDockerCompose = await fs.pathExists(path.join(projectRoot, 'docker-compose.yml'));
        if (!hasDockerCompose) {
            spinner.fail(chalk.red('No Gremius project found in current directory.'));
            process.exit(1);
        }
        execSync('docker compose down', {
            cwd: projectRoot,
            stdio: 'pipe'
        });
        spinner.succeed(chalk.green('✅ All Gremius services stopped'));
        console.log(chalk.gray('\nContainers have been stopped and removed.\n'));
    }
    catch (error) {
        spinner.fail(chalk.red('Failed to stop Gremius'));
        console.error(error);
        process.exit(1);
    }
}
//# sourceMappingURL=stop.js.map