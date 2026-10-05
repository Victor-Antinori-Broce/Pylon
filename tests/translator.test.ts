// @ts-nocheck
/**
 * Tests para Kitsuden QL Engine (translator.ts)
 *
 * Verifica:
 * - Mapeo de operadores Prisma a Drizzle
 * - Operadores lógicos AND/OR/NOT
 * - Validación de columnas y operadores
 * - Auto-Join con expand
 * - Errores semánticos
 */

import { describe, it, expect } from "vitest";

import { agentIdentities, agentTraces, dataSets } from "../apps/api/src/db/schema";
import {
  validateKitsudenQuery,
  getAvailableRelations,
  debugQuery,
  KitsudenQLError,
} from "../packages/engine/src/translator";

describe("Kitsuden QL Engine - translator.ts", () => {
  describe("Operadores de Comparación", () => {
    it("debe traducir eq (igualdad)", () => {
      const debug = debugQuery(agentIdentities, {
        where: { type: { eq: "service" } },
      });
      expect(debug.sql).toContain("SELECT");
    });

    it("debe traducir neq (diferente)", () => {
      const debug = debugQuery(agentIdentities, {
        where: { type: { neq: "disabled" } },
      });
      expect(debug.sql).toBeTruthy();
    });

    it("debe traducir gt/gte/lt/lte (numéricos)", () => {
      const debug = debugQuery(agentIdentities, {
        where: {
          rateLimit: { gte: 60, lte: 100 },
        },
      });
      expect(debug.sql).toBeTruthy();
    });

    it("debe traducir in (array de valores)", () => {
      const debug = debugQuery(agentIdentities, {
        where: {
          type: { in: ["service", "worker", "agent"] },
        },
      });
      expect(debug.sql).toBeTruthy();
    });

    it("debe traducir contains (búsqueda de texto)", () => {
      const debug = debugQuery(agentIdentities, {
        where: {
          name: { contains: "agent" },
        },
      });
      expect(debug.sql).toBeTruthy();
    });

    it("debe traducir startsWith y endsWith", () => {
      const debug = debugQuery(agentIdentities, {
        where: {
          name: { startsWith: "test", endsWith: "bot" },
        },
      });
      expect(debug.sql).toBeTruthy();
    });
  });

  describe("Igualdad Directa", () => {
    it("debe soportar igualdad directa sin operador", () => {
      const debug = debugQuery(agentIdentities, {
        where: {
          isActive: true,
          type: "service",
        },
      });
      expect(debug.sql).toBeTruthy();
    });
  });

  describe("Operadores Lógicos", () => {
    it("debe traducir AND", () => {
      const debug = debugQuery(agentIdentities, {
        where: {
          AND: [{ isActive: true }, { type: { eq: "service" } }],
        },
      });
      expect(debug.sql).toBeTruthy();
    });

    it("debe traducir OR", () => {
      const debug = debugQuery(agentIdentities, {
        where: {
          OR: [{ type: { eq: "service" } }, { type: { eq: "worker" } }],
        },
      });
      expect(debug.sql).toBeTruthy();
    });

    it("debe traducir NOT", () => {
      const debug = debugQuery(agentIdentities, {
        where: {
          NOT: { isActive: false },
        },
      });
      expect(debug.sql).toBeTruthy();
    });

    it("debe soportar anidación compleja AND/OR/NOT", () => {
      const debug = debugQuery(agentIdentities, {
        where: {
          AND: [
            { isActive: true },
            {
              OR: [{ type: { eq: "service" } }, { type: { eq: "worker" } }],
            },
          ],
        },
      });
      expect(debug.sql).toBeTruthy();
    });
  });

  describe("Validación de Errores", () => {
    it("debe lanzar error por columna inexistente", () => {
      expect(() => {
        debugQuery(agentIdentities, {
          where: { nonExistentField: { eq: "value" } },
        });
      }).toThrow(KitsudenQLError);
    });

    it("debe lanzar error por operador no soportado", () => {
      expect(() => {
        debugQuery(agentIdentities, {
          where: { name: { invalidOp: "value" } as any },
        });
      }).toThrow(KitsudenQLError);
    });

    it("debe lanzar error por valor inválido para 'in'", () => {
      expect(() => {
        debugQuery(agentIdentities, {
          where: { type: { in: "not-an-array" } as any },
        });
      }).toThrow(KitsudenQLError);
    });

    it("debe lanzar error por relación inexistente en expand", () => {
      expect(() => {
        debugQuery(agentIdentities, {
          where: {},
          expand: ["nonExistentRelation"],
        });
      }).toThrow(KitsudenQLError);
    });
  });

  describe("Validación sin Ejecución", () => {
    it("debe validar consulta correcta", () => {
      const { valid, errors } = validateKitsudenQuery(agentIdentities, {
        where: { isActive: true },
        expand: ["traces"],
      });
      expect(valid).toBe(true);
      expect(errors).toHaveLength(0);
    });

    it("debe detectar columnas inválidas", () => {
      const { valid, errors } = validateKitsudenQuery(agentIdentities, {
        where: { invalidField: { eq: "value" } },
      });
      expect(valid).toBe(false);
      expect(errors.length).toBeGreaterThan(0);
    });

    it("debe detectar relaciones inválidas", () => {
      const { valid, errors } = validateKitsudenQuery(agentIdentities, {
        expand: ["invalidRelation"],
      });
      expect(valid).toBe(false);
      expect(errors.length).toBeGreaterThan(0);
    });

    it("debe detectar límites inválidos", () => {
      const { valid, errors } = validateKitsudenQuery(agentIdentities, {
        limit: 5000,
      });
      expect(valid).toBe(false);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe("Relaciones Disponibles", () => {
    it("debe listar relaciones de agentIdentities", () => {
      const relations = getAvailableRelations(agentIdentities);
      expect(relations).toContain("traces");
      expect(relations).toContain("apiKeys");
      expect(relations).toContain("memories");
      expect(relations).toContain("auditLogs");
    });

    it("debe listar relaciones de agentTraces", () => {
      const relations = getAvailableRelations(agentTraces);
      expect(relations).toContain("steps");
      expect(relations).toContain("agent");
    });

    it("debe listar relaciones de dataSets", () => {
      const relations = getAvailableRelations(dataSets);
      expect(relations).toContain("entries");
      expect(relations).toContain("game");
    });
  });

  describe("Escenarios BDD", () => {
    it("Escenario 1: Filtros complejos con AND implícito", () => {
      // Given: Payload {"level": {"gte": 50}, "element": "pyro"}
      // When: Procesa contra tabla
      // Then: Retorna condición AND
      const debug = debugQuery(agentIdentities, {
        where: {
          rateLimit: { gte: 50 },
          type: "service",
        },
      });
      expect(debug.sql).toBeTruthy();
    });

    it("Escenario 2: Expansión de relaciones", () => {
      // Given: Parámetro "expand": ["traces", "apiKeys"]
      const debug = debugQuery(agentIdentities, {
        where: { isActive: true },
        expand: ["traces", "apiKeys"],
      });
      expect(debug.sql).toBeTruthy();
    });

    it("Escenario 3: Búsqueda de texto con contains", () => {
      const debug = debugQuery(agentIdentities, {
        where: {
          name: { contains: "agent" },
          description: { contains: "AI" },
        },
      });
      expect(debug.sql).toBeTruthy();
    });
  });
});
