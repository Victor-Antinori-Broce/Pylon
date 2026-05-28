# CRM Grimoire Tests

This directory contains comprehensive tests for the CRM Grimoire.

## Test Structure

```
tests/
├── vitest.config.ts           # Vitest configuration
├── crm.schema.test.ts         # Schema validation tests (unit)
├── crm.routes.test.ts         # Route tests (unit)
└── crm.integration.spec.ts    # API integration tests (Playwright)
```

## Running Tests

### Unit Tests (Vitest)

```bash
# Run all unit tests
cd packages/grimoires/grimoire-crm
pnpm test

# Run in watch mode
pnpm test:watch

# Run with coverage
pnpm test:coverage
```

### Integration Tests (Playwright)

Requires the API server to be running.

```bash
# Start the API server first
cd apps/api && bun run dev

# Run integration tests (from project root)
npx playwright test packages/grimoires/grimoire-crm/tests/crm.integration.spec.ts

# Or using the package script
cd packages/grimoires/grimoire-crm
pnpm test:integration
```

## Test Coverage

### Unit Tests
- **Schema Tests**: Validates Drizzle table definitions, columns, enums, and relations
- **Routes Tests**: Verifies all API endpoints are properly registered with correct HTTP methods

### Integration Tests
- **Companies API**: CRUD operations, filtering, pagination
- **Contacts API**: CRUD operations, search, company association
- **Pipelines API**: CRUD operations, default stages creation
- **Stages API**: Create, update, delete with WIP limit validation
- **Deals API**: CRUD operations, Kanban board operations, deal movement
- **Activities API**: CRUD operations, completion tracking
- **Dashboard**: Statistics endpoint

## Environment Variables

For integration tests:
- `API_URL`: Base URL for API (default: `http://localhost:3000`)

## Writing New Tests

### Unit Test Example

```typescript
import { describe, it, expect } from "vitest";
import { crmCompanies } from "../crm.schema";

describe("Companies Schema", () => {
  it("should have correct table name", () => {
    expect(crmCompanies._.name).toBe("crm_companies");
  });
});
```

### Integration Test Example

```typescript
import { test, expect } from "@playwright/test";

const API = "http://localhost:3000/api/crm";

test("should create a company", async ({ request }) => {
  const res = await request.post(`${API}/companies`, {
    data: { name: "Test Company" },
  });
  expect(res.status()).toBe(201);
});
```

## Notes

- Unit tests use mocked database and context (no real DB needed)
- Integration tests require a running database and API server
- Integration tests create and clean up their own test data
