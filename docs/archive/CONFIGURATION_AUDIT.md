# Kitsuden Configuration Audit

**Date:** 2026-03-07

## Summary

Comprehensive audit and cleanup of hardcoded configuration values to ensure proper use of environment variables and coding best practices.

## Changes Made

### 1. Port Configuration (3001 → 3000)

All references to the old port `3001` have been updated to `3000` to match the default API port:

| File                                         | Change                                                  |
| -------------------------------------------- | ------------------------------------------------------- |
| `.env`                                       | `API_PORT=3000`, `PUBLIC_API_URL=http://localhost:3000` |
| `apps/api/src/lib/config.ts`                 | Default PORT changed from 3001 to 3000                  |
| `apps/api/src/lib/config.ts`                 | Default BETTER_AUTH_URL changed from 3001 to 3000       |
| `apps/api/src/index.ts`                      | Swagger server URL uses env var                         |
| `packages/admin/.env`                        | Created with `VITE_API_URL=http://localhost:3000`       |
| `packages/admin/src/lib/auth-client.ts`      | baseURL uses 3000                                       |
| `packages/admin/src/routes/mcp/+page.svelte` | MCP URL uses env var                                    |

### 2. Admin Panel Files (16 files updated)

All files in `packages/admin/src/` now use `import.meta.env.VITE_API_URL || "http://localhost:3000"`:

- `lib/api.ts`
- `lib/auth.svelte.ts`
- `lib/theme.svelte.ts`
- `lib/registerDefaultWidgets.ts`
- `lib/states/modules.svelte.ts`
- `lib/states/datasets.svelte.ts`
- `lib/states/datasets.svelte.test.ts`
- `lib/components/layout/SidebarLayout.svelte`
- `lib/components/forms/DynamicForm.svelte`
- `lib/components/forms/RelationshipField.svelte`
- `views/auth/SetupView.svelte`
- `views/data/DataExplorer.svelte`
- `views/DataSetEntries.svelte`
- `views/Media.svelte`
- `views/Grimoires/GrimoiresView.svelte`
- `views/Settings.svelte`
- `views/workers/WorkersView.svelte`
- `views/webhooks/WebhooksView.svelte`

### 3. Test Files (11 files updated)

All test files now use environment variables with sensible defaults:

| File                                    | Change                                                 |
| --------------------------------------- | ------------------------------------------------------ |
| `tests/seed.spec.ts`                    | Uses `process.env.ADMIN_URL` and `process.env.API_URL` |
| `tests/api/endpoints.spec.ts`           | Uses `process.env.API_URL`                             |
| `tests/api/kitsuden.spec.ts`            | Uses `process.env.API_URL`                             |
| `tests/api/mcp.spec.ts`                 | Uses `process.env.API_URL`                             |
| `tests/api/promote.spec.ts`             | Uses `process.env.API_URL`                             |
| `tests/api/webhooks.spec.ts`            | Uses `process.env.API_URL`                             |
| `tests/api/connectors.spec.ts`          | Uses `process.env.API_URL`                             |
| `tests/auth/login.spec.ts`              | Uses `process.env.ADMIN_URL`                           |
| `tests/formulas/formula-editor.spec.ts` | Uses `process.env.ADMIN_URL`                           |
| `tests/modules/modules-page.spec.ts`    | Uses `process.env.ADMIN_URL`                           |
| `tests/navigation/sidebar.spec.ts`      | Uses `process.env.ADMIN_URL`                           |
| `packages/admin/src/lib/api.test.ts`    | Uses default API_URL = 3000                            |

### 4. API Test Scripts (2 files updated)

| File                               | Change                                  |
| ---------------------------------- | --------------------------------------- |
| `apps/api/test-api.ts`             | Uses `process.env.API_URL`              |
| `apps/api/test-kons-api.ts`        | Uses `process.env.API_URL`              |
| `apps/api/tests.json`              | WebSocket endpoint updated to port 3000 |
| `apps/api/docs/RLS_SETUP_GUIDE.md` | Documentation updated                   |

### 5. SDK and Starters (2 files updated)

| File                                                      | Change                             |
| --------------------------------------------------------- | ---------------------------------- |
| `packages/sdk/src/realtime.ts`                            | Uses `process.env.KITSUDEN_WS_URL` |
| `packages/starters/kitsuden-blog-template/src/lib/cms.ts` | Uses port 3000 as default          |

### 6. Cleanup

Removed temporary files with hardcoded values:

- `tmp_mcp_test.ts`
- `tmp_mcp_test2.ts`
- `api_logs.txt`
- `apps/api/progress.txt`

## Best Practices Implemented

### 1. Environment Variable Priority

All configuration values follow this priority:

1. Environment variable (e.g., `process.env.API_URL`)
2. Default value for development (e.g., `"http://localhost:3000"`)

### 2. Type-Safe Configuration

The `apps/api/src/lib/config.ts` uses Zod schema validation:

- Validates all env vars at startup
- Provides clear error messages
- Sets sensible defaults for development

### 3. Separation of Concerns

- `.env` - Production secrets and configuration
- `.env.example` - Template with documentation
- `packages/admin/.env` - Frontend-specific variables

### 4. CORS Configuration

CORS origins are now configurable via `ALLOWED_ORIGINS` env var:

```javascript
ALLOWED_ORIGINS: "http://localhost:4321,http://localhost:5173";
```

## Environment Variables Reference

### Required Variables

- `DATABASE_URL` - PostgreSQL connection string
- `S3_ACCESS_KEY` - S3/MinIO access key
- `S3_SECRET_KEY` - S3/MinIO secret key
- `BETTER_AUTH_SECRET` - Auth secret (min 32 chars in production)

### Optional Variables with Defaults

| Variable         | Default                | Description       |
| ---------------- | ---------------------- | ----------------- |
| `API_PORT`       | 3000                   | API server port   |
| `ADMIN_URL`      | http://localhost:5173  | Admin panel URL   |
| `WEB_URL`        | http://localhost:4321  | Web frontend URL  |
| `PUBLIC_API_URL` | http://localhost:3000  | Public API URL    |
| `REDIS_URL`      | redis://localhost:6379 | Redis/Valkey URL  |
| `S3_ENDPOINT`    | http://localhost:9000  | S3/MinIO endpoint |
| `LOG_LEVEL`      | info                   | Logging level     |

## Testing with Custom Ports

To run tests against a different port:

```bash
# Set environment variables
export API_URL=http://localhost:3001
export ADMIN_URL=http://localhost:5173

# Run tests
pnpm test
```

## Docker Configuration

Docker Compose uses environment variables from `.env`:

```yaml
ports:
  - "${API_PORT:-3000}:3000"
environment:
  - BETTER_AUTH_URL=${BETTER_AUTH_URL:-http://localhost:3000}
```

## Verification

To verify all hardcoded values have been updated:

```bash
# Search for any remaining hardcoded 3001 references
grep -r "localhost:3001" --include="*.ts" --include="*.js" --include="*.svelte" apps/ packages/ tests/

# Should return no results (or only in comments/documentation)
```

## Security Notes

1. **Never commit `.env` files** - They are in `.gitignore` for a reason
2. **Use strong secrets in production** - `BETTER_AUTH_SECRET` should be 32+ random characters
3. **Restrict CORS origins** - Only allow trusted domains in production
4. **Use HTTPS in production** - All URLs should use `https://` in production

## Future Improvements

1. Consider using a configuration service like AWS Secrets Manager for production
2. Add environment-specific config files (`.env.production`, `.env.staging`)
3. Implement runtime config validation with detailed error messages
4. Add health checks that verify all required env vars are set
