#Requires -Version 5.1
<#
.SYNOPSIS
    Script SIMPLE para iniciar GremiusCMS en modo DESARROLLO.
#>

$ErrorActionPreference = "Stop"
$RootDir = $PSScriptRoot | Split-Path -Parent

Set-Location $RootDir

Write-Host "`n[DEV] Iniciando GremiusCMS...`n" -ForegroundColor Cyan

# 1. Instalar dependencias
Write-Host "[1/6] pnpm install..." -ForegroundColor Yellow
pnpm install
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "      OK" -ForegroundColor Green

# 2. Docker Compose up
Write-Host "`n[2/6] Levantando infraestructura Docker..." -ForegroundColor Yellow
docker compose -f docker-compose.dev.yml up -d
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "      OK" -ForegroundColor Green

# 3. Esperar servicios
Write-Host "`n[3/6] Esperando servicios (20s)..." -ForegroundColor Yellow
Start-Sleep -Seconds 20
Write-Host "      OK" -ForegroundColor Green

# 4. Build shared
Write-Host "`n[4/6] Compilando shared..." -ForegroundColor Yellow
cd packages\shared
pnpm build
if ($LASTEXITCODE -ne 0) { cd ..\..; exit 1 }
cd ..\..
Write-Host "      OK" -ForegroundColor Green

# 5. Migraciones
Write-Host "`n[5/6] Aplicando migraciones..." -ForegroundColor Yellow
cd apps\api
echo "y" | pnpm db:push
if ($LASTEXITCODE -ne 0) { cd ..\..; exit 1 }
cd ..\..
Write-Host "      OK" -ForegroundColor Green

# 6. Iniciar dev
Write-Host "`n[6/6] Iniciando modo desarrollo..." -ForegroundColor Green
Write-Host "`n      API: http://localhost:3000" -ForegroundColor Gray
Write-Host "      Presiona Ctrl+C para detener`n" -ForegroundColor Gray

pnpm dev