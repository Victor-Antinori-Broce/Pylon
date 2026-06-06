# Changelog

All notable changes to the Gremius CLI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-03-05

### Added

- Initial release of the Gremius CLI
- `init` command to scaffold new projects
- `start` command to start services locally
- `stop` command to stop all services
- `logs` command to view container logs
- `mcp` command to run MCP server for AI assistants
- `deploy` command for Docker and cloud deployments
- `status` command to check service status
- Docker Compose generation for local development
- GitHub Actions workflow template
- Support for PostgreSQL with pgvector
- Support for Valkey (Redis alternative)

### Features

- One-command project initialization
- Integrated MCP server for Claude/Cursor
- Hot-reload development setup
- Production-ready Docker configuration
