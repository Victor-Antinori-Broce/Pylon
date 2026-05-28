# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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

[Unreleased]: https://github.com/yourorg/gremius/compare/v0.7.0-beta...HEAD
[0.7.0-beta]: https://github.com/yourorg/gremius/compare/v0.6.0...v0.7.0-beta
[0.6.0]: https://github.com/yourorg/gremius/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/yourorg/gremius/releases/tag/v0.5.0
