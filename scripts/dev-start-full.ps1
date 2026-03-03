#Requires -Version 5.1
<#
.SYNOPSIS
    Script de inicio para GremiusCMS en modo DESARROLLO (con healthchecks).

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
║           🚀 GremiusCMS - Modo DESARROLLO (Dev)                ║
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

Wait-ForService -Name "PostgreSQL" -ContainerName "gremius_db" -TimeoutSeconds 60
Wait-ForService -Name "MinIO" -ContainerName "gremius_minio" -TimeoutSeconds 30
Wait-ForService -Name "Valkey" -ContainerName "gremius_cache" -TimeoutSeconds 30

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
