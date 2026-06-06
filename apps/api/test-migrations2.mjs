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
  // Normalize TIMESTAMPTZ
  let cleaned = sql.replace(/\bTIMESTAMPTZ\b/gi, "TIMESTAMP WITH TIME ZONE");

  // Extract CREATE TYPE from DO blocks (multiple formats)
  cleaned = cleaned.replace(
    /DO\s*\$\$\s*BEGIN\s*(CREATE\s+TYPE[\s\S]*?;)\s*EXCEPTION[\s\S]*?END\s*\$\$\s*;?\s*(?:-->\s*statement-breakpoint)?/gi,
    "$1\n"
  );

  // Remove remaining DO blocks entirely
  cleaned = cleaned.replace(/DO\s*\$\$[\s\S]*?\$\$\s*;?/gi, "");

  // Remove PL/pgSQL functions and triggers
  cleaned = cleaned.replace(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION[\s\S]*?\$\$[\s\S]*?\$\$\s*LANGUAGE\s+plpgsql\s*;?/gi,
    ""
  );
  cleaned = cleaned.replace(
    /CREATE\s+TRIGGER[\s\S]*?EXECUTE\s+(?:FUNCTION|PROCEDURE)[\s\S]*?;/gi,
    ""
  );

  // Remove statement breakpoints and comments
  cleaned = cleaned.replace(/-->\s*statement-breakpoint\n?/g, "\n");
  cleaned = cleaned.replace(/\n\s*--.*$/gm, "");

  return cleaned
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function runMigrations(dir) {
  let allOk = 0,
    allFail = 0;
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
        const msg = e.message;
        if (
          !msg.includes("already exists") &&
          !msg.includes("does not exist") &&
          !msg.includes("cannot find column")
        ) {
          console.log("FAIL", file + ":", msg.substring(0, 100));
        }
      }
    }
    allOk += ok;
    allFail += fail;
    if (fail > 0) {
      console.log(file + ": " + ok + " OK, " + fail + " FAIL");
    } else {
      console.log(file + ": " + ok + " OK");
    }
  }
  return { ok: allOk, fail: allFail };
}

const r1 = runMigrations("./drizzle");
const r2 = runMigrations("./src/db/migrations");
console.log("\nTotal: " + (r1.ok + r2.ok) + " OK, " + (r1.fail + r2.fail) + " FAIL");

const tables = pgMem.public.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
);
console.log(
  "\nTables:",
  tables.rows
    .map((r) => r.table_name)
    .sort()
    .join(", ")
);
