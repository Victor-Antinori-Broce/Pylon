// @ts-nocheck
/**
 * Zero Config Integration Tests
 * 
 * Validates the complete flow:
 * 1. Grimoire auto-discovery from grimoire.json
 * 2. Schema introspection from database
 * 3. Admin config generation
 * 4. Inline relations detection
 * 5. API endpoint responses
 */

import { describe, it, expect } from "bun:test";

import { buildAdminRegistry, getGrimoireAdminConfig } from "../services/admin-registry";
import { detectRelations, generateInlineConfigs } from "../services/inline-relations";
import { introspectTable, getAllTables, generateAdminConfigFromIntrospection } from "../services/schema-introspector";

describe("Zero Config Integration", () => {
  
  describe("🎛️ Admin Registry Flow", () => {
    it("should discover grimoires from filesystem", async () => {
      const registry = await buildAdminRegistry();
      
      expect(registry.length).toBeGreaterThan(0);
      
      // Check for known grimoires
      const hasGames = registry.some(g => g.id === "grimoire-games");
      expect(hasGames).toBe(true);
    });

    it("should parse grimoire.json config correctly", async () => {
      const config = await getGrimoireAdminConfig("grimoire-games");
      
      expect(config).toBeDefined();
      expect(config?.name).toBe("Games");
      expect(config?.tables.length).toBeGreaterThan(0);
      expect(config?.views.length).toBeGreaterThan(0);
    });

    it("should detect custom views correctly", async () => {
      const registry = await buildAdminRegistry();
      
      // webhooks should have custom view (from legacy registry)
      const webhooks = registry.find(g => g.id === "webhooks" || g.id === "core-webhooks");
      if (webhooks) {
        expect(webhooks.hasCustomView).toBe(true);
      }
    });
  });

  describe("🔍 Schema Introspection Flow", () => {
    it("should list all database tables", async () => {
      const tables = await getAllTables();
      
      expect(Array.isArray(tables)).toBe(true);
      expect(tables.length).toBeGreaterThan(0);
      
      // Should have core tables
      expect(tables).toContain("games");
      expect(tables).toContain("auth_users");
    });

    it("should introspect games table", async () => {
      const introspected = await introspectTable("games");
      
      expect(introspected).toBeDefined();
      expect(introspected?.name).toBe("games");
      expect(introspected?.columns.length).toBeGreaterThan(0);
      expect(introspected?.primaryKey.length).toBeGreaterThan(0);
    });

    it("should detect columns with correct types", async () => {
      const introspected = await introspectTable("games");
      
      if (!introspected) return;
      
      const idColumn = introspected.columns.find(c => c.name === "id");
      expect(idColumn).toBeDefined();
      expect(idColumn?.isPrimaryKey).toBe(true);
    });

    it("should generate admin config from introspection", async () => {
      const config = await generateAdminConfigFromIntrospection("games");
      
      expect(config.table).toBe("games");
      expect(config.columns.length).toBeGreaterThan(0);
      expect(config.icon).toBeDefined();
    });
  });

  describe("🔗 Inline Relations Flow", () => {
    it("should detect relations for a table", async () => {
      const relations = await detectRelations("games");
      
      expect(Array.isArray(relations)).toBe(true);
      // games might have relations to platforms, tags, etc.
    });

    it("should generate inline configs", async () => {
      const configs = await generateInlineConfigs("games");
      
      expect(Array.isArray(configs)).toBe(true);
      // Each config should have required fields
      for (const config of configs) {
        expect(config.name).toBeDefined();
        expect(config.table).toBeDefined();
        expect(config.fkColumn).toBeDefined();
        expect(config.fields.length).toBeGreaterThan(0);
      }
    });
  });

  describe("🔄 End-to-End Flow", () => {
    it("complete flow: grimoire → introspection → relations", async () => {
      // Step 1: Get grimoire from registry
      const grimoire = await getGrimoireAdminConfig("grimoire-games");
      expect(grimoire).toBeDefined();
      
      // Step 2: Introspect its main table
      const mainTable = grimoire?.tables[0]?.name;
      expect(mainTable).toBeDefined();
      
      const introspected = await introspectTable(mainTable!);
      expect(introspected).toBeDefined();
      
      // Step 3: Generate admin config
      const adminConfig = await generateAdminConfigFromIntrospection(mainTable!);
      expect(adminConfig.columns.length).toBeGreaterThan(0);
      
      // Step 4: Detect relations
      const relations = await detectRelations(mainTable!);
      expect(Array.isArray(relations)).toBe(true);
      
      // Step 5: Generate inline configs
      const inlines = await generateInlineConfigs(mainTable!);
      expect(Array.isArray(inlines)).toBe(true);
    });

    it("should handle missing tables gracefully", async () => {
      const introspected = await introspectTable("non_existent_table_xyz");
      expect(introspected).toBeNull();
    });

    it("should handle missing grimoires gracefully", async () => {
      const config = await getGrimoireAdminConfig("non-existent-grimoire");
      expect(config).toBeNull();
    });
  });

  describe("📊 Data Consistency", () => {
    it("registry should be consistent across calls", async () => {
      const registry1 = await buildAdminRegistry();
      const registry2 = await buildAdminRegistry();
      
      // Should be same length (from cache)
      expect(registry1.length).toBe(registry2.length);
    });

    it("introspection should be cacheable", async () => {
      // First call
      const intro1 = await introspectTable("games");
      // Second call should use cache
      const intro2 = await introspectTable("games");
      
      expect(intro1).toEqual(intro2);
    });
  });
});

console.log("🧪 Running Zero Config Integration tests...");
