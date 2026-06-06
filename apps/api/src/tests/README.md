# GremiusCMS API Tests

## Test Suites

### 1. Grimoire Registry Tests (`modules.test.ts`)

Tests for the grimoire registry system.

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
  --name gremius-test-db \
  -e POSTGRES_USER=gremius \
  -e POSTGRES_PASSWORD=gremiuspassword \
  -e POSTGRES_DB=gremius_test \
  -p 5433:5432 \
  pgvector/pgvector:pg16

# Set environment
export DATABASE_URL="postgres://gremius:gremiuspassword@localhost:5433/gremius_test"

# Run migrations
bun run db:migrate

# Run tests
bun test
```

### Environment Variables

```env
# .env.test
DATABASE_URL=postgres://gremius:gremiuspassword@localhost:5433/gremius_test
REDIS_URL=redis://localhost:6380
NODE_ENV=test
JWT_SECRET=test-secret
```

## Test Coverage

| Module            | Tests  | Coverage | DB Required |
| ----------------- | ------ | -------- | ----------- |
| Grimoire Registry | 26     | ✅ 100%  | No          |
| Auth              | 12     | ⚠️ Ready | Yes         |
| Datasets          | 15     | ⚠️ Ready | Yes         |
| RLS               | 10     | ⚠️ Ready | Yes         |
| **Total**         | **63** | **~25%** | Partial     |

## Future Test Additions

### Priority 1

- [ ] Middleware tests (auth-guard, transactional-rls)
- [ ] API endpoint integration tests
- [ ] Cache layer tests
- [ ] Queue/Worker tests

### Priority 2

- [ ] Grimoire loader tests
- [ ] MCP server tests
- [ ] Real-time/WebSocket tests
- [ ] File upload tests

### Priority 3

- [ ] Performance benchmarks
- [ ] Load tests
- [ ] End-to-end API tests
