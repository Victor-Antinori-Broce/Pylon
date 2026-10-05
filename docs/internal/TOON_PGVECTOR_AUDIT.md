# TOON Encoder & pgvector Audit Report

**Date:** 2026-03-07

---

## ✅ TOON Encoder (Token-Optimized Object Notation)

### Overview

TOON is a compact, line-based format designed for AI/LLM consumers that minimizes token usage compared to JSON.

### Implementation Status: ✅ FUNCTIONAL

**Location:** `apps/api/src/lib/toon.ts`

### Format Example

```toon
~type:course
id:abc-123
title:Intro to TypeScript
topics[0].id:t1
topics[0].title:Variables
---
```

### Key Features

| Feature          | Status | Description                                 |
| ---------------- | ------ | ------------------------------------------- |
| Flatten Objects  | ✅     | Dot notation: `user.email:test@example.com` |
| Flatten Arrays   | ✅     | Bracket notation: `items[0].name:foo`       |
| Array Separation | ✅     | Records separated by `---`                  |
| Type Hints       | ✅     | Adds `~type` hint when possible             |
| JSON Unwrapping  | ✅     | Auto-unwraps `{ data: [...] }` envelope     |

### API Usage

**Via Accept Header:**

```bash
curl -H "Accept: application/vnd.toon" http://localhost:3000/api/datasets
```

**Via Query Param:**

```bash
curl http://localhost:3000/api/datasets?format=toon
```

**Response Headers:**

```
Content-Type: application/vnd.toon
X-Kitsuden-Format: toon
```

### Middleware Integration

The TOON middleware is active on all `/api/*` routes:

```typescript
// apps/api/src/index.ts
import { toonMiddleware } from "./lib/toon";
app.use("/api/*", toonMiddleware());
```

### MCP Tool Available

The `kitsuden_encode_toon` tool is available via MCP:

```json
{
  "name": "kitsuden_encode_toon",
  "description": "Encode arbitrary JSON data into TOON format"
}
```

### Test Verification

No unit tests exist for TOON. To verify functionality:

```bash
# Start the API
cd apps/api && bun run dev

# Test TOON encoding via API
curl -H "Accept: application/vnd.toon" http://localhost:3000/api/health

# Or via MCP
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "kitsuden_encode_toon",
      "arguments": {
        "data": {"title": "Test", "items": [{"id": 1}, {"id": 2}]}
      }
    },
    "id": 1
  }'
```

### Recommendations

1. **Add Unit Tests:** Create `apps/api/src/lib/toon.test.ts`
2. **Add Benchmarks:** Compare token count vs JSON
3. **Document Savings:** Show LLM token savings in documentation

---

## ✅ pgvector Integration

### Overview

pgvector is a PostgreSQL extension for vector similarity search, used for AI embeddings and semantic search.

### Implementation Status: ✅ CONFIGURED (Requires Setup)

---

## pgvector Fields in Code

### 1. ai-memories Schema (`packages/kons/ai-memories/schema.ts`)

| Table              | Field       | Type           | Dimensions | Index                              |
| ------------------ | ----------- | -------------- | ---------- | ---------------------------------- |
| `ai_memories`      | `embedding` | `vector(1536)` | 1536       | `ivfflat` with `vector_cosine_ops` |
| `ai_memory_chunks` | `embedding` | `vector(1536)` | 1536       | `ivfflat` with `vector_cosine_ops` |

### Schema Details

**ai_memories table:**

```typescript
embedding: vector("embedding", { dimensions: 1536 });
// OpenAI text-embedding-3-small standard

// Index for similarity search
embeddingIndex: index("ai_memories_embedding_idx").using(
  "ivfflat",
  table.embedding.op("vector_cosine_ops")
);
```

**ai_memory_chunks table:**

```typescript
embedding: vector("embedding", { dimensions: 1536 });

// Index for chunk similarity
chunkEmbeddingIdx: index("ai_chunks_embedding_idx").using(
  "ivfflat",
  table.embedding.op("vector_cosine_ops")
);
```

### Database Migration

**Docker Auto-Setup:**

```sql
-- docker/init-extensions.sql
CREATE EXTENSION IF NOT EXISTS vector;
```

This runs automatically when the PostgreSQL container starts for the first time.

**Manual Setup:**

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Health Check Endpoint

**URL:** `GET /api/health/pgvector`

**Response when installed:**

```json
{
  "pgvector": true,
  "requiredFor": ["ai-memories"],
  "message": "pgvector is installed and ready"
}
```

**Response when NOT installed:**

```json
{
  "pgvector": false,
  "requiredFor": ["ai-memories"],
  "message": "pgvector is NOT installed. AI features will not work."
}
```

