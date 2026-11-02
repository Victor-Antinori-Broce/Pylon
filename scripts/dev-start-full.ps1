#Requires -Version 5.1
<#
.SYNOPSIS
    Script de inicio para Kitsuden en modo DESARROLLO (con healthchecks).

.DESCRIPTION
    Este script automatiza el proceso de inicio en desarrollo:
    1. Instala dependencias (pnpm install)
    2. Levanta infraestructura Docker (PostgreSQL + MinIO + Valkey)
    3. Espera a que los servicios estén saludables
    4. Compila el paquete shared
    5. Ejecuta migraciones de base de datos (db:push --force)
    6. Inicia todos los servicios en modo desarrollo

.USAGE
    .\scripts\dev-start-full.ps1

.PARAMETERS
    -SkipInstall    : Omite la instalación de dependencias
    -SkipBuild      : Omite la compilación del paquete shared
    -SkipMigrations : Omite las migraciones de base de datos
    -ResetDb        : Reinicia la base de datos (down -v + up)
#>

[CmdletBinding()]
param(
    [switch]$SkipInstall,
    [switch]$SkipBuild,
    [switch]$SkipMigrations,
    [switch]$ResetDb
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $scriptDir "..")

Set-Location $projectRoot

Write-Host @"
╔════════════════════════════════════════════════════════════════╗
║           🚀 Kitsuden - Modo DESARROLLO (Dev)                ║
║                   One-Command Startup v1.0                     ║
╚════════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Cyan

function Wait-ForService {
    param(
        [string]$Name,
        [string]$ContainerName,
        [int]$TimeoutSeconds = 60
    )
    
    Write-Host "⏳ Esperando a que $Name esté listo..." -NoNewline
    $startTime = Get-Date
    $healthy = $false
    
    while (-not $healthy -and ((Get-Date) - $startTime).TotalSeconds -lt $TimeoutSeconds) {
        try {
            $status = docker inspect --format='{{.State.Health.Status}}' $ContainerName 2>$null
            if ($status -eq "healthy") {
                $healthy = $true
                Write-Host " ✅" -ForegroundColor Green
                return $true
            }
        } catch {
            # Contenedor aún no existe o no responde
        }
        Write-Host "." -NoNewline
        Start-Sleep -Seconds 1
    }
    
    if (-not $healthy) {
        Write-Host " ❌" -ForegroundColor Red
        throw "El servicio $Name no está saludable después de ${TimeoutSeconds}s"
    }
}

function Test-CommandExists {
    param([string]$Command)
    $null = Get-Command $Command -ErrorAction SilentlyContinue
}

Write-Host "`n📋 Verificando pre-requisitos..." -ForegroundColor Yellow

if (-not (Test-CommandExists "docker")) {
    throw "Docker no está instalado o no está en el PATH"
}

if (-not (Test-CommandExists "pnpm")) {
    throw "pnpm no está instalado. Instálalo con: npm install -g pnpm"
}

Write-Host "   ✅ Docker detectado"
Write-Host "   ✅ pnpm detectado"

# 0. FRENO: la pila de PRODUCCION no puede estar en marcha
# docker-compose.dev.yml usa los MISMOS puertos que la de produccion (5432,
# 6379, 9000) y apps/api/.env apunta a la base `kitsuden_prod`: con las dos a
# la vez, el `db:push` de abajo empujaria el esquema de Drizzle contra la base
# REAL, con el "y" ya contestado. Visto el 2026-09-28.
$prod = docker ps --format "{{.Names}}" 2>$null | Where-Object { $_ -like "kitsuden_*_prod" }
if ($prod) {
    Write-Host "`nLa pila de PRODUCCION esta en marcha ($($prod -join ', '))." -ForegroundColor Red
    Write-Host "Este script es para desarrollo: comparte puertos y base con ella." -ForegroundColor Red
    Write-Host "Paralo antes con 'docker compose down' (sin -v) o usa la pila de produccion:" -ForegroundColor Yellow
    Write-Host "  API :3000, panel :3001; la web de ejemplo con 'pnpm --filter @kitsuden/starter-basic dev' (:4321)" -ForegroundColor Yellow
    exit 1
}

