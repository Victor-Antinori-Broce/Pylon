#!/bin/sh
# ===================================================================
# GremiusCMS Start Script with Auto-Setup
#
# Estrategia de Migraciones:
#   1. Migraciones Drizzle (core schema)
#   2. Cada grimoire maneja sus propias tablas via SQL
# ===================================================================

set -e

DB_URL="${DATABASE_URL:-postgresql://gremius:gremiuspassword@gremius_db_prod:5432/gremius_prod}"
API_URL="${BETTER_AUTH_URL:-http://localhost:3000}"

echo "==================================================================="
echo "  GremiusCMS Auto-Setup"
echo "==================================================================="

# Parse DATABASE_URL
DB_HOST=$(echo "$DB_URL" | sed -n 's|.*@\([^:/]*\).*|\1|p')
DB_PORT=$(echo "$DB_URL" | sed -n 's|.*@[^:]*:\([0-9]*\)/.*|\1|p')
DB_NAME=$(echo "$DB_URL" | sed -n 's|.*/\([^?]*\)$|\1|p')
DB_USER=$(echo "$DB_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')
DB_PASS=$(echo "$DB_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-gremius_prod}"
DB_USER="${DB_USER:-gremius}"

ADMIN_DB_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/postgres"

echo ""
echo "[1/6] Checking PostgreSQL..."
echo "   Host: $DB_HOST:$DB_PORT"
echo "   Database: $DB_NAME"

MAX_RETRIES=60
RETRY_COUNT=0

while ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -q 2>/dev/null; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo "ERROR: PostgreSQL not responding"
        exit 1
    fi
    echo "   Waiting... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done

echo "   OK - PostgreSQL ready"

# Auto-create database
echo ""
echo "[2/6] Checking database '$DB_NAME'..."

DB_EXISTS=$(psql "$ADMIN_DB_URL" -t -A -c "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" 2>/dev/null || echo "")

if [ "$DB_EXISTS" = "1" ]; then
    echo "   OK - Database exists"
else
    echo "   Creating database..."
    psql "$ADMIN_DB_URL" -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";" 2>&1 || true
fi

# Verify pgvector
echo ""
echo "[3/6] Checking pgvector..."

PGVECTOR_CHECK=$(psql "$DB_URL" -t -A -c "SELECT 1 FROM pg_extension WHERE extname = 'vector'" 2>/dev/null || echo "")

if [ "$PGVECTOR_CHECK" = "1" ]; then
    echo "   OK - pgvector installed"
else
    echo "   Installing pgvector..."
    psql "$DB_URL" -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>&1 || echo "   WARN: Could not install pgvector"
fi

# Database Migrations - SOLO CORE
echo ""
cd /app/apps/api
echo "[4/6] Running core migrations..."

# Solo aplicar migraciones existentes, NO push
# Los grimoires opcionales manejan sus tablas via SQL
bunx drizzle-kit migrate 2>&1 || echo "   INFO: No pending migrations"

echo "   Core migrations complete"

# Auto-Install Grimoires
echo ""
echo "[5/6] Installing grimoires..."

bun run - << 'GRIMOIRE_SCRIPT'
import { db } from "./src/db";
import { installedGrimoires } from "./src/db/schema";
import { eq } from "drizzle-orm";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { readdir } from "fs/promises";

const GRIMOIRE_CONFIG_PATH = "./gremius.config.ts";

async function scanLocalGrimoires() {
  const grimoiresDir = "/app/packages/grimoires";
  const found = [];

  try {
    const entries = await readdir(grimoiresDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const grimoireJsonPath = join(grimoiresDir, entry.name, "grimoire.json");
      const gremiusJsonPath = join(grimoiresDir, entry.name, "gremius.json");

      let manifest = null;

      if (existsSync(grimoireJsonPath)) {
        manifest = JSON.parse(readFileSync(grimoireJsonPath, "utf-8"));
      } else if (existsSync(gremiusJsonPath)) {
        manifest = JSON.parse(readFileSync(gremiusJsonPath, "utf-8"));
      }

      if (manifest && manifest.id) {
        found.push({
          grimoireId: manifest.id,
          name: manifest.name || manifest.id,
          description: manifest.description,
          version: manifest.version || "1.0.0",
          source: "local",
          path: join(grimoiresDir, entry.name),
          manifest,
          enabled: true,
        });
      }
    }
  } catch (err) {
    console.log("   WARN: Scan error:", err.message);
  }

  return found;
}

async function getConfigGrimoires() {
  try {
    if (!existsSync(GRIMOIRE_CONFIG_PATH)) return [];

    // Import the static config directly instead of regex-parsing TS
    const configModule = await import(GRIMOIRE_CONFIG_PATH);
    const staticConfig = configModule.staticConfig || configModule.default || configModule;
    return staticConfig.grimoires || staticConfig.modules || [];
  } catch (err) {
    console.log("   WARN: Could not import gremius.config.ts:", err.message);
    return [];
  }
}

async function main() {
  const [localGrimoires, configIds] = await Promise.all([
    scanLocalGrimoires(),
    getConfigGrimoires(),
  ]);

  const toInstall = configIds.length > 0
    ? localGrimoires.filter(g => configIds.includes(g.grimoireId))
    : localGrimoires;

  console.log("   Found " + localGrimoires.length + " grimoires (" + toInstall.length + " active)");

  const installed = await db.select().from(installedGrimoires);
  const installedIds = new Set(installed.map(i => i.grimoireId));

  for (const grimoire of toInstall) {
    if (installedIds.has(grimoire.grimoireId)) {
      console.log("   ✓ " + grimoire.grimoireId + " already registered");
      continue;
    }

    try {
      await db.insert(installedGrimoires).values({
        grimoireId: grimoire.grimoireId,
        name: grimoire.name,
        description: grimoire.description,
        version: grimoire.version,
        source: grimoire.source,
        sourceUrl: grimoire.sourceUrl,
        path: grimoire.path,
        manifest: grimoire.manifest,
        enabled: grimoire.enabled,
      });
      console.log("   + " + grimoire.grimoireId + " registered");
    } catch (err) {
      console.log("   ✗ " + grimoire.grimoireId + ": " + err.message);
    }
  }
}

main().catch(() => process.exit(0));
GRIMOIRE_SCRIPT

echo ""
echo "==================================================================="
echo "[6/6] Setup complete. Starting API..."
echo "==================================================================="
echo ""
echo "  API: ${API_URL}"
echo "  Docs: ${API_URL}/api/swagger"
echo ""

exec bun run dist/index.js
