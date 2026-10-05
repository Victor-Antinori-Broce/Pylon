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

  // Try the exact query that fails
  try {
    const res = await client.query(
      "SELECT * FROM games WHERE status = $1 ORDER BY metacritic_score DESC LIMIT $2",
      ["published", 24]
    );
    console.log("games query OK, rows:", res.rowCount);
  } catch (e) {
    console.log("games query ERROR:", e.message);
  }

  // Try media query
  try {
    const res2 = await client.query("SELECT * FROM media ORDER BY created_at DESC LIMIT $1", [50]);
    console.log("media query OK, rows:", res2.rowCount);
  } catch (e) {
    console.log("media query ERROR:", e.message);
  }

  // Try blog query
  try {
    const res3 = await client.query(
      "SELECT * FROM blog_posts ORDER BY created_at DESC LIMIT $1 OFFSET $2",
      [12, 0]
    );
    console.log("blog query OK, rows:", res3.rowCount);
  } catch (e) {
    console.log("blog query ERROR:", e.message);
  }

  client.release();
} catch (e) {
  console.error("Error:", e.message);
}
await pool.end();
