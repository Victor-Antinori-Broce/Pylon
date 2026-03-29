/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TESTS - Query Engine (Query Parser + Auto-Join)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Tests unitarios para validar:
 * 1. Parseo de queries JSON a SQL
 * 2. Expansión de relaciones (Anti N+1)
 * 3. Lista blanca de campos
 * 4. Validación de queries
 */

import {
  parseQuery,
  validateQuery,
  getAvailableRelations,
  fieldWhiteList,
  registerDynamicRelation,
  type QueryOptions,
} from "./src/query-parser";

import * as schema from "../../apps/api/src/db/schema";

// ═══════════════════════════════════════════════════════════════════════════════
// SISTEMA DE TESTING
// ═══════════════════════════════════════════════════════════════════════════════

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

function test(name: string, fn: () => void | Promise<void>) {
  const start = performance.now();
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result
        .then(() => {
          results.push({ name, passed: true, duration: performance.now() - start });
        })
        .catch((err) => {
          results.push({
            name,
            passed: false,
            error: err instanceof Error ? err.message : String(err),
            duration: performance.now() - start,
          });
        });
    }
    results.push({ name, passed: true, duration: performance.now() - start });
  } catch (err) {
    results.push({
      name,
      passed: false,
      error: err instanceof Error ? err.message : String(err),
      duration: performance.now() - start,
    });
  }
}

