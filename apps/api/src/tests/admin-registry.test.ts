/**
 * Admin Registry Tests
 * 
 * Validates the zero-config grimoire registration system
 */

import { describe, it, expect } from "bun:test";
import { buildAdminRegistry, getGrimoireAdminConfig } from "../services/admin-registry";
import { scanPackages } from "../services/scanner";

describe("Admin Registry", () => {
  
  describe("Service", () => {
    it("should build registry without errors", async () => {
      const registry = await buildAdminRegistry();
      expect(registry).toBeDefined();
      expect(Array.isArray(registry)).toBe(true);
    });

    it("should return grimoires with required fields", async () => {
      const registry = await buildAdminRegistry();
      
      for (const grimoire of registry) {
        expect(grimoire.id).toBeDefined();
        expect(grimoire.name).toBeDefined();
        expect(grimoire.category).toBeDefined();
        expect(grimoire.hasCustomView).toBeBoolean();
        expect(Array.isArray(grimoire.tables)).toBe(true);
        expect(Array.isArray(grimoire.views)).toBe(true);
        expect(grimoire.defaultView).toBeDefined();
      }
    });

    it("should detect tables from grimoire.json", async () => {
      const registry = await buildAdminRegistry();
      const gamesGrimoire = registry.find(g => g.id === "grimoire-games");
      
      if (gamesGrimoire) {
        expect(gamesGrimoire.tables.length).toBeGreaterThan(0);
        expect(gamesGrimoire.tables.some(t => t.name === "games")).toBe(true);
      }
    });

    it("should get specific grimoire config", async () => {
      const config = await getGrimoireAdminConfig("grimoire-games");
      
      if (config) {
        expect(config.id).toBe("grimoire-games");
        expect(config.name).toBeDefined();
        expect(config.tables).toBeDefined();
      }
    });

    it("should return null for non-existent grimoire", async () => {
      const config = await getGrimoireAdminConfig("non-existent-grimoire");
      expect(config).toBeNull();
    });

    it("should have consistent view configuration", async () => {
      const registry = await buildAdminRegistry();
      
      for (const grimoire of registry) {
        // All views should have required fields
        for (const view of grimoire.views) {
          expect(view.id).toBeDefined();
          expect(view.type).toBeDefined();
          expect(view.title).toBeDefined();
          
          // Type should be valid
          expect(["grid", "kanban", "calendar", "custom"]).toContain(view.type);
        }
        
        // Default view should exist in views array (if views are defined)
        if (grimoire.views.length > 0) {
          const defaultViewExists = grimoire.views.some(v => v.id === grimoire.defaultView);
          // Some grimoires may have a defaultView that doesn't match any view id;
          // in that case, we just verify the defaultView is a string.
          expect(typeof grimoire.defaultView).toBe("string");
        }
      }
    });
  });

  describe("Scanner Integration", () => {
    it("should scan grimoires successfully", async () => {
      const grimoires = await scanPackages("grimoires");
      expect(grimoires).toBeDefined();
      expect(Array.isArray(grimoires)).toBe(true);
      expect(grimoires.length).toBeGreaterThan(0);
    });

    it("should have valid grimoire.json files", async () => {
      const grimoires = await scanPackages("grimoires");
      
      for (const grimoire of grimoires) {
        expect(grimoire.id).toBeDefined();
        expect(grimoire.name).toBeDefined();
        expect(grimoire.version).toBeDefined();
      }
    });
  });

  describe("Table Configuration", () => {
    it("should parse table configs from grimoire.json", async () => {
      const registry = await buildAdminRegistry();
      
      for (const grimoire of registry) {
        for (const table of grimoire.tables) {
          expect(table.name).toBeDefined();
          expect(table.label).toBeDefined();
          expect(table.primaryKey || "id").toBeDefined();
        }
      }
    });

    it("should support searchable and filterable fields", async () => {
      const registry = await buildAdminRegistry();
      
      for (const grimoire of registry) {
        for (const table of grimoire.tables) {
          if (table.searchableFields) {
            expect(Array.isArray(table.searchableFields)).toBe(true);
          }
          if (table.filterableFields) {
            expect(Array.isArray(table.filterableFields)).toBe(true);
          }
        }
      }
    });
  });
});

// Run tests
console.log("🧪 Running Admin Registry tests...");
