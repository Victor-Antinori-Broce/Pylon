# Port Configuration Audit Report

**Date**: 2026-03-15  
**Status**: ⚠️ **INCONSISTENCIES FOUND**

---

## Summary of Issues

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 Critical | 4 | Port mismatches that will cause connection failures |
| 🟡 Warning | 3 | Inconsistent defaults across files |
| 🟢 Info | 2 | Minor documentation mismatches |

---

## 1. API Server Port (CRITICAL)

### Current Configuration

| File | Port | Context |
|------|------|---------|
| `apps/api/.env` | **3001** | `PORT=3001` |
| `apps/api/src/index.ts` | **3001** | `process.env.PORT \|\| 3001` |
| `apps/api/src/lib/config.ts` | **3001** | `PORT: default("3001")` |
| `packages/admin/.env` | **3001** | `VITE_API_URL=http://localhost:3001` |

### 🔴 INCONSISTENT Configuration

| File | Port | Context |
|------|------|---------|
| `.env` (root) | **3000** | `API_PORT=3000` |
| `docker-compose.yml` | **3000** | `PORT=3000`, `${API_PORT:-3000}:3000` |
| `packages/cli/src/commands/init.ts` | **3000** | `API_PORT:-3000:3000` |
| `README.md` | **3000** | Documentation says API at :3000 |
| `START-GUIDE.md` | **3000** | Documentation says API at :3000 |
| `docker-compose.yml` | **3000** | `BETTER_AUTH_URL=http://localhost:3000` |

### Impact
- Running `./start` or `docker-compose up` will start API on :3000
- But admin panel expects API on :3001
- **Result**: Connection failures between admin and API

### Recommended Fix
```bash
# Option A: Change root .env to match actual API port
API_PORT=3001

# Option B: Change apps/api/.env to match docker default
PORT=3000

# Option C: Update all docker configurations to use 3001
# (Recommended - 3001 is the actual working port)
```

---

## 2. Admin Panel Port (WARNING)

### Current Configuration

| File | Port | Context |
|------|------|---------|
| `.env` (root) | **5173** | `ADMIN_URL=http://localhost:5173`, `ADMIN_PORT=5173` |
| `apps/api/.env` | **5173** | `ADMIN_URL=http://localhost:5173` |
| `packages/cli/src/commands/init.ts` | **5173** | `${ADMIN_PORT:-5173}:80` (in nginx) |

### 🔴 INCONSISTENT Configuration

| File | Port | Context |
|------|------|---------|
| `docker-compose.yml` | **3001** | `${ADMIN_PORT:-3001}:80` |

### Impact
- Docker uses :3001 as default for admin, but env files use :5173
- If ADMIN_PORT is not set, docker maps :3001 but app expects :5173

### Recommended Fix
```yaml
# docker-compose.yml line 162
- "${ADMIN_PORT:-5173}:80"
```

---

## 3. Database Port (CRITICAL)

### Current Configuration

| File | Port | Context |
|------|------|---------|
| `apps/api/.env` | **5432** | `DATABASE_URL=...localhost:5432/...` |
| `apps/api/src/db/index.ts` | **5432** | Hardcoded fallback |
| `docker-compose.dev.yml` | **5432** | `${POSTGRES_PORT:-5432}:5432` |
| `docker-compose.yml` | **5432** | `${DB_PORT:-5432}:5432` |

### 🔴 INCONSISTENT Configuration

| File | Port | Context |
|------|------|---------|
| `.env` (root) | **5433** | `DATABASE_URL=...localhost:5433/...` |
| `apps/api/src/tests/setup.ts` | **5433** | Test database on :5433 |
| `apps/api/src/tests/README.md` | **5433** | Test instructions |

### Impact
- Root `.env` points to :5433, but docker exposes :5432
- API `.env` correctly uses :5432
- **Result**: If using root .env, API won't connect to database

### Recommended Fix
```bash
# .env (root) - Change from 5433 to 5432
DATABASE_URL=postgres://gremius:gremius_dev_2025@localhost:5432/gremiuscms
```

---

## 4. Valkey/Redis Port (CRITICAL)

### Current Configuration

| File | Port | Context |
|------|------|---------|
| `apps/api/.env` | **6379** | `REDIS_URL=redis://localhost:6379` |
| `apps/api/src/lib/config.ts` | **6379** | `REDIS_URL: default("redis://localhost:6379")` |
| `apps/api/src/lib/valkey.ts` | **6379** | Hardcoded fallback |
| `docker-compose.dev.yml` | **6379** | `${VALKEY_PORT:-6379}:6379` |
| `docker-compose.yml` | **6379** | `${VALKEY_PORT:-6379}:6379` |

### 🔴 INCONSISTENT Configuration

| File | Port | Context |
|------|------|---------|
| `.env` (root) | **6381** | `VALKEY_URL=redis://localhost:6381` |

### Impact
- Root `.env` uses :6381, but docker exposes :6379
- API `.env` correctly uses :6379
- **Result**: If using root .env, API won't connect to Valkey

### Recommended Fix
```bash
# .env (root) - Change from 6381 to 6379
VALKEY_URL=redis://localhost:6379
```

