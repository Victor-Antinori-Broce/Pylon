# 🧪 MCP + Vector Search Tests Documentation

## 📋 Overview

Complete test suite for MCP (Model Context Protocol) and Vector Search integration in Kitsuden CMS.

## 📁 Test Structure

```
tests/
├── e2e/                              # End-to-End Tests (Playwright)
│   ├── mcp-vector-search.e2e.spec.ts  # Main E2E scenarios
│   ├── playwright.e2e.config.ts       # Playwright configuration
│   ├── global-setup.ts                # API startup + seed
│   ├── global-teardown.ts             # Cleanup
│   └── README.md                      # E2E test docs
├── unit/                             # Unit Tests (Vitest)
│   ├── vector-search.test.ts          # Vector search logic
│   ├── mcp-server.test.ts             # MCP protocol
│   ├── agent-auth.test.ts             # Authentication & RBAC
│   ├── vitest.config.ts               # Vitest configuration
│   └── setup.ts                       # Test setup
└── MCP_VECTOR_SEARCH_TESTS.md         # This file
```

## 🎯 Test Coverage

### End-to-End Tests

| Scenario                   | Description                                                              |
| -------------------------- | ------------------------------------------------------------------------ |
| **Semantic FAQ Search**    | Claude asks natural questions, MCP routes, vector search returns results |
| **Vector Index Status**    | Claude checks dataset vector search configuration                        |
| **Add & Search Knowledge** | Claude creates entry, auto-indexed, then searches                        |
| **Error Handling**         | Invalid dataset ID, empty queries, missing auth                          |
| **Security**               | Token validation, scope verification, session isolation                  |

### Unit Tests

| Module            | Tests                                                           |
| ----------------- | --------------------------------------------------------------- |
| **Vector Search** | Extension config, query options, chunking, vector operations    |
| **MCP Server**    | JSON-RPC validation, tool definitions, response formatting      |
| **Agent Auth**    | Token format, scope validation, wildcard scopes, identity types |

## 🚀 Running Tests

### Prerequisites

```bash
# Environment variables
export DATABASE_URL="postgresql://..."
export API_URL="http://localhost:3001"
export TEST_MCP_TOKEN="kitsuden_agent_..."  # From seed script
```

### Run All Tests

```bash
# E2E tests
pnpm run test:e2e:mcp

# Unit tests
pnpm run test:unit

# Unit tests with coverage
pnpm run test:unit:coverage

# Interactive mode
pnpm run test:e2e:mcp:ui
pnpm run test:unit:watch
```

### Setup Before Tests

```bash
# 1. Start infrastructure
docker compose up -d postgres

# 2. Seed test data
pnpm run seed:mcp

# 3. Run tests
pnpm run test:e2e:mcp
```

## 🔑 Test Data

The seed script (`apps/api/scripts/seed-mcp-test.ts`) creates:

- **Agent Identity**: `DevBot` (type: `claude-desktop`)
- **Scopes**: `["read:issues", "write:intake"]`
- **Token**: `kitsuden_agent_claude-desktop_XUNgpwuKoeB52UYHPoEdXQlgSkKtFZ0LNgll-jQCm2g`

## 📊 Test Scenarios Details

### Scenario 1: Semantic FAQ Search

```
Claude: "How do I change my password?"
   ↓
MCP: tools/call kitsuden_search_entries
   ↓
Vector Search: semantic query → returns password FAQ
   ↓
Claude receives relevant answer
```

### Scenario 2: Vector Index Status Check

```
Claude: "What fields are indexed?"
   ↓
MCP: tools/call kitsuden_get_dataset_schema
   ↓
Returns: { vectorSearch: { enabled: true, fields: [...] } }
```

### Scenario 3: Add Knowledge

```
Claude: Create new FAQ entry
   ↓
MCP: tools/call kitsuden_create_entry
   ↓
Auto-indexed (autoIndex: true)
   ↓
Claude searches for it
   ↓
Found in search results
```

### Scenario 4: Error Handling

```
- Invalid dataset ID → 404
- Empty query → 400 validation error
- Missing token → 401
- Invalid scope → 403
```

## 🔐 Security Test Cases

| Case                       | Expected |
| -------------------------- | -------- |
| No Authorization header    | 401      |
| Invalid token format       | 401      |
| Expired token              | 401      |
| Valid token, missing scope | 403      |
| Cross-session access       | 403      |

## 🛠️ Configuration

### Playwright (E2E)

```typescript
// tests/e2e/playwright.e2e.config.ts
{
  workers: 1,           // Sequential (MCP session stateful)
  timeout: 120_000,     // 2 minutes
  expect: { timeout: 10_000 }
}
```

### Vitest (Unit)

```typescript
// tests/unit/vitest.config.ts
{
  environment: "node",
  globals: true,
  coverage: { reporter: ["text", "json", "html"] }
}
```

## 📝 New npm Scripts

```json
{
  "test:e2e:mcp": "Playwright MCP E2E tests",
  "test:e2e:mcp:ui": "Interactive E2E mode",
  "test:unit": "Vitest unit tests",
  "test:unit:watch": "Watch mode",
  "test:unit:coverage": "With coverage report",
  "seed:mcp": "Seed MCP test data"
}
```

## ✅ Verification Checklist

- [ ] E2E: Create dataset with vector search enabled
- [ ] E2E: Seed FAQ entries
- [ ] E2E: Establish MCP session
- [ ] E2E: Execute search via MCP tools
- [ ] E2E: Verify semantic results
- [ ] Unit: Vector search configuration validation
- [ ] Unit: MCP protocol compliance
- [ ] Unit: RBAC scope checking
- [ ] Unit: Token format validation
- [ ] Security: Authentication rejection
- [ ] Security: Authorization rejection

## 🐛 Troubleshooting

### "Database connection refused"

```bash
docker compose up -d postgres
```

### "API not running"

```bash
cd apps/api && bun run dev
```

### "Token invalid"

```bash
# Re-run seed to generate new token
pnpm run seed:mcp
```

### "Port already in use"

```bash
# Kill existing processes
npx kill-port 3001
```
