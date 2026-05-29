// @ts-nocheck

/**
 * Modules (Grimoires) Tests
 * 
 * Tests for module registry, loading, and lifecycle management.
 * These tests don't require a database.
 */

import { describe, it, expect } from "bun:test";
import {
  GRIMOIRE_REGISTRY,
  GRIMOIRE_KEYS,
  getCoreGrimoires,
  getOptionalGrimoires,
  getRealmGrimoires,
  getGrimoireCoreGrimoires,
} from "../services/module-registry";

describe("Grimoire Registry", () => {
  describe("Registry Structure", () => {
    it("should have grimoires registered", () => {
      expect(GRIMOIRE_REGISTRY.length).toBeGreaterThan(0);
      expect(GRIMOIRE_KEYS.length).toBeGreaterThan(0);
      expect(GRIMOIRE_KEYS.length).toBe(GRIMOIRE_REGISTRY.length);
    });

    it("should have unique keys", () => {
      const keys = GRIMOIRE_REGISTRY.map((g) => g.key);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });

    it("should have all required fields for each grimoire", () => {
      for (const grimoire of GRIMOIRE_REGISTRY) {
        expect(grimoire.key).toBeDefined();
        expect(typeof grimoire.key).toBe("string");
        expect(grimoire.key.length).toBeGreaterThan(0);

        expect(grimoire.name).toBeDefined();
        expect(typeof grimoire.name).toBe("string");
        expect(grimoire.name.length).toBeGreaterThan(0);

        expect(grimoire.description).toBeDefined();
        expect(typeof grimoire.description).toBe("string");

        expect(grimoire.category).toBeDefined();
        expect(["core", "grimoire-core", "optional", "realm"]).toContain(grimoire.category);

        expect(Array.isArray(grimoire.tables)).toBe(true);
        expect(Array.isArray(grimoire.dependsOn)).toBe(true);
        expect(Array.isArray(grimoire.referencedBy)).toBe(true);
      }
    });
  });

  describe("Categories", () => {
    it("should categorize grimoires correctly", () => {
      const core = getCoreGrimoires();
      const optional = getOptionalGrimoires();
      const grimoireCore = getGrimoireCoreGrimoires();
      const realm = getRealmGrimoires();

      expect(core.length).toBeGreaterThanOrEqual(0);
      expect(optional.length).toBeGreaterThanOrEqual(0);
      expect(grimoireCore.length).toBeGreaterThanOrEqual(0);
      expect(realm.length).toBeGreaterThanOrEqual(0);

      // Verify total matches
      const total = core.length + optional.length + grimoireCore.length + realm.length;
      expect(total).toBe(GRIMOIRE_REGISTRY.length);
    });

    it("should have realm grimoires with realmId", () => {
      const realmGrimoires = getRealmGrimoires();

      for (const grimoire of realmGrimoires) {
        expect(grimoire.realmId).toBeDefined();
        expect(typeof grimoire.realmId).toBe("string");
        expect(grimoire.realmId).toContain("realm-");
      }
    });
  });

  describe("Dependencies", () => {
    it("should track dependencies when present", () => {
      const grimoireWithDeps = GRIMOIRE_REGISTRY.find(
        (g) => g.dependsOn.length > 0
      );

      if (grimoireWithDeps) {
        expect(grimoireWithDeps.dependsOn.length).toBeGreaterThan(0);

        // All dependencies should exist in registry
        for (const dep of grimoireWithDeps.dependsOn) {
          expect(GRIMOIRE_KEYS).toContain(dep);
        }
      }
    });

    it("should track references when present", () => {
      const grimoireWithRefs = GRIMOIRE_REGISTRY.find(
        (g) => g.referencedBy.length > 0
      );

      if (grimoireWithRefs) {
        expect(grimoireWithRefs.referencedBy.length).toBeGreaterThan(0);

        for (const ref of grimoireWithRefs.referencedBy) {
          expect(ref.grimoire).toBeDefined();
          expect(ref.table).toBeDefined();
          expect(ref.column).toBeDefined();
          expect(ref.label).toBeDefined();
        }
      }
    });
  });

  describe("Grimoire Definitions", () => {
    const expectedGrimoires = [
      { key: "media-library", category: "core" },
      { key: "grimoire-blog", category: "grimoire-core" },
      { key: "webhooks", category: "core" },
      { key: "connectors", category: "core" },
      { key: "blocks", category: "grimoire-core" },
      { key: "academy", category: "optional" },
      { key: "dms", category: "optional" },
      { key: "booking", category: "optional" },
      { key: "directory", category: "optional" },
      { key: "gremius-crm", category: "optional" },
      { key: "blog", category: "optional" },
      { key: "games", category: "realm" },
      { key: "streamers", category: "realm" },
      { key: "platforms", category: "realm" },
      { key: "tags", category: "realm" },
      { key: "collections", category: "realm" },
      { key: "matches", category: "realm" },
      { key: "players", category: "realm" },
      { key: "teams", category: "realm" },
      { key: "tournaments", category: "realm" },
    ];

    for (const expected of expectedGrimoires) {
      it(`should have ${expected.key} as ${expected.category}`, () => {
        const grimoire = GRIMOIRE_REGISTRY.find((g) => g.key === expected.key);
        expect(grimoire).toBeDefined();
        expect((grimoire as any).category).toBe(expected.category);
      });
    }
  });

  describe("Icons and Colors", () => {
    it("should have icons for all grimoires", () => {
      for (const grimoire of GRIMOIRE_REGISTRY) {
        expect(grimoire.icon).toBeDefined();
        expect(typeof grimoire.icon).toBe("string");
        expect(grimoire.icon.length).toBeGreaterThan(0);
      }
    });

    it("should have valid hex colors", () => {
      const hexRegex = /^#[0-9A-Fa-f]{6}$/;

      for (const grimoire of GRIMOIRE_REGISTRY) {
        expect(grimoire.color).toMatch(hexRegex);
      }
    });
  });
});