---

## 5. MCP Server Port

### Current Configuration

| File | Port | Context |
|------|------|---------|
| `packages/mcp-server/src/standalone.ts` | **3002** | `PORT \|\| "3002"` |
| `packages/cli/src/commands/init.ts` | **3002** | `MCP_PORT:-3002:3002` |
| `packages/cli/src/commands/mcp.ts` | **3002** | `options.port \|\| '3002'` |
| `README.md` | **3002** | Documentation |

### Status
✅ **Consistent** - All files use port 3002

---

## 6. Web/Website Port

### Current Configuration

| File | Port | Context |
|------|------|---------|
| `.env` (root) | **4321** | `PUBLIC_SITE_URL=http://localhost:4321`, `WEB_PORT=4321` |
| `packages/starters/gremio-blog-template/.env` | **4321** | `PUBLIC_SITE_URL=http://localhost:4321` |
| `apps/api/src/lib/config.ts` | **3002** | `WEB_URL: default("http://localhost:3002")` |

### 🔴 INCONSISTENT Configuration

| File | Port | Context |
|------|------|---------|
| `docker-compose.yml` | **3002** | Web service conceptually at :3002 |
| `apps/api/src/lib/config.ts` | **3002** | `WEB_URL: default("http://localhost:3002")` |

### Impact
- Root `.env` uses :4321 (Astro default)
- But API config defaults to :3002
- **Result**: CORS issues if web tries to connect to API

### Recommended Fix
```typescript
// apps/api/src/lib/config.ts - Line 36
WEB_URL: z.string().default("http://localhost:4321"), // Change from 3002
```

---

## 7. MinIO Ports

### Current Configuration

| File | Service Port | Console Port |
|------|--------------|--------------|
| `.env` (root) | 9000 | 9001 |
| `apps/api/.env` | 9000 | - |
| `docker-compose.dev.yml` | 9000 | 9001 |
| `docker-compose.yml` | 9000 | 9001 |
| `packages/cli` | 9000 | 9001 |

### Status
✅ **Consistent** - All files use 9000 (API) and 9001 (Console)

---

## 8. WebSocket/Realtime Port

### Current Configuration

| File | Port | Notes |
|------|------|-------|
| `apps/api/tests.json` | **3000** | Multiple WebSocket endpoints at ws://localhost:3000 |
| `packages/sdk/src/realtime.ts` | **3001** | Default `ws://localhost:3001/api/realtime` |
| `apps/api/src/tests/realtime.test.ts` | **3001** | `ws://localhost:3001/api/realtime` |

### Status
⚠️ **Inconsistent** - Some files reference :3000, others :3001

---

## Complete Port Matrix

| Service | Expected Port | Files with Correct Port | Files with Wrong Port |
|---------|---------------|------------------------|----------------------|
| **API Server** | 3001 | apps/api/.env, apps/api/src/index.ts, packages/admin/.env | .env (3000), docker-compose.yml (3000), README.md (3000) |
| **Admin Panel** | 5173 | .env, apps/api/.env, packages/cli | docker-compose.yml (3001 default) |
| **Web/Website** | 4321 | .env, packages/starters | apps/api/src/lib/config.ts (3002) |
| **MCP Server** | 3002 | All files | None |
| **PostgreSQL** | 5432 | apps/api/.env, docker-compose*.yml | .env (5433) |
| **Valkey/Redis** | 6379 | apps/api/.env, docker-compose*.yml | .env (6381) |
| **MinIO API** | 9000 | All files | None |
| **MinIO Console** | 9001 | All files | None |

---

## Critical Fixes Required

### Fix 1: Root .env Database Port
```bash
# .env line 5
DATABASE_URL=postgres://gremius:gremius_dev_2025@localhost:5432/gremiuscms
# Changed from 5433 to 5432
```

### Fix 2: Root .env Valkey Port
```bash
# .env line 14
VALKEY_URL=redis://localhost:6379
# Changed from 6381 to 6379
```

### Fix 3: Root .env API Port Alignment
```bash
# .env line 16
API_PORT=3001
# Changed from 3000 to 3001

# .env line 21
PUBLIC_API_URL=http://localhost:3001
# Changed from 3000 to 3001
```

### Fix 4: docker-compose.yml Admin Port Default
```yaml
# docker-compose.yml line 162
- "${ADMIN_PORT:-5173}:80"
# Changed from 3001 to 5173
```

### Fix 5: API Config Web URL
```typescript
// apps/api/src/lib/config.ts line 36
WEB_URL: z.string().default("http://localhost:4321"),
// Changed from 3002 to 4321
```

---

## Testing After Fixes

```bash
# 1. Start infrastructure
docker-compose -f docker-compose.dev.yml up -d

# 2. Start API
cd apps/api && bun dev  # Should start on :3001

# 3. Start Admin
cd packages/admin && bun dev  # Should start on :5173

# 4. Test connections
curl http://localhost:3001/api/health
curl http://localhost:5173
```

---

**Conclusion**: There are 4 critical port mismatches that will cause connection failures between services. The most critical are the database (5433 vs 5432) and Valkey (6381 vs 6379) ports in the root `.env` file.
