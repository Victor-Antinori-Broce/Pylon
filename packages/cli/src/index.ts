#!/usr/bin/env node

import { createRequire } from "node:module";

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
import { konAddCommand, konListCommand, konRemoveCommand } from "./commands/kon.js";
import {
  konInfoCommand,
  konKeygenCommand,
  konOutdatedCommand,
  konPublishCommand,
  konSearchCommand,
  konSyncCommand,
  konUpdateCommand,
  konVerifyCommand,
  konYankCommand,
} from "./commands/kon-registro.js";
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
import { newCommand } from "./commands/new.js";
import { migrateCommand } from "./commands/migrate.js";
import { shellCommand } from "./commands/shell.js";
import { startCommand } from "./commands/start.js";
import { statusCommand } from "./commands/status.js";
import { stopCommand } from "./commands/stop.js";

const program = new Command();

// La versión sale del package.json: la cadena fija ("0.1.0") se había quedado
// atrás respecto al paquete (0.9.0-beta).
const pkg = createRequire(import.meta.url)("../package.json") as { version: string };

program
  .name("kitsuden")
  .description("Kitsuden CLI - AI-Native Backend as a Service")
  .version(pkg.version)
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
  .option("--stdio", "Run the MCP server over stdin/stdout (for .mcp.json); token from KITSUDEN_API_TOKEN")
  .option("--agent-env-file <path>", "With --stdio: read KITSUDEN_API_URL/KITSUDEN_API_TOKEN from a file outside any repository")
  .action(mcpCommand);

program
  .command("new [name]")
  .description("Create a frontend website from the Kitsuden starter (Astro)")
  .option("--api-url <url>", "Kitsuden API URL written to .env (KITSUDEN_API_URL)")
  .option("--site-url <url>", "Public URL of the site written to .env (SITE_URL)")
  .option("--site-name <name>", "Site name written to .env (SITE_NAME)")
  .option("--from <dir>", "Copy this starter folder instead of the bundled one")
  .option("--install", "Run pnpm install in the new project")
  .option("--quickstart", "No questions, default values, and pnpm install")
  .option("-y, --yes", "No questions: use the options or the defaults")
  .option("--api", "Explain how to get a Kitsuden API running (nothing is generated for it)")
  .action(newCommand);

program
  .command("make <kind> <name>")
  .description("Scaffolding: kon | model | policy | request | job | test")
  .option("--force", "Overwrite generated files that already exist")
  .option("--kon <name>", "Generate inside this kon (model, policy, request, job, test)")
  .option("--dir <folder>", "make model: folder for a model outside a kon (e.g. apps/api/src/modelos)")
  .option("--root <dir>", "Kitsuden monorepo root (default: found from the current folder)")
  .option("--icon <name>", "make kon: lucide icon name from the admin icon map", "Package")
  .option("--title <title>", "make kon: display name")
  .option("--description <text>", "make kon: description")
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
  .description("Diff the declared models (defineModelo) and write the migration SQL (never applies it)")
  .option("-n, --name <name>", "Migration name")
  .option("--dry-run", "Show what would be created without writing")
  .option("--kon <name>", "Only this kon")
  .option("--dir <folder>", "A folder with models (*.modelo.ts / modelos.ts) and its migrations/")
  .option("--allow-destructive", "Emit DROP TABLE / DROP COLUMN (commented out by default)")
  .option("--drizzle", "Legacy generator: drizzle-kit export of each kon's schema.ts")
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
// ── kon add|remove|list: instalar kons (kitsuden-kons) en este proyecto ──
const konCmd = program
  .command("kon")
  .description("Install, remove and list kons (extension modules from kitsuden-kons)");

konCmd
  .command("add <names...>")
  .description("Install kons (and the kons they depend on) and run their migrations")
  .option("--from <source>", "Local path or git URL of the kons repo (default: ../kitsuden-kons, then the official repo)")
  .option("--ref <ref>", "Git branch or tag when --from is a git URL")
  .option("--link", "Use the kon where it is instead of copying it to packages/kons (kon development)")
  .option("--enable", "Seed the kon as active (first time the database hears of it)")
  .option("--force", "Overwrite an installed copy that has local changes")
  .option("--no-install", "Do not run pnpm install")
  .option("--no-migrate", "Do not run the migrations (apps/api/scripts/migrate.ts --kon <id>)")
  .option("--api-url <url>", "Running API whose GET /api/version gives the kon SDK version")
  .option("--root <dir>", "Kitsuden project root (default: found from the current folder)")
  // Registry installs (`kon add blog@^2`): docs/kons/registry.md
  .option("--registry <name|path|url>", "Install from a signed kon registry (name in kitsuden.registries.json, folder or URL)")
  .option("--registry-key <key>", "Registry public key (file or base64), if not in kitsuden.registries.json")
  .option("--yes", "Accept the declared permissions shown (new kons)")
  .option("--accept-wider", "With --yes: also accept updates that widen scopes, hosts or sensitive operations")
  .option("--allow-unsigned", "Local development only: accept unsigned packages (refused when KITSUDEN_PUBLIC=true)")
  .option("--dry-run", "Resolve, verify and show the permissions; install nothing")
  .action(konAddCommand);

