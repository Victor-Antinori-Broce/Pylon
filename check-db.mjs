import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Error: DATABASE_URL is not set. Configure your .env file.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString,
  connectionTimeoutMillis: 5000,
});
try {
  const client = await pool.connect();

  // Check columns in games table
  const cols = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'games' ORDER BY ordinal_position"
  );
  console.log(
    "games columns:",
    cols.rows.map((r) => r.column_name)
  );

  // Check columns in media table
  const cols2 = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'media' ORDER BY ordinal_position"
  );
  console.log(
    "media columns:",
    cols2.rows.map((r) => r.column_name)
  );

  // Check columns in blog_posts table
  const cols3 = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'blog_posts' ORDER BY ordinal_position"
  );
  console.log(
    "blog_posts columns:",
    cols3.rows.map((r) => r.column_name)
  );

  client.release();
} catch (e) {
  console.error("Error:", e.message);
}
await pool.end();