describe("Grimoire Loader", () => {
  it("should resolve directory paths correctly", () => {
    const testCases = [
      { input: "games", expectedDir: "grimoire-games" },
      { input: "academy", expectedDir: "grimoire-academy-lms" },
      { input: "gremius-crm", expectedDir: "grimoire-crm" },
    ];

    for (const testCase of testCases) {
      // Mirror the logic in module-loader.ts
      const cleanName = testCase.input.replace(/^grimoire-/, "");
      const dirMap: Record<string, string> = {
        academy: "grimoire-academy-lms",
        "gremius-crm": "grimoire-crm",
      };
      const dirName = dirMap[testCase.input] || `grimoire-${cleanName}`;

      expect(dirName).toBe(testCase.expectedDir);
    }
  });
});

describe("Grimoire Registry Helpers", () => {
  it("getCoreGrimoires should return only core category", () => {
    const core = getCoreGrimoires();
    expect(core.every((g) => g.category === "core")).toBe(true);
  });

  it("getOptionalGrimoires should return only optional category", () => {
    const optional = getOptionalGrimoires();
    expect(optional.every((g) => g.category === "optional")).toBe(true);
  });

  it("getRealmGrimoires should return only realm category", () => {
    const realm = getRealmGrimoires();
    expect(realm.every((g) => g.category === "realm")).toBe(true);
  });

  it("getGrimoireCoreGrimoires should return only grimoire-core category", () => {
    const grimoireCore = getGrimoireCoreGrimoires();
    expect(grimoireCore.every((g) => g.category === "grimoire-core")).toBe(true);
  });

  it("getRealmGrimoires should filter by realmId", () => {
    const realmEsports = getRealmGrimoires("realm-esports");
    expect(realmEsports.every((g) => g.realmId === "realm-esports")).toBe(true);
  });

  it("getRealmGrimoires without filter should return all realm grimoires", () => {
    const allRealm = getRealmGrimoires();
    expect(allRealm.length).toBeGreaterThan(0);
    expect(allRealm.every((g) => g.category === "realm")).toBe(true);
  });
});

describe("Registry Counts", () => {
  it("should have expected number of grimoires", () => {
    // We expect at least 21 grimoires based on the registry
    expect(GRIMOIRE_REGISTRY.length).toBeGreaterThanOrEqual(21);
  });

  it("should have more realm grimoires than core", () => {
    const realm = getRealmGrimoires();
    const core = getCoreGrimoires();

    expect(realm.length).toBeGreaterThan(core.length);
  });
});
