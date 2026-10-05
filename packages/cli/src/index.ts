#!/usr/bin/env node

import chalk from "chalk";
import { Command } from "commander";

import { addProvider, listProviders, removeProvider } from "./commands/auth.js";
import { createKonCommand } from "./commands/create-kon.js";
import { deployCommand } from "./commands/deploy.js";
import { devCommand } from "./commands/dev.js";
import { dumpdataCommand } from "./commands/dumpdata.js";
import { genTypesCommand } from "./commands/gen-types.js";
import { generateSdkCommand } from "./commands/generate-sdk.js";
import { initCommand } from "./commands/init.js";
import { inspectCommand } from "./commands/inspect.js";
import { installCommand } from "./commands/install.js";
import { loaddataCommand } from "./commands/loaddata.js";
import { logsCommand } from "./commands/logs.js";
import { makemigrationsCommand } from "./commands/makemigrations.js";
import { syncSchemaCommand } from "./commands/sync-schema.js";
import { brainCommand } from "./commands/brain.js";
import { makeCommand } from "./commands/make.js";
import { mapCommand } from "./commands/map.js";
import { graphCommand } from "./commands/graph.js";
import { mcpCommand } from "./commands/mcp.js";
import { migrateCommand } from "./commands/migrate.js";
import { shellCommand } from "./commands/shell.js";
import { startCommand } from "./commands/start.js";
import { statusCommand } from "./commands/status.js";
import { stopCommand } from "./commands/stop.js";

const program = new Command();

program
  .name("kitsuden")
  .description("Kitsuden CLI - AI-Native Backend as a Service")
  .version("0.1.0")
  .configureHelp({
    sortSubcommands: true,
    subcommandTerm: (cmd) => chalk.green(cmd.name()),
  });

// ═══════════════════════════════════════════════════════════════════════════
// VIBECODER COMMANDS (Primary)
// ═══════════════════════════════════════════════════════════════════════════

program
  .command("init")
  .description("Initialize a new Kitsuden project (vibecoder mode by default)")
  .argument("[name]", "Project name")
  .option("-t, --template <type>", "Template: default, blog, saas, ecommerce", "default")
  .option(
    "-m, --mode <mode>",
    "Mode: lite (sin Docker) | vibecoder (Docker) | developer (monorepo)",
    "vibecoder"
  )
  .option("--lite", "Modo lite: PostgreSQL embebido, sin Docker ni servicios externos")
  .option("-d, --database <type>", "Database type", "postgres")
  .option("--headless", "API-only mode (no admin panel)")
  .option("--start", "Auto-start services after init")
  .action(initCommand);

program
  .command("start")
  .description("Start your Kitsuden backend locally")
  .option("-d, --detach", "Run in detached mode")
  .option("-p, --port <port>", "API port", "3000")
  .option("--mcp", "Start MCP server for AI assistants")
  .option("--admin", "Start admin panel")
  .action(startCommand);

program
  .command("dev")
  .description("Start development server with hot-reload")
  .option("-p, --port <port>", "API port", "3000")
  .option("-h, --host <host>", "Host to bind to", "localhost")
  .option("--api-only", "Start only the API server")
  .option("--admin-only", "Start only the Admin UI")
  .action(devCommand);

program.command("stop").description("Stop your Kitsuden backend").action(stopCommand);

program
  .command("logs")
  .description("View logs from your Kitsuden backend")
  .option("-f, --follow", "Follow log output")
  .option("-s, --service <service>", "Service to view logs for")
  .action(logsCommand);

program
  .command("mcp")
  .description("Configure MCP server for Cursor/Claude/Windsurf")
  .option("-p, --port <port>", "MCP server port", "3002")
  .option("--api-url <url>", "Kitsuden API URL", "http://localhost:3000")
  .option("--token <token>", "API authentication token")
  .option("--ide <ide>", "Generate IDE config (cursor, claude, vscode, windsurf)")
  .action(mcpCommand);

program
  .command("make <kind> <name>")
  .description("Genera scaffolding: policy | request | job | test")
  .option("--force", "Sobrescribir si ya existe")
  .option("--kon <name>", "Generar DENTRO de un kon (plugin autocontenido)")
  .action(makeCommand);

program
  .command("map")
  .description("System Map determinista del repo + app (sin IA)")
  .option("--json", "Grafo completo en JSON")
  .option("--toon", "Grafo completo en TOON")
  .action(mapCommand);

program
  .command("graph [action] [args...]")
  .description(
    "Code Graph: summary|symbol|outline|path|search|semantic|history|open|rename|replace|delete"
  )
  .option("--json", "Salida en JSON")
  .option("--apply", "Aplicar los cambios de una edición semántica (default: dry-run)")
  .action(graphCommand);

program
  .command("brain <action>")
  .description("Segundo Cerebro: schema | lint | sources | capture | sync | digest")
  .option("--title <title>", "Título de la fuente (capture)")
  .option("--content <content>", "Contenido de la fuente (capture)")
  .option("--file <file>", "Leer contenido desde archivo (capture)")
  .option("--author <author>", "Autor de la prosa: instruction | api | cli")
  .option("--days <days>", "Ventana en días (digest)", "7")
  .option("--force", "Forzar re-derivación (sync)")
  .action(brainCommand);

