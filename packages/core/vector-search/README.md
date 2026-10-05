# @kitsuden/vector-search

Vector Search Extension for Kitsuden Datasets — migrated from AI Memories Kon.

## Migration Summary

**Before (Kon)**: Standalone AI Memories module at `/api/ai-memories`

**After (Core Extension)**: Integrated vector search available on ANY dataset via `/api/datasets/:id/vector-search`

## Why This Change?

As a BaaS, vector search should be a **capability** of any dataset, not a separate module:

```typescript
// Before: User had to "install" AI Memories
// Then manage content in separate table

// After: Enable on any dataset
const products = {
  name: "products",
  fields: [
    { name: "name", type: "text" },
    { name: "description", type: "richtext" },
  ],
  extensions: {
    vectorSearch: {
      enabled: true,
      fields: ["description"],
      autoIndex: true,
    },
  },
};

// Now searchable:
// POST /api/datasets/products/vector-search
// { "query": "wireless headphones", "limit": 10 }
```

## API Endpoints

Auto-mounted for datasets with `vectorSearch` extension enabled:

| Method | Endpoint                                  | Description                 |
| ------ | ----------------------------------------- | --------------------------- |
| POST   | `/api/datasets/:id/vector-search`         | Semantic search             |
| POST   | `/api/datasets/:id/vector-index`          | Index content               |
| DELETE | `/api/datasets/:id/vector-index/:entryId` | Remove from index           |
| GET    | `/api/datasets/:id/vector-status`         | Index stats                 |
| POST   | `/api/vector-search/global`               | Search all datasets (admin) |

## Database Schema

### vector_index

Stores embeddings for all dataset entries:

| Column     | Type         | Description      |
| ---------- | ------------ | ---------------- |
| dataset_id | varchar      | Source dataset   |
| entry_id   | uuid         | Source entry     |
| content    | text         | Indexed content  |
| embedding  | vector(1536) | OpenAI embedding |
| field_name | varchar      | Which field      |

### vector_chunks

For long documents (chunked):

| Column      | Type | Description  |
| ----------- | ---- | ------------ |
| index_id    | uuid | Parent index |
| content     | text | Chunk text   |
| chunk_index | int  | Position     |

## Configuration

```typescript
interface VectorSearchExtension {
  enabled: boolean;
  fields: string[]; // Fields to index
  embeddingModel?: string; // Default: text-embedding-3-small
  autoIndex?: boolean; // Index on create/update
  chunkSize?: number; // 2000 chars
  chunkOverlap?: number; // 200 chars
}
```

## Environment Variables

```bash
OPENAI_API_KEY=sk-...  # Optional, for embeddings
```

Without OpenAI key, returns zero vectors (for testing/development).

## Migration from AI Memories

If you were using AI Memories kon:

1. Data migration: Run SQL to migrate from `ai_memories` table to `vector_index`
2. Update API calls: Change `/api/ai-memories/search` to `/api/datasets/:id/vector-search`
3. Enable extension: Add `vectorSearch` config to your datasets

## Future Enhancements

- [ ] Support for multiple embedding providers (Cohere, local models)
- [ ] Automatic re-indexing on field updates
- [ ] Hybrid search (vector + full-text)
- [ ] Filtering by metadata in vector search
