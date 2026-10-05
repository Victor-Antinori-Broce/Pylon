/**
 * Test Setup and Utilities
 *
 * Provides test database setup, teardown, and utility functions
 * for all test suites.
 */

import { sql } from "drizzle-orm";

import { db, isPgMem } from "../db";

// Test database URL from environment
export const TEST_DATABASE_URL = process.env.DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env and configure your PostgreSQL test connection."
  );
}

/**
 * Check if a REAL PostgreSQL database is available.
 * Returns false when falling back to pg-mem, since pg-mem
 * does not fully support drizzle-orm 0.45.x for integration tests.
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return !isPgMem;
  } catch {
    return false;
  }
}

/**
 * Clear all test data
 */
export async function clearTestData() {
  // Delete in correct order to avoid foreign key constraints
  await db.execute(sql`DELETE FROM "data_entries"`);
  await db.execute(sql`DELETE FROM "data_sets"`);
  await db.execute(sql`DELETE FROM "auth_users" WHERE email LIKE 'test-%@example.com'`);
  await db.execute(sql`DELETE FROM "api_keys" WHERE name LIKE 'Test%'`);
}

/**
 * Setup test environment
 */
export async function setupTestEnv() {
  const isAvailable = await isDatabaseAvailable();

  if (!isAvailable) {
    console.error("❌ Database not available. Skipping tests that require DB.");
    console.error(`Expected database at: ${TEST_DATABASE_URL}`);
    return false;
  }

  console.log("✅ Database connected, running tests...");
  return true;
}

/**
 * Generate unique test IDs
 */
export function generateTestId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create test user data
 */
export function createTestUserData() {
  const id = generateTestId();
  return {
    email: `${id}@example.com`,
    password: "TestPassword123!",
    name: `Test User ${id}`,
  };
}

/**
 * Create test dataset data
 */
export function createTestDatasetData() {
  const id = generateTestId();
  return {
    name: `Test Dataset ${id}`,
    slug: `test-dataset-${id}`,
    description: "A test dataset",
    schema: [{ fieldName: "title", fieldType: "text", required: true }],
  };
}
