/**
 * Schema Patch: Page Builder Blocks
 *
 * Add this blocks column to the games and blogPosts tables in schema.ts:
 *
 * In the `games` table definition, add after `screenshots`:
 *   blocks: jsonb("blocks").default([]).$type<Array<{ id: string; type: string; data: Record<string, any>; order: number }>>(),
 *
 * In the `blogPosts` table definition, add after `seoOverrides`:
 *   blocks: jsonb("blocks").default([]).$type<Array<{ id: string; type: string; data: Record<string, any>; order: number }>>(),
 *
 * Since the file may be locked by the running process, apply this manually
 * or restart the server and run the SQL migration first.
 */

// TypeScript type for reference:
export interface PageBlockSchema {
  id: string;
  type: string;
  data: Record<string, any>;
  order: number;
}

// Drizzle column definition:
// blocks: jsonb("blocks").default([]).$type<PageBlockSchema[]>(),
