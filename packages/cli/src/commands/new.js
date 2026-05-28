/**
 * NEW Command - Create a new GremiusCMS project from a starter/realm
 *
 * Fase 3: CLI Mágica - Quickstart con rollback
 */
import chalk from "chalk";
import ora from "ora";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { mkdir, writeFile, readFile, cp, rmdir, unlink } from "node:fs/promises";
import { execa } from "execa";
// @ts-ignore
import degit from "degit";
import inquirer from "inquirer";
let currentState = null;
// ═══════════════════════════════════════════════════════════════════════════
// ROLLBACK - Limpiar en caso de fallo
// ═══════════════════════════════════════════════════════════════════════════
async function performRollback(state, reason) {
    console.log(chalk.red(`\n✖ Error durante la instalación: ${reason}`));
    console.log(chalk.yellow("\n🔄 Realizando rollback para mantener el sistema limpio...\n"));
    const spinner = ora("Limpiando archivos...").start();
    try {
        // 1. Detener Docker si se inició
        if (state.steps.dockerStarted) {
            spinner.text = "Deteniendo contenedores Docker...";
            try {
                await execa("docker", ["compose", "down", "-v"], {
                    cwd: state.targetDir,
                    stdio: "ignore",
                    timeout: 30000,
                });
            }
            catch {
                // Ignorar errores al detener Docker
            }
        }
        // 2. Eliminar archivos creados
        for (const file of state.createdFiles.reverse()) {
            try {
                if (existsSync(file)) {
                    await unlink(file);
                }
            }
            catch {
                // Continuar aunque falle
            }
        }
        // 3. Eliminar directorio si se creó
        if (state.steps.directoryCreated && existsSync(state.targetDir)) {
            spinner.text = "Eliminando directorio...";
            try {
                await rmdir(state.targetDir, { recursive: true });
            }
            catch {
                // Ignorar errores al eliminar directorio
            }
        }
        spinner.succeed(chalk.green("✓ Rollback completado"));
        console.log(chalk.gray("\nTu sistema está limpio. Puedes intentar nuevamente.\n"));
    }
    catch (error) {
        spinner.fail(chalk.red("No se pudo completar el rollback completamente"));
        console.log(chalk.gray("Es posible que necesites limpiar manualmente algunos archivos.\n"));
    }
    process.exit(1);
}
// ═══════════════════════════════════════════════════════════════════════════
// AVAILABLE REALMS (STARTERS)
// ═══════════════════════════════════════════════════════════════════════════
const OFFICIAL_REALMS = {
    default: {
        name: "Default",
        description: "Standard GremiusCMS with core functionality",
        grimoires: ["blog", "blocks", "media"],
        tags: ["starter", "minimal"],
    },
    esports: {
        name: "Esports",
        description: "Gaming platform with tournaments, teams, and matches",
        repo: "gremiuscms/realm-esports",
        grimoires: [
            "games", "streamers", "platforms", "tags", "collections",
            "players", "teams", "tournaments", "matches"
        ],
        tags: ["gaming", "esports", "competitive"],
    },
    blog: {
        name: "Blog",
        description: "Content-focused blog with SEO optimization",
        grimoires: ["blog", "tags", "blocks"],
        tags: ["content", "blog", "seo"],
    },
    ecommerce: {
        name: "E-Commerce",
        description: "Online store with products and payments (coming soon)",
        grimoires: ["products", "orders", "payments", "inventory"],
        tags: ["commerce", "store", "payments"],
    },
    corporate: {
        name: "Corporate",
        description: "Company website with team and services",
        grimoires: ["directory", "blog", "booking", "blocks"],
        tags: ["business", "company", "services"],
    },
    lms: {
        name: "LMS",
        description: "Learning Management System with courses",
        grimoires: ["academy", "blog", "progress", "certificates"],
        tags: ["education", "courses", "learning"],
    },
};
export async function newCommand(projectName, options) {
    // Quickstart mode - skip all prompts
    if (options.quickstart) {
        console.log(chalk.bold("\n🚀 GremiusCMS - Quick Start Mode\n"));
        console.log(chalk.gray("Configurando todo automáticamente...\n"));
        console.log(chalk.gray("Tiempo estimado: ~3-5 minutos\n"));
        const targetDir = join(process.cwd(), projectName);
        // Check if directory exists
        if (existsSync(targetDir)) {
            console.error(chalk.red(`\n✖ El directorio "${projectName}" ya existe.`));
            console.log(chalk.gray("Elimínalo primero o elige otro nombre.\n"));
            process.exit(1);
        }
        // Inicializar estado para posible rollback
        currentState = {
            projectName,
            targetDir,
            steps: {
                directoryCreated: false,
                templateCopied: false,
                envGenerated: false,
                dependenciesInstalled: false,
                gitInitialized: false,
                dockerStarted: false,
                databaseMigrated: false,
            },
            createdFiles: [],
        };
        const realmInfo = OFFICIAL_REALMS["default"];
        try {
            await createProjectQuickstart(projectName, targetDir, "default", realmInfo, currentState);
            console.log(chalk.bold("\n" + "=".repeat(60)));
            console.log(chalk.green.bold("✓ ¡Proyecto creado exitosamente!"));
            console.log(chalk.bold("=".repeat(60) + "\n"));
            console.log(chalk.bold("Próximos pasos:\n"));
            console.log(chalk.gray(`  cd ${projectName}`));
            console.log(chalk.gray("  pnpm dev\n"));
            console.log(chalk.gray("Servicios disponibles:"));
            console.log(chalk.gray("  API:     http://localhost:3000"));
            console.log(chalk.gray("  Admin:   http://localhost:3001"));
            console.log(chalk.gray("  Web:     http://localhost:3002\n"));
            // Guardar progreso exitoso
            await saveProgressToFile(projectName, true);
        }
        catch (error) {
            await performRollback(currentState, error.message);
        }
        return;
    }
    // Interactive mode
    console.log(chalk.bold("\n📦 GremiusCMS - Create New Project\n"));
    const targetDir = join(process.cwd(), projectName);
    // Check if directory exists
    if (existsSync(targetDir)) {
        const { overwrite } = await inquirer.prompt([{
                type: "confirm",
                name: "overwrite",
                message: `Directory "${projectName}" already exists. Overwrite?`,
                default: false,
            }]);
        if (!overwrite) {
            console.log(chalk.yellow("\n✖ Cancelled"));
            process.exit(0);
        }
    }
    // Select realm if not specified
    let realm = options.realm || "default";
    if (!options.realm) {
        const { selectedRealm } = await inquirer.prompt([{
                type: "list",
                name: "selectedRealm",
                message: "Select a starter template:",
                choices: Object.entries(OFFICIAL_REALMS).map(([key, info]) => ({
                    name: `${chalk.bold(info.name)} ${chalk.gray(`- ${info.description}`)}`,
                    value: key,
                    short: info.name,
                })),
            }]);
        realm = selectedRealm;
    }
    const realmInfo = OFFICIAL_REALMS[realm];
    if (!realmInfo) {
        console.error(chalk.red(`\n✖ Unknown realm: ${realm}`));
        console.log(chalk.gray(`Available realms: ${Object.keys(OFFICIAL_REALMS).join(", ")}`));
        process.exit(1);
    }
    console.log(chalk.blue(`\n🚀 Creating ${chalk.bold(projectName)} with ${chalk.bold(realmInfo.name)} realm...\n`));
    // Create project
    await createProject(projectName, targetDir, realm, realmInfo, options);
}
async function createProjectQuickstart(name, targetDir, realm, realmInfo, state) {
    const spinner = ora("Creando directorio del proyecto...").start();
    try {
        // 1. Crear directorio
        await mkdir(targetDir, { recursive: true });
        state.steps.directoryCreated = true;
        state.createdFiles.push(targetDir);
        // 2. Copiar template
        spinner.text = "Descargando plantilla...";
        await copyLocalTemplate(realm, targetDir);
        state.steps.templateCopied = true;
        // Registrar archivos creados
        const templateFiles = [
            "package.json",
            "docker-compose.yml",
            "apps/api/package.json",
            "apps/api/src/db/schema.ts",
            "apps/api/.env.example",
        ];
        for (const file of templateFiles) {
            const fullPath = join(targetDir, file);
            if (existsSync(fullPath)) {
                state.createdFiles.push(fullPath);
            }
        }
        // 3. Configurar proyecto
        spinner.text = "Configurando proyecto...";
        await updatePackageJson(targetDir, name);
        await updateGremiusConfig(targetDir, realmInfo.grimoires, []);
        await updateEnvFiles(targetDir, name);
        state.steps.envGenerated = true;
        // 4. Inicializar git
        spinner.text = "Inicializando repositorio git...";
        try {
            await execa("git", ["init"], { cwd: targetDir, stdio: "ignore" });
            await execa("git", ["add", "."], { cwd: targetDir, stdio: "ignore" });
            await execa("git", ["commit", "-m", "Initial commit from Gremius CLI"], { cwd: targetDir, stdio: "ignore" });
            state.steps.gitInitialized = true;
        }
        catch {
            // Git es opcional
        }
        // 5. Instalar dependencias
        spinner.text = "Instalando dependencias (esto puede tomar varios minutos)...";
        try {
            await execa("pnpm", ["install"], {
                cwd: targetDir,
                stdio: "ignore",
                timeout: 300000, // 5 minutos
            });
            state.steps.dependenciesInstalled = true;
        }
        catch {
            // Intentar con npm
            spinner.text = "Intentando con npm...";
            try {
                await execa("npm", ["install"], {
                    cwd: targetDir,
                    stdio: "ignore",
                    timeout: 300000,
                });
                state.steps.dependenciesInstalled = true;
            }
            catch (error) {
                throw new Error(`No se pudieron instalar las dependencias: ${error.message}`);
            }
        }
        // 6. Levantar Docker
        spinner.text = "Iniciando contenedores Docker...";
        try {
            await execa("docker", ["compose", "up", "-d"], {
                cwd: targetDir,
                stdio: "ignore",
                timeout: 60000,
            });
            state.steps.dockerStarted = true;
            // Esperar a que PostgreSQL esté listo
            spinner.text = "Esperando a PostgreSQL (30s)...";
            await waitForPostgresQuickstart(targetDir, spinner);
        }
        catch (error) {
            throw new Error(`No se pudieron iniciar los contenedores Docker: ${error.message}`);
        }
        // 7. Migrar base de datos
        spinner.text = "Configurando base de datos...";
        try {
            await execa("pnpm", ["db:push"], {
                cwd: targetDir,
                stdio: "ignore",
                timeout: 60000,
            });
            state.steps.databaseMigrated = true;
        }
        catch (error) {
            throw new Error(`No se pudo configurar la base de datos: ${error.message}`);
        }
        spinner.succeed(chalk.green("¡Proyecto configurado exitosamente!"));
    }
    catch (error) {
        spinner.fail(chalk.red(`Error: ${error.message}`));
        throw error;
    }
}
async function waitForPostgresQuickstart(targetDir, spinner) {
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
        try {
            await execa("docker", ["compose", "exec", "-T", "postgres", "pg_isready", "-U", "gremius"], {
                cwd: targetDir,
                stdio: "ignore",
                timeout: 2000,
            });
            return;
        }
        catch {
            spinner.text = `Esperando a PostgreSQL... (${i + 1}/${maxAttempts})`;
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    throw new Error("PostgreSQL no respondió a tiempo");
}
async function saveProgressToFile(projectName, success) {
    try {
        // Progress entry for logging
        void {
            timestamp: new Date().toISOString(),
            command: "new --quickstart",
            projectName,
            success,
        };
        // Actualizar progress.txt en la raíz
        const progressPath = join(process.cwd(), "progress.txt");
        let content = "";
        try {
            content = await readFile(progressPath, "utf-8");
        }
        catch {
            // File doesn't exist yet
        }
        const newEntry = `\n[CLI Quickstart] ${new Date().toLocaleString()} - Proyecto: ${projectName} - ${success ? "✅ ÉXITO" : "❌ FALLIDO"}\n`;
        await writeFile(progressPath, content + newEntry);
    }
    catch {
        // No crítico si falla
    }
}
async function createProject(name, targetDir, realm, realmInfo, options) {
    const spinner = ora("Creating project directory...").start();
    try {
        // Create directory
        await mkdir(targetDir, { recursive: true });
        spinner.text = "Downloading starter template...";
        // Download from repo or use local template
        if (realmInfo.repo) {
            // Clone from GitHub
            const emitter = degit(realmInfo.repo, {
                cache: false,
                force: true,
                verbose: false,
            });
            await emitter.clone(targetDir);
        }
        else {
            // Use local template
            await copyLocalTemplate(realm, targetDir);
        }
        spinner.text = "Configuring project...";
        // Update package.json
        await updatePackageJson(targetDir, name);
        // Update gremius.config.ts with grimoires
        await updateGremiusConfig(targetDir, realmInfo.grimoires, options.grimoires);
        // Update .env files
        await updateEnvFiles(targetDir, name);
        // Initialize git
        if (options.git) {
            spinner.text = "Initializing git repository...";
            try {
                await execa("git", ["init"], { cwd: targetDir, stdio: "ignore" });
                await execa("git", ["add", "."], { cwd: targetDir, stdio: "ignore" });
                await execa("git", ["commit", "-m", "Initial commit"], { cwd: targetDir, stdio: "ignore" });
            }
            catch {
                // Git init failed, continue anyway
            }
        }
        // Install dependencies
        if (options.install) {
            spinner.text = "Installing dependencies (this may take a while)...";
            try {
                await execa("pnpm", ["install"], { cwd: targetDir, stdio: "ignore" });
            }
            catch {
                // Try npm if pnpm fails
                try {
                    await execa("npm", ["install"], { cwd: targetDir, stdio: "ignore" });
                }
                catch {
                    spinner.warn("Failed to install dependencies. Run 'pnpm install' manually.");
                }
            }
        }
        // Database setup
        if (!options.skipDb && options.install) {
            spinner.text = "Setting up database...";
            try {
                // Start Docker containers
                await execa("docker", ["compose", "up", "-d"], { cwd: targetDir, stdio: "ignore" });
                // Wait a bit for DB to be ready
                await new Promise(r => setTimeout(r, 3000));
                // Push schema
                await execa("pnpm", ["db:push"], { cwd: targetDir, stdio: "ignore" });
            }
            catch {
                spinner.warn("Database setup failed. Run 'pnpm db:push' manually after starting Docker.");
            }
        }
        spinner.succeed(chalk.green(`Project ${chalk.bold(name)} created successfully!`));
        // Print next steps
        console.log(chalk.bold("\nNext steps:\n"));
        console.log(chalk.gray(`  cd ${name}`));
        if (!options.install) {
            console.log(chalk.gray("  pnpm install"));
        }
        console.log(chalk.gray("  pnpm dev"));
        console.log(chalk.gray("\n  API:     http://localhost:3000"));
        console.log(chalk.gray("  Admin:   http://localhost:3001"));
        console.log(chalk.gray("  Web:     http://localhost:3002\n"));
    }
    catch (error) {
        spinner.fail(chalk.red(`Failed to create project: ${error.message}`));
        process.exit(1);
    }
}
async function copyLocalTemplate(realm, targetDir) {
    // In development, copy from local packages/starters
    // In production, copy from bundled templates
    const starterDir = join(__dirname, "../../../starters", `gremius-starter-${realm}`);
    const templateDir = join(__dirname, "../../templates", realm);
    if (existsSync(starterDir)) {
        // Use official starter
        await cp(starterDir, targetDir, { recursive: true });
        // Copy setup.js if it exists
        const setupScript = join(starterDir, "setup.js");
        if (existsSync(setupScript)) {
            await cp(setupScript, join(targetDir, "setup.js"));
        }
    }
    else if (existsSync(templateDir)) {
        await cp(templateDir, targetDir, { recursive: true });
    }
    else {
        // Create minimal structure
        await createMinimalTemplate(targetDir, realm);
    }
}
async function createMinimalTemplate(targetDir, _realm) {
    // Create basic project structure
    const dirs = [
        "apps/api",
        "apps/admin",
        "apps/web",
        "packages/shared",
        "packages/grimoires",
    ];
    for (const dir of dirs) {
        await mkdir(join(targetDir, dir, "src"), { recursive: true });
    }
    // Create package.json
    await writeFile(join(targetDir, "package.json"), JSON.stringify({
        name: "gremius-project",
        private: true,
        type: "module",
        scripts: {
            dev: "pnpm -r dev",
            build: "pnpm -r build",
            "db:push": "cd apps/api && pnpm db:push",
            "db:studio": "cd apps/api && pnpm db:studio",
        },
        devDependencies: {
            typescript: "^5.3.0",
        },
    }, null, 2));
    // Create docker-compose.yml
    await writeFile(join(targetDir, "docker-compose.yml"), `version: "3.8"
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: gremius
      POSTGRES_PASSWORD: gremius
      POSTGRES_DB: gremius
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
  
  valkey:
    image: valkey/valkey:8-alpine
    ports:
      - "6379:6379"
  
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin

volumes:
  postgres_data:
`);
}
async function updatePackageJson(targetDir, projectName) {
    const packageJsonPath = join(targetDir, "package.json");
    try {
        const content = await readFile(packageJsonPath, "utf-8");
        const pkg = JSON.parse(content);
        pkg.name = projectName.toLowerCase().replace(/\s+/g, "-");
        await writeFile(packageJsonPath, JSON.stringify(pkg, null, 2));
    }
    catch {
        // Ignore if file doesn't exist
    }
}
async function updateGremiusConfig(targetDir, defaultGrimoires, extraGrimoires) {
    const configPath = join(targetDir, "apps/api/gremius.config.ts");
    const grimoires = [...defaultGrimoires];
    if (extraGrimoires) {
        grimoires.push(...extraGrimoires);
    }
    const configContent = `/**
 * GremiusCMS Configuration
 */

const config = {
  core: {
    dataSets: { enabled: true, alwaysActive: true },
    mediaLibrary: { enabled: true },
    webhooks: { enabled: true },
    connectors: { enabled: true },
  },
  grimoires: [
${grimoires.map(g => `    "${g}",`).join("\n")}
  ],
};

export default config;
`;
    try {
        await writeFile(configPath, configContent);
    }
    catch {
        // Ignore if can't write
    }
}
async function updateEnvFiles(targetDir, projectName) {
    const envContent = `# Database
DATABASE_URL=postgres://gremius:gremius@localhost:5432/gremius

# Better Auth
BETTER_AUTH_SECRET=generate-a-secure-secret-here
BETTER_AUTH_URL=http://localhost:3000

# Storage (MinIO)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=gremius

# Cache (Valkey)
VALKEY_URL=redis://localhost:6379

# Site
SITE_NAME=${projectName}
SITE_URL=http://localhost:3000
`;
    try {
        await writeFile(join(targetDir, "apps/api/.env"), envContent);
        await writeFile(join(targetDir, ".env"), envContent);
    }
    catch {
        // Ignore
    }
}
//# sourceMappingURL=new.js.map