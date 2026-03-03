/**
 * GremiusCMS — Apply "Lego" blocks migration
 *
 * Run with: bun run apps/api/migrations/apply-blocks.ts
 *
 * This script:
 * 1. Adds the `blocks` JSONB column to blog_posts and games tables
 * 2. Creates GIN indexes for efficient queries
 */

import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://gremius:gremius_dev_2025@localhost:5432/gremiuscms";

const sql = postgres(connectionString);

async function migrate() {
  console.log("🧱 GremiusCMS — Applying blocks migration...\n");

  try {
    // Add blocks column to blog_posts
    await sql`
      ALTER TABLE blog_posts
      ADD COLUMN IF NOT EXISTS blocks jsonb DEFAULT '[]'::jsonb
    `;
    console.log("  ✅ blog_posts.blocks column added");

    // Add blocks column to games
    await sql`
      ALTER TABLE games
      ADD COLUMN IF NOT EXISTS blocks jsonb DEFAULT '[]'::jsonb
    `;
    console.log("  ✅ games.blocks column added");

    // Create GIN indexes
    await sql`
      CREATE INDEX IF NOT EXISTS blog_posts_blocks_idx ON blog_posts USING GIN (blocks)
    `;
    console.log("  ✅ blog_posts_blocks_idx created");

    await sql`
      CREATE INDEX IF NOT EXISTS games_blocks_idx ON games USING GIN (blocks)
    `;
    console.log("  ✅ games_blocks_idx created");

    console.log("\n🎉 Migration complete! Blocks system ready.\n");
  } catch (err: any) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();
