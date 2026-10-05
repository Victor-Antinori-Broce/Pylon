#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════
# Stop PostgreSQL test database (Unix/Mac)
# ═══════════════════════════════════════════════════════════════════════════

ENV_FILE=".env.test"
NUKE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --nuke)
            NUKE=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

echo "🛑 Stopping PostgreSQL test database..."

if [ "$NUKE" = true ]; then
    docker compose -f docker-compose.test.yml --env-file "$ENV_FILE" down -v
    echo "💥 Test database container and volume removed."
else
    docker compose -f docker-compose.test.yml --env-file "$ENV_FILE" down
    echo "✅ Test database container stopped."
fi
