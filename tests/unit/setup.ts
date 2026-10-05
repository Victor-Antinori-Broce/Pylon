// @ts-nocheck
// Vitest Setup File
// Runs before all unit tests

import { vi } from "vitest";

import { instalarGuardiaWhere } from "./guard-drizzle-where";

// Segunda llamada a `.where()` sobre el mismo builder de Drizzle → lanza.
// Complementa al guardián de texto: éste no tiene agujeros de forma, pero solo
// ve los caminos que las pruebas ejecutan. Ver guard-drizzle-where.ts.
instalarGuardiaWhere();

// Mock environment variables
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";

// Global mocks
global.fetch = vi.fn();

// Cleanup after each test
// (handled by Vitest's isolate option)
