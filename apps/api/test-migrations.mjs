import { readFileSync, readdirSync } from "fs";
import { join } from "path";

import { newDb, DataType } from "pg-mem";

const pgMem = newDb();
pgMem.public.registerFunction({
  name: "gen_random_uuid",
  returns: DataType.uuid,
  implementation: () => crypto.randomUUID(),
});

function extractStatements(sql) {
  // Extract CREATE TYPE from DO blocks
  let cleaned = sql
    .replace(
      /DO \$\$ BEGIN\s*(CREATE TYPE[\s\S]*?;)\s*EXCEPTION WHEN duplicate_object THEN null; END \$\$;\s*--> statement-breakpoint\n?/gi,
      "$1\n"
    )
    .replace(/--> statement-breakpoint\n?/g, "\n")
    .replace(/\n\s*\n/g, "\n");

  // Remove PL/pgSQL blocks (CREATE OR REPLACE FUNCTION ... $$ ... $$)
  cleaned = cleaned.replace(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION[\s\S]*?\$\$[\s\S]*?\$\$\s*LANGUAGE\s+plpgsql;?/gi,
    ""
  );

  // Remove trigger creation that references plpgsql functions
  cleaned = cleaned.replace(/CREATE\s+TRIGGER[\s\S]*?EXECUTE\s+FUNCTION[\s\S]*?;/gi, "");

  return cleaned
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));
}

function runMigrations(dir) {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(dir, file), "utf-8");
    const stmts = extractStatements(sql);

    let ok = 0,
      fail = 0;
    for (const stmt of stmts) {
      try {
        pgMem.public.none(stmt + ";");
        ok++;
      } catch (e) {
        fail++;
        if (!e.message.includes("already exists") && !e.message.includes("does not exist")) {
          console.log("FAIL", file + ":", e.message.substring(0, 120));
        }
      }
    }
    console.log(file + ": " + ok + " OK, " + fail + " FAIL (ignored)");
  }
}

runMigrations("./drizzle");
runMigrations("./src/db/migrations");

const tables = pgMem.public.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
);
console.log(
  "Tables:",
  tables.rows
    .map((r) => r.table_name)
    .sort()
    .join(", ")
);
