/**
 * User Context Enrichment Middleware
 *
 * Populates ACL-related fields in the Hono context after authentication.
 * Runs AFTER the global auth middleware (which sets `user` and `session`).
 *
 * Sources:
 *   - userRoleIds:    Derived from `user.role` (Better Auth enum → array)
 *   - userDepartmentId: Looked up from directory_employees table (if grimoire-directory installed)
 *
 * Graceful degradation:
 *   - If grimoire-directory is not installed → userDepartmentId = null
 *   - If user has no role → userRoleIds = []
 */

import { sql } from "drizzle-orm";
import { createMiddleware } from "hono/factory";

import { db } from "../db";

export const enrichUserContext = createMiddleware(async (c, next) => {
  const user = c.get("user");

  // Not authenticated — nothing to enrich
  if (!user) {
    c.set("userRoleIds", []);
    c.set("userDepartmentId", null);
    return next();
  }

  // 1. Roles — Better Auth only stores a single role string
  const userRoleIds = user.role ? [String(user.role)] : [];
  c.set("userRoleIds", userRoleIds);

  // 2. Department — lookup in directory_employees (if table exists)
  let userDepartmentId: string | null = null;

  try {
    const result = await db.execute(
      sql`SELECT department_id FROM directory_employees WHERE user_id = ${user.id} LIMIT 1`
    );
    const rows = result.rows as Array<{ department_id: string | null }>;
    userDepartmentId = rows[0]?.department_id ?? null;
  } catch {
    // grimoire-directory not installed or table missing → leave as null
  }

  c.set("userDepartmentId", userDepartmentId);
  await next();
});
