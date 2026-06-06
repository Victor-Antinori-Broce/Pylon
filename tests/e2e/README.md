# 🎯 E2E Tests: MCP + Vector Search Integration

Integration tests validating the complete flow from Claude Desktop through MCP to Vector Search.

## 📁 Structure

```
tests/e2e/
├── mcp-vector-search.e2e.spec.ts   # Main test suite
├── playwright.e2e.config.ts        # Playwright config
├── global-setup.ts                 # Start API, seed data
├── global-teardown.ts              # Cleanup
└── README.md                       # This file
```

## 🔧 Prerequisites

```bash
# 1. PostgreSQL running
# 2. API dependencies installed
cd apps/api && bun install

# 3. Environment variables
export DATABASE_URL="postgresql://..."
export API_URL="http://localhost:3001"
export TEST_MCP_TOKEN="grm_agent_..."  # From seed script
```

## ▶️ Running Tests

```bash
# Start database and API
docker compose up -d postgres
bun run apps/api/src/index.ts

# Seed test data (creates DevBot agent with token)
bun run apps/api/scripts/seed-mcp-test.ts

# Run E2E tests
cd tests/e2e
npx playwright test --config=playwright.e2e.config.ts

# Or with environment
TEST_MCP_TOKEN=grm_agent_xxx npx playwright test
```

## 📋 Test Scenarios

### Scenario 1: Semantic FAQ Search

- Claude asks natural language questions
- MCP routes to `gremius_search_entries`
- Vector search finds semantically similar entries
- Results returned to Claude

### Scenario 2: Vector Index Status

- Claude checks dataset configuration
- Verifies vector search is enabled

### Scenario 3: Add & Search Knowledge

- Claude creates new FAQ entry via MCP
- Entry automatically indexed (autoIndex: true)
- Claude searches and finds new entry

### Scenario 4: Error Handling

- Invalid dataset ID
- Empty queries
- Missing authentication

## 🔐 Security Tests

- Token validation (401 on missing token)
- Scope verification (403 on insufficient scopes)
- Session isolation (no cross-session access)

## 📝 Environment Variables

| Variable         | Description           | Default                 |
| ---------------- | --------------------- | ----------------------- |
| `API_URL`        | Base URL for API      | `http://localhost:3001` |
| `DATABASE_URL`   | PostgreSQL connection | -                       |
| `TEST_MCP_TOKEN` | Agent token from seed | -                       |
| `SKIP_SEED`      | Skip seed script      | `false`                 |
