/**
 * Guard: the bun suites never run against a database that is not a test one
 * ============================================================================
 *
 * bun loads `apps/api/.env` on its own, and on the owner's machine that file
 * points at PRODUCTION. Several suites delete rows (`clearTestData()`, the RLS
 * suites), so a plain `bun test` here would delete real data. This file runs
 * before any test (bunfig.toml `preload`), before anything connects, and stops
 * the run unless the database name contains "test".
 *
 * The package scripts pass `--env-file=../../.env.test`, which also stops bun
 * from loading `.env`.
 */

const url = process.env.DATABASE_URL;
const memory = process.env.KITSUDEN_TEST_DB === "memory" || url === "lite";

if (url && !memory) {
  let name = "";
  try {
    name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    name = "";
  }
  if (!/test/i.test(name)) {
    // The URL is never printed: it carries a password.
    throw new Error(
      `Refusing to run tests: DATABASE_URL points at database "${name || "?"}", whose name does not contain "test". ` +
        "Run the suites through the package scripts (they pass --env-file=../../.env.test), " +
        "or set DATABASE_URL to the test database (port 5434)."
    );
  }
}
