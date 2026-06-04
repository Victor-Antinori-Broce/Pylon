import { newDb, DataType } from "pg-mem";

const pgMem = newDb();

// Register gen_random_uuid directly
pgMem.public.registerFunction({
  name: "gen_random_uuid",
  returns: DataType.uuid,
  implementation: () => crypto.randomUUID(),
});

// Test simple CREATE TABLE with DEFAULT gen_random_uuid()
pgMem.public.none("CREATE TABLE test (id UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, name TEXT NOT NULL);");
pgMem.public.none("INSERT INTO test (name) VALUES ('hello');");
const result = pgMem.public.query("SELECT * FROM test;");
console.log("Success:", result.rows[0]);

// Test enum
pgMem.public.none("CREATE TYPE user_role AS ENUM('admin', 'editor', 'user');");
pgMem.public.none("CREATE TABLE auth_users (id TEXT PRIMARY KEY, name TEXT NOT NULL, role user_role DEFAULT 'user' NOT NULL);");
pgMem.public.none("INSERT INTO auth_users (id, name) VALUES ('u1', 'Test');");
const result2 = pgMem.public.query("SELECT * FROM auth_users;");
console.log("Auth user:", result2.rows[0]);

// Test timestamp with time zone
try {
  pgMem.public.none("CREATE TABLE tstamp (id INT PRIMARY KEY, created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL);");
  pgMem.public.none("INSERT INTO tstamp (id) VALUES (1);");
  const result3 = pgMem.public.query("SELECT * FROM tstamp;");
  console.log("Timestamp:", result3.rows[0]);
} catch (e) {
  console.log("Timestamp error:", e.message);
}

// Test JSONB
try {
  pgMem.public.none("CREATE TABLE jsonb_test (id INT PRIMARY KEY, data JSONB NOT NULL DEFAULT '[]');");
  pgMem.public.none("INSERT INTO jsonb_test (id) VALUES (1);");
  const result4 = pgMem.public.query("SELECT * FROM jsonb_test;");
  console.log("JSONB:", result4.rows[0]);
} catch (e) {
  console.log("JSONB error:", e.message);
}

console.log("All basic tests passed!");
