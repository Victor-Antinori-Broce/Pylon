# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.0-beta] - 2026-06-04

### Added
- SDK: Subpath export `@gremius/sdk/realtime` with full type definitions
- SDK: `getClientId()` and `getUserId()` getters on `GremiusRealtime`
- Auth: Migration script `migrate-api-keys-to-agents.ts` for legacy API key migration
- Auth: Deprecation headers (`Deprecation: gremius_sk_*; grm_agent_*`) on all legacy API key endpoints

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
- README (root): Updated architecture diagram (`packages/admin` instead of `apps/admin`, Svelte 5 instead of Vue, `packages/realms` instead of `packages/themes`)
- Docs: `PUBLISH_GUIDE.md` and `MCP_SDK_AUDIT.md` updated to reflect current SDK version and API
- Docs: AI prompts (`mcp-tools.md`, `claude-system-prompt.md`, `troubleshooting.md`) now recommend Agent NHI (`grm_agent_*`) over deprecated legacy API keys (`gremius_sk_*`)
- Auth: Legacy API keys (`gremius_sk_*`) now log deprecation warnings on every use
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
- Grimoire system with 21 grimoires
- Realm Esports bundle
- MCP server for AI agents
- pgvector integration for AI features

## [0.5.0] - 2026-01-20

### Added
- 3-tier architecture (Engine, Core, Grimoires)
- Row Level Security (RLS) implementation
- Dynamic schema system
- Better Auth integration
- BullMQ queues

[Unreleased]: https://github.com/yourorg/gremius/compare/v0.9.0-beta...HEAD
[0.9.0-beta]: https://github.com/yourorg/gremius/compare/v0.7.0-beta...v0.9.0-beta
[0.7.0-beta]: https://github.com/yourorg/gremius/compare/v0.6.0...v0.7.0-beta
[0.6.0]: https://github.com/yourorg/gremius/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/yourorg/gremius/releases/tag/v0.5.0
