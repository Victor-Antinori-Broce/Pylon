/**
 * Schema Patch Instructions — Add blocks column
 * 
 * Apply these changes to apps/api/src/db/schema.ts once the server is stopped.
 * 
 * 1. In the `games` table definition, add before `createdAt`:
 * 
 *    blocks: jsonb("blocks").default([]).$type<PageBlock[]>(),
 * 
 * 2. In the `blogPosts` table definition, add before `createdAt`:
 * 
 *    blocks: jsonb("blocks").default([]).$type<PageBlock[]>(),
 * 
 * 3. Add the PageBlock type at the top of the file (or import from shared):
 * 
 *    interface PageBlock {
 *      id: string;
 *      type: string;
 *      data: Record<string, any>;
 *      order: number;
 *    }
 * 
 * Alternatively, just run the migration SQL:
 *   psql -U gremius -d gremius_db -f migrations/0002_add_blocks_column.sql
 * 
 * Then Drizzle will pick up the existing columns on next introspect/push.
 */
export {};