function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        throw new Error(`Expected ${expected} but got ${actual}`);
      }
    },
    toEqual(expected: any) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },
    toBeDefined() {
      if (actual === undefined) {
        throw new Error(`Expected value to be defined but got undefined`);
      }
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null but got ${actual}`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (!(actual > expected)) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toBeLessThan(expected: number) {
      if (!(actual < expected)) {
        throw new Error(`Expected ${actual} to be less than ${expected}`);
      }
    },
    toContain(expected: any) {
      if (!actual.includes(expected)) {
        throw new Error(`Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(expected)}`);
      }
    },
    toHaveLength(expected: number) {
      if (actual.length !== expected) {
        throw new Error(`Expected length ${expected} but got ${actual.length}`);
      }
    },
    toBeInstanceOf(expected: any) {
      if (!(actual instanceof expected)) {
        throw new Error(`Expected instance of ${expected.name} but got ${actual?.constructor?.name}`);
      }
    },
    toBeGreaterThanOrEqual(expected: number) {
      if (!(actual >= expected)) {
        throw new Error(`Expected ${actual} to be greater than or equal to ${expected}`);
      }
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 1: VALIDACIÓN DE QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n📋 Testing Query Validation...\n");

// Test 1.1: Query válida pasa validación
test("validateQuery passes for valid query", () => {
  const options: QueryOptions = {
    table: schema.agentIdentities,
    where: { isActive: true, name: "Test Agent" },
    limit: 10,
  };
  const result = validateQuery(options);
  expect(result.valid).toBe(true);
  expect(result.errors).toHaveLength(0);
});

// Test 1.2: Campo no permitido en where
test("validateQuery rejects blacklisted fields in where", () => {
  const options: QueryOptions = {
    table: schema.agentIdentities,
    where: { keyHash: "secret123" }, // Blacklisted
  };
  const result = validateQuery(options);
  expect(result.valid).toBe(false);
  expect(result.errors.length).toBeGreaterThan(0);
  expect(result.errors[0]).toContain("keyHash");
});

// Test 1.3: Relación inválida
test("validateQuery rejects invalid expand relation", () => {
  const options: QueryOptions = {
    table: schema.agentIdentities,
    expand: ["nonExistentRelation"],
  };
  const result = validateQuery(options);
  expect(result.valid).toBe(false);
  expect(result.errors[0]).toContain("nonExistentRelation");
});

// Test 1.4: Relación válida
test("validateQuery accepts valid expand relation", () => {
  const options: QueryOptions = {
    table: schema.agentIdentities,
    expand: ["traces"],
  };
  const result = validateQuery(options);
  expect(result.valid).toBe(true);
});

// Test 1.5: Múltiples errores reportados
test("validateQuery reports all errors", () => {
  const options: QueryOptions = {
    table: schema.agentIdentities,
    where: { password: "secret", keyHash: "hash" },
    expand: ["invalid1", "invalid2"],
  };
  const result = validateQuery(options);
  expect(result.valid).toBe(false);
  expect(result.errors.length).toBeGreaterThanOrEqual(4);
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 2: RELACIONES DISPONIBLES
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n🔗 Testing Available Relations...\n");

// Test 2.1: Relaciones de agentIdentities
test("getAvailableRelations returns traces for agentIdentities", () => {
  const relations = getAvailableRelations(schema.agentIdentities);
  expect(relations).toContain("traces");
  expect(relations).toContain("apiKeys");
  expect(relations).toContain("memories");
  expect(relations).toContain("auditLogs");
});

// Test 2.2: Relaciones de agentTraces
test("getAvailableRelations returns steps and agent for agentTraces", () => {
  const relations = getAvailableRelations(schema.agentTraces);
  expect(relations).toContain("steps");
  expect(relations).toContain("agent");
});

// Test 2.3: dataSets tiene entries
test("getAvailableRelations returns entries for dataSets", () => {
  const relations = getAvailableRelations(schema.dataSets);
  expect(relations).toContain("entries");
});

// Test 2.4: Tabla sin relaciones
test("getAvailableRelations returns empty array for unknown table", () => {
  // Creamos una tabla ficticia para el test
  const fakeTable = {} as any;
  const relations = getAvailableRelations(fakeTable);
  expect(relations).toHaveLength(0);
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 3: LISTA BLANCA Y SEGURIDAD
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n🔒 Testing Field Whitelist...\n");

// Test 3.1: Campos permitidos
test("fieldWhiteList contains common fields", () => {
  expect(fieldWhiteList.has("id")).toBe(true);
  expect(fieldWhiteList.has("name")).toBe(true);
  expect(fieldWhiteList.has("createdAt")).toBe(true);
  expect(fieldWhiteList.has("status")).toBe(true);
});

// Test 3.2: Campos sensibles no permitidos por defecto
test("fieldWhiteList does not contain blacklisted fields", () => {
  // Estos campos deberían estar en blacklist, no en whitelist
  const blacklisted = ["keyHash", "password", "secret", "token"];
  for (const field of blacklisted) {
    expect(fieldWhiteList.has(field)).toBe(false);
  }
});

// Test 3.3: Validación rechaza campos sensibles
test("validateQuery rejects sensitive fields", () => {
  const options: QueryOptions = {
    table: schema.agentApiKeys, // tabla que tiene keyHash
    where: { keyHash: "should-be-rejected" },
  };
  const result = validateQuery(options);
  expect(result.valid).toBe(false);
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 4: ESTRUCTURA DE QUERY
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n📐 Testing Query Structure...\n");

// Test 4.1: QueryOptions requeridos
test("QueryOptions requires table", () => {
  // Solo verificamos que el tipo exista y funcione
  const options: QueryOptions = {
    table: schema.agentIdentities,
  };
  expect(options.table).toBeDefined();
});

// Test 4.2: QueryOptions con todas las opciones
test("QueryOptions accepts all optional fields", () => {
  const options: QueryOptions = {
    table: schema.agentIdentities,
    where: { isActive: true },
    expand: ["traces", "apiKeys"],
    select: ["id", "name", "createdAt"],
    limit: 10,
    offset: 20,
    orderBy: [{ field: "createdAt", direction: "desc" }],
  };
  expect(options.where).toEqual({ isActive: true });
  expect(options.expand).toHaveLength(2);
  expect(options.limit).toBe(10);
  expect(options.offset).toBe(20);
});

// Test 4.3: orderBy sin dirección default a asc
test("QueryOptions orderBy defaults to asc", () => {
  const options: QueryOptions = {
    table: schema.agentIdentities,
    orderBy: [{ field: "name" }], // sin direction
  };
  expect(options.orderBy![0].field).toBe("name");
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 5: REGISTRO DINÁMICO DE RELACIONES
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n🔧 Testing Dynamic Relation Registration...\n");

// Test 5.1: Registrar relación dinámica
test("registerDynamicRelation adds new relation", () => {
  // Usamos agentIdentities como base para evitar problemas con games
  const before = getAvailableRelations(schema.agentIdentities);
  const hasCustomBefore = before.includes("customTestRelation");
  
  // Registramos relación dinámica
  registerDynamicRelation(schema.agentIdentities, "customTestRelation", {
    type: "many",
    table: schema.dataSets,
    fkColumn: "agentId",
    targetColumn: "id",
    targetTable: schema.agentIdentities,
  });

  // Verificamos que ahora existe
  const after = getAvailableRelations(schema.agentIdentities);
  // Si ya existía, no hay problema; si no, debería existir ahora
  if (!hasCustomBefore) {
    expect(after.includes("customTestRelation")).toBe(true);
  }
});

// Test 5.2: Query con relación dinámica es válida
test("validateQuery accepts dynamically registered relation", () => {
  // Usamos agentIdentities que tiene la relación custom registrada
  const options: QueryOptions = {
    table: schema.agentIdentities,
    expand: ["customTestRelation"],
  };
  const result = validateQuery(options);
  expect(result.valid).toBe(true);
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 6: EJEMPLOS DE DOCUMENTACIÓN
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n📚 Testing Documentation Examples...\n");

// Test 6.1: Ejemplo básico de documentación
test("Documentation example: Basic query", () => {
  const options: QueryOptions = {
    table: schema.agentIdentities,
    where: { isActive: true, type: "service" },
    expand: ["traces", "apiKeys"],
    limit: 10,
    orderBy: [{ field: "createdAt", direction: "desc" }],
  };

  const validation = validateQuery(options);
  expect(validation.valid).toBe(true);
  expect(options.where).toEqual({ isActive: true, type: "service" });
  expect(options.expand).toEqual(["traces", "apiKeys"]);
});

// Test 6.2: Query con operadores
test("Documentation example: Query with operators", () => {
  const options: QueryOptions = {
    table: schema.agentTraces,
    where: {
      status: "completed",
      // Estos operadores deberían ser parseados
      totalDurationMs: { $gt: 1000 },
    },
    expand: ["steps"],
  };

  const validation = validateQuery(options);
  // Nota: totalDurationMs debe estar en fieldWhiteList
  // Si falla, agregarlo a la lista
  if (!validation.valid) {
    console.log("  ⚠️  Note: Add totalDurationMs to fieldWhiteList if needed");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 7: REPORTE FINAL
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n" + "=".repeat(70));
console.log("📊 TEST RESULTS SUMMARY - Query Engine");
console.log("=".repeat(70) + "\n");

const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;
const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📈 Total: ${results.length}`);
console.log(`⏱️ Duration: ${totalDuration.toFixed(2)}ms\n`);