program
  .command("deploy")
  .description("Deploy your Kitsuden backend to production")
  .option("-p, --provider <provider>", "Deployment provider (railway, kitsuden)", "kitsuden")
  .option("--railway", "Deploy to Railway")
  .option("--preview", "Deploy as preview environment")
  .option("--prod", "Deploy to production environment")
  .option("--build", "Force rebuild before deploy")
  .action(deployCommand);

program
  .command("status")
  .description("Check the status of your Kitsuden backend")
  .action(statusCommand);

program
  .command("install")
  .description("Install a kon from npm")
  .argument("<kon>", "npm package name (e.g. @kitsuden/kon-crm)")
  .option("-D, --dev", "Install as dev dependency")
  .action(installCommand);

program
  .command("generate-sdk")
  .description("Generate frontend SDK from OpenAPI spec")
  .option("-l, --lang <lang>", "Language: typescript", "typescript")
  .option("-o, --output <dir>", "Output directory", "./src/lib/kitsuden-sdk")
  .option("-u, --base-url <url>", "API base URL", "http://localhost:3001/api")
  .action(generateSdkCommand);

// `gen` agrupa los generadores. `gen types` es el que más mueve la aguja:
// sin tipos del esquema, cada consulta del usuario acaba en `any`.
const genCmd = program.command("gen").description("Generadores de código");

genCmd
  .command("types")
  .description("Genera tipos TypeScript desde el esquema de la base de datos")
  .option("-u, --url <url>", "URL base de la API", process.env.KITSUDEN_API_URL)
  .option("-o, --out <file>", "Fichero de salida", "src/kitsuden.types.ts")
  .option("-e, --exclude <tables>", "Tablas a excluir, separadas por comas")
  .option("--database-name <name>", "Nombre del tipo del mapa de tablas", "Database")
  .action(genTypesCommand);

// ═══════════════════════════════════════════════════════════════════════════
// AUTH COMMANDS (Zero-Config)
// ═══════════════════════════════════════════════════════════════════════════

const authCmd = program.command("auth").description("Configure authentication providers");

authCmd
  .command("add <provider>")
  .description("Add a social auth provider (google, github, microsoft)")
  .option("--client-id <id>", "OAuth Client ID")
  .option("--client-secret <secret>", "OAuth Client Secret")
  .option("--tenant <tenant>", "Azure AD Tenant ID (microsoft only)")
  .action(addProvider);

authCmd.command("list").description("List configured auth providers").action(listProviders);

authCmd.command("remove <provider>").description("Remove an auth provider").action(removeProvider);

// ═══════════════════════════════════════════════════════════════════════════
// DEVELOPER COMMANDS (Django-style)
// ═══════════════════════════════════════════════════════════════════════════

program
  .command("sync-schema")
  .description("Regenera el agregado de schemas de kons (schema-kons.generated.ts)")
  .action(syncSchemaCommand);

program
  .command("makemigrations")
  .description("Auto-detect schema changes and create migrations")
  .option("-n, --name <name>", "Migration name")
  .option("--dry-run", "Show what would be created without writing")
  .action(makemigrationsCommand);

program
  .command("migrate")
  .description("Apply pending migrations")
  .option("--rollback", "Rollback last migration")
  .option("--status", "Show migration status")
  .option("--fake", "Mark as applied without running")
  .action(migrateCommand);

program
  .command("shell")
  .description("Interactive shell with ORM loaded")
  .option("--typescript", "Use TypeScript REPL")
  .action(shellCommand);

program
  .command("inspect")
  .description("Inspect project structure")
  .argument("<target>", "What to inspect: routes|kons|middleware|db")
  .action(inspectCommand);

// Alias de create-kon (mismo código, stack limpio). El antiguo
// kon-create.ts duplicado fue eliminado — generaba el scaffold obsoleto.
program
  .command("kon:create")
  .description("Alias for create-kon")
  .argument("<name>", "Kon name")
  .option("--with-admin", "Include admin configuration")
  .option("--with-tests", "Include test files")
  .action(createKonCommand);

program
  .command("create-kon")
  .description("Alias for kon:create")
  .argument("<name>", "Kon name")
  .option("--with-admin", "Include admin configuration")
  .option("--with-tests", "Include test files")
  .action(createKonCommand);

program
  .command("dumpdata")
  .description("Export data to JSON")
  .argument("[kon]", "Specific kon or all")
  .option("-o, --output <file>", "Output file")
  .option("--indent", "Pretty print JSON")
  .action(dumpdataCommand);

program
  .command("loaddata")
  .description("Load data from JSON file")
  .argument("<file>", "JSON file to load")
  .action(loaddataCommand);

program.on("command:*", (operands) => {
  console.error(chalk.red(`Unknown command: ${operands[0]}`));
  console.log('Run "kitsuden --help" for available commands.');
  process.exit(1);
});

program.parse();