**Error response:**

```json
{
  "pgvector": false,
  "error": "connection error details",
  "message": "Could not check pgvector status. Database connection failed."
}
```

### Docker Configuration

**Image:** `pgvector/pgvector:pg16`

**docker-compose.yml:**

```yaml
kitsuden_db:
  image: pgvector/pgvector:pg16
  volumes:
    - ./docker/init-extensions.sql:/docker-entrypoint-initdb.d/init-extensions.sql
```

### Similarity Search Operators

pgvector supports these operators:

| Operator | Description             | Use Case                      |
| -------- | ----------------------- | ----------------------------- |
| `<->`    | Euclidean distance (L2) | General similarity            |
| `<=>`    | Cosine distance         | Text embeddings (recommended) |
| `<#>`    | Negative inner product  | Maximize similarity           |
| `<+>`    | Distance with L1 norm   | Manhattan distance            |

### Usage Example

```typescript
import { sql } from "drizzle-orm";
import { aiMemories } from "@kitsuden/ai-memories";

// Search similar embeddings
const results = await db
  .select({
    id: aiMemories.id,
    content: aiMemories.content,
    distance: sql`embedding <=> ${embeddingVector}`,
  })
  .from(aiMemories)
  .where(eq(aiMemories.memoryType, "knowledge"))
  .orderBy(sql`embedding <=> ${embeddingVector}`)
  .limit(5);
```

---

## Verification Steps

### 1. Verify TOON Encoder

```bash
# Start API
cd apps/api && bun run dev

# Test with curl
curl -H "Accept: application/vnd.toon" http://localhost:3000/api/health

# Expected output:
# status:ok
# service:kitsuden-api
# version:1.0.0
# ...
```

### 2. Verify pgvector Installation

```bash
# Check health endpoint
curl http://localhost:3000/api/health/pgvector

# Expected output:
# {"pgvector":true,"requiredFor":["ai-memories"],"message":"pgvector is installed and ready"}
```

### 3. Verify via Database

```bash
# Connect to database
docker exec -it kitsuden_db_prod psql -U kitsuden -d kitsuden_prod

# Check extension
SELECT * FROM pg_extension WHERE extname = 'vector';

# Check tables
\dt ai_*
```

---

## Issues & Recommendations

### TOON Encoder

| Issue              | Severity | Recommendation                                 |
| ------------------ | -------- | ---------------------------------------------- |
| No unit tests      | Medium   | Create `toon.test.ts` with encode/decode tests |
| No benchmarks      | Low      | Add token count comparison vs JSON             |
| No decode function | Low      | Consider adding TOON parser if needed          |

### pgvector

| Issue                    | Severity | Recommendation                            |
| ------------------------ | -------- | ----------------------------------------- |
| ai-memories is stub      | High     | Complete the API routes for ai-memories   |
| No embedding generation  | High     | Integrate OpenAI or local embedding model |
| No similarity search API | High     | Add `/api/ai-memories/search` endpoint    |

### ai-memories Completion Tasks

To make ai-memories fully functional:

1. **Add API Routes:**

   ```typescript
   // POST /api/ai-memories - Create memory
   // GET /api/ai-memories - List memories
   // POST /api/ai-memories/search - Semantic search
   // DELETE /api/ai-memories/:id - Delete memory
   ```

2. **Add Embedding Generation:**

   ```typescript
   // Integrate OpenAI embeddings API
   // Or use local model like sentence-transformers
   ```

3. **Add Chunking Service:**
   ```typescript
   // Automatic document chunking for large texts
   // Overlapping windows for context preservation
   ```

---

## Summary

| Component             | Status         | Notes                                  |
| --------------------- | -------------- | -------------------------------------- |
| TOON Encoder          | ✅ Functional  | Middleware active, MCP tool available  |
| pgvector Extension    | ✅ Configured  | Auto-installs with Docker              |
| ai-memories Schema    | ⚠️ Schema Only | No API routes implemented              |
| pgvector Health Check | ✅ Working     | `/api/health/pgvector` endpoint active |

---

## Quick Reference

### TOON

- **Mime Type:** `application/vnd.toon`
- **Query Param:** `?format=toon`
- **Middleware:** Active on `/api/*`
- **MCP Tool:** `kitsuden_encode_toon`

### pgvector

- **Extension:** `vector` (PostgreSQL)
- **Tables:** `ai_memories`, `ai_memory_chunks`
- **Dimensions:** 1536 (OpenAI standard)
- **Index Type:** `ivfflat` with cosine similarity
- **Health Check:** `/api/health/pgvector`
