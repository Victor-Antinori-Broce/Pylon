# ===================================================================
# Kitsuden MCP Server Docker Image (Standalone)
# Build: docker build -f docker/mcp/Dockerfile -t kitsuden/mcp .
# ===================================================================

FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install pnpm (project uses pnpm, not bun for package management)
RUN apk add --no-cache nodejs npm
RUN npm install -g pnpm@9.15.4

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/mcp-server/package.json ./packages/mcp-server/
COPY packages/shared/package.json ./packages/shared/
COPY packages/sdk/package.json ./packages/sdk/

# Install dependencies
#
# --frozen-lockfile SIN respaldo (auditoría 2026-10-25): el `--no-frozen-lockfile`
# de antes volvía a resolver versiones y metía en la imagen lo que nadie revisó.
#
# --ignore-scripts por lo mismo que en Dockerfile.prod: aquí solo hay manifiestos
# y el `prepare` de @kitsuden/shared (scripts/build.ts) todavía no existe. Shared
# se compila abajo a mano, y el servidor MCP no tiene dependencias nativas (MCP
# SDK, hono, zod), así que no hace falta el `pnpm rebuild` de Dockerfile.prod.
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source
COPY packages/mcp-server ./packages/mcp-server
COPY packages/shared ./packages/shared
COPY packages/sdk ./packages/sdk

# Build shared first, then MCP server
RUN pnpm --filter @kitsuden/shared build
WORKDIR /app/packages/mcp-server
RUN bun run build

# Production stage
FROM oven/bun:1-alpine AS production
WORKDIR /app

RUN apk add --no-cache curl

# Copy built files and dependencies
COPY --from=base /app/packages/mcp-server/dist ./dist
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/mcp-server/package.json ./

# Sin root (auditoría 2026-10-25), como la API en Dockerfile.prod: `bun`
# (uid 1000) viene en la imagen base. El servidor no escribe en disco, así que
# el código copiado arriba sigue siendo de root y de solo lectura para él.
USER bun

ENV NODE_ENV=production
ENV PORT=3002
ENV KITSUDEN_API_URL=http://localhost:3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3002/health || exit 1

EXPOSE 3002

CMD ["bun", "run", "dist/standalone.js"]