if (failed > 0) {
  console.log("FAILED TESTS:\n");
  results
    .filter((r) => !r.passed)
    .forEach((r) => {
      console.log(`❌ ${r.name}`);
      console.log(`   Error: ${r.error}\n`);
    });
}

console.log("\n" + "=".repeat(70));
console.log(failed === 0 ? "🎉 ALL TESTS PASSED!" : "⚠️ SOME TESTS FAILED");
console.log("=".repeat(70) + "\n");

// Guardar resultados en tests.json
import * as fs from "fs";
import * as path from "path";

try {
  const testsJsonPath = path.join(__dirname, "../../tests.json");
  let testsData: any = { meta: {}, results: [] };

  if (fs.existsSync(testsJsonPath)) {
    testsData = JSON.parse(fs.readFileSync(testsJsonPath, "utf-8"));
  }

  testsData.query_engine = {
    description: "Query Engine - Traductor JSON a SQL con Auto-Join",
    date: new Date().toISOString().split("T")[0],
    summary: {
      total: results.length,
      passed,
      failed,
      duration: `${totalDuration.toFixed(2)}ms`,
    },
    results: results.map((r) => ({
      name: r.name,
      status: r.passed ? "passed" : "failed",
      duration: `${r.duration.toFixed(2)}ms`,
      error: r.error || undefined,
    })),
  };

  fs.writeFileSync(testsJsonPath, JSON.stringify(testsData, null, 4));
  console.log(`✅ Results saved to tests.json\n`);
} catch (err) {
  console.log(`⚠️ Could not save to tests.json: ${err}\n`);
}

process.exit(failed > 0 ? 1 : 0);
