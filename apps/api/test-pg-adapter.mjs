import { newDb, DataType } from "pg-mem";
import { drizzle } from "drizzle-orm/node-postgres";
import * as coreSchema from "./src/db/schema-core.js";

const pgMem = newDb();

pgMem.public.registerFunction({
  name: "gen_random_uuid",
  returns: DataType.uuid,
  implementation: () => crypto.randomUUID(),
});

// Create a minimal table
pgMem.public.none(`
  CREATE TABLE auth_users (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
  );
`);

// Try pg-mem's built-in adapter
const adapter = pgMem.adapters.createPg();
const db = drizzle(adapter, { schema: coreSchema });

// Test a parameterized query like drizzle would
try {
  await db.select().from(coreSchema.authUsers).where(coreSchema.authUsers.email.eq("test@example.com"));
  console.log("Parameterized query: SUCCESS");
} catch (e) {
  console.log("Parameterized query: FAIL", e.message.substring(0, 200));
}

// Test insert
try {
  await db.insert(coreSchema.authUsers).values({ id: "u1", name: "Test", email: "test@example.com" });
  console.log("Insert: SUCCESS");
} catch (e) {
  console.log("Insert: FAIL", e.message.substring(0, 200));
}

// Test select after insert
try {
  const result = await db.select().from(coreSchema.authUsers);
  console.log("Select after insert:", result);
} catch (e) {
  console.log("Select after insert: FAIL", e.message.substring(0, 200));
}
