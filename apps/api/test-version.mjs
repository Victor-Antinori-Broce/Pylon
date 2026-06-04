import { newDb } from "pg-mem";
const pgMem = newDb();
try {
  const result = pgMem.public.query("SELECT version();");
  console.log("version:", result.rows[0].version);
} catch (e) {
  console.log("error:", e.message.substring(0, 100));
}
