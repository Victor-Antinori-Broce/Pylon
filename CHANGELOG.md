# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Docs: Sección de estado actual en `STABILIZATION_PLAN.md` con métricas reales del proyecto.
- Docs: Nuevo `packages/admin/ROADMAP.md` documentando vistas funcionales, rotas y pendientes para beta.
- Docs: Actualización de `docs/TEST_REPORT.md` con hallazgos críticos de calidad de tests.

### Changed

- STABILIZATION_PLAN.md: Métricas actualizadas (604 tests, TypeScript limpio, builds funcionando).
- Root `package.json`: versiones vacías en `@hono/swagger-ui` y `@hono/zod-openapi` corregidas.
- `.env.example` y `apps/api/.env.example`: puertos alineados a API `3000` para consistencia con Docker y documentación.
- `scripts/test-db-up.ps1` y `scripts/test-db-up.sh`: URL de test corregida para coincidir con `docker-compose.test.yml`.
- `docker-compose.test.yml`: valores de PostgreSQL hardcodeados y puerto cambiado a `5434` para evitar conflictos con instancias locales de PostgreSQL en el host.
- `.env.test`: puerto y contraseña alineados con `docker-compose.test.yml`.
- Root `package.json`: scripts `test:api` y `test:api:all` ahora fuerzan `NODE_ENV=test KITSUDEN_TEST_DB=postgres` y ejecutan migraciones antes de los tests.
- Root `package.json`: `typecheck` ahora usa `NODE_OPTIONS=--max-old-space-size=8192` para evitar OOM en `svelte-check`.

### Fixed

- Docs: Corrección de documentación desfasada respecto al estado real de tests y admin.
- Admin: Configuración de Vitest ahora resuelve `$app/navigation` y `$app/stores` de SvelteKit.
- Admin: Tests de `kon-loader.test.ts` ahora pasan (33/33).
- Admin: Links rotos del dashboard corregidos (`/posts`, `/media`, `/users`, `/blocks` → `/g/kon-*`).
- Admin: Reducidos warnings de accesibilidad en múltiples vistas y componentes.
- Admin: `/data-viewer` protegido detrás de rol `admin`.
- Repo: `bun.lock` eliminado del tracking de git e ignorado.
- Lint/Format: `pnpm lint` y `pnpm format:check` ahora pasan sin errores.
- Tests: Aserciones débiles reescritas en `rls-e2e.test.ts`, `datasets-http.test.ts`, `mcp.test.ts` y `critical-features.test.ts`; ahora verifican valores estrictos en lugar de tipos o rangos de status.
- Tests: `mcp.test.ts` ahora usa un token Agent NHI real con scope `mcp:connect` en lugar de cookies.
- Tests: `critical-features.test.ts` ahora usa rutas correctas (`/health`, `/admin/stats`, etc.) y aserciones estrictas de status/respuesta.
- Tests: `pnpm test:api:all` pasa 225 tests contra PostgreSQL real (migraciones + teardown incluidos).
- Typecheck: `pnpm typecheck` pasa con 0 errores (71 warnings en admin por `css-unknown-at-rule`).

## [0.9.0-beta] - 2026-06-04

### Added

- SDK: Subpath export `@kitsuden/sdk/realtime` with full type definitions
- SDK: `getClientId()` and `getUserId()` getters on `KitsudenRealtime`
- Auth: Migration script `migrate-api-keys-to-agents.ts` for legacy API key migration
- Auth: Deprecation headers (`Deprecation: kitsuden_sk_*; grm_agent_*`) on all legacy API key endpoints

### Changed

- **TypeScript strict mode enabled across the entire monorepo**
  - `apps/api`: `strict: true` (was `false`) — passes `tsc --noEmit` with 0 errors
  - `packages/shared`: strict mode verified clean
  - `packages/mcp-server`: strict mode verified clean
  - `packages/sdk`: strict mode verified clean
  - `packages/cli`: strict mode verified clean
  - `packages/admin`: strict mode verified clean
- SDK: `realtime.ts` — removed `@ts-nocheck`, fully typed with strict mode
- SDK: `tsup.config.ts` — now builds both `index` and `realtime` as separate entries
- SDK: `README.md` — completely rewritten with correct `from()` API, TOON, error handling, and edge runtime examples
- README (root): Updated architecture diagram (`packages/admin` instead of `apps/admin`, Svelte 5 instead of Vue, `packages/grimoires` instead of `packages/themes`)
- Docs: `PUBLISH_GUIDE.md` and `MCP_SDK_AUDIT.md` updated to reflect current SDK version and API
- Docs: AI prompts (`mcp-tools.md`, `claude-system-prompt.md`, `troubleshooting.md`) now recommend Agent NHI (`grm_agent_*`) over deprecated legacy API keys (`kitsuden_sk_*`)
- Auth: Legacy API keys (`kitsuden_sk_*`) now log deprecation warnings on every use
- Docker: `Dockerfile.prod` updated to copy full package directories instead of non-existent `dist/` for packages without build steps

### Fixed

- SDK: TypeScript strict mode now passes (`tsc --noEmit`) for both `index.ts` and `realtime.ts`
- SDK: Build artifacts cleaned from `src/` (`.js`, `.d.ts`, `.map` files)
- Repo: Removed 21 tracked compiled artifacts (`.js`, `.d.ts`) from `src/` directories
- Auth: Unified auth system — Better-Auth (humans) + Agents NHI (machines); legacy API keys deprecated but functional

## [0.7.0-beta] - 2026-03-06

### Added

- Structured logging system with Pino
- Centralized configuration with Zod validation
- Rate limiting middleware (hono-rate-limiter)
- Enhanced health checks with multi-component status
- Request ID tracing for debugging
- Security event logging
- Performance monitoring
- Comprehensive test suite (71 tests)
- ESLint + Prettier configuration
- GitHub Actions CI/CD pipeline
- Pre-commit hooks with Husky

### Changed

- Improved error handling with structured logging
- Migrated to type-safe configuration
- Enhanced health check endpoint with detailed status

### Fixed

- Resolved 60 TypeScript errors (now 0)
- Cleaned 445 legacy files
- All tests passing (71/71)

## [0.6.0] - 2026-02-15

### Added

- Svelte 5 migration complete
- Kon system with 21 kons
- Grimoire Esports bundle
- MCP server for AI agents
- pgvector integration for AI features

## [0.5.0] - 2026-01-20

### Added

- 3-tier architecture (Engine, Core, Kons)
- Row Level Security (RLS) implementation
- Dynamic schema system
- Better Auth integration
- BullMQ queues

[Unreleased]: https://github.com/yourorg/kitsuden/compare/v0.9.0-beta...HEAD
[0.9.0-beta]: https://github.com/yourorg/kitsuden/compare/v0.7.0-beta...v0.9.0-beta
[0.7.0-beta]: https://github.com/yourorg/kitsuden/compare/v0.6.0...v0.7.0-beta
[0.6.0]: https://github.com/yourorg/kitsuden/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/yourorg/kitsuden/releases/tag/v0.5.0
