<#
.SYNOPSIS
    Ejecuta la suite completa de tests contra PostgreSQL real.

.DESCRIPTION
    1. Lee .env.test
    2. Levanta la base de datos de tests
    3. Ejecuta migraciones
    4. Corre los tests en apps/api/src/tests/
    5. Detiene la base de datos de tests

.EXAMPLE
    .\scripts\test-api-all.ps1
#>

$ErrorActionPreference = "Stop"

# Run from repository root.
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Join-Path $scriptDir ".."
Set-Location $repoRoot

$envFile = ".env.test"

# Load test environment variables from .env.test
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#\s][^=]*?)\s*=\s*(.*?)\s*$') {
            [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
        }
    }
}

Write-Host "🧪 Running full API test suite against PostgreSQL..." -ForegroundColor Cyan

pnpm run test:db:up

try {
    cd apps/api

    Write-Host "🗃️  Running migrations..." -ForegroundColor Yellow
    $env:NODE_ENV = "test"
    bunx drizzle-kit migrate

    Write-Host "🧪 Running tests..." -ForegroundColor Yellow
    $env:KITSUDEN_TEST_DB = "postgres"
    bun test src/tests/
} finally {
    Set-Location $repoRoot
    pnpm run test:db:down
}

Write-Host "✅ Full API test suite completed." -ForegroundColor Green
