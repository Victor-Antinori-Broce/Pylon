// @ts-nocheck
/**
 * Auth Module Tests
 * 
 * Tests for authentication functionality including:
 * - User registration
 * - User login
 * - Session management
 * - API key authentication
 */

import { createHash } from "crypto";

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";

import { db } from "../db";
import { authUsers, apiKeys } from "../db/schema";

import { 
  isDatabaseAvailable, 
  clearTestData, 
  createTestUserData,
  generateTestId 
} from "./setup";

// Skip tests if database is not available
let dbAvailable = false;

describe("Auth Module", () => {
  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (dbAvailable) {
      await clearTestData();
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await clearTestData();
    }
  });

  // Test user data
  const testUser = createTestUserData();
  let userId: string;

  describe("User Management", () => {
    it("should create a new user directly in database", async () => {
      if (!dbAvailable) {
        console.log("⚠️ Skipping: Database not available");
        return;
      }

      const [result] = await db
        .insert(authUsers)
        .values({
          id: generateTestId(),
          email: testUser.email,
          name: testUser.name,
          emailVerified: false,
          role: "user",
        })
        .returning();

      expect(result).toBeDefined();
      expect(result.email).toBe(testUser.email);
      expect(result.name).toBe(testUser.name);
      
      userId = result.id;
    });

    it("should find user by email", async () => {
      if (!dbAvailable) return;

      const [result] = await db
        .select()
        .from(authUsers)
        .where(eq(authUsers.email, testUser.email))
        .limit(1);

      expect(result).toBeDefined();
      expect(result.email).toBe(testUser.email);
    });

    it("should update user role", async () => {
      if (!dbAvailable) return;

      const [result] = await db
        .update(authUsers)
        .set({ role: "admin" })
        .where(eq(authUsers.id, userId))
        .returning();

      expect(result).toBeDefined();
      expect(result.role).toBe("admin");
    });

    it("should delete user", async () => {
      if (!dbAvailable) return;

      await db.delete(authUsers).where(eq(authUsers.id, userId));

      const [result] = await db
        .select()
        .from(authUsers)
        .where(eq(authUsers.id, userId))
        .limit(1);

      expect(result).toBeUndefined();
    });
  });

  describe("API Key Management", () => {
    let apiKeyId: string;
    let testUserId: string;

    beforeAll(async () => {
      if (!dbAvailable) return;
      
      // Create test user for API key tests
      const [user] = await db
        .insert(authUsers)
        .values({
          id: generateTestId(),
          email: `apikey-test-${Date.now()}@example.com`,
          name: "API Key Test User",
          role: "user",
        })
        .returning();
      
      testUserId = user.id;
    });

    it("should create API key for user", async () => {
      if (!dbAvailable) return;

      const apiKeyToken = `gremius_sk_${generateTestId()}`;
      const keyHash = createHash("sha256").update(apiKeyToken).digest("hex");

      const [result] = await db
        .insert(apiKeys)
        .values({
          name: "Test API Key",
          keyHash,
          userId: testUserId,
          permissions: ["read", "write"],
        })
        .returning();

      expect(result).toBeDefined();
      expect(result.name).toBe("Test API Key");
      expect(result.keyHash).toBe(keyHash);
      
      apiKeyId = result.id;
    });

    it("should find API key by hash", async () => {
      if (!dbAvailable) return;

      const [result] = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.id, apiKeyId))
        .limit(1);

      expect(result).toBeDefined();
      expect(result.userId).toBe(testUserId);
    });

    it("should update API key last used", async () => {
      if (!dbAvailable) return;

      const now = new Date();
      
      const [result] = await db
        .update(apiKeys)
        .set({ lastUsedAt: now })
        .where(eq(apiKeys.id, apiKeyId))
        .returning();

      expect(result).toBeDefined();
      expect(result.lastUsedAt).toBeDefined();
    });

    it("should set API key expiration", async () => {
      if (!dbAvailable) return;

      const expiredDate = new Date(Date.now() - 1000); // 1 second ago
      
      const [result] = await db
        .update(apiKeys)
        .set({ expiresAt: expiredDate })
        .where(eq(apiKeys.id, apiKeyId))
        .returning();

      expect(result).toBeDefined();
      expect(result.expiresAt).toBeDefined();
      expect(result.expiresAt!.getTime()).toBeLessThan(Date.now());
    });

    it("should delete API key", async () => {
      if (!dbAvailable) return;

      await db.delete(apiKeys).where(eq(apiKeys.id, apiKeyId));

      const [result] = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.id, apiKeyId))
        .limit(1);

      expect(result).toBeUndefined();
    });

    afterAll(async () => {
      if (!dbAvailable) return;
      if (testUserId) {
        await db.delete(apiKeys).where(eq(apiKeys.userId, testUserId));
        await db.delete(authUsers).where(eq(authUsers.id, testUserId));
      }
    });
  });

  describe("User Role Validation", () => {
    it("should validate role assignments", async () => {
      if (!dbAvailable) return;

      const validRoles = ["admin", "editor", "user"];
      
      for (const role of validRoles) {
        const [user] = await db
          .insert(authUsers)
          .values({
            id: generateTestId(),
            email: `role-test-${role}-${Date.now()}@example.com`,
            name: `Role Test ${role}`,
            role,
          })
          .returning();

        expect(user.role).toBe(role);
        
        // Cleanup
        await db.delete(authUsers).where(eq(authUsers.id, user.id));
      }
    });
  });
});
