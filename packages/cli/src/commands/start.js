import { spawn, execSync } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
export async function startCommand(options) {
    const spinner = ora('Checking project...').start();
    try {
        // Check if we're in a Gremius project
        const projectRoot = process.cwd();
        const hasDockerCompose = await fs.pathExists(path.join(projectRoot, 'docker-compose.yml'));
        const hasGremiusConfig = await fs.pathExists(path.join(projectRoot, 'gremius.config.ts'));
        if (!hasDockerCompose && !hasGremiusConfig) {
            spinner.fail(chalk.red('No Gremius project found. Run "gremius init" first.'));
            process.exit(1);
        }
        spinner.text = 'Starting Gremius services...';
        // Build the docker compose command
        const composeArgs = ['compose', 'up'];
        if (options.detach) {
            composeArgs.push('-d');
        }
        // Select services to start
        const services = [];
        // Always start core services
        services.push('gremius_db', 'gremius_cache', 'gremius_api');
        if (options.admin !== false) {
            services.push('gremius_admin');
        }
        if (options.mcp || (await isMcpEnabled(projectRoot))) {
            services.push('gremius_mcp');
        }
        // Check if Docker is running
        try {
            execSync('docker info', { stdio: 'ignore' });
        }
        catch {
            spinner.fail(chalk.red('Docker is not running. Please start Docker first.'));
            console.log(chalk.yellow('\n💡 Tips:'));
            console.log('  - Docker Desktop: https://www.docker.com/products/docker-desktop');
            console.log('  - Or install Docker Engine for your OS');
            process.exit(1);
        }
        spinner.stop();
        console.log(chalk.cyan('\n🚀 Starting Gremius services:\n'));
        if (options.admin !== false) {
            console.log(chalk.green('  ✓ Admin Panel') + chalk.gray('   → http://localhost:3001'));
        }
        console.log(chalk.green('  ✓ API Server') + chalk.gray('    → http://localhost:3000'));
        console.log(chalk.green('  ✓ API Docs') + chalk.gray('      → http://localhost:3000/api/swagger'));
        if (options.mcp || (await isMcpEnabled(projectRoot))) {
            console.log(chalk.green('  ✓ MCP Server') + chalk.gray('    → http://localhost:3002'));
        }
        console.log(chalk.green('  ✓ Database') + chalk.gray('      → localhost:5432'));
        console.log(chalk.green('  ✓ Cache') + chalk.gray('         → localhost:6379'));
        console.log(chalk.cyan('\n⏳ Starting containers...\n'));
        // Start services
        void spawn('docker', composeArgs, {
            cwd: projectRoot,
            stdio: options.detach ? 'ignore' : 'inherit',
            shell: true
        });
        if (options.detach) {
            console.log(chalk.green('✅ Services started in detached mode'));
            console.log(chalk.cyan('\n📋 Useful commands:'));
            console.log(chalk.white('  gremius logs -f     # View logs'));
            console.log(chalk.white('  gremius stop        # Stop services'));
            console.log(chalk.white('  gremius status      # Check status\n'));
        }
        else {
            // Wait for startup
            setTimeout(async () => {
                console.log(chalk.green('\n✅ Gremius is running!\n'));
                console.log(chalk.cyan('🔗 Access your services:'));
                if (options.admin !== false) {
                    console.log(chalk.white('  Admin:    http://localhost:3001'));
                }
                console.log(chalk.white('  API:      http://localhost:3000'));
                console.log(chalk.white('  Swagger:  http://localhost:3000/api/swagger'));
                if (options.mcp || (await isMcpEnabled(projectRoot))) {
                    console.log(chalk.white('  MCP:      http://localhost:3002'));
                }
                console.log(chalk.gray('\nPress Ctrl+C to stop\n'));
            }, 5000);
        }
    }
    catch (error) {
        spinner.fail(chalk.red('Failed to start Gremius'));
        console.error(error);
        process.exit(1);
    }
}
async function isMcpEnabled(projectRoot) {
    try {
        const configPath = path.join(projectRoot, 'gremius.config.ts');
        if (!await fs.pathExists(configPath))
            return true; // Default to enabled
        const configContent = await fs.readFile(configPath, 'utf-8');
        // Simple check - if mcp: { enabled: false } is present, disable it
        return !configContent.includes('enabled: false');
    }
    catch {
        return true;
    }
}
//# sourceMappingURL=start.js.map