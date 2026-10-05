#!/bin/sh
# ===================================================================
# Kitsuden - Entrypoint for development with auto-setup
# ===================================================================

set -e

echo "==================================================================="
echo "  Kitsuden - Auto-Setup Container (Development)"
echo "==================================================================="
echo ""

# Wait for PostgreSQL
echo "[1/3] Waiting for PostgreSQL..."
until pg_isready -h kitsuden_db -U "${POSTGRES_USER:-kitsuden}" > /dev/null 2>&1; do
    echo "   PostgreSQL not ready yet... waiting"
    sleep 2
done
echo "   OK - PostgreSQL is ready"

# Wait for MinIO
echo "[2/3] Waiting for MinIO..."
until curl -s http://kitsuden_minio:9000/minio/health/live > /dev/null 2>&1; do
    echo "   MinIO not ready yet... waiting"
    sleep 2
done
echo "   OK - MinIO is ready"

# Wait for Valkey
echo "[3/3] Waiting for Valkey..."
until valkey-cli -h kitsuden_cache ping > /dev/null 2>&1; do
    echo "   Valkey not ready yet... waiting"
    sleep 2
done
echo "   OK - Valkey is ready"

echo ""
echo "Building shared package..."
cd /app/packages/shared
pnpm build

echo ""
echo "Running database migrations..."
cd /app/apps/api
echo "y" | pnpm db:push || pnpm exec drizzle-kit push --force

echo ""
echo "Setup complete. Starting applications..."
echo ""

# Execute the provided command
exec "$@"
