#Requires -Version 7
<#
.SYNOPSIS
    Levanta PostgreSQL dedicado para tests.

.DESCRIPTION
    Usa docker-compose.test.yml para crear un contenedor PostgreSQL
    en el puerto 5433 con la base de datos 'gremius_test'.
    Espera a que la base de datos esté saludable antes de continuar.

.EXAMPLE
    .\scripts\test-db-up.ps1
#>

$ErrorActionPreference = "Stop"

Write-Host "🐘 Starting PostgreSQL test database..." -ForegroundColor Cyan

# Check if Docker is running
try {
    docker info > $null 2>&1
} catch {
    Write-Host "❌ Docker is not running. Please start Docker Desktop first." -ForegroundColor Red
    exit 1
}

# Start test database
docker compose -f docker-compose.test.yml up -d

if (-not $?) {
    Write-Host "❌ Failed to start test database container." -ForegroundColor Red
    exit 1
}

# Wait for healthcheck
Write-Host "⏳ Waiting for PostgreSQL to be ready..." -ForegroundColor Yellow
$retries = 0
$maxRetries = 30

while ($retries -lt $maxRetries) {
    $health = docker inspect --format='{{.State.Health.Status}}' gremius_test_db 2>$null
    if ($health -eq "healthy") {
        Write-Host "✅ PostgreSQL test database is ready!" -ForegroundColor Green
        Write-Host "   URL: postgres://gremius:gremius_test_2025@localhost:5433/gremius_test" -ForegroundColor Gray
        exit 0
    }
    Start-Sleep -Seconds 1
    $retries++
    Write-Host "   ...waiting ($retries/$maxRetries)" -ForegroundColor DarkGray
}

Write-Host "❌ PostgreSQL test database did not become healthy in time." -ForegroundColor Red
Write-Host "   Check logs: docker compose -f docker-compose.test.yml logs" -ForegroundColor Yellow
exit 1
