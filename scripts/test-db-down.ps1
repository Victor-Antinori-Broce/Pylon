<#
.SYNOPSIS
    Detiene y elimina el contenedor PostgreSQL de tests.

.DESCRIPTION
    Usa docker-compose.test.yml para detener y remover el contenedor.
    Opcionalmente elimina el volumen de datos (para empezar limpio).

.PARAMETER Nuke
    Si se especifica, elimina también el volumen de datos.

.EXAMPLE
    .\scripts\test-db-down.ps1
    .\scripts\test-db-down.ps1 -Nuke
#>

param(
    [switch]$Nuke
)

$ErrorActionPreference = "Stop"

# Run from repository root so docker-compose.test.yml is found regardless of caller CWD.
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $scriptDir "..")

$envFile = ".env.test"

Write-Host "🛑 Stopping PostgreSQL test database..." -ForegroundColor Cyan

if ($Nuke) {
    docker compose -f docker-compose.test.yml --env-file $envFile down -v
    Write-Host "💥 Test database container and volume removed." -ForegroundColor Magenta
} else {
    docker compose -f docker-compose.test.yml --env-file $envFile down
    Write-Host "✅ Test database container stopped." -ForegroundColor Green
}
