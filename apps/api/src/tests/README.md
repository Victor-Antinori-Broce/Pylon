# Kitsuden API Tests

## Test Suites

### 1. Kon Registry Tests (`modules.test.ts`)

Tests for the kon registry system.

- ✅ Registry structure validation
- ✅ Category classification
- ✅ Dependency tracking
- ✅ Icon and color validation
- **Status:** Passing (26 tests)
- **Requires DB:** No

### 2. Auth Module Tests (`auth.test.ts`)

Tests for authentication and authorization.

- User registration
- User login
- Session management
- API key authentication
- **Status:** Ready (requires PostgreSQL)
- **Requires DB:** Yes

### 3. Datasets Module Tests (`datasets.test.ts`)

Tests for dataset CRUD operations.

- Dataset creation
- Entry management
- Schema validation
- Concurrent operations
- **Status:** Ready (requires PostgreSQL)
- **Requires DB:** Yes

### 4. Row Level Security Tests (`rls.test.ts`)

Tests for RLS context and tenant isolation.

- RLS context variables
- Data isolation
- RLS policies
- Transaction context
- **Status:** Ready (requires PostgreSQL)
- **Requires DB:** Yes

## Running Tests

### Run all tests

```bash
cd apps/api
bun test
```

### Run specific test suite

```bash
bun test src/tests/modules.test.ts    # No DB required
bun test src/tests/auth.test.ts       # Requires DB
bun test src/tests/datasets.test.ts   # Requires DB
bun test src/tests/rls.test.ts        # Requires DB
```

### Run with coverage

```bash
bun test --coverage
```

## Database Setup for Tests

Tests that require database need:

1. PostgreSQL with pgvector running
2. Test database created
3. Environment variables set

### Quick Setup

```bash
# Start PostgreSQL with Docker
docker run -d \
  --name kitsuden-test-db \
  -e POSTGRES_USER=kitsuden \
  -e POSTGRES_PASSWORD=changeme \\
  -e POSTGRES_DB=kitsuden_test \
  -p 5433:5432 \
  pgvector/pgvector:pg16

# Set environment
export DATABASE_URL="postgres://kitsuden:changeme@localhost:5433/kitsuden_test"

# Run migrations
bun run db:migrate

# Run tests
bun test
```

### Environment Variables

```env
# .env.test
DATABASE_URL=postgres://kitsuden:changeme@localhost:5433/kitsuden_test
REDIS_URL=redis://localhost:6380
NODE_ENV=test
BETTER_AUTH_SECRET=change-me-to-a-random-string-at-least-32-chars
```

## Test Coverage

| Module       | Tests  | Coverage | DB Required |
| ------------ | ------ | -------- | ----------- |
| Kon Registry | 26     | ✅ 100%  | No          |
| Auth         | 12     | ⚠️ Ready | Yes         |
| Datasets     | 15     | ⚠️ Ready | Yes         |
| RLS          | 10     | ⚠️ Ready | Yes         |
| **Total**    | **63** | **~25%** | Partial     |

## Recent Additions

A focused test pass added coverage for core files that previously had 0% or very low line coverage:

- `src/tests-unit/logger.test.ts` — logger helpers (`createRequestLogger`, `createPerformanceLogger`, `logQuery`, `logSecurity`)
- `src/tests-unit/storage.test.ts` — S3/MinIO operations with mocked AWS SDK
- `src/tests-unit/config.test.ts` — config exports, feature flags, rate-limit and CORS configs
- `src/tests-unit/transactional-rls.test.ts` — RLS context utilities and middleware helpers
- `src/tests-unit/module-loader-unit.test.ts` — `createKonContext`, kon type guards, dependency sort
- `src/tests-unit/crud-routes.test.ts` — inline `dataSetsRoutes` handlers (GET/POST datasets and entries)
- `src/tests-unit/system-routes.test.ts` — inline `systemRoutes` handlers (theme activation, grimoire-state, grimoire deletion)
- `src/tests/system-routes-http.test.ts` — integration smoke tests for authenticated system routes (skips when DB unavailable)

These tests follow the existing `describe`/`it`/`expect` Bun style and reuse the mock patterns from the rest of the suite.

## Future Test Additions

### Priority 1

- [x] Middleware tests (auth-guard, transactional-rls)
- [x] API endpoint integration tests
- [x] Cache layer tests
- [ ] Queue/Worker tests

### Priority 2

- [ ] Kon loader tests
- [ ] MCP server tests
- [ ] Real-time/WebSocket tests
- [ ] File upload tests

### Priority 3

- [ ] Performance benchmarks
- [ ] Load tests
- [ ] End-to-end API tests
