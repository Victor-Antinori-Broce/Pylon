#!/bin/sh
# ═══════════════════════════════════════════════════════════════════════════
# Entrypoint para desarrollo con auto-setup
# ═══════════════════════════════════════════════════════════════════════════

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║           🚀 GremiusCMS - Auto-Setup Container                 ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Esperar a que PostgreSQL esté listo
echo "⏳ Esperando a PostgreSQL..."
until pg_isready -h gremius_db -U "${POSTGRES_USER:-gremius}" > /dev/null 2>&1; do
    echo "   PostgreSQL no está listo aún... esperando"
    sleep 2
done
echo "   ✅ PostgreSQL está listo"

# Esperar a que MinIO esté listo
echo "⏳ Esperando a MinIO..."
until curl -s http://gremius_minio:9000/minio/health/live > /dev/null 2>&1; do
    echo "   MinIO no está listo aún... esperando"
    sleep 2
done
echo "   ✅ MinIO está listo"

# Esperar a que Valkey esté listo
echo "⏳ Esperando a Valkey..."
until valkey-cli -h gremius_cache ping > /dev/null 2>&1; do
    echo "   Valkey no está listo aún... esperando"
    sleep 2
done
echo "   ✅ Valkey está listo"

echo ""
echo "🔨 Compilando paquete shared..."
cd /app/packages/shared
pnpm build

echo ""
echo "🗄️  Aplicando migraciones de base de datos..."
cd /app/apps/api
# Aceptar automáticamente las migraciones
echo "y" | pnpm db:push || pnpm exec drizzle-kit push --force

echo ""
echo "✅ Setup completado. Iniciando aplicaciones..."
echo ""

# Ejecutar el comando proporcionado
exec "$@"
