#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { makemigrationsCommand } from './commands/makemigrations.js';
import { migrateCommand } from './commands/migrate.js';
import { shellCommand } from './commands/shell.js';
import { inspectCommand } from './commands/inspect.js';
import { grimoireCreateCommand } from './commands/grimoire-create.js';
import { createGrimoireCommand } from './commands/create-grimoire.js';
import { dumpdataCommand } from './commands/dumpdata.js';
import { loaddataCommand } from './commands/loaddata.js';
import { initCommand } from './commands/init.js';
import { startCommand } from './commands/start.js';
import { stopCommand } from './commands/stop.js';
import { logsCommand } from './commands/logs.js';
import { mcpCommand } from './commands/mcp.js';
import { deployCommand } from './commands/deploy.js';
import { statusCommand } from './commands/status.js';
import { installCommand } from './commands/install.js';
import { generateSdkCommand } from './commands/generate-sdk.js';
import { devCommand } from './commands/dev.js';
import { addProvider, listProviders, removeProvider } from './commands/auth.js';
const program = new Command();
program
    .name('gremius')
    .description('GremiusCMS CLI - AI-Native Backend as a Service')
    .version('0.1.0')
    .configureHelp({
    sortSubcommands: true,
    subcommandTerm: (cmd) => chalk.green(cmd.name())
});
// ═══════════════════════════════════════════════════════════════════════════
// VIBECODER COMMANDS (Primary)
// ═══════════════════════════════════════════════════════════════════════════
program
    .command('init')
    .description('Initialize a new Gremius project (vibecoder mode by default)')
    .argument('[name]', 'Project name')
    .option('-t, --template <type>', 'Template: default, blog, saas, ecommerce', 'default')
    .option('-m, --mode <mode>', 'Mode: vibecoder (Docker) or developer (monorepo)', 'vibecoder')
    .option('-d, --database <type>', 'Database type', 'postgres')
    .option('--start', 'Auto-start services after init')
    .action(initCommand);
program
    .command('start')
    .description('Start your Gremius backend locally')
    .option('-d, --detach', 'Run in detached mode')
    .option('-p, --port <port>', 'API port', '3000')
    .option('--mcp', 'Start MCP server for AI assistants')
    .option('--admin', 'Start admin panel')
    .action(startCommand);
program
    .command('dev')
    .description('Start development server with hot-reload')
    .option('-p, --port <port>', 'API port', '3000')
    .option('-h, --host <host>', 'Host to bind to', 'localhost')
    .option('--api-only', 'Start only the API server')
    .option('--admin-only', 'Start only the Admin UI')
    .action(devCommand);
program
    .command('stop')
    .description('Stop your Gremius backend')
    .action(stopCommand);
program
    .command('logs')
    .description('View logs from your Gremius backend')
    .option('-f, --follow', 'Follow log output')
    .option('-s, --service <service>', 'Service to view logs for')
    .action(logsCommand);
program
    .command('mcp')
    .description('Configure MCP server for Cursor/Claude/Windsurf')
    .option('-p, --port <port>', 'MCP server port', '3002')
    .option('--api-url <url>', 'Gremius API URL', 'http://localhost:3000')
    .option('--token <token>', 'API authentication token')
    .option('--ide <ide>', 'Generate IDE config (cursor, claude, vscode, windsurf)')
    .action(mcpCommand);
program
    .command('deploy')
    .description('Deploy your Gremius backend to production')
    .option('-p, --provider <provider>', 'Deployment provider (railway, gremius)', 'gremius')
    .option('--railway', 'Deploy to Railway')
    .option('--preview', 'Deploy as preview environment')
    .option('--prod', 'Deploy to production environment')
    .option('--build', 'Force rebuild before deploy')
    .action(deployCommand);
program
    .command('status')
    .description('Check the status of your Gremius backend')
    .action(statusCommand);
program
    .command('install')
    .description('Install a grimoire from npm')
    .argument('<grimoire>', 'npm package name (e.g. @gremius/grimoire-crm)')
    .option('-D, --dev', 'Install as dev dependency')
    .action(installCommand);
program
    .command('generate-sdk')
    .description('Generate frontend SDK from OpenAPI spec')
    .option('-l, --lang <lang>', 'Language: typescript', 'typescript')
    .option('-o, --output <dir>', 'Output directory', './src/lib/gremius-sdk')
    .option('-u, --base-url <url>', 'API base URL', 'http://localhost:3001/api')
    .action(generateSdkCommand);
// ═══════════════════════════════════════════════════════════════════════════
// AUTH COMMANDS (Zero-Config)
// ═══════════════════════════════════════════════════════════════════════════
const authCmd = program
    .command('auth')
    .description('Configure authentication providers');
authCmd
    .command('add <provider>')
    .description('Add a social auth provider (google, github, microsoft)')
    .option('--client-id <id>', 'OAuth Client ID')
    .option('--client-secret <secret>', 'OAuth Client Secret')
    .option('--tenant <tenant>', 'Azure AD Tenant ID (microsoft only)')
    .action(addProvider);
authCmd
    .command('list')
    .description('List configured auth providers')
    .action(listProviders);
authCmd
    .command('remove <provider>')
    .description('Remove an auth provider')
    .action(removeProvider);
// ═══════════════════════════════════════════════════════════════════════════
// DEVELOPER COMMANDS (Django-style)
// ═══════════════════════════════════════════════════════════════════════════
program
    .command('makemigrations')
    .description('Auto-detect schema changes and create migrations')
    .option('-n, --name <name>', 'Migration name')
    .option('--dry-run', 'Show what would be created without writing')
    .action(makemigrationsCommand);
program
    .command('migrate')
    .description('Apply pending migrations')
    .option('--rollback', 'Rollback last migration')
    .option('--status', 'Show migration status')
    .option('--fake', 'Mark as applied without running')
    .action(migrateCommand);
program
    .command('shell')
    .description('Interactive shell with ORM loaded')
    .option('--typescript', 'Use TypeScript REPL')
    .action(shellCommand);
program
    .command('inspect')
    .description('Inspect project structure')
    .argument('<target>', 'What to inspect: routes|grimoires|middleware|db')
    .action(inspectCommand);
program
    .command('grimoire:create')
    .description('Create a new grimoire scaffolding')
    .argument('<name>', 'Grimoire name')
    .option('--with-admin', 'Include admin configuration')
    .option('--with-tests', 'Include test files')
    .action(grimoireCreateCommand);
program
    .command('create-grimoire')
    .description('Alias for grimoire:create')
    .argument('<name>', 'Grimoire name')
    .option('--with-admin', 'Include admin configuration')
    .option('--with-tests', 'Include test files')
    .action(createGrimoireCommand);
program
    .command('dumpdata')
    .description('Export data to JSON')
    .argument('[grimoire]', 'Specific grimoire or all')
    .option('-o, --output <file>', 'Output file')
    .option('--indent', 'Pretty print JSON')
    .action(dumpdataCommand);
program
    .command('loaddata')
    .description('Load data from JSON file')
    .argument('<file>', 'JSON file to load')
    .action(loaddataCommand);
program.on('command:*', (operands) => {
    console.error(chalk.red(`Unknown command: ${operands[0]}`));
    console.log('Run "gremius --help" for available commands.');
    process.exit(1);
});
program.parse();
//# sourceMappingURL=index.js.map