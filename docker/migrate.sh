#!/bin/sh
# Safe database migration script for production
set -e

echo "Running database migrations..."

DB_URL="${DATABASE_URL}"
if [ -z "$DB_URL" ]; then
    echo "ERROR: DATABASE_URL is not set. Configure it in your .env file."
    exit 1
fi

# Extract host and port from DATABASE_URL
DB_HOST=$(echo "$DB_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo "$DB_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

# Wait for PostgreSQL
echo "Waiting for PostgreSQL at $DB_HOST:$DB_PORT..."
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -q 2>/dev/null; do
    echo "   PostgreSQL not ready... waiting"
    sleep 2
done
echo "   OK - PostgreSQL is ready"

# Run migrations with drizzle
cd /app/apps/api
bunx drizzle-kit migrate

echo "   OK - Migrations completed"
