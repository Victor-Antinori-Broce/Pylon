import { execFileSync, execSync, spawn } from "child_process";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

import chalk from "chalk";
import fs from "fs-extra";
import ora from "ora";

interface McpOptions {
  port?: string;
  apiUrl?: string;
  token?: string;
  ide?: string;
  stdio?: boolean;
  agentEnvFile?: string;
}

export async function mcpCommand(options: McpOptions) {
  const PORT = options.port || "3002";
  const API_URL = options.apiUrl || "http://localhost:3000";

  // --stdio: el cliente MCP lanza este proceso; stdout es suyo, nada de spinner.
  // Orden: --agent-env-file, luego el entorno, luego --api-url. El entorno gana a
  // --api-url porque esta siempre trae valor (el por defecto), y pisarla
  // mandaría al agente a localhost:3000 sin pedirlo.
  if (options.stdio) {
    const delFichero = options.agentEnvFile ? readAgentEnvFile(options.agentEnvFile) : {};
    runStdio(
      delFichero.KITSUDEN_API_URL ?? process.env.KITSUDEN_API_URL ?? API_URL,
      delFichero.KITSUDEN_API_TOKEN
    );
    return;
  }

  // If --ide flag is set, just generate IDE config and exit
  if (options.ide) {
    generateIdeConfig(options.ide, PORT, API_URL, options.token);
    return;
  }

  const spinner = ora("Starting MCP Server...").start();

  try {
    const projectRoot = process.cwd();
    const hasDockerCompose = await fs.pathExists(path.join(projectRoot, "docker-compose.yml"));

    if (hasDockerCompose) {
      spinner.text = "Starting MCP container...";

      try {
        execSync("docker compose up -d kitsuden_mcp", {
          cwd: projectRoot,
          stdio: "ignore",
        });

        spinner.succeed(chalk.green("✅ MCP Server started"));
        printConnectionInfo(PORT, API_URL);
        return;
      } catch {
        // Fall through to standalone mode
      }
    }

    // Standalone mode
    spinner.text = "Starting standalone MCP Server...";

    const envVars: string[] = [
      `-e KITSUDEN_API_URL=${options.apiUrl || "http://host.docker.internal:3000"}`,
      `-e PORT=${PORT}`,
    ];

    if (options.token) {
      envVars.push(`-e KITSUDEN_API_TOKEN=${options.token}`);
    }

    const dockerArgs = [
      "run",
      "--rm",
      "-d",
      "--name",
      "kitsuden-mcp-standalone",
      "-p",
      `${PORT}:3002`,
      ...envVars,
      "kitsuden/mcp:latest",
    ];

    execSync(`docker ${dockerArgs.join(" ")}`, { stdio: "ignore" });

    spinner.succeed(chalk.green("✅ MCP Server started (standalone)"));
    printConnectionInfo(PORT, API_URL);
    console.log(chalk.gray("\nStop with: docker stop kitsuden-mcp-standalone\n"));
  } catch (error) {
    spinner.fail(chalk.red("Failed to start MCP Server"));
    console.log(chalk.yellow("\n💡 Try running directly with Docker:"));
    console.log(
      chalk.white(`docker run -p ${PORT}:3002 -e KITSUDEN_API_URL=${API_URL} kitsuden/mcp:latest`)
    );
    console.error(error);
    process.exit(1);
  }
}

/**
 * Dónde está el servidor: `KITSUDEN_MCP_ENTRY`, o `packages/mcp-server` buscando
 * hacia arriba desde el directorio actual (el monorepo), o junto a este CLI.
 */
function findStandaloneEntry(): string | null {
  if (process.env.KITSUDEN_MCP_ENTRY) return process.env.KITSUDEN_MCP_ENTRY;
  const candidates: string[] = [];
  for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
    candidates.push(path.join(dir, "packages", "mcp-server"));
    if (path.dirname(dir) === dir) break;
  }
  // dist/commands/mcp.js → packages/cli → packages/mcp-server
  candidates.push(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "mcp-server")
  );
  for (const pkg of candidates) {
    for (const entry of ["dist/standalone.js", "src/standalone.ts"]) {
      const file = path.join(pkg, entry);
      if (fs.existsSync(file)) return file;
    }
  }
  return null;
}

