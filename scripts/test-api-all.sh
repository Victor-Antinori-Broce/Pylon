#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════
# Run full API test suite against real PostgreSQL (Unix/Mac)
# ═══════════════════════════════════════════════════════════════════════════

ENV_FILE=".env.test"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Load test environment variables from .env.test
if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck source=/dev/null
    source "$ENV_FILE"
    set +a
fi

cd "$ROOT_DIR"

echo "🧪 Running full API test suite against PostgreSQL..."

pnpm run test:db:up

cleanup() {
    cd "$ROOT_DIR"
    pnpm run test:db:down
}
trap cleanup EXIT

cd apps/api

echo "🗃️  Running migrations..."
export NODE_ENV=test
bunx drizzle-kit migrate

echo "🧪 Running tests..."
export KITSUDEN_TEST_DB=postgres
bun test src/tests/
