#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════
# Start PostgreSQL test database (Unix/Mac)
# ═══════════════════════════════════════════════════════════════════════════

echo "🐘 Starting PostgreSQL test database..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Start test database
docker compose -f docker-compose.test.yml up -d

# Wait for healthcheck
echo "⏳ Waiting for PostgreSQL to be ready..."
retries=0
max_retries=30

while [ $retries -lt $max_retries ]; do
    health=$(docker inspect --format='{{.State.Health.Status}}' gremius_test_db 2>/dev/null || echo "")
    if [ "$health" = "healthy" ]; then
        echo "✅ PostgreSQL test database is ready!"
        echo "   URL: postgres://gremius:gremius_test_2025@localhost:5433/gremius_test"
        exit 0
    fi
    sleep 1
    retries=$((retries + 1))
    echo "   ...waiting ($retries/$max_retries)"
done

echo "❌ PostgreSQL test database did not become healthy in time."
echo "   Check logs: docker compose -f docker-compose.test.yml logs"
exit 1
