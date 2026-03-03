#!/bin/sh
# Script de migración seguro para producción
set -e

echo "🗄️  Ejecutando migraciones de base de datos..."

# Esperar a que PostgreSQL esté disponible
echo "⏳ Esperando a PostgreSQL..."
until pg_isready -h "$DB_HOST" -U "$DB_USER" > /dev/null 2>&1; do
    echo "   PostgreSQL no está listo... esperando"
    sleep 2
done
echo "   ✅ PostgreSQL está listo"

# Ejecutar migraciones con drizzle (método seguro)
cd /app
bun run db:migrate

echo "   ✅ Migraciones completadas"