const VARIABLES_DEL_FICHERO = ["KITSUDEN_API_URL", "KITSUDEN_API_TOKEN"] as const;

/**
 * `--agent-env-file`: para clientes MCP que no expanden `${VAR}` y que, como el SDK
 * de referencia, solo pasan al servidor PATH, HOME y poco más (Antigravity).
 * El token vive en un fichero que ningún repositorio vaya a subir: dentro de
 * uno sin ignorar, un `git add .` lo publicaría (hay máquinas donde la propia
 * carpeta personal es un repositorio con remoto). Dentro de uno se acepta solo
 * si ese repositorio lo ignora. `~` se expande aquí porque en un JSON nadie lo
 * hace. No se llama `--env-file` porque Node 22 y Bun tienen una opción con ese
 * nombre y Node la leía aunque fuera detrás del script.
 */
function readAgentEnvFile(
  ruta: string
): Partial<Record<(typeof VARIABLES_DEL_FICHERO)[number], string>> {
  const fichero = path.resolve(ruta.replace(/^~(?=$|[\\/])/, os.homedir()));
  const fallar = (motivo: string): never => {
    console.error(`--agent-env-file ${fichero}: ${motivo}`);
    process.exit(1);
  };
  if (!fs.existsSync(fichero)) fallar("does not exist");
  // null cuando git sale con error (fuera de un repositorio, o no ignorado)
  const git = (...args: string[]): string | null => {
    try {
      return execFileSync("git", ["-C", path.dirname(fichero), ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      return null;
    }
  };
  if (
    git("rev-parse", "--is-inside-work-tree") === "true" &&
    git("check-ignore", "-q", "--", fichero) === null
  ) {
    fallar(
      `is inside the git repository ${git("rev-parse", "--show-toplevel")} and not ignored there; ` +
        "move it out of every repository, or ignore it in that one"
    );
  }
  const vars: Partial<Record<(typeof VARIABLES_DEL_FICHERO)[number], string>> = {};
  for (const linea of fs.readFileSync(fichero, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const [, nombre, valor] = m;
    if ((VARIABLES_DEL_FICHERO as readonly string[]).includes(nombre)) {
      vars[nombre as (typeof VARIABLES_DEL_FICHERO)[number]] = valor.replace(
        /^(['"])(.*)\1$/,
        "$2"
      );
    } else {
      console.error(
        `--agent-env-file: ignoring ${nombre} (only ${VARIABLES_DEL_FICHERO.join(", ")})`
      );
    }
  }
  return vars;
}

/**
 * El token llega por el entorno (`KITSUDEN_API_TOKEN`) o por `--agent-env-file`:
 * en `.mcp.json` se escribe `${KITSUDEN_API_TOKEN}` y cada agente trae el
 * suyo. Un `--token` acabaría escrito en un fichero de configuración.
 */
function runStdio(apiUrl: string, token?: string) {
  const entry = findStandaloneEntry();
  if (!entry) {
    console.error(
      "Kitsuden MCP server not found. Run inside the Kitsuden monorepo, or set KITSUDEN_MCP_ENTRY " +
        "to packages/mcp-server/dist/standalone.js."
    );
    process.exit(1);
  }
  const env = {
    ...process.env,
    KITSUDEN_API_URL: apiUrl,
    ...(token ? { KITSUDEN_API_TOKEN: token } : {}),
  };
  const child = spawn("bun", ["run", entry, "--stdio"], { stdio: "inherit", env });
  child.on("error", (error) => {
    console.error(`Could not start bun (${error.message}). The MCP server runs on Bun.`);
    process.exit(1);
  });
  child.on("exit", (code) => process.exit(code ?? 1));
}

function printConnectionInfo(port: string, _apiUrl: string) {
  console.log(chalk.cyan("\n═══════════════════════════════════════════"));
  console.log(chalk.green.bold("  🧙 Kitsuden MCP Server"));
  console.log(chalk.cyan("═══════════════════════════════════════════"));
  console.log("");
  console.log(chalk.white("  SSE:        ") + chalk.blue.underline(`http://localhost:${port}/sse`));
  console.log(
    chalk.white("  Health:     ") + chalk.blue.underline(`http://localhost:${port}/health`)
  );
  console.log(
    chalk.white("  IDE Config: ") + chalk.blue.underline(`http://localhost:${port}/ide-config`)
  );
  console.log("");
  console.log(chalk.dim("  11 tools • 5 resources • TOON-enabled"));
  console.log("");
  console.log(chalk.cyan("  Quick IDE Setup:"));
  console.log(chalk.white("    kitsuden mcp --ide cursor"));
  console.log(chalk.white("    kitsuden mcp --ide claude"));
  console.log(chalk.white("    kitsuden mcp --ide vscode"));
  console.log("");
}

function generateIdeConfig(ide: string, port: string, apiUrl: string, token?: string) {
  const sseUrl = `http://localhost:${port}/sse`;

  switch (ide.toLowerCase()) {
    case "cursor": {
      const config = {
        mcpServers: {
          kitsuden: {
            url: sseUrl,
          },
        },
      };
      const configPath = path.join(process.cwd(), ".cursor", "mcp.json");

      console.log(chalk.cyan("\n🎯 Cursor MCP Configuration"));
      console.log(chalk.dim(`File: ${configPath}\n`));

      // Try to create the file
      try {
        fs.ensureDirSync(path.dirname(configPath));

        // Merge with existing config if present
        let existing: any = {};
        if (fs.existsSync(configPath)) {
          existing = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        }

        const merged = {
          ...existing,
          mcpServers: {
            ...(existing.mcpServers || {}),
            ...config.mcpServers,
          },
        };

        fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));
        console.log(chalk.green(`✅ Written to ${configPath}`));
      } catch {
        console.log(chalk.yellow("⚠️  Could not write file. Copy this manually:\n"));
        console.log(JSON.stringify(config, null, 2));
      }
      break;
    }

    case "claude": {
      const config = {
        mcpServers: {
          kitsuden: {
            command: "npx",
            args: ["-y", "@kitsuden/mcp-server"],
            env: {
              KITSUDEN_API_URL: apiUrl,
              ...(token ? { KITSUDEN_API_TOKEN: token } : {}),
            },
          },
        },
      };

      console.log(chalk.cyan("\n🤖 Claude Desktop Configuration"));
      console.log(
        chalk.dim("File: ~/Library/Application Support/Claude/claude_desktop_config.json (macOS)")
      );
      console.log(chalk.dim("      %APPDATA%\\Claude\\claude_desktop_config.json (Windows)\n"));
      console.log(chalk.white(JSON.stringify(config, null, 2)));
      break;
    }

    case "vscode": {
      const config = {
        "mcp.servers": {
          kitsuden: {
            url: sseUrl,
          },
        },
      };

      console.log(chalk.cyan("\n📝 VS Code Configuration"));
      console.log(chalk.dim("Merge into: .vscode/settings.json\n"));
      console.log(chalk.white(JSON.stringify(config, null, 2)));
      break;
    }

    case "windsurf": {
      const config = {
        mcpServers: {
          kitsuden: {
            serverUrl: sseUrl,
          },
        },
      };

      console.log(chalk.cyan("\n🏄 Windsurf Configuration"));
      console.log(chalk.dim("File: ~/.codeium/windsurf/mcp_config.json\n"));
      console.log(chalk.white(JSON.stringify(config, null, 2)));
      break;
    }

    default:
      console.log(chalk.red(`Unknown IDE: ${ide}`));
      console.log(chalk.dim("Available: cursor, claude, vscode, windsurf"));
  }
}
