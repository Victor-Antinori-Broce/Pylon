import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import path from 'path';

export async function loadDatabase() {
  const configPath = path.resolve('gremius.config.ts');
  let config: any = {};

  try {
    const module = await import(configPath);
    config = module.default || module;
  } catch {
    // Usar defaults
  }

  const connectionString =
    config.database?.connectionString ||
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/gremius';

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  return { db, client };
}

export async function closeDatabase(client: postgres.Sql) {
  await client.end();
}
