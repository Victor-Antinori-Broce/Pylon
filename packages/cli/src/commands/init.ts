import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve package root (dist/commands/ -> dist/ -> package root)
const PACKAGE_ROOT = path.resolve(__dirname, '../..');

function getTemplatePath(templateName: string): string {
  return path.join(PACKAGE_ROOT, 'templates', templateName);
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATES CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

interface TemplateConfig {
  name: string;
  description: string;
  grimoires: string[];
}

const TEMPLATES: Record<string, TemplateConfig> = {
  default: {
    name: "Default",
    description: "Core functionality: auth, datasets, media",
    grimoires: ["grimoire-auth", "grimoire-datasets", "grimoire-media"],
  },
  blog: {
    name: "Blog",
    description: "Content-focused blog with posts, tags, and SEO",
    grimoires: ["grimoire-auth", "grimoire-datasets", "grimoire-media", "grimoire-blog"],
  },
  saas: {
    name: "SaaS",
    description: "Teams, subscriptions, and user management",
    grimoires: ["grimoire-auth", "grimoire-datasets", "grimoire-media"],
  },
  ecommerce: {
    name: "E-Commerce",
    description: "Online store with products, orders, inventory",
    grimoires: ["grimoire-auth", "grimoire-datasets", "grimoire-media"],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// OPTIONS INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

export interface InitOptions {
  template?: string;
  mode?: 'vibecoder' | 'developer';
  database?: string;
  autoStart?: boolean;
  start?: boolean;
  headless?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN INIT COMMAND
// ═══════════════════════════════════════════════════════════════════════════

export async function initCommand(name: string | undefined, options: InitOptions) {
  const spinner = ora();

  try {
    // ── Determine mode ──
    const mode = options.mode || 'vibecoder';

    // ── Ask for project name if not provided ──
    let projectName = name;
    if (!projectName) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: mode === 'vibecoder' ? 'Project name:' : 'Project name (monorepo):',
          default: 'my-gremius-app',
        },
      ]);
      projectName = answers.name;
    }

    const projectPath = path.resolve(process.cwd(), projectName || 'my-gremius-app');

    // ── Check if directory exists ──
    if (await fs.pathExists(projectPath)) {
      spinner.fail(chalk.red(`Directory "${projectName}" already exists`));
      process.exit(1);
    }

    // ── Determine template ──
    let template = options.template || 'default';
    if (!TEMPLATES[template]) {
      spinner.warn(chalk.yellow(`Unknown template "${template}". Using default.`));
      template = 'default';
    }

    const templateConfig = TEMPLATES[template];

    console.log(chalk.cyan(`\n🚀 GremiusCMS v0.8 — ${mode === 'vibecoder' ? 'Vibecoder' : 'Developer'} Mode\n`));
    console.log(chalk.gray(`Template: ${templateConfig.name} — ${templateConfig.description}\n`));

    spinner.start('Creating project...');
    await fs.ensureDir(projectPath);

    if (mode === 'vibecoder') {
      await createVibecoderProject(projectPath, projectName || 'my-gremius-app', template, templateConfig, spinner, options.headless);
    } else {
      await createDeveloperProject(projectPath, projectName || 'my-gremius-app', template, templateConfig, spinner);
    }

    spinner.succeed(chalk.green(`✅ Project "${projectName}" created successfully!`));

    // ── Post-creation output ──
    if (mode === 'vibecoder') {
      printVibecoderOutput(projectPath, projectName || 'my-gremius-app', options);
    } else {
      printDeveloperOutput(projectPath, projectName || 'my-gremius-app');
    }

  } catch (error) {
    spinner.fail(chalk.red('Failed to initialize project'));
    console.error(error);
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VIBECODER MODE — Zero-config Docker
// ═══════════════════════════════════════════════════════════════════════════

async function createVibecoderProject(
  projectPath: string,
  projectName: string,
  template: string,
  templateConfig: TemplateConfig,
  spinner: Ora,
  headless: boolean = false
) {
  // Detect if the project path would be inside the Gremius monorepo
  const monorepoRoot = findMonorepoRoot();
  const isDestInsideMonorepo = monorepoRoot
    ? projectPath.startsWith(path.resolve(monorepoRoot))
    : false;

  if (isDestInsideMonorepo) {
    spinner.warn('Cannot create a vibecoder project inside the Gremius monorepo directory.');
    console.log(chalk.yellow('\n💡 Choose a destination outside the monorepo:'));
    console.log(chalk.white(`  cd .. && npx gremius init ${projectName} --mode vibecoder`));
    console.log(chalk.yellow('\nOr use the monorepo directly:'));
    console.log(chalk.white('  docker compose up -d --build'));
    console.log(chalk.white('  pnpm dev:start:simple'));
    throw new Error('Cannot create vibecoder project inside the Gremius monorepo');
  }

  spinner.text = 'Generating vibecoder project...';

  // Copy template-specific files if they exist (before generating docker-compose)
  const templateDir = getTemplatePath(template);
  const hasSeedSql = await fs.pathExists(path.join(templateDir, 'seed.sql'));

  if (await fs.pathExists(templateDir)) {
    const templateFiles = ['realm.json', 'seed.sql', 'seed.ts'];
    for (const file of templateFiles) {
      const src = path.join(templateDir, file);
      if (await fs.pathExists(src)) {
        await fs.copy(src, path.join(projectPath, file));
      }
    }
  }

  // Generate self-contained docker-compose and env
  const dc = generateVibecoderDockerCompose(projectName, hasSeedSql, headless);
  await fs.writeFile(path.join(projectPath, 'docker-compose.yml'), dc);
  await fs.writeFile(path.join(projectPath, '.env'), generateVibecoderEnv(projectName, headless));

  // Write realm.json if template didn't provide one
  const realmPath = path.join(projectPath, 'realm.json');
  if (!(await fs.pathExists(realmPath))) {
    const realmData = {
      name: templateConfig.name,
      template,
      grimoires: templateConfig.grimoires,
      createdAt: new Date().toISOString(),
    };
    await fs.writeFile(realmPath, JSON.stringify(realmData, null, 2));
  }

  // Write railway.json for easy Railway deployment
  await fs.writeFile(
    path.join(projectPath, 'railway.json'),
    generateRailwayJson()
  );

  // Write README
  await fs.writeFile(path.join(projectPath, 'README.md'), generateVibecoderReadme(projectName, template));

  // Write init scripts (auto-detect pre-built images vs build from source)
  await fs.writeFile(
    path.join(projectPath, 'init.sh'),
    `#!/bin/bash
set -e

cd "$(dirname "$0")"

GREMIUS_SOURCE="\${GREMIUS_SOURCE_PATH:-./gremius-source}"
GREMIUS_REPO="\${GREMIUS_REPO_URL:-https://github.com/gremiuscms/gremius.git}"

echo "🚀 GremiusCMS — Starting up..."

# Option A: Try pre-built images first (fast)
if docker pull gremius/api:latest >/dev/null 2>&1 && docker pull gremius/admin:latest >/dev/null 2>&1; then
  echo "✅ Using pre-built images from Docker Hub (fast mode)"
  docker compose up -d
else
  echo "⚠️  Pre-built images not available. Building from source..."
  echo "   This will take 5-10 minutes on first run."
  echo ""

  # Option B: Build from source
  if [ ! -d "$GREMIUS_SOURCE" ]; then
    echo "📥 Cloning Gremius source from $GREMIUS_REPO..."
    git clone "$GREMIUS_REPO" "$GREMIUS_SOURCE"
  fi

  export GREMIUS_SOURCE_PATH="$GREMIUS_SOURCE"
  docker compose up -d --build
fi

echo ""
echo "⏳ Waiting for services to start..."
echo "   API:     http://localhost:3000/api/swagger"
echo "   Admin:   http://localhost:3001"
echo "   MCP:     http://localhost:3000/api/mcp"
echo ""
echo "💡 Next time, just run: ./start.sh"
`,
    { mode: 0o755 }
  );
  await fs.writeFile(
    path.join(projectPath, 'init.bat'),
    `@echo off
setlocal EnableDelayedExpansion

set GREMIUS_SOURCE=%GREMIUS_SOURCE_PATH%
if "%GREMIUS_SOURCE%"=="" set GREMIUS_SOURCE=.\gremius-source

set GREMIUS_REPO=%GREMIUS_REPO_URL%
if "%GREMIUS_REPO%"=="" set GREMIUS_REPO=https://github.com/gremiuscms/gremius.git

echo 🚀 GremiusCMS — Starting up...

:: Option A: Try pre-built images first
docker pull gremius/api:latest >nul 2>&1
if !errorlevel! equ 0 (
  docker pull gremius/admin:latest >nul 2>&1
  if !errorlevel! equ 0 (
    echo ✅ Using pre-built images from Docker Hub (fast mode)
    docker compose up -d
    goto :done
  )
)

echo ⚠️  Pre-built images not available. Building from source...
echo    This will take 5-10 minutes on first run.
echo.

:: Option B: Build from source
if not exist "%GREMIUS_SOURCE%" (
  echo 📥 Cloning Gremius source from %GREMIUS_REPO%...
  git clone %GREMIUS_REPO% %GREMIUS_SOURCE%
)

set GREMIUS_SOURCE_PATH=%GREMIUS_SOURCE%
docker compose up -d --build

:done
echo.
echo ⏳ Waiting for services to start...
echo    API:     http://localhost:3000/api/swagger
echo    Admin:   http://localhost:3001
echo    MCP:     http://localhost:3000/api/mcp
echo.
echo 💡 Next time, just run: start.bat
`,
    { mode: 0o755 }
  );

  // Write a simple start script (assumes source already cloned)
  await fs.writeFile(
    path.join(projectPath, 'start.sh'),
    `#!/bin/bash\ncd "$(dirname "$0")"\ndocker compose up -d --build\n`,
    { mode: 0o755 }
  );
  await fs.writeFile(
    path.join(projectPath, 'start.bat'),
    `@echo off\ncd /d "%~dp0"\ndocker compose up -d --build\n`,
    { mode: 0o755 }
  );

  // Initialize git
  try {
    execSync('git init', { cwd: projectPath, stdio: 'ignore' });
    execSync('git add .', { cwd: projectPath, stdio: 'ignore' });
    execSync('git commit -m "Initial commit from Gremius CLI"', { cwd: projectPath, stdio: 'ignore' });
  } catch {
    // Git might not be installed
  }
}

function printVibecoderOutput(projectPath: string, projectName: string, options: InitOptions) {
  const isHeadless = options.headless;

  console.log(chalk.cyan('\n📁 Project structure:'));
  console.log(`  ${projectName}/`);
  console.log('  ├── docker-compose.yml    # All services');
  console.log('  ├── .env                  # Configuration');
  console.log('  ├── realm.json            # Active modules');
  console.log('  ├── start.sh / start.bat  # Quick start scripts');
  console.log('  └── README.md');

  if (isHeadless) {
    console.log(chalk.gray('\n  👻 Headless mode — no admin panel'));
  }

  // Auto-start if requested
  const shouldStart = options.autoStart || options.start;
  if (shouldStart) {
    console.log(chalk.cyan('\n🐳 Starting services...'));
    const startSpinner = ora('Running docker compose up -d --build...').start();
    try {
      execSync('docker compose up -d --build', { cwd: projectPath, stdio: 'pipe' });
      startSpinner.succeed(chalk.green('All services started!'));

      console.log(chalk.yellow('\n⏳ Waiting for first build to complete (~60-120s)...'));
      console.log(chalk.dim('   The API container builds from source on first run.'));

      console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════'));
      console.log(chalk.green.bold('  🚀 Your backend is starting up!'));
      console.log(chalk.cyan('═══════════════════════════════════════════════════════════'));
      console.log('');
      if (!isHeadless) {
        console.log(chalk.white('  Admin Panel:  ') + chalk.blue.underline('http://localhost:3001'));
      }
      console.log(chalk.white('  API Docs:     ') + chalk.blue.underline('http://localhost:3000/api/swagger'));
      console.log(chalk.white('  MCP Endpoint: ') + chalk.blue.underline('http://localhost:3000/api/mcp'));
      console.log(chalk.white('  MinIO Console:') + chalk.blue.underline('http://localhost:9001'));
      console.log('');
      console.log(chalk.yellow('  💡 Connect Cursor/Claude to the MCP endpoint above'));
      console.log(chalk.yellow('     and let AI configure your backend for you.'));
      console.log('');
    } catch (e: any) {
      startSpinner.fail(chalk.yellow('Docker Compose failed — is Docker running?'));
      console.log(chalk.dim('  Start manually: cd ' + projectName + ' && docker compose up -d --build\n'));
    }
  } else {
    console.log(chalk.cyan('\n🚀 Next steps:'));
    console.log(chalk.white(`  cd ${projectName}`));
    console.log(chalk.white('  ./init.sh        (Linux/Mac)'));
    console.log(chalk.white('  init.bat         (Windows)'));
    console.log('');
    console.log(chalk.cyan('  Then open:'));
    if (!isHeadless) {
      console.log(chalk.white('  Admin:  http://localhost:3001'));
    }
    console.log(chalk.white('  API:    http://localhost:3000/api/swagger'));
    console.log(chalk.white('  MCP:    http://localhost:3000/api/mcp'));
  }

  console.log(chalk.cyan('\n📚 Documentation:'));
  console.log(chalk.blue('  https://docs.gremius.gg/vibecoder\n'));
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVELOPER MODE — Full monorepo
// ═══════════════════════════════════════════════════════════════════════════

async function createDeveloperProject(
  projectPath: string,
  projectName: string,
  template: string,
  templateConfig: TemplateConfig,
  spinner: Ora
) {
  spinner.text = 'Creating developer project structure...';

  // Create directory structure
  await fs.ensureDir(path.join(projectPath, 'grimoires'));
  await fs.ensureDir(path.join(projectPath, 'schemas'));
  await fs.ensureDir(path.join(projectPath, 'migrations'));
  await fs.ensureDir(path.join(projectPath, 'hooks'));
  await fs.ensureDir(path.join(projectPath, '.github', 'workflows'));

  // Docker Compose
  const dockerComposeContent = generateDeveloperDockerCompose();
  await fs.writeFile(path.join(projectPath, 'docker-compose.yml'), dockerComposeContent);

  // Environment files
  const envContent = generateDeveloperEnvFile();
  await fs.writeFile(path.join(projectPath, '.env.example'), envContent);
  await fs.writeFile(path.join(projectPath, '.env'), envContent);

  // Schema file
  const schemaContent = generateDeveloperSchemaFile();
  await fs.writeFile(path.join(projectPath, 'schemas', 'index.ts'), schemaContent);

  // Config file
  const configContent = generateDeveloperConfigFile(templateConfig.grimoires);
  await fs.writeFile(path.join(projectPath, 'gremius.config.ts'), configContent);

  // README
  const readmeContent = generateDeveloperReadme(projectName);
  await fs.writeFile(path.join(projectPath, 'README.md'), readmeContent);

  // Git ignore
  await fs.writeFile(
    path.join(projectPath, '.gitignore'),
    'node_modules\n.env\n.env.local\ndata/\ndist/\n*.log\n.DS_Store\n'
  );

  // Package.json
  const packageJson = generateDeveloperPackageJson(projectName);
  await fs.writeFile(path.join(projectPath, 'package.json'), JSON.stringify(packageJson, null, 2));

  // GitHub Actions
  const workflowContent = generateGitHubWorkflow();
  await fs.writeFile(
    path.join(projectPath, '.github', 'workflows', 'gremius-deploy.yml'),
    workflowContent
  );

  // Realm config
  const realmData = {
    name: templateConfig.name,
    template,
    grimoires: templateConfig.grimoires,
    mode: 'developer',
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(path.join(projectPath, 'realm.json'), JSON.stringify(realmData, null, 2));

  // Write railway.json for easy Railway deployment
  await fs.writeFile(
    path.join(projectPath, 'railway.json'),
    generateRailwayJson()
  );

  // Git init
  try {
    execSync('git init', { cwd: projectPath, stdio: 'ignore' });
    execSync('git add .', { cwd: projectPath, stdio: 'ignore' });
    execSync('git commit -m "Initial commit from Gremius CLI"', { cwd: projectPath, stdio: 'ignore' });
  } catch {
    // Git might not be installed
  }
}

function printDeveloperOutput(_projectPath: string, projectName: string) {
  console.log(chalk.cyan('\n📁 Project structure:'));
  console.log(`  ${projectName}/`);
  console.log('  ├── docker-compose.yml    # Infrastructure services');
  console.log('  ├── gremius.config.ts     # Backend configuration');
  console.log('  ├── schemas/              # Database schemas');
  console.log('  ├── grimoires/            # Custom modules');
  console.log('  ├── migrations/           # Database migrations');
  console.log('  ├── hooks/                # Event hooks');
  console.log('  └── .github/workflows/    # CI/CD');

  console.log(chalk.cyan('\n🛠️ Next steps:'));
  console.log(chalk.white(`  cd ${projectName}`));
  console.log(chalk.white('  docker compose up -d          # Start Postgres, Valkey, MinIO'));
  console.log(chalk.white('  pnpm install                  # Install dependencies'));
  console.log(chalk.white('  pnpm dev:start:simple         # Start API + Admin with hot-reload'));
  console.log('');
  console.log(chalk.cyan('  Then open:'));
  console.log(chalk.white('  Admin:  http://localhost:3001'));
  console.log(chalk.white('  API:    http://localhost:3000'));
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function findMonorepoRoot(): string | null {
  let current = process.cwd();
  while (current !== path.parse(current).root) {
    const dockerCompose = path.join(current, 'docker-compose.yml');
    const pnpmWorkspace = path.join(current, 'pnpm-workspace.yaml');
    if (fs.existsSync(dockerCompose) && fs.existsSync(pnpmWorkspace)) {
      return current;
    }
    current = path.dirname(current);
  }
  return null;
}

// function customizeEnvForProject(envContent: string, projectName: string): string {
//   return envContent
//     .replace(/PUBLIC_SITE_NAME=.*/g, `PUBLIC_SITE_NAME=${projectName}`)
//     .replace(/POSTGRES_DB=gremius_dev/g, `POSTGRES_DB=${projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`);
// }

// ═══════════════════════════════════════════════════════════════════════════
// GENERATORS — Vibecoder
// ═══════════════════════════════════════════════════════════════════════════

function generateVibecoderDockerCompose(_projectName: string, hasSeedSql: boolean = false, headless: boolean = false): string {
  const adminService = headless ? '' : `
  # ═══════════════════════════════════════════════════════════════════════
  # Admin Panel — Dual mode: pre-built image OR build from source
  # ═══════════════════════════════════════════════════════════════════════
  gremius_admin:
    image: \${GREMIUS_ADMIN_IMAGE:-gremius/admin:latest}
    build:
      context: \${GREMIUS_SOURCE_PATH:-.}
      dockerfile: docker/Dockerfile.prod
      target: admin
    container_name: gremius_admin
    restart: unless-stopped
    depends_on:
      - gremius_api
    ports:
      - "\${ADMIN_PORT:-3001}:80"
    networks:
      - gremius_net
`;

  return `# GremiusCMS — Vibecoder Docker Compose
# Generated by Gremius CLI
#
# DUAL MODE:
#   Option A (default): docker compose up -d
#     Uses pre-built images from Docker Hub. Fast (~30s).
#     Requires: images published (gremius/api:latest, gremius/admin:latest)
#
#   Option B (developer): docker compose up -d --build
#     Builds from source. Slow first time (~5-10 min), fast on rebuilds.
#     Requires: GREMIUS_SOURCE_PATH pointing to cloned repo
#
# Quick start:
#   ./init.sh      (Linux/Mac)  — auto-detects best option
#   init.bat       (Windows)    — auto-detects best option

services:
  gremius_db:
    image: pgvector/pgvector:pg16
    container_name: gremius_db
    restart: unless-stopped
    environment:
      POSTGRES_USER: \${POSTGRES_USER:-gremius}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-gremiuspassword}
      POSTGRES_DB: \${POSTGRES_DB:-gremius}
    volumes:
      - gremius_postgres:/var/lib/postgresql/data${hasSeedSql ? '\n      - ./seed.sql:/docker-entrypoint-initdb.d/99_seed.sql:ro' : ''}
    ports:
      - "\${DB_PORT:-5432}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${POSTGRES_USER:-gremius}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - gremius_net

  gremius_state:
    image: valkey/valkey:7-alpine
    container_name: gremius_cache
    restart: unless-stopped
    command: valkey-server --maxmemory 256mb --maxmemory-policy noeviction --appendonly yes
    ports:
      - "\${CACHE_PORT:-6379}:6379"
    volumes:
      - gremius_valkey:/data
    healthcheck:
      test: ["CMD", "valkey-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    networks:
      - gremius_net

  gremius_minio:
    image: minio/minio:latest
    container_name: gremius_minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: \${S3_ACCESS_KEY:-gremius_minio}
      MINIO_ROOT_PASSWORD: \${S3_SECRET_KEY:-gremius_minio_secret}
    ports:
      - "\${MINIO_PORT:-9000}:9000"
      - "\${MINIO_CONSOLE_PORT:-9001}:9001"
    volumes:
      - gremius_minio:/data
    networks:
      - gremius_net

  # ═══════════════════════════════════════════════════════════════════════
  # API — Dual mode: pre-built image OR build from source
  # ═══════════════════════════════════════════════════════════════════════
  gremius_api:
    image: \${GREMIUS_API_IMAGE:-gremius/api:latest}
    build:
      context: \${GREMIUS_SOURCE_PATH:-.}
      dockerfile: docker/Dockerfile.prod
      target: api
    container_name: gremius_api
    restart: unless-stopped
    depends_on:
      gremius_db:
        condition: service_healthy
      gremius_state:
        condition: service_healthy
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATABASE_URL=postgresql://\${POSTGRES_USER:-gremius}:\${POSTGRES_PASSWORD:-gremiuspassword}@gremius_db:5432/\${POSTGRES_DB:-gremius}
      - REDIS_URL=redis://gremius_state:6379
      - DEFAULT_STORAGE_PROVIDER=minio
      - S3_ENDPOINT=http://gremius_minio:9000
      - S3_PUBLIC_URL=\${S3_PUBLIC_URL:-http://localhost:9000}
      - S3_ACCESS_KEY=\${S3_ACCESS_KEY:-gremius_minio}
      - S3_SECRET_KEY=\${S3_SECRET_KEY:-gremius_minio_secret}
      - S3_BUCKET=\${S3_BUCKET:-gremius-media}
      - S3_REGION=\${S3_REGION:-us-east-1}
      - BETTER_AUTH_SECRET=\${BETTER_AUTH_SECRET:-change-me-in-production}
      - BETTER_AUTH_URL=http://localhost:\${API_PORT:-3000}
      - ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
      - ADMIN_URL=http://localhost:3001
      - LOG_LEVEL=info
      - ENABLE_SWAGGER=true
      - ENABLE_MCP=true
      - RATE_LIMIT_ENABLED=true
      - HEADLESS=${headless ? 'true' : 'false'}
    ports:
      - "\${API_PORT:-3000}:3000"
    networks:
      - gremius_net
${adminService}
volumes:
  gremius_postgres:
  gremius_valkey:
  gremius_minio:

networks:
  gremius_net:
    driver: bridge
`;
}

function generateVibecoderEnv(projectName: string, headless: boolean = false): string {
  return `# GremiusCMS — Environment
PROJECT_NAME=${projectName}

POSTGRES_USER=gremius
POSTGRES_PASSWORD=gremiuspassword
POSTGRES_DB=gremius
DB_PORT=5432

CACHE_PORT=6379

API_PORT=3000
BETTER_AUTH_SECRET=dev-secret-change-in-production-min-32-chars
BETTER_AUTH_URL=http://localhost:3000

ADMIN_PORT=3001

MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001
S3_ACCESS_KEY=gremius_minio
S3_SECRET_KEY=gremius_minio_secret
S3_BUCKET=gremius-media
S3_REGION=us-east-1
S3_PUBLIC_URL=http://localhost:9000

ENABLE_SWAGGER=true
ENABLE_MCP=true
HEADLESS=${headless ? 'true' : 'false'}

# ═══════════════════════════════════════════════════════════════════════════
# Auth Providers (managed via CLI: gremius auth add <provider>)
# ═══════════════════════════════════════════════════════════════════════════
# Google OAuth — get credentials at https://console.cloud.google.com/
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
#
# GitHub OAuth — get credentials at https://github.com/settings/developers
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=
#
# Microsoft/Azure AD OAuth
# AZURE_AD_CLIENT_ID=
# AZURE_AD_CLIENT_SECRET=
# AZURE_AD_TENANT_ID=common
`;
}

function generateVibecoderReadme(projectName: string, template: string): string {
  return `# ${projectName}

Powered by [GremiusCMS](https://gremius.gg) - AI-Native Backend

## 🚀 Quick Start

\`\`\`bash
# First time — auto-detects best mode
./init.sh        # Linux/Mac
init.bat         # Windows
\`\`\`

**What happens:**
- **If images are published** (Opcion A): Pulls pre-built images in ~30 seconds
- **If not** (Opcion B): Clones source and builds locally (~5-10 min first time)

Then open:
- **Admin Panel:** http://localhost:3001
- **API Docs:**    http://localhost:3000/api/swagger
- **MCP Endpoint:** http://localhost:3000/api/mcp

## 🚀 Quick Start (After First Run)

\`\`\`bash
# Just restart services
./start.sh       # Linux/Mac
start.bat        # Windows
\`\`\`

## 🎮 Vibecoder Mode

No backend knowledge needed. Connect Cursor/Claude and let AI do the work.

1. Open Cursor → Settings → MCP
2. Add server URL: \`http://localhost:3000/api/mcp\`
3. Ask: "Set up my ${template} backend"

## 📁 Files

- \`docker-compose.yml\` — All services (dual mode: image or build)
- \`.env\` — Configuration
- \`realm.json\` — Active modules
- \`gremius-source/\` — Cloned source (only if building locally)

## 🔧 Customization

Edit \`.env\` to change ports or passwords. Use environment variables to customize:

\`\`\`bash
# Use a local copy of Gremius instead of cloning
export GREMIUS_SOURCE_PATH=/path/to/gremius
export GREMIUS_REPO_URL=https://github.com/your-org/gremius-fork.git
./init.sh
\`\`\`

## 📚 Docs

- [Vibecoder Guide](https://docs.gremius.gg/vibecoder)
- [MCP Setup](https://docs.gremius.gg/mcp)
`;
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATORS — Developer
// ═══════════════════════════════════════════════════════════════════════════

function generateDeveloperDockerCompose(): string {
  return `# GremiusCMS — Developer Infrastructure
# Only starts Postgres, Valkey, and MinIO.
# The API and Admin run via pnpm dev:start:simple for hot-reload.

services:
  postgres:
    image: pgvector/pgvector:pg16
    container_name: gremius_postgres_dev
    restart: unless-stopped
    environment:
      POSTGRES_USER: gremius
      POSTGRES_PASSWORD: gremius
      POSTGRES_DB: gremius
    ports:
      - "5432:5432"
    volumes:
      - gremius_postgres_dev:/var/lib/postgresql/data

  valkey:
    image: valkey/valkey:7-alpine
    container_name: gremius_valkey_dev
    restart: unless-stopped
    command: valkey-server --maxmemory 256mb --maxmemory-policy noeviction --appendonly yes
    ports:
      - "6379:6379"
    volumes:
      - gremius_valkey_dev:/data

  minio:
    image: minio/minio:latest
    container_name: gremius_minio_dev
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - gremius_minio_dev:/data

volumes:
  gremius_postgres_dev:
  gremius_valkey_dev:
  gremius_minio_dev:
`;
}

function generateDeveloperEnvFile(): string {
  return `# GremiusCMS — Developer Environment
DATABASE_URL=postgres://gremius:gremius@localhost:5432/gremius
REDIS_URL=redis://localhost:6379

API_PORT=3000
PORT=3000
NODE_ENV=development

BETTER_AUTH_SECRET=dev-secret-change-in-production-min-32-chars
BETTER_AUTH_URL=http://localhost:3000

ADMIN_URL=http://localhost:3001
ADMIN_PORT=3001
PUBLIC_API_URL=http://localhost:3000
PUBLIC_SITE_NAME=GremiusCMS

DEFAULT_STORAGE_PROVIDER=local
S3_ENDPOINT=http://localhost:9000
S3_PUBLIC_URL=http://localhost:9000
S3_BUCKET=gremius-media
S3_REGION=us-east-1
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin

ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:5173
RATE_LIMIT_ENABLED=true
LOG_LEVEL=info
ENABLE_SWAGGER=true
ENABLE_MCP=true

# ═══════════════════════════════════════════════════════════════════════════
# Auth Providers (managed via CLI: gremius auth add <provider>)
# ═══════════════════════════════════════════════════════════════════════════
# Google OAuth — get credentials at https://console.cloud.google.com/
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
#
# GitHub OAuth — get credentials at https://github.com/settings/developers
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=
#
# Microsoft/Azure AD OAuth
# AZURE_AD_CLIENT_ID=
# AZURE_AD_CLIENT_SECRET=
# AZURE_AD_TENANT_ID=common
`;
}

function generateDeveloperSchemaFile(): string {
  return `// GremiusCMS Schema Definition
// Define your data models here

export const schemas = {
  profiles: {
    tableName: 'profiles',
    columns: {
      id: { type: 'uuid', primary: true },
      userId: { type: 'uuid', references: 'auth.users' },
      displayName: { type: 'string', length: 255 },
      avatar: { type: 'string' },
      bio: { type: 'text' },
      createdAt: { type: 'timestamp', default: 'now()' },
      updatedAt: { type: 'timestamp' }
    },
    rls: {
      enabled: true,
      policies: [
        { name: 'Users can view all profiles', action: 'SELECT', using: 'true' },
        { name: 'Users can update own profile', action: 'UPDATE', check: 'user_id = auth.uid()' }
      ]
    }
  },

  posts: {
    tableName: 'posts',
    columns: {
      id: { type: 'uuid', primary: true },
      title: { type: 'string', length: 255, required: true },
      slug: { type: 'string', length: 255, unique: true },
      content: { type: 'text' },
      published: { type: 'boolean', default: false },
      authorId: { type: 'uuid', references: 'auth.users' },
      publishedAt: { type: 'timestamp' },
      createdAt: { type: 'timestamp', default: 'now()' },
      updatedAt: { type: 'timestamp' }
    },
    rls: {
      enabled: true,
      policies: [
        { name: 'Published posts are viewable', action: 'SELECT', using: 'published = true OR author_id = auth.uid()' },
        { name: 'Authors can manage posts', action: 'ALL', check: 'author_id = auth.uid()' }
      ]
    }
  }
};

export default schemas;
`;
}

function generateDeveloperConfigFile(grimoires: string[]): string {
  return `// GremiusCMS Configuration
// https://docs.gremius.gg/config

export default {
  name: 'My Gremius App',

  grimoires: [
${grimoires.map(g => `    '${g}',`).join('\n')}
  ],

  auth: {
    providers: ['email', 'github', 'google'],
    sessionDuration: '7d',
    requireEmailVerification: true
  },

  api: {
    rateLimit: {
      enabled: true,
      requests: 100,
      window: '15m'
    },
    cors: {
      origins: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'],
      credentials: true
    }
  },

  mcp: {
    enabled: true,
    allowedOperations: ['read', 'write', 'admin']
  },

  hooks: {
    'auth:user:created': './hooks/onUserCreated.ts',
    'post:published': './hooks/onPostPublished.ts'
  }
};
`;
}

function generateDeveloperReadme(projectName: string): string {
  return `# ${projectName}

Powered by [GremiusCMS](https://gremius.gg) — AI-Native Backend

## 🛠️ Developer Quick Start

\`\`\`bash
# 1. Start infrastructure (Postgres, Valkey, MinIO)
docker compose up -d

# 2. Install dependencies
pnpm install

# 3. Start API + Admin with hot-reload
pnpm dev:start:simple
\`\`\`

## 📁 Project Structure

- \`schemas/\` — Database schema definitions
- \`grimoires/\` — Custom modules and extensions
- \`migrations/\` — Database migrations
- \`hooks/\` — Event hooks and automation

## 📚 Documentation

- [Getting Started](https://docs.gremius.gg/getting-started)
- [Schema Definition](https://docs.gremius.gg/schemas)
- [Grimoires](https://docs.gremius.gg/grimoires)
`;
}

function generateDeveloperPackageJson(projectName: string): object {
  return {
    name: projectName.toLowerCase().replace(/\s+/g, '-'),
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      start: 'gremius start',
      dev: 'gremius start --admin --mcp',
      stop: 'gremius stop',
      logs: 'gremius logs -f',
      deploy: 'gremius deploy',
      'db:migrate': 'gremius db migrate',
      'db:generate': 'gremius db generate'
    },
    dependencies: {
      '@gremius/cli': '^0.1.0'
    },
    devDependencies: {
      '@gremius/sdk': '^1.0.0',
      typescript: '^5.7.0'
    }
  };
}

function generateGitHubWorkflow(): string {
  return `name: Gremius Deploy

on:
  push:
    branches: [main]
    paths:
      - 'schemas/**'
      - 'grimoires/**'
      - 'gremius.config.ts'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Gremius
        uses: gremius/deploy-action@v1
        with:
          token: \${{ secrets.GREM_TOKEN }}
          project: \${{ github.repository }}
`;
}

function generateRailwayJson(): string {
  return JSON.stringify(
    {
      $schema: "https://railway.app/railway.schema.json",
      build: {
        builder: "DOCKERFILE",
        dockerfilePath: "docker/Dockerfile.prod",
      },
      deploy: {
        startCommand: "",
        healthcheckPath: "/api/health",
        restartPolicyType: "ON_FAILURE",
        restartPolicyMaxRetries: 3,
      },
    },
    null,
    2
  );
}
