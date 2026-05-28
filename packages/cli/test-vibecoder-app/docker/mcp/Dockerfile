# ===================================================================
# GremiusCMS MCP Server Docker Image (Standalone)
# Build: docker build -f docker/mcp/Dockerfile -t gremius/mcp .
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
RUN pnpm install --frozen-lockfile || pnpm install --no-frozen-lockfile

# Copy source
COPY packages/mcp-server ./packages/mcp-server
COPY packages/shared ./packages/shared
COPY packages/sdk ./packages/sdk

# Build shared first, then MCP server
RUN pnpm --filter @gremius/shared build
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

ENV NODE_ENV=production
ENV PORT=3002
ENV GREMIUS_API_URL=http://localhost:3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3002/health || exit 1

EXPOSE 3002

CMD ["bun", "run", "dist/standalone.js"]
