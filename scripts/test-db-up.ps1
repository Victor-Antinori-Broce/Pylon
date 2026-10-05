<#
.SYNOPSIS
    Levanta PostgreSQL dedicado para tests.

.DESCRIPTION
    Usa docker-compose.test.yml para crear un contenedor PostgreSQL
    en el puerto configurado en .env.test (por defecto 5434) con la
    base de datos 'kitsuden_test'. Espera a que la base de datos esté
    saludable antes de continuar.

.EXAMPLE
    .\scripts\test-db-up.ps1
#>

$ErrorActionPreference = "Stop"

# Run from repository root so docker-compose.test.yml is found regardless of caller CWD.
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $scriptDir "..")

# Load test environment variables from .env.test
$envFile = ".env.test"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#\s][^=]*?)\s*=\s*(.*?)\s*$') {
            [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
        }
    }
}

$postgresUser = $env:POSTGRES_USER -or "kitsuden"
$postgresPassword = $env:POSTGRES_PASSWORD -or "kitsuden_test_secure_change_me"
$postgresDb = $env:POSTGRES_DB -or "kitsuden_test"
$postgresPort = $env:POSTGRES_PORT -or "5434"

Write-Host "🐘 Starting PostgreSQL test database..." -ForegroundColor Cyan

# Check if Docker is running
try {
    docker info > $null 2>&1
} catch {
    Write-Host "❌ Docker is not running. Please start Docker Desktop first." -ForegroundColor Red
    exit 1
}

# Start test database
docker compose -f docker-compose.test.yml --env-file $envFile up -d

if (-not $?) {
    Write-Host "❌ Failed to start test database container." -ForegroundColor Red
    exit 1
}

# Wait for healthcheck
Write-Host "⏳ Waiting for PostgreSQL to be ready..." -ForegroundColor Yellow
$retries = 0
$maxRetries = 30

while ($retries -lt $maxRetries) {
    $health = docker inspect --format='{{.State.Health.Status}}' kitsuden_test_db 2>$null
    if ($health -eq "healthy") {
        Write-Host "✅ PostgreSQL test database is ready!" -ForegroundColor Green
        Write-Host "   URL: postgres://${postgresUser}:***@localhost:${postgresPort}/${postgresDb}" -ForegroundColor Gray
        exit 0
    }
    Start-Sleep -Seconds 1
    $retries++
    Write-Host "   ...waiting ($retries/$maxRetries)" -ForegroundColor DarkGray
}

Write-Host "❌ PostgreSQL test database did not become healthy in time." -ForegroundColor Red
Write-Host "   Check logs: docker compose -f docker-compose.test.yml --env-file $envFile logs" -ForegroundColor Yellow
exit 1
