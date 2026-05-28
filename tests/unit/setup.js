// @ts-nocheck
// Vitest Setup File
// Runs before all unit tests
import { vi } from "vitest";
// Mock environment variables
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";
// Global mocks
global.fetch = vi.fn();
// Cleanup after each test
// (handled by Vitest's isolate option)
//# sourceMappingURL=setup.js.map