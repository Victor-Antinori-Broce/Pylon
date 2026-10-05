# {{PROJECT_NAME}}

Powered by [Kitsuden](https://kitsuden.gg) — AI-Native Backend

## 🚀 Quick Start

```bash
# Start everything
docker compose up -d --build

# Wait ~60 seconds for first build, then open:
# Admin Panel:   http://localhost:3001
# API Docs:      http://localhost:3000/api/swagger
# MCP Server:    http://localhost:3000/api/mcp
```

## 🎮 Vibecoder Mode

No backend knowledge needed. Connect Cursor/Claude to the MCP server and let AI configure everything.

```
MCP Endpoint: http://localhost:3000/api/mcp
```

## 🛠️ Developer Mode

For hot-reload development with the full monorepo:

```bash
# Clone the Kitsuden monorepo
git clone https://github.com/kitsuden/kitsuden.git
cd kitsuden
pnpm install
pnpm dev:start:simple
```

## 📁 Project Structure

- `docker-compose.yml` — All services
- `.env` — Configuration
- `grimoire.json` — Active modules (auto-generated)

## 🔧 Customization

Edit `.env` to change ports, passwords, or enable features.

## 📚 Documentation

- [Getting Started](https://docs.kitsuden.gg)
- [MCP Setup](https://docs.kitsuden.gg/mcp)
