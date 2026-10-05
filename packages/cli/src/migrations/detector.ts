import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Tabla para trackear migraciones
export const migrationsTable = pgTable("_migrations", {
  id: serial("id").primaryKey(),
  kon: text("kon").notNull(),
  name: text("name").notNull(),
  appliedAt: timestamp("applied_at").defaultNow().notNull(),
  checksum: text("checksum").notNull(),
});

/**
 * Post-procesa el SQL generado por drizzle-kit export para hacerlo idempotente.
 * - CREATE TYPE -> DO $$ BEGIN IF NOT EXISTS ... END $$;
 * - CREATE TABLE -> CREATE TABLE IF NOT EXISTS
 * - CREATE INDEX -> CREATE INDEX IF NOT EXISTS
 * - ALTER TABLE ADD CONSTRAINT -> ALTER TABLE IF EXISTS ... ADD CONSTRAINT IF NOT EXISTS
 */
export function postProcessSqlForIdempotency(sql: string): string {
  const lines = sql.split("\n");
  const result: string[] = [];

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // CREATE TYPE "public"."xxx" AS ENUM(...)
    const typeMatch = line.match(/^CREATE TYPE\s+"public"\."([^"]+)"\s+AS\s+ENUM\s*\(/i);
    if (typeMatch) {
      const typeName = typeMatch[1];
      let enumBody = line.substring(line.indexOf("AS ENUM"));
      enumBody = enumBody.replace(/;+$/, ""); // quitar trailing semicolons
      result.push(`DO $$ BEGIN`);
      result.push(`  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${typeName}') THEN`);
      result.push(`    CREATE TYPE "public"."${typeName}" ${enumBody};`);
      result.push(`  END IF;`);
      result.push(`END $$;`);
      continue;
    }

    // CREATE TABLE "xxx"
    if (line.match(/^CREATE TABLE\s+"/i)) {
      line = line.replace(/^CREATE TABLE\s+/, "CREATE TABLE IF NOT EXISTS ");
      result.push(line);
      continue;
    }

    // CREATE INDEX "xxx" ON "yyy"
    if (line.match(/^CREATE INDEX\s+"/i)) {
      line = line.replace(/^CREATE INDEX\s+/, "CREATE INDEX IF NOT EXISTS ");
      result.push(line);
      continue;
    }

    // ALTER TABLE "xxx" ADD CONSTRAINT "yyy" FOREIGN KEY ...
    if (line.match(/^ALTER TABLE\s+"/i)) {
      line = line.replace(/^ALTER TABLE\s+/, "ALTER TABLE IF EXISTS ");
      // PostgreSQL 9.5+ soporta ADD CONSTRAINT IF NOT EXISTS
      line = line.replace(/ADD CONSTRAINT\s+"([^"]+)"/, 'ADD CONSTRAINT IF NOT EXISTS "$1"');
      result.push(line);
      continue;
    }

    result.push(line);
  }

  return result.join("\n");
}
