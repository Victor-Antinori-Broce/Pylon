#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════
# Start PostgreSQL test database (Unix/Mac)
# ═══════════════════════════════════════════════════════════════════════════

ENV_FILE=".env.test"

# Load test environment variables from .env.test
if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck source=/dev/null
    source "$ENV_FILE"
    set +a
fi

POSTGRES_USER="${POSTGRES_USER:-kitsuden}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-kitsuden_test_secure_change_me}"
POSTGRES_DB="${POSTGRES_DB:-kitsuden_test}"
POSTGRES_PORT="${POSTGRES_PORT:-5434}"

echo "🐘 Starting PostgreSQL test database..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Start test database
docker compose -f docker-compose.test.yml --env-file "$ENV_FILE" up -d

# Wait for healthcheck
echo "⏳ Waiting for PostgreSQL to be ready..."
retries=0
max_retries=30

while [ $retries -lt $max_retries ]; do
    health=$(docker inspect --format='{{.State.Health.Status}}' kitsuden_test_db 2>/dev/null || echo "")
    if [ "$health" = "healthy" ]; then
        echo "✅ PostgreSQL test database is ready!"
        echo "   URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}"
        exit 0
    fi
    sleep 1
    retries=$((retries + 1))
    echo "   ...waiting ($retries/$max_retries)"
done

echo "❌ PostgreSQL test database did not become healthy in time."
echo "   Check logs: docker compose -f docker-compose.test.yml --env-file $ENV_FILE logs"
exit 1