# 1. INSTALAR DEPENDENCIAS
if (-not $SkipInstall) {
    Write-Host "`n📦 Instalando dependencias..." -ForegroundColor Yellow
    pnpm install
    if ($LASTEXITCODE -ne 0) { throw "Error al instalar dependencias" }
    Write-Host "   ✅ Dependencias instaladas" -ForegroundColor Green
} else {
    Write-Host "`n⏭️  Saltando instalación de dependencias (--SkipInstall)" -ForegroundColor Gray
}

# 2. LEVANTAR INFRAESTRUCTURA
Write-Host "`n🐳 Levantando infraestructura Docker..." -ForegroundColor Yellow

if ($ResetDb) {
    Write-Host "   🗑️  Reiniciando volúmenes de base de datos..." -ForegroundColor Magenta
    docker compose -f docker-compose.dev.yml down -v --remove-orphans 2>$null | Out-Null
}

docker compose -f docker-compose.dev.yml up -d
if ($LASTEXITCODE -ne 0) { throw "Error al levantar Docker Compose" }

Write-Host "   ✅ Contenedores iniciados" -ForegroundColor Green

# 3. ESPERAR A QUE LOS SERVICIOS ESTÉN LISTOS
Write-Host "`n⏳ Verificando salud de los servicios..." -ForegroundColor Yellow

Wait-ForService -Name "PostgreSQL" -ContainerName "kitsuden_db" -TimeoutSeconds 60
Wait-ForService -Name "MinIO" -ContainerName "kitsuden_minio" -TimeoutSeconds 30
Wait-ForService -Name "Valkey" -ContainerName "kitsuden_cache" -TimeoutSeconds 30

Write-Host "   ✅ Todos los servicios están saludables" -ForegroundColor Green

# 4. COMPILAR PAQUETE SHARED
if (-not $SkipBuild) {
    Write-Host "`n🔨 Compilando paquete shared..." -ForegroundColor Yellow
    Set-Location "$projectRoot\packages\shared"
    pnpm build
    if ($LASTEXITCODE -ne 0) { 
        Set-Location $projectRoot
        throw "Error al compilar el paquete shared" 
    }
    Set-Location $projectRoot
    Write-Host "   ✅ Paquete shared compilado" -ForegroundColor Green
} else {
    Write-Host "`n⏭️  Saltando compilación de shared (--SkipBuild)" -ForegroundColor Gray
}

# 5. CREAR TABLAS EN BASE DE DATOS
if (-not $SkipMigrations) {
    Write-Host "`n🗄️  Ejecutando migraciones de base de datos..." -ForegroundColor Yellow
    Set-Location "$projectRoot\apps\api"
    echo "y" | pnpm db:push
    Set-Location $projectRoot
    Write-Host "   ✅ Migraciones aplicadas" -ForegroundColor Green
} else {
    Write-Host "`n⏭️  Saltando migraciones (--SkipMigrations)" -ForegroundColor Gray
}

# 6. ARRANCAR TODOS LOS SERVICIOS EN MODO DESARROLLO
Write-Host @"

╔════════════════════════════════════════════════════════════════╗
║                    🎉 TODO LISTO PARA INICIAR                  ║
╠════════════════════════════════════════════════════════════════╣
║  Servicios disponibles:                                        ║
║    • PostgreSQL: localhost:5432                                ║
║    • MinIO API:  localhost:9000                                ║
║    • MinIO UI:   http://localhost:9001                         ║
║    • Valkey:     localhost:6379                                ║
╠════════════════════════════════════════════════════════════════╣
║  Iniciando aplicaciones en modo desarrollo...                  ║
║  Presiona Ctrl+C para detener                                  ║
╚════════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Green

pnpm dev
