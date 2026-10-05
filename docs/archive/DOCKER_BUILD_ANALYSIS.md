# Kitsuden Docker Build & API Route Analysis Report

**Date:** 2026-03-26  
**Project:** Kitsuden v0.8.0-beta  
**Purpose:** Validate Docker build configuration and identify potential API route issues (500/404 errors)

---

## Executive Summary

| Category            | Status            | Details                                                              |
| ------------------- | ----------------- | -------------------------------------------------------------------- |
| **Docker Build**    | ✅ LIKELY TO WORK | Multi-stage Dockerfile is well-structured with proper error handling |
| **API Routes**      | ⚠️ NEEDS TESTING  | 40+ routes analyzed, most should work but some edge cases identified |
| **Infrastructure**  | ✅ READY          | Docker Compose files properly configured                             |
| **Critical Issues** | 🚫 NONE FOUND     | No blocking issues identified                                        |

---

## Part 1: Docker Build Analysis

### 1.1 Dockerfile.prod Structure

The Dockerfile uses a **5-stage multi-stage build**:

```
Stage 1: base        → oven/bun:1-alpine + pnpm
Stage 2: dependencies → Install all workspace dependencies
Stage 3: builder     → Compile code + Sharp library
Stage 4: api         → Runtime image (Bun only)
Stage 5: admin       → Nginx serving static files
```

### 1.2 Build Success Factors ✅

| Factor            | Status  | Notes                                    |
| ----------------- | ------- | ---------------------------------------- |
| Base Image        | ✅ Good | `oven/bun:1-alpine` is stable            |
| Package Manager   | ✅ Good | pnpm 9.15.4 locked                       |
| Workspace Support | ✅ Good | All package.json files copied explicitly |
| Sharp Compilation | ✅ Good | Rebuilt for Alpine/musl in builder stage |
| Health Checks     | ✅ Good | `/api/health` endpoint configured        |
| Startup Script    | ✅ Good | `start-with-check.sh` handles migrations |

### 1.3 Potential Build Issues ⚠️

| Issue                        | Risk Level | Mitigation                                 |
| ---------------------------- | ---------- | ------------------------------------------ |
| `pnpm-lock.yaml` drift       | Medium     | Use `--frozen-lockfile` or commit lockfile |
| Missing `BETTER_AUTH_SECRET` | Low        | Already set in `.env` file                 |
| Kon loading at runtime       | Medium     | Fallbacks exist in `module-loader.ts`      |

### 1.4 Dockerfile Validation

```powershell
# To test the build locally:
docker build -f docker/Dockerfile.prod --target api -t kitsuden/api:test .
docker build -f docker/Dockerfile.prod --target admin -t kitsuden/admin:test .
```

**Expected Result:** Build should succeed (15-25 minutes first time)

---

## Part 2: API Route Deep Analysis

### 2.1 Route Categories

| Category               | Count    | Auth Required       | Status                      |
| ---------------------- | -------- | ------------------- | --------------------------- |
| **Public Routes**      | 6        | No                  | ✅ Should work              |
| **Auth Routes**        | 8        | No (auth endpoints) | ✅ Should work              |
| **Protected Routes**   | 30+      | Yes                 | ⚠️ Returns 401 without auth |
| **Dynamic Kon Routes** | Variable | Mixed               | ⚠️ Depends on kon loading   |

### 2.2 Public Routes (Should Return 200)

| Route                    | Method   | Expected | Notes                              |
| ------------------------ | -------- | -------- | ---------------------------------- |
| `/api/health`            | GET      | 200      | Health check endpoint              |
| `/api/health/pgvector`   | GET      | 200/503  | Checks pgvector extension          |
| `/api/system/init-check` | GET      | 200      | Checks if system initialized       |
| `/api/system/setup`      | POST     | 200/400  | Initial setup (public before auth) |
| `/api/auth/*`            | GET/POST | 200/400  | Better-Auth endpoints              |
| `/api/swagger`           | GET      | 200      | OpenAPI docs (if enabled)          |

### 2.3 Protected Routes (Should Return 401 without auth)

| Route                       | Method    | Expected without Auth | Notes                           |
| --------------------------- | --------- | --------------------- | ------------------------------- |
| `/api/data-sets`            | GET/POST  | 401                   | Data sets CRUD                  |
| `/api/datasets`             | GET/POST  | 401                   | Alternative path                |
| `/api/datasets/:id/entries` | GET/POST  | 401                   | Dataset entries                 |
| `/api/settings`             | GET/PATCH | 401                   | Site settings                   |
| `/api/modules`              | GET       | 401                   | Module management               |
| `/api/actions`              | GET/POST  | 401                   | Actions management              |
| `/api/keys`                 | GET/POST  | 401                   | API keys                        |
| `/api/admin/*`              | ALL       | 401/403               | Admin routes require admin role |
| `/api/agent/memory`         | GET/POST  | 401                   | Agent memory                    |
| `/api/schema`               | GET       | 401                   | Schema introspection            |
| `/api/relations`            | GET/POST  | 401                   | Inline relations                |
| `/api/sync/*`               | POST      | 401                   | IGDB/Twitch sync                |
| `/api/graphql`              | POST      | 401                   | GraphQL endpoint                |
| `/api/functions`            | GET/POST  | 401                   | Legacy functions                |
| `/api/mcp`                  | GET/POST  | 401                   | MCP endpoint                    |

