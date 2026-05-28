import { execSync } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';

interface McpOptions {
  port?: string;
  apiUrl?: string;
  token?: string;
  ide?: string;
}

export async function mcpCommand(options: McpOptions) {
  const PORT = options.port || '3002';
  const API_URL = options.apiUrl || 'http://localhost:3000';

  // If --ide flag is set, just generate IDE config and exit
  if (options.ide) {
    generateIdeConfig(options.ide, PORT, API_URL, options.token);
    return;
  }

  const spinner = ora('Starting MCP Server...').start();

  try {
    const projectRoot = process.cwd();
    const hasDockerCompose = await fs.pathExists(path.join(projectRoot, 'docker-compose.yml'));

    if (hasDockerCompose) {
      spinner.text = 'Starting MCP container...';

      try {
        execSync('docker compose up -d gremius_mcp', {
          cwd: projectRoot,
          stdio: 'ignore'
        });

        spinner.succeed(chalk.green('✅ MCP Server started'));
        printConnectionInfo(PORT, API_URL);
        return;
      } catch {
        // Fall through to standalone mode
      }
    }

    // Standalone mode
    spinner.text = 'Starting standalone MCP Server...';

    const envVars: string[] = [
      `-e GREMIUS_API_URL=${options.apiUrl || 'http://host.docker.internal:3000'}`,
      `-e PORT=${PORT}`
    ];

    if (options.token) {
      envVars.push(`-e GREMIUS_API_TOKEN=${options.token}`);
    }

    const dockerArgs = [
      'run', '--rm', '-d',
      '--name', 'gremius-mcp-standalone',
      '-p', `${PORT}:3002`,
      ...envVars,
      'gremius/mcp:latest'
    ];

    execSync(`docker ${dockerArgs.join(' ')}`, { stdio: 'ignore' });

    spinner.succeed(chalk.green('✅ MCP Server started (standalone)'));
    printConnectionInfo(PORT, API_URL);
    console.log(chalk.gray('\nStop with: docker stop gremius-mcp-standalone\n'));

  } catch (error) {
    spinner.fail(chalk.red('Failed to start MCP Server'));
    console.log(chalk.yellow('\n💡 Try running directly with Docker:'));
    console.log(chalk.white(`docker run -p ${PORT}:3002 -e GREMIUS_API_URL=${API_URL} gremius/mcp:latest`));
    console.error(error);
    process.exit(1);
  }
}

function printConnectionInfo(port: string, _apiUrl: string) {
  console.log(chalk.cyan('\n═══════════════════════════════════════════'));
  console.log(chalk.green.bold('  🧙 Gremius MCP Server'));
  console.log(chalk.cyan('═══════════════════════════════════════════'));
  console.log('');
  console.log(chalk.white('  SSE:        ') + chalk.blue.underline(`http://localhost:${port}/sse`));
  console.log(chalk.white('  Health:     ') + chalk.blue.underline(`http://localhost:${port}/health`));
  console.log(chalk.white('  IDE Config: ') + chalk.blue.underline(`http://localhost:${port}/ide-config`));
  console.log('');
  console.log(chalk.dim('  11 tools • 5 resources • TOON-enabled'));
  console.log('');
  console.log(chalk.cyan('  Quick IDE Setup:'));
  console.log(chalk.white('    gremius mcp --ide cursor'));
  console.log(chalk.white('    gremius mcp --ide claude'));
  console.log(chalk.white('    gremius mcp --ide vscode'));
  console.log('');
}

function generateIdeConfig(ide: string, port: string, apiUrl: string, token?: string) {
  const sseUrl = `http://localhost:${port}/sse`;

  switch (ide.toLowerCase()) {
    case 'cursor': {
      const config = {
        mcpServers: {
          gremius: {
            url: sseUrl,
          },
        },
      };
      const configPath = path.join(process.cwd(), '.cursor', 'mcp.json');

      console.log(chalk.cyan('\n🎯 Cursor MCP Configuration'));
      console.log(chalk.dim(`File: ${configPath}\n`));

      // Try to create the file
      try {
        fs.ensureDirSync(path.dirname(configPath));

        // Merge with existing config if present
        let existing: any = {};
        if (fs.existsSync(configPath)) {
          existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
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
        console.log(chalk.yellow('⚠️  Could not write file. Copy this manually:\n'));
        console.log(JSON.stringify(config, null, 2));
      }
      break;
    }

    case 'claude': {
      const config = {
        mcpServers: {
          gremius: {
            command: "npx",
            args: ["-y", "@gremius/mcp-server"],
            env: {
              GREMIUS_API_URL: apiUrl,
              ...(token ? { GREMIUS_API_TOKEN: token } : {}),
            },
          },
        },
      };

      console.log(chalk.cyan('\n🤖 Claude Desktop Configuration'));
      console.log(chalk.dim('File: ~/Library/Application Support/Claude/claude_desktop_config.json (macOS)'));
      console.log(chalk.dim('      %APPDATA%\\Claude\\claude_desktop_config.json (Windows)\n'));
      console.log(chalk.white(JSON.stringify(config, null, 2)));
      break;
    }

    case 'vscode': {
      const config = {
        "mcp.servers": {
          gremius: {
            url: sseUrl,
          },
        },
      };

      console.log(chalk.cyan('\n📝 VS Code Configuration'));
      console.log(chalk.dim('Merge into: .vscode/settings.json\n'));
      console.log(chalk.white(JSON.stringify(config, null, 2)));
      break;
    }

    case 'windsurf': {
      const config = {
        mcpServers: {
          gremius: {
            serverUrl: sseUrl,
          },
        },
      };

      console.log(chalk.cyan('\n🏄 Windsurf Configuration'));
      console.log(chalk.dim('File: ~/.codeium/windsurf/mcp_config.json\n'));
      console.log(chalk.white(JSON.stringify(config, null, 2)));
      break;
    }

    default:
      console.log(chalk.red(`Unknown IDE: ${ide}`));
      console.log(chalk.dim('Available: cursor, claude, vscode, windsurf'));
  }
}
