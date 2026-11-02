/**
 * Lo que de la RAÍZ del repo es producto (kitsuden2.md, B2)
 * ============================================================================
 *
 * Una sola lista para los dos scripts de publicación: el inventario la usa
 * para clasificar la raíz, y la exportación del repo público para no dejar
 * entrar nada más (lista blanca: un resto nuevo en la raíz se queda fuera
 * sin tener que acordarse de él).
 */

export const PRODUCTO = new Set([
  "apps", "packages", "scripts", "skills", "tests", "docker", "docs", "specs",
  ".github", ".husky", ".vscode",
  "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json",
  "eslint.config.js", "vitest.config.ts", "playwright.config.ts", "bunfig.toml",
  ".gitignore", ".gitattributes", ".dockerignore", ".prettierignore", ".prettierrc",
  ".lintstagedrc.json", ".env.example", ".env.production.example", ".worktreeinclude",
  "docker-compose.yml", "docker-compose.dev.yml", "docker-compose.test.yml",
  "docker-compose.tls.yml", "docker-compose.automatic.yml", "orca.yaml",
  "LICENSE", "README.md", "CHANGELOG.md", "ARCHITECTURE.md", "CORE.md", "AGENTS.md",
  "CLAUDE.md", "SECURITY.md", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "QUICKSTART.md",
  "kitsuden.kons.json", "install.sh", "install.ps1",
]);
