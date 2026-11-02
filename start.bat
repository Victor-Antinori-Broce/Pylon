@echo off
:: Kitsuden - Inicio RÁPIDO para PRODUCCIÓN
:: Este archivo inicia TODO el sistema con un solo comando
::
:: USO: Simplemente haz doble clic en este archivo
::
:: Accesos:
::   • Admin Panel: http://localhost:3001
::   • API:         http://localhost:3000
::   • S3 (medios): http://localhost:9000  (SeaweedFS; crea su bucket solo)
::
:: La web publica de ejemplo NO va en este compose: se sirve aparte
::   cd packages\starters\kitsuden-starter-basic && pnpm dev   (http://localhost:4321)

chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║                🚀 Kitsuden - PRODUCCIÓN                      ║
echo ║                   docker compose up -d                         ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

:: Verificar Docker
docker --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker no está instalado o no está en ejecución
    echo    Descarga Docker Desktop desde: https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

:: Verificar docker-compose.yml
if not exist "docker-compose.yml" (
    echo ❌ No se encontró docker-compose.yml
    echo    Asegúrate de ejecutar este archivo desde la raíz del proyecto
    pause
    exit /b 1
)

:: Iniciar
echo 📦 Iniciando todos los servicios...
echo    Esto puede tomar 1-2 minutos la primera vez...
echo.

docker compose up -d --build

if errorlevel 1 (
    echo.
    echo ❌ Error al iniciar los servicios
    echo    Revisa los logs con: docker compose logs
    pause
    exit /b 1
)

echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║                    ✅ SERVICIOS INICIADOS                      ║
echo ╠════════════════════════════════════════════════════════════════╣
echo ║  📊 Panel Admin:  http://localhost:3001                        ║
echo ║  🔌 API:          http://localhost:3000                        ║
echo ║  💾 S3 (medios):  http://localhost:9000                        ║
echo ║  🌐 Web ejemplo:  kitsuden-starter-basic, pnpm dev (:4321)     ║
echo ╠════════════════════════════════════════════════════════════════╣
echo ║  Comandos útiles:                                              ║
echo ║    docker compose logs -f     (Ver logs en tiempo real)        ║
echo ║    docker compose down        (Detener todo)                   ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.
echo 💡 La web de ejemplo se sirve aparte:
echo    cd packages\starters\kitsuden-starter-basic ^&^& pnpm dev
echo.

pause
