#!/usr/bin/env node
import { createRequire } from "module";

import chalk from "chalk";
import { program } from "commander";

import { createGrimoireCommand } from "../dist/commands/create-grimoire.js";
import { deployCommand } from "../dist/commands/deploy.js";
import { initCommand } from "../dist/commands/init.js";
import { logsCommand } from "../dist/commands/logs.js";
import { mcpCommand } from "../dist/commands/mcp.js";
import { startCommand } from "../dist/commands/start.js";
import { statusCommand } from "../dist/commands/status.js";
import { stopCommand } from "../dist/commands/stop.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

console.log(
  chalk.cyan(`
╔══════════════════════════════════════════╗
║   🚀 GremiusCMS CLI v${pkg.version.padEnd(9)}  ║
║   AI-Native Backend as a Service         ║
╚══════════════════════════════════════════╝
`)
);

program
  .name("gremius")
  .description("GremiusCMS CLI - Deploy your backend in seconds")
  .version(pkg.version, "-v, --version", "Display version number")
  .helpOption("-h, --help", "Display help")
  .configureHelp({
    sortSubcommands: true,
    subcommandTerm: (cmd) => chalk.green(cmd.name()),
  });

program
  .command("init")
  .description("Initialize a new Gremius project (vibecoder mode by default)")
  .argument("[name]", "Project name")
  .option("-t, --template <type>", "Template to use: default, blog, saas, ecommerce", "default")
  .option("-m, --mode <mode>", "Mode: vibecoder (Docker-only) or developer (monorepo)", "vibecoder")
  .option("-d, --database <type>", "Database type (postgres, mysql)", "postgres")
  .option("--start", "Auto-start services after init (vibecoder mode)")
  .action(initCommand);

program
  .command("start")
  .description("Start your Gremius backend locally")
  .option("-d, --detach", "Run in detached mode")
  .option("-p, --port <port>", "API port", "3000")
  .option("--mcp", "Start MCP server for AI assistants")
  .option("--admin", "Start admin panel")
  .action(startCommand);

program.command("stop").description("Stop your Gremius backend").action(stopCommand);

program
  .command("logs")
  .description("View logs from your Gremius backend")
  .option("-f, --follow", "Follow log output")
  .option("-s, --service <service>", "Service to view logs for (api, mcp, admin, db)")
  .action(logsCommand);

program
  .command("mcp")
  .description("Run the MCP server for AI assistants")
  .option("-p, --port <port>", "MCP server port", "3002")
  .option("--api-url <url>", "Gremius API URL", "http://localhost:3000")
  .option("--token <token>", "API authentication token")
  .option("--ide <ide>", "Generate IDE config (cursor, claude, vscode, windsurf)")
  .action(mcpCommand);

program
  .command("deploy")
  .description("Deploy your Gremius backend to production")
  .option("-p, --provider <provider>", "Deployment provider (docker, gremius)", "docker")
  .option("--build", "Force rebuild before deploy")
  .action(deployCommand);

program
  .command("status")
  .description("Check the status of your Gremius backend")
  .action(statusCommand);

program
  .command("create-grimoire <name>")
  .description("Create a new grimoire scaffolding in packages/grimoires/")
  .option("--with-admin", "Include admin configuration")
  .action(createGrimoireCommand);

program.parse();