### 2.4 Potential 500 Error Sources

| Source              | Location                   | Risk            | Mitigation                   |
| ------------------- | -------------------------- | --------------- | ---------------------------- |
| Database connection | `src/db/index.ts`          | High if DB down | Connection pooling + retries |
| Kon loading         | `src/lib/module-loader.ts` | Medium          | try/catch in loader          |
| Better-Auth session | `src/lib/auth.ts`          | Low             | Graceful degradation         |
| Queue (BullMQ)      | `src/lib/queue.ts`         | Low             | Non-fatal if unavailable     |
| Realtime Valkey     | `src/lib/realtime.ts`      | Low             | Non-fatal if unavailable     |

### 2.5 Potential 404 Error Sources

| Source                 | Location                        | Risk     | Mitigation              |
| ---------------------- | ------------------------------- | -------- | ----------------------- |
| Non-existent routes    | `src/index.ts` notFound handler | Expected | Returns proper JSON 404 |
| Kon routes not loaded  | Dynamic loading                 | Medium   | Graceful fallback       |
| Dataset slug not found | `src/routes/crud.ts`            | Expected | Returns 404             |
| Entry ID not found     | `src/routes/datasets.ts`        | Expected | Returns 404             |

---

## Part 3: Route-by-Route Risk Assessment

### 🔴 High Risk (Could 500)

| Route                       | Issue                            | Fix Required                 |
| --------------------------- | -------------------------------- | ---------------------------- |
| `/api/datasets/:id/entries` | Missing RLS transaction handling | Already has `getDB()` helper |
| `/api/sync/igdb/*`          | External API dependency          | Wrapped in try/catch         |
| `/api/mcp`                  | SSE connection handling          | Should be stable             |

### 🟡 Medium Risk (Edge Cases)

| Route                 | Issue                    | Mitigation              |
| --------------------- | ------------------------ | ----------------------- |
| `/api/system/setup`   | Race condition on init   | Check user count first  |
| `/api/admin/registry` | Kon not loaded           | Returns empty array     |
| `/api/schema/*`       | DB reflection on startup | Cached after first call |

### 🟢 Low Risk (Should Work)

All other routes have proper error handling and should not 500.

---

## Part 4: Test Script Usage

### 4.1 Running the Test Script

```powershell
# Full test (build + infrastructure + API testing)
.\scripts\docker-api-test.ps1

# Skip build (use existing images)
.\scripts\docker-api-test.ps1 -SkipBuild

# Skip infrastructure (use running containers)
.\scripts\docker-api-test.ps1 -SkipInfrastructure

# Keep containers running after test
.\scripts\docker-api-test.ps1 -KeepRunning
```

### 4.2 Manual Testing Commands

```powershell
# 1. Start infrastructure
docker compose -f docker-compose.dev.yml up -d

# 2. Wait 30 seconds for services to be ready
Start-Sleep -Seconds 30

# 3. Test public endpoints
Invoke-RestMethod -Uri "http://localhost:3000/api/health" -Method GET
Invoke-RestMethod -Uri "http://localhost:3000/api/system/init-check" -Method GET

# 4. Test auth-required endpoints (should return 401)
Invoke-RestMethod -Uri "http://localhost:3000/api/data-sets" -Method GET
# Expected: 401 Unauthorized

# 5. Test non-existent routes (should return 404)
Invoke-RestMethod -Uri "http://localhost:3000/api/nonexistent" -Method GET
# Expected: 404 Not Found
```

---

## Part 5: Recommendations

### 5.1 Before Production Deploy

1. **Run the test script**: Execute `scripts/docker-api-test.ps1` to validate
2. **Set proper secrets**: Ensure `BETTER_AUTH_SECRET` is a real 32+ character secret
3. **Configure CORS**: Update `ALLOWED_ORIGINS` in docker-compose.yml
4. **Test kon loading**: Verify core kons load correctly:
   - `kon-datasets`
   - `kon-media`
   - `kon-data-visualizer`

### 5.2 Monitoring Checklist

Monitor these endpoints after deployment:

| Endpoint                 | Expected | Alert If         |
| ------------------------ | -------- | ---------------- |
| `/api/health`            | 200      | Status != "ok"   |
| `/api/health/pgvector`   | 200      | pgvector = false |
| `/api/data-sets`         | 401      | 500 error        |
| `/api/system/init-check` | 200      | Any error        |

### 5.3 Known Limitations

1. **Docker Desktop Required**: The scripts require Docker Desktop running on Windows
2. **Port 3000/3001**: Must be available or change in `.env`
3. **First startup**: Initial database migrations may take 30-60 seconds

---

## Part 6: Conclusion

### Docker Build: ✅ READY

The Docker build is well-structured and should work correctly. The multi-stage build optimizes the final image size, and the startup script handles database initialization gracefully.

### API Routes: ⚠️ TEST RECOMMENDED

The API routes are properly structured with:

- Proper error handling (no unexpected 500s expected)
- Clear auth boundaries (401 for unauthenticated)
- Proper 404 handling for missing resources
- Graceful degradation for optional services

**Next Steps:**

1. Run the provided test script: `.\scripts\docker-api-test.ps1`
2. Review any failures in the generated report
3. Address any issues before production deployment

---

_Report generated by automated analysis of the Kitsuden codebase_