const opcionesDeRegistro = (c: ReturnType<typeof konCmd.command>) =>
  c
    .option("--registry <name|path|url>", "Registry (name in kitsuden.registries.json, folder or URL)")
    .option("--registry-key <key>", "Registry public key (file or base64)")
    .option("--allow-unsigned", "Local development only (refused when KITSUDEN_PUBLIC=true)")
    .option("--api-url <url>", "Running API whose GET /api/version gives the core and SDK versions")
    .option("--root <dir>", "Kitsuden project root (default: found from the current folder)");

opcionesDeRegistro(konCmd.command("search [text]").description("Search the kon registry"))
  .option("--json", "JSON output")
  .action(konSearchCommand);

opcionesDeRegistro(konCmd.command("info <kon>").description("Versions, permissions, signer and advisories of a kon (<kon>[@range])"))
  .option("--json", "JSON output")
  .action(konInfoCommand);

opcionesDeRegistro(konCmd.command("update [names...]").description("Update registry kons within their ranges (all if none given)"))
  .option("--yes", "Accept the plan")
  .option("--accept-wider", "With --yes: accept wider scopes, hosts or sensitive operations")
  .option("--dry-run", "Show the plan and the permission diff only")
  .option("--force", "Overwrite installed copies with local changes")
  .option("--no-install", "Do not run pnpm install")
  .option("--no-migrate", "Do not run the migrations")
  .action(konUpdateCommand);

opcionesDeRegistro(konCmd.command("outdated").description("Registry kons with newer versions, yanked or under an advisory"))
  .option("--json", "JSON output")
  .action(konOutdatedCommand);

opcionesDeRegistro(konCmd.command("sync").description("Install exactly what kitsuden.kons.lock pins, verifying every package"))
  .option("--yes", "Non-interactive")
  .option("--accept-wider", "With --yes: accept a changed signing key")
  .option("--force", "Overwrite installed copies with local changes")
  .option("--no-install", "Do not run pnpm install")
  .option("--no-migrate", "Do not run the migrations")
  .action(konSyncCommand);

opcionesDeRegistro(konCmd.command("verify [names...]").description("Verify installed registry kons against the lockfile, or one package file offline"))
  .option("--file <tgz>", "Verify this package file offline (with --key and <tgz>.minisig)")
  .option("--sig <file>", "Signature file (default: <tgz>.minisig)")
  .option("--key <pub>", "Publisher public key file (with --file)")
  .action(konVerifyCommand);

konCmd
  .command("publish <dir>")
  .description("Pack, sign and add a kon to a LOCAL registry folder (never uploads)")
  .requiredOption("--registry <folder>", "Local registry folder (index.json is created if missing)")
  .requiredOption("--key <file>", "Publisher secret key (kon keygen)")
  .option("--index-key <file>", "Registry secret key that signs the index (default: --key)")
  .option("--registry-name <name>", "Name recorded in a new index", "local")
  .option("--add-owner", "Registry key holder: let this publisher key publish an existing kon")
  .option("--dry-run", "Validate and pack, write nothing")
  .action(konPublishCommand);

konCmd
  .command("yank <spec>")
  .description("Yank <kon>@<version> in a local registry; --revoke adds a revoking advisory")
  .requiredOption("--registry <folder>", "Local registry folder")
  .requiredOption("--index-key <file>", "Registry secret key")
  .option("--reason <text>", "Why (shown to users)")
  .option("--undo", "Un-yank")
  .option("--advisory <summary>", "Also publish an advisory")
  .option("--revoke", "The advisory revokes: refused even when a lockfile pins it")
  .option("--severity <level>", "low | moderate | high | critical")
  .option("--range <range>", "Affected versions (default: =<version>)")
  .option("--revoke-key <keyId>", "Revoke a publisher key instead (spec is ignored)")
  .action(konYankCommand);

konCmd
  .command("keygen")
  .description("Create an Ed25519 publisher/registry key pair (minisign format public key)")
  .requiredOption("--out <path>", "Writes <path>.pub and <path>.key (outside any git repository)")
  .option("--force", "Allow writing inside a git repository")
  .action(konKeygenCommand);

konCmd
  .command("remove <names...>")
  .description("Uninstall kons (their tables and data stay in the database)")
  .option("--force", "Remove even if another kon depends on it or the copy has local changes")
  .option("--keep-files", "Keep packages/kons/<kon> on disk, only stop declaring it")
  .option("--no-install", "Do not run pnpm install")
  .option("--root <dir>", "Kitsuden project root (default: found from the current folder)")
  .action(konRemoveCommand);

konCmd
  .command("list")
  .description("List installed kons (or --available ones in the source)")
  .option("--available", "List the kons the source offers, with their maturity")
  .option("--from <source>", "Source for --available (default: ../kitsuden-kons, then the official repo)")
  .option("--ref <ref>", "Git branch or tag when --from is a git URL")
  .option("--json", "JSON output")
  .option("--root <dir>", "Kitsuden project root (default: found from the current folder)")
  .action(konListCommand);

// kon-create.ts duplicado fue eliminado — generaba el scaffold obsoleto.
program
  .command("kon:create")
  .description("Alias for make kon")
  .argument("<name>", "Kon name")
  .option("--with-admin", "Include admin configuration")
  .option("--with-tests", "Include test files")
  .action(createKonCommand);

program
  .command("create-kon")
  .description("Alias for make kon")
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
