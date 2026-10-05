import { execSync } from "child_process";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

import chalk from "chalk";
import fs from "fs-extra";
import inquirer from "inquirer";
import ora, { type Ora } from "ora";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve package root (dist/commands/ -> dist/ -> package root)
const PACKAGE_ROOT = path.resolve(__dirname, "../..");

function getTemplatePath(templateName: string): string {
  return path.join(PACKAGE_ROOT, "templates", templateName);
}

/**
 * Generate a cryptographically secure random secret string.
 */
function generateSecret(length = 32): string {
  return crypto.randomBytes(length).toString("hex");
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATES CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

interface TemplateConfig {
  name: string;
  description: string;
  kons: string[];
}

const TEMPLATES: Record<string, TemplateConfig> = {
  default: {
    name: "Default",
    description: "Core functionality: auth, datasets, media",
    kons: ["kon-auth", "kon-datasets", "kon-media"],
  },
  blog: {
    name: "Blog",
    description: "Content-focused blog with posts, tags, and SEO",
    kons: ["kon-auth", "kon-datasets", "kon-media", "kon-blog"],
  },
  saas: {
    name: "SaaS",
    description: "Teams, subscriptions, and user management",
    kons: ["kon-auth", "kon-datasets", "kon-media"],
  },
  ecommerce: {
    name: "E-Commerce",
    description: "Online store with products, orders, inventory",
    kons: ["kon-auth", "kon-datasets", "kon-media"],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// OPTIONS INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

export interface InitOptions {
  template?: string;
  mode?: "vibecoder" | "developer" | "lite";
  database?: string;
  autoStart?: boolean;
  start?: boolean;
  headless?: boolean;
  /** Modo lite: PostgreSQL embebido (PGlite), sin Docker. */
  lite?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN INIT COMMAND
// ═══════════════════════════════════════════════════════════════════════════

export async function initCommand(name: string | undefined, options: InitOptions) {
  const spinner = ora();

  try {
    // ── Determine mode ──
    // `--lite` es un atajo de `--mode lite` (el flag gana sobre el default).
    const mode = options.lite ? "lite" : options.mode || "vibecoder";

    // ── Ask for project name if not provided ──
    let projectName = name;
    if (!projectName) {
      const answers = await inquirer.prompt([
        {
          type: "input",
          name: "name",
          message: mode === "vibecoder" ? "Project name:" : "Project name (monorepo):",
          default: "my-kitsuden-app",
        },
      ]);
      projectName = answers.name;
    }

    const projectPath = path.resolve(process.cwd(), projectName || "my-kitsuden-app");

    // ── Check if directory exists ──
    if (await fs.pathExists(projectPath)) {
      spinner.fail(chalk.red(`Directory "${projectName}" already exists`));
      process.exit(1);
    }

    // ── Determine template ──
    let template = options.template || "default";
    if (!TEMPLATES[template]) {
      spinner.warn(chalk.yellow(`Unknown template "${template}". Using default.`));
      template = "default";
    }

    const templateConfig = TEMPLATES[template];

    console.log(
      chalk.cyan(`\n🚀 Kitsuden v0.8 — ${mode === "vibecoder" ? "Vibecoder" : "Developer"} Mode\n`)
    );
    console.log(chalk.gray(`Template: ${templateConfig.name} — ${templateConfig.description}\n`));

    spinner.start("Creating project...");
    await fs.ensureDir(projectPath);

    if (mode === "lite") {
      await createLiteProject(projectPath, projectName || "my-kitsuden-app", spinner);
    } else if (mode === "vibecoder") {
      await createVibecoderProject(
        projectPath,
        projectName || "my-kitsuden-app",
        template,
        templateConfig,
        spinner,
        options.headless
      );
    } else {
      await createDeveloperProject(
        projectPath,
        projectName || "my-kitsuden-app",
        template,
        templateConfig,
        spinner
      );
    }

    spinner.succeed(chalk.green(`✅ Project "${projectName}" created successfully!`));

    // ── Post-creation output ──
    if (mode === "lite") {
      printLiteOutput(projectName || "my-kitsuden-app");
    } else if (mode === "vibecoder") {
      printVibecoderOutput(projectPath, projectName || "my-kitsuden-app", options);
    } else {
      printDeveloperOutput(projectPath, projectName || "my-kitsuden-app");
    }
  } catch (error) {
    spinner.fail(chalk.red("Failed to initialize project"));
    console.error(error);
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LITE MODE — cero infraestructura (el "django-admin startproject" de Kitsuden)
//
// Genera un proyecto que corre con `kitsuden dev` sin Docker, sin Postgres
// instalado y sin Valkey/MinIO: la DB es PGlite (PostgreSQL embebido en WASM),
// así que el schema, las migraciones y las políticas RLS son las MISMAS que en
// producción — migrar es solo cambiar DATABASE_URL.
// ═══════════════════════════════════════════════════════════════════════════

async function createLiteProject(projectPath: string, projectName: string, spinner: Ora) {
  spinner.text = "Generando proyecto lite (sin Docker)...";

  await fs.ensureDir(projectPath);
  await fs.ensureDir(path.join(projectPath, ".kitsuden"));
  await fs.ensureDir(path.join(projectPath, "uploads"));

  // .env con DATABASE_URL=lite
  await fs.writeFile(path.join(projectPath, ".env"), generateLiteEnv(projectName));

  // package.json mínimo: el runtime completo viene de @kitsuden/api
  await fs.writeJSON(
    path.join(projectPath, "package.json"),
    {
      name: projectName,
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        dev: "kitsuden dev",
        start: "kitsuden start",
        migrate: "kitsuden migrate",
        "make:kon": "kitsuden create-kon",
      },
      dependencies: {
        "@kitsuden/api": "latest",
        "@kitsuden/cli": "latest",
      },
    },
    { spaces: 2 }
  );

  await fs.writeFile(
    path.join(projectPath, ".gitignore"),
    ["node_modules/", ".env", ".kitsuden/", "uploads/", "dist/", "*.log"].join("\n") + "\n"
  );

  await fs.writeFile(
    path.join(projectPath, "README.md"),
    `# ${projectName}

Backend Kitsuden en **modo lite** — sin Docker, sin base de datos que instalar.

## Arrancar

\`\`\`bash
npm install
npm run dev          # API en http://localhost:3001
\`\`\`

La base de datos es **PostgreSQL embebido** (PGlite) y vive en \`.kitsuden/data\`.
Es Postgres de verdad: el mismo schema, las mismas migraciones y las mismas
políticas de Row-Level Security que usarías en producción.

## Pasar a producción

Cambia una sola línea en \`.env\`:

\`\`\`bash
DATABASE_URL=postgres://user:pass@host:5432/db
KITSUDEN_LITE=false
\`\`\`

Nada más cambia: el código, el schema y las policies son idénticos.

## Siguientes pasos

\`\`\`bash
npx kitsuden create-kon blog   # genera un módulo de dominio con CRUD + policies
npx kitsuden graph open          # visualiza la arquitectura de tu backend
npx kitsuden mcp --ide cursor    # conecta tu agente de IA
\`\`\`
`
  );
}

function printLiteOutput(projectName: string) {
  console.log(chalk.cyan("\n⚡ Modo lite — sin Docker, sin instalar Postgres\n"));
  console.log(chalk.white("  cd " + projectName));
  console.log(chalk.white("  npm install"));
  console.log(chalk.white("  npm run dev\n"));
  console.log(chalk.gray("  API:      http://localhost:3001"));
  console.log(chalk.gray("  Admin:    http://localhost:3000"));
  console.log(chalk.gray("  DB:       PostgreSQL embebido en .kitsuden/data\n"));
  console.log(chalk.gray("  Para producción: cambia DATABASE_URL en .env por tu Postgres real.\n"));
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
  // Detect if the project path would be inside the Kitsuden monorepo
  const monorepoRoot = findMonorepoRoot();
  const isDestInsideMonorepo = monorepoRoot
    ? projectPath.startsWith(path.resolve(monorepoRoot))
    : false;

  if (isDestInsideMonorepo) {
    spinner.warn("Cannot create a vibecoder project inside the Kitsuden monorepo directory.");
    console.log(chalk.yellow("\n💡 Choose a destination outside the monorepo:"));
    console.log(chalk.white(`  cd .. && npx kitsuden init ${projectName} --mode vibecoder`));
    console.log(chalk.yellow("\nOr use the monorepo directly:"));
    console.log(chalk.white("  docker compose up -d --build"));
    console.log(chalk.white("  pnpm dev:start:simple"));
    throw new Error("Cannot create vibecoder project inside the Kitsuden monorepo");
  }

  spinner.text = "Generating vibecoder project...";

  // Copy template-specific files if they exist (before generating docker-compose)
  const templateDir = getTemplatePath(template);
  const hasSeedSql = await fs.pathExists(path.join(templateDir, "seed.sql"));

  if (await fs.pathExists(templateDir)) {
    const templateFiles = ["grimoire.json", "seed.sql", "seed.ts"];
    for (const file of templateFiles) {
      const src = path.join(templateDir, file);
      if (await fs.pathExists(src)) {
        await fs.copy(src, path.join(projectPath, file));
      }
    }
  }

  // Generate self-contained docker-compose and env
  const dc = generateVibecoderDockerCompose(projectName, hasSeedSql, headless);
  await fs.writeFile(path.join(projectPath, "docker-compose.yml"), dc);
  await fs.writeFile(path.join(projectPath, ".env"), generateVibecoderEnv(projectName, headless));

  // Write grimoire.json if template didn't provide one
  const grimoirePath = path.join(projectPath, "grimoire.json");
  if (!(await fs.pathExists(grimoirePath))) {
    const grimoireData = {
      name: templateConfig.name,
      template,
      kons: templateConfig.kons,
      createdAt: new Date().toISOString(),
    };
    await fs.writeFile(grimoirePath, JSON.stringify(grimoireData, null, 2));
  }

  // Write railway.json for easy Railway deployment
  await fs.writeFile(path.join(projectPath, "railway.json"), generateRailwayJson());

  // Write README
  await fs.writeFile(
    path.join(projectPath, "README.md"),
    generateVibecoderReadme(projectName, template)
  );

  // Write init scripts (auto-detect pre-built images vs build from source)
  await fs.writeFile(
    path.join(projectPath, "init.sh"),
    `#!/bin/bash
set -e

cd "$(dirname "$0")"

KITSUDEN_SOURCE="\${KITSUDEN_SOURCE_PATH:-./kitsuden-source}"
KITSUDEN_REPO="\${KITSUDEN_REPO_URL:-https://github.com/kitsuden/kitsuden.git}"

echo "🚀 Kitsuden — Starting up..."

# Option A: Try pre-built images first (fast)
if docker pull kitsuden/api:latest >/dev/null 2>&1 && docker pull kitsuden/admin:latest >/dev/null 2>&1; then
  echo "✅ Using pre-built images from Docker Hub (fast mode)"
  docker compose up -d
else
  echo "⚠️  Pre-built images not available. Building from source..."
  echo "   This will take 5-10 minutes on first run."
  echo ""

  # Option B: Build from source
  if [ ! -d "$KITSUDEN_SOURCE" ]; then
    echo "📥 Cloning Kitsuden source from $KITSUDEN_REPO..."
    git clone "$KITSUDEN_REPO" "$KITSUDEN_SOURCE"
  fi

  export KITSUDEN_SOURCE_PATH="$KITSUDEN_SOURCE"
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
    path.join(projectPath, "init.bat"),
    `@echo off
setlocal EnableDelayedExpansion

set KITSUDEN_SOURCE=%KITSUDEN_SOURCE_PATH%
if "%KITSUDEN_SOURCE%"=="" set KITSUDEN_SOURCE=.\\kitsuden-source

set KITSUDEN_REPO=%KITSUDEN_REPO_URL%
if "%KITSUDEN_REPO%"=="" set KITSUDEN_REPO=https://github.com/kitsuden/kitsuden.git

echo 🚀 Kitsuden — Starting up...

:: Option A: Try pre-built images first
docker pull kitsuden/api:latest >nul 2>&1
if !errorlevel! equ 0 (
  docker pull kitsuden/admin:latest >nul 2>&1
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
if not exist "%KITSUDEN_SOURCE%" (
  echo 📥 Cloning Kitsuden source from %KITSUDEN_REPO%...
  git clone %KITSUDEN_REPO% %KITSUDEN_SOURCE%
)

set KITSUDEN_SOURCE_PATH=%KITSUDEN_SOURCE%
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
    path.join(projectPath, "start.sh"),
    `#!/bin/bash\ncd "$(dirname "$0")"\ndocker compose up -d --build\n`,
    { mode: 0o755 }
  );
  await fs.writeFile(
    path.join(projectPath, "start.bat"),
    `@echo off\ncd /d "%~dp0"\ndocker compose up -d --build\n`,
    { mode: 0o755 }
  );

  // Initialize git
  try {
    execSync("git init", { cwd: projectPath, stdio: "ignore" });
    execSync("git add .", { cwd: projectPath, stdio: "ignore" });
    execSync('git commit -m "Initial commit from Kitsuden CLI"', {
      cwd: projectPath,
      stdio: "ignore",
    });
  } catch {
    // Git might not be installed
  }
}

function printVibecoderOutput(projectPath: string, projectName: string, options: InitOptions) {
  const isHeadless = options.headless;

  console.log(chalk.cyan("\n📁 Project structure:"));
  console.log(`  ${projectName}/`);
  console.log("  ├── docker-compose.yml    # All services");
  console.log("  ├── .env                  # Configuration");
  console.log("  ├── grimoire.json            # Active modules");
  console.log("  ├── start.sh / start.bat  # Quick start scripts");
  console.log("  └── README.md");

  if (isHeadless) {
    console.log(chalk.gray("\n  👻 Headless mode — no admin panel"));
  }

  // Auto-start if requested
  const shouldStart = options.autoStart || options.start;
  if (shouldStart) {
    console.log(chalk.cyan("\n🐳 Starting services..."));
    const startSpinner = ora("Running docker compose up -d --build...").start();
    try {
      execSync("docker compose up -d --build", { cwd: projectPath, stdio: "pipe" });
      startSpinner.succeed(chalk.green("All services started!"));

      console.log(chalk.yellow("\n⏳ Waiting for first build to complete (~60-120s)..."));
      console.log(chalk.dim("   The API container builds from source on first run."));

      console.log(chalk.cyan("\n═══════════════════════════════════════════════════════════"));
      console.log(chalk.green.bold("  🚀 Your backend is starting up!"));
      console.log(chalk.cyan("═══════════════════════════════════════════════════════════"));
      console.log("");
      if (!isHeadless) {
        console.log(
          chalk.white("  Admin Panel:  ") + chalk.blue.underline("http://localhost:3001")
        );
      }
      console.log(
        chalk.white("  API Docs:     ") + chalk.blue.underline("http://localhost:3000/api/swagger")
      );
      console.log(
        chalk.white("  MCP Endpoint: ") + chalk.blue.underline("http://localhost:3000/api/mcp")
      );
      console.log(chalk.white("  MinIO Console:") + chalk.blue.underline("http://localhost:9001"));
      console.log("");
      console.log(chalk.yellow("  💡 Connect Cursor/Claude to the MCP endpoint above"));
      console.log(chalk.yellow("     and let AI configure your backend for you."));
      console.log("");
    } catch (e: any) {
      startSpinner.fail(chalk.yellow("Docker Compose failed — is Docker running?"));
      console.log(
        chalk.dim("  Start manually: cd " + projectName + " && docker compose up -d --build\n")
      );
    }
  } else {
    console.log(chalk.cyan("\n🚀 Next steps:"));
    console.log(chalk.white(`  cd ${projectName}`));
    console.log(chalk.white("  ./init.sh        (Linux/Mac)"));
    console.log(chalk.white("  init.bat         (Windows)"));
    console.log("");
    console.log(chalk.cyan("  Then open:"));
    if (!isHeadless) {
      console.log(chalk.white("  Admin:  http://localhost:3001"));
    }
    console.log(chalk.white("  API:    http://localhost:3000/api/swagger"));
    console.log(chalk.white("  MCP:    http://localhost:3000/api/mcp"));
  }

  console.log(chalk.cyan("\n📚 Documentation:"));
  console.log(chalk.blue("  https://docs.kitsuden.gg/vibecoder\n"));
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
  spinner.text = "Creating developer project structure...";

  // Create directory structure
  await fs.ensureDir(path.join(projectPath, "kons"));
  await fs.ensureDir(path.join(projectPath, "schemas"));
  await fs.ensureDir(path.join(projectPath, "migrations"));
  await fs.ensureDir(path.join(projectPath, "hooks"));
  await fs.ensureDir(path.join(projectPath, ".github", "workflows"));

  // Docker Compose
  const dockerComposeContent = generateDeveloperDockerCompose();
  await fs.writeFile(path.join(projectPath, "docker-compose.yml"), dockerComposeContent);

  // Environment files — example uses placeholders, .env uses generated secrets
  const envExampleContent = generateDeveloperEnvExampleFile();
  await fs.writeFile(path.join(projectPath, ".env.example"), envExampleContent);
  await fs.writeFile(path.join(projectPath, ".env"), generateDeveloperEnvFile());

  // Schema file
  const schemaContent = generateDeveloperSchemaFile();
  await fs.writeFile(path.join(projectPath, "schemas", "index.ts"), schemaContent);

  // Config file
  const configContent = generateDeveloperConfigFile(templateConfig.kons);
  await fs.writeFile(path.join(projectPath, "kitsuden.config.ts"), configContent);

  // README
  const readmeContent = generateDeveloperReadme(projectName);
  await fs.writeFile(path.join(projectPath, "README.md"), readmeContent);

  // Git ignore
  await fs.writeFile(
    path.join(projectPath, ".gitignore"),
    "node_modules\n.env\n.env.local\ndata/\ndist/\n*.log\n.DS_Store\n"
  );

  // Package.json
  const packageJson = generateDeveloperPackageJson(projectName);
  await fs.writeFile(path.join(projectPath, "package.json"), JSON.stringify(packageJson, null, 2));

  // GitHub Actions
  const workflowContent = generateGitHubWorkflow();
  await fs.writeFile(
    path.join(projectPath, ".github", "workflows", "kitsuden-deploy.yml"),
    workflowContent
  );

  // Grimoire config
  const grimoireData = {
    name: templateConfig.name,
    template,
    kons: templateConfig.kons,
    mode: "developer",
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(
    path.join(projectPath, "grimoire.json"),
    JSON.stringify(grimoireData, null, 2)
  );

  // Write railway.json for easy Railway deployment
  await fs.writeFile(path.join(projectPath, "railway.json"), generateRailwayJson());

  // Git init
  try {
    execSync("git init", { cwd: projectPath, stdio: "ignore" });
    execSync("git add .", { cwd: projectPath, stdio: "ignore" });
    execSync('git commit -m "Initial commit from Kitsuden CLI"', {
      cwd: projectPath,
      stdio: "ignore",
    });
  } catch {
    // Git might not be installed
  }
}

function printDeveloperOutput(_projectPath: string, projectName: string) {
  console.log(chalk.cyan("\n📁 Project structure:"));
  console.log(`  ${projectName}/`);
  console.log("  ├── docker-compose.yml    # Infrastructure services");
  console.log("  ├── kitsuden.config.ts     # Backend configuration");
  console.log("  ├── schemas/              # Database schemas");
  console.log("  ├── kons/            # Custom modules");
  console.log("  ├── migrations/           # Database migrations");
  console.log("  ├── hooks/                # Event hooks");
  console.log("  └── .github/workflows/    # CI/CD");

  console.log(chalk.cyan("\n🛠️ Next steps:"));
  console.log(chalk.white(`  cd ${projectName}`));
  console.log(chalk.white("  docker compose up -d          # Start Postgres, Valkey, MinIO"));
  console.log(chalk.white("  pnpm install                  # Install dependencies"));
  console.log(chalk.white("  pnpm dev:start:simple         # Start API + Admin with hot-reload"));
  console.log("");
  console.log(chalk.cyan("  Then open:"));
  console.log(chalk.white("  Admin:  http://localhost:3001"));
  console.log(chalk.white("  API:    http://localhost:3000"));
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function findMonorepoRoot(): string | null {
  let current = process.cwd();
  while (current !== path.parse(current).root) {
    const dockerCompose = path.join(current, "docker-compose.yml");
    const pnpmWorkspace = path.join(current, "pnpm-workspace.yaml");
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
//     .replace(/POSTGRES_DB=kitsuden_dev/g, `POSTGRES_DB=${projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`);
// }

// ═══════════════════════════════════════════════════════════════════════════
// GENERATORS — Vibecoder
// ═══════════════════════════════════════════════════════════════════════════

function generateVibecoderDockerCompose(
  _projectName: string,
  hasSeedSql: boolean = false,
  headless: boolean = false
): string {
  const adminService = headless
    ? ""
    : `
  # ═══════════════════════════════════════════════════════════════════════
  # Admin Panel — Dual mode: pre-built image OR build from source
  # ═══════════════════════════════════════════════════════════════════════
  kitsuden_admin:
    image: \${KITSUDEN_ADMIN_IMAGE:-kitsuden/admin:latest}
    build:
      context: \${KITSUDEN_SOURCE_PATH:-.}
      dockerfile: docker/Dockerfile.prod
      target: admin
    container_name: kitsuden_admin
    restart: unless-stopped
    depends_on:
      - kitsuden_api
    ports:
      - "\${ADMIN_PORT:-3001}:80"
    networks:
      - kitsuden_net
`;

  return `# Kitsuden — Vibecoder Docker Compose
# Generated by Kitsuden CLI
#
# DUAL MODE:
#   Option A (default): docker compose up -d
#     Uses pre-built images from Docker Hub. Fast (~30s).
#     Requires: images published (kitsuden/api:latest, kitsuden/admin:latest)
#
#   Option B (developer): docker compose up -d --build
#     Builds from source. Slow first time (~5-10 min), fast on rebuilds.
#     Requires: KITSUDEN_SOURCE_PATH pointing to cloned repo
#
# Quick start:
#   ./init.sh      (Linux/Mac)  — auto-detects best option
#   init.bat       (Windows)    — auto-detects best option

services:
  kitsuden_db:
    image: pgvector/pgvector:pg16
    container_name: kitsuden_db
    restart: unless-stopped
    environment:
      POSTGRES_USER: \${POSTGRES_USER:-kitsuden}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required - set it in .env}
      POSTGRES_DB: \${POSTGRES_DB:-kitsuden}
    volumes:
      - kitsuden_postgres:/var/lib/postgresql/data${hasSeedSql ? "\n      - ./seed.sql:/docker-entrypoint-initdb.d/99_seed.sql:ro" : ""}
    ports:
      - "\${DB_PORT:-5432}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${POSTGRES_USER:-kitsuden}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - kitsuden_net

  kitsuden_state:
    image: valkey/valkey:7-alpine
    container_name: kitsuden_cache
    restart: unless-stopped
    command: valkey-server --maxmemory 256mb --maxmemory-policy noeviction --appendonly yes
    ports:
      - "\${CACHE_PORT:-6379}:6379"
    volumes:
      - kitsuden_valkey:/data
    healthcheck:
      test: ["CMD", "valkey-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    networks:
      - kitsuden_net

  kitsuden_minio:
    image: minio/minio:latest
    container_name: kitsuden_minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: \${S3_ACCESS_KEY:-kitsuden_minio}
      MINIO_ROOT_PASSWORD: \${S3_SECRET_KEY:?S3_SECRET_KEY is required - set it in .env}
    ports:
      - "\${MINIO_PORT:-9000}:9000"
      - "\${MINIO_CONSOLE_PORT:-9001}:9001"
    volumes:
      - kitsuden_minio:/data
    networks:
      - kitsuden_net

  # ═══════════════════════════════════════════════════════════════════════
  # API — Dual mode: pre-built image OR build from source
  # ═══════════════════════════════════════════════════════════════════════
  kitsuden_api:
    image: \${KITSUDEN_API_IMAGE:-kitsuden/api:latest}
    build:
      context: \${KITSUDEN_SOURCE_PATH:-.}
      dockerfile: docker/Dockerfile.prod
      target: api
    container_name: kitsuden_api
    restart: unless-stopped
    depends_on:
      kitsuden_db:
        condition: service_healthy
      kitsuden_state:
        condition: service_healthy
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATABASE_URL=postgresql://\${POSTGRES_USER:-kitsuden}:\${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}@kitsuden_db:5432/\${POSTGRES_DB:-kitsuden}
      - REDIS_URL=redis://kitsuden_state:6379
      - DEFAULT_STORAGE_PROVIDER=minio
      - S3_ENDPOINT=http://kitsuden_minio:9000
      - S3_PUBLIC_URL=\${S3_PUBLIC_URL:-http://localhost:9000}
      - S3_ACCESS_KEY=\${S3_ACCESS_KEY:-kitsuden_minio}
      - S3_SECRET_KEY=\${S3_SECRET_KEY:?S3_SECRET_KEY is required}
      - S3_BUCKET=\${S3_BUCKET:-kitsuden-media}
      - S3_REGION=\${S3_REGION:-us-east-1}
      - BETTER_AUTH_SECRET=\${BETTER_AUTH_SECRET:?BETTER_AUTH_SECRET is required - set it in .env (min 32 chars)}
      - BETTER_AUTH_URL=http://localhost:\${API_PORT:-3000}
      - ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
      - ADMIN_URL=http://localhost:3001
      - LOG_LEVEL=info
      - ENABLE_SWAGGER=true
      - ENABLE_MCP=true
      - RATE_LIMIT_ENABLED=true
      - HEADLESS=${headless ? "true" : "false"}
    ports:
      - "\${API_PORT:-3000}:3000"
    networks:
      - kitsuden_net
${adminService}
volumes:
  kitsuden_postgres:
  kitsuden_valkey:
  kitsuden_minio:

networks:
  kitsuden_net:
    driver: bridge
`;
}

/**
 * .env del MODO LITE — cero infraestructura externa.
 *
 * DATABASE_URL=lite activa PGlite (PostgreSQL embebido en WASM): mismo motor,
 * mismo schema y mismas políticas RLS que producción, pero sin Docker.
 * Valkey y MinIO se degradan solos (cache en memoria, storage local), así que
 * no hace falta levantar nada.
 *
 * Para pasar a producción basta cambiar DATABASE_URL por tu Postgres real.
 */
function generateLiteEnv(projectName: string): string {
  return `# Kitsuden — Modo Lite (sin Docker)
# Generado por Kitsuden CLI. Rota los secretos antes de producción.
PROJECT_NAME=${projectName}

# PostgreSQL EMBEBIDO (PGlite). Para producción, cámbialo por tu Postgres real:
#   DATABASE_URL=postgres://user:pass@host:5432/db
DATABASE_URL=lite
KITSUDEN_LITE=true
KITSUDEN_LITE_DIR=.kitsuden/data

API_PORT=3001
BETTER_AUTH_SECRET=${generateSecret(32)}
BETTER_AUTH_URL=http://localhost:3001

ADMIN_PORT=3000

# Sin Valkey: el cache cae a memoria automáticamente.
# Sin MinIO: el storage usa el disco local (uploads/).
NODE_ENV=development
LOG_LEVEL=info
`;
}

function generateVibecoderEnv(projectName: string, headless: boolean = false): string {
  return `# Kitsuden — Environment
# Generated by Kitsuden CLI. Review and rotate secrets before production use.
PROJECT_NAME=${projectName}

POSTGRES_USER=kitsuden
POSTGRES_PASSWORD=${generateSecret(16)}
POSTGRES_DB=kitsuden
DB_PORT=5432

CACHE_PORT=6379

API_PORT=3000
BETTER_AUTH_SECRET=${generateSecret(32)}
BETTER_AUTH_URL=http://localhost:3000

ADMIN_PORT=3001

MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001
S3_ACCESS_KEY=kitsuden_minio
S3_SECRET_KEY=${generateSecret(16)}
S3_BUCKET=kitsuden-media
S3_REGION=us-east-1
S3_PUBLIC_URL=http://localhost:9000

ENABLE_SWAGGER=true
ENABLE_MCP=true
HEADLESS=${headless ? "true" : "false"}

# ═══════════════════════════════════════════════════════════════════════════
# Auth Providers (managed via CLI: kitsuden auth add <provider>)
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

Powered by [Kitsuden](https://kitsuden.gg) - AI-Native Backend

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
- \`grimoire.json\` — Active modules
- \`kitsuden-source/\` — Cloned source (only if building locally)

## 🔧 Customization

Edit \`.env\` to change ports or passwords. Use environment variables to customize:

\`\`\`bash
# Use a local copy of Kitsuden instead of cloning
export KITSUDEN_SOURCE_PATH=/path/to/kitsuden
export KITSUDEN_REPO_URL=https://github.com/your-org/kitsuden-fork.git
./init.sh
\`\`\`

## 📚 Docs

- [Vibecoder Guide](https://docs.kitsuden.gg/vibecoder)
- [MCP Setup](https://docs.kitsuden.gg/mcp)
`;
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERATORS — Developer
// ═══════════════════════════════════════════════════════════════════════════

function generateDeveloperDockerCompose(): string {
  return `# Kitsuden — Developer Infrastructure
# Only starts Postgres, Valkey, and MinIO.
# The API and Admin run via pnpm dev:start:simple for hot-reload.
#
# Copy .env.example to .env and configure strong secrets before starting.

services:
  postgres:
    image: pgvector/pgvector:pg16
    container_name: kitsuden_postgres_dev
    restart: unless-stopped
    environment:
      POSTGRES_USER: \${POSTGRES_USER:-kitsuden}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required - set it in .env}
      POSTGRES_DB: \${POSTGRES_DB:-kitsuden}
    ports:
      - "\${DB_PORT:-5432}:5432"
    volumes:
      - kitsuden_postgres_dev:/var/lib/postgresql/data

  valkey:
    image: valkey/valkey:7-alpine
    container_name: kitsuden_valkey_dev
    restart: unless-stopped
    command: valkey-server --maxmemory 256mb --maxmemory-policy noeviction --appendonly yes
    ports:
      - "\${CACHE_PORT:-6379}:6379"
    volumes:
      - kitsuden_valkey_dev:/data

  minio:
    image: minio/minio:latest
    container_name: kitsuden_minio_dev
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: \${S3_ACCESS_KEY:-kitsuden_minio}
      MINIO_ROOT_PASSWORD: \${S3_SECRET_KEY:?S3_SECRET_KEY is required - set it in .env}
    ports:
      - "\${MINIO_PORT:-9000}:9000"
      - "\${MINIO_CONSOLE_PORT:-9001}:9001"
    volumes:
      - kitsuden_minio_dev:/data

volumes:
  kitsuden_postgres_dev:
  kitsuden_valkey_dev:
  kitsuden_minio_dev:
`;
}

function generateDeveloperEnvExampleFile(): string {
  return `# Kitsuden — Developer Environment
# Copy to .env and replace ALL placeholder values with strong secrets.
DATABASE_URL=postgres://kitsuden:changeme@localhost:5432/kitsuden
REDIS_URL=redis://localhost:6379

API_PORT=3000
PORT=3000
NODE_ENV=development

# Generate a strong secret (min 32 chars), e.g.: openssl rand -base64 48
BETTER_AUTH_SECRET=change-me-to-a-random-string-at-least-32-chars
BETTER_AUTH_URL=http://localhost:3000

ADMIN_URL=http://localhost:3001
ADMIN_PORT=3001
PUBLIC_API_URL=http://localhost:3000
PUBLIC_SITE_NAME=Kitsuden

DEFAULT_STORAGE_PROVIDER=local
S3_ENDPOINT=http://localhost:9000
S3_PUBLIC_URL=http://localhost:9000
S3_BUCKET=kitsuden-media
S3_REGION=us-east-1
S3_ACCESS_KEY=kitsuden_minio
S3_SECRET_KEY=changeme

ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:5173
RATE_LIMIT_ENABLED=true
LOG_LEVEL=info
ENABLE_SWAGGER=true
ENABLE_MCP=true

# ═══════════════════════════════════════════════════════════════════════════
# Auth Providers (managed via CLI: kitsuden auth add <provider>)
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

function generateDeveloperEnvFile(): string {
  const postgresPassword = generateSecret(16);
  const betterAuthSecret = generateSecret(32);
  const s3SecretKey = generateSecret(16);
  return `# Kitsuden — Developer Environment
# Generated by Kitsuden CLI. Review and rotate secrets before production use.
DATABASE_URL=postgres://kitsuden:${postgresPassword}@localhost:5432/kitsuden
REDIS_URL=redis://localhost:6379

API_PORT=3000
PORT=3000
NODE_ENV=development

BETTER_AUTH_SECRET=${betterAuthSecret}
BETTER_AUTH_URL=http://localhost:3000

ADMIN_URL=http://localhost:3001
ADMIN_PORT=3001
PUBLIC_API_URL=http://localhost:3000
PUBLIC_SITE_NAME=Kitsuden

DEFAULT_STORAGE_PROVIDER=local
S3_ENDPOINT=http://localhost:9000
S3_PUBLIC_URL=http://localhost:9000
S3_BUCKET=kitsuden-media
S3_REGION=us-east-1
S3_ACCESS_KEY=kitsuden_minio
S3_SECRET_KEY=${s3SecretKey}

ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:5173
RATE_LIMIT_ENABLED=true
LOG_LEVEL=info
ENABLE_SWAGGER=true
ENABLE_MCP=true

# ═══════════════════════════════════════════════════════════════════════════
# Auth Providers (managed via CLI: kitsuden auth add <provider>)
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
  return `// Kitsuden Schema Definition
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

function generateDeveloperConfigFile(kons: string[]): string {
  return `// Kitsuden Configuration
// https://docs.kitsuden.gg/config

export default {
  name: 'My Kitsuden App',

  kons: [
${kons.map((g) => `    '${g}',`).join("\n")}
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

Powered by [Kitsuden](https://kitsuden.gg) — AI-Native Backend

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
- \`kons/\` — Custom modules and extensions
- \`migrations/\` — Database migrations
- \`hooks/\` — Event hooks and automation

## 📚 Documentation

- [Getting Started](https://docs.kitsuden.gg/getting-started)
- [Schema Definition](https://docs.kitsuden.gg/schemas)
- [Kons](https://docs.kitsuden.gg/kons)
`;
}

function generateDeveloperPackageJson(projectName: string): object {
  return {
    name: projectName.toLowerCase().replace(/\s+/g, "-"),
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      start: "kitsuden start",
      dev: "kitsuden start --admin --mcp",
      stop: "kitsuden stop",
      logs: "kitsuden logs -f",
      deploy: "kitsuden deploy",
      "db:migrate": "kitsuden db migrate",
      "db:generate": "kitsuden db generate",
    },
    dependencies: {
      "@kitsuden/cli": "^0.1.0",
    },
    devDependencies: {
      "@kitsuden/sdk": "^1.0.0",
      typescript: "^5.7.0",
    },
  };
}

function generateGitHubWorkflow(): string {
  return `name: Kitsuden Deploy

on:
  push:
    branches: [main]
    paths:
      - 'schemas/**'
      - 'kons/**'
      - 'kitsuden.config.ts'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Kitsuden
        uses: kitsuden/deploy-action@v1
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
