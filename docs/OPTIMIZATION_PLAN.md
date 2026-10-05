# Kitsuden Image Size Optimization Plan

## Current State: 1.05 GB API Image

## Target: 300-400 MB (60% reduction)

---

## 1. AWS SDK Tree-Shaking (Save ~100 MB)

**Problem**: `@aws-sdk/client-s3` brings in entire SDK

**Solution**: Use specific imports or S3-compatible lightweight client

```typescript
// BEFORE (heavy)
import { S3Client } from "@aws-sdk/client-s3";

// AFTER (lighter alternative)
import { S3Client } from "@aws-sdk/client-s3/dist-es/S3Client";
// Or use minio-js which is smaller
```

**Impact**: ~100 MB savings

---

## 2. Sharp Optimization (Save ~50 MB)

**Problem**: Sharp includes support for many image formats you may not need

**Solution**: Build sharp with only needed formats

```dockerfile
# In builder stage:
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
ENV NPM_CONFIG_ARCH=x64
ENV npm_config_sharp_libvips_binary_host_mirror=https://github.com/lovell/sharp-libvips/releases/download
RUN pnpm rebuild sharp --verbose

# Then in final stage, only copy the compiled binaries:
COPY --from=builder /app/node_modules/sharp /app/node_modules/sharp
```

**Alternative**: Skip Sharp entirely if not doing image processing

```typescript
// Remove from package.json if not needed:
// "sharp": "^0.34.5"
```

**Impact**: ~50 MB savings

---

## 3. Database Driver Selection (Save ~20 MB)

**Problem**: You have multiple DB drivers installed

```json
"dependencies": {
  "mysql2": "^3.18.0",     // ~15 MB
  "pg": "^8.16.0",         // ~10 MB
  "redis": "^5.11.0"       // ~5 MB
}
```

**Solution**: Make drivers optional or use adapter pattern

```typescript
// Create a database adapter interface
interface DatabaseAdapter {
  query(sql: string, params: any[]): Promise<any>;
}

// Only import the driver you need at runtime
const driver = process.env.DB_DRIVER;
if (driver === "postgres") {
  const { default: pg } = await import("pg");
} else if (driver === "mysql") {
  const { default: mysql } = await import("mysql2");
}
```

**Impact**: ~20 MB savings

---

## 4. Remove DevDependencies (Save ~50 MB)

**Current devDependencies in final image**:

- `drizzle-kit` (~30 MB)
- `typescript` (~15 MB)
- `@types/*` packages (~5 MB)

**Solution**: Use proper multi-stage build

```dockerfile
# Builder stage has everything
FROM dependencies AS builder
RUN pnpm install  # includes devDependencies

# Runtime stage has only production
FROM oven/bun:1-alpine AS api
COPY --from=builder /app/dist /app/dist
# Only copy package.json and install prod deps
RUN pnpm install --prod
```

---

## 5. Optional Features as Plugins (Save ~100 MB)

**Problem**: All features are bundled even if unused

**Solution**: Make heavy features optional

```typescript
// Instead of:
import { generatePDF } from "pdf-lib";

// Use dynamic import:
async function generatePDF(data: any) {
  const { PDFDocument } = await import("pdf-lib");
  // ...
}
```

**Candidates for dynamic imports**:

- `pdf-lib` (~10 MB) - PDF generation
- `graphql` (~15 MB) - GraphQL support
- `bullmq` (~20 MB) - Queue processing
- `@aws-sdk/*` (~100 MB) - S3 storage

---

## 6. Bun-Specific Optimizations

### 6.1 Single Executable

Bun can create single-file executables:

```bash
# Build standalone executable
bun build src/index.ts --compile --outfile kitsuden-api

# This bundles everything into one ~50-100 MB file
# No node_modules needed!
```

### 6.2 Smaller Base Image

```dockerfile
# Instead of oven/bun:1-alpine (~150 MB)
# Use distroless or scratch with bun binary

FROM debian:bookworm-slim AS runtime
COPY --from=oven/bun:1-alpine /usr/local/bin/bun /usr/local/bin/bun
COPY ./dist/index.js /app/
CMD ["bun", "/app/index.js"]
```

---

## 7. Package.json Splitting

Create separate package files for different environments:

```
apps/api/
  ├── package.json          # Core only
  ├── package.full.json     # All features
  └── package.slim.json     # Minimal
```

---

## Expected Results

| Optimization    | Current     | Target     | Savings  |
| --------------- | ----------- | ---------- | -------- |
| Base Image      | 150 MB      | 50 MB      | 100 MB   |
| AWS SDK         | 150 MB      | 20 MB      | 130 MB   |
| Sharp           | 80 MB       | 30 MB      | 50 MB    |
| DevDependencies | 50 MB       | 0 MB       | 50 MB    |
| DB Drivers      | 30 MB       | 10 MB      | 20 MB    |
| Misc bloat      | 100 MB      | 50 MB      | 50 MB    |
| **TOTAL**       | **1.05 GB** | **250 MB** | **~75%** |

---

## Implementation Priority

1. **Quick wins** (1-2 hours):
   - Remove devDependencies from final image
   - Stop copying full workspace

2. **Medium effort** (1 day):
   - AWS SDK tree-shaking
   - Sharp optimization

3. **High effort** (1 week):
   - Plugin architecture
   - Single executable
   - Optional features

---

## Quick Test Command

```bash
# Check what's taking space in your image
docker run --rm -it cms-kitsuden_api:latest sh -c "du -sh /app/* | sort -h"

# Check node_modules size
docker run --rm -it cms-kitsuden_api:latest sh -c "du -sh /app/node_modules/* | sort -h | tail -20"
```
