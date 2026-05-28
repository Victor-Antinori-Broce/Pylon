# Migración: AI Memories Grimoire → Core Vector Search

## Resumen

El grimoire `ai-memories` ha sido migrado a `packages/core/vector-search/` como una **capability transversal** del core de Gremius.

**Fecha de migración:** 2026-03-19  
**Versión:** 1.0.0  
**Breaking Changes:** Sí - Cambio en la API y modelo de datos

---

## Cambios Principales

### Antes (Grimoire AI Memories)

```typescript
// Tablas separadas
- ai_memories: Memoria general del sistema
- ai_memory_chunks: Fragmentos de documentos
- agent_memory: Memoria específica de agentes (Fase 4)

// API independiente
POST /api/ai-memories              // Crear memoria
POST /api/ai-memories/search       // Buscar en todas las memorias
GET  /api/ai-memories/:id          // Obtener memoria
```

### Después (Core Vector Search)

```typescript
// Tablas unificadas (extension de dataset)
- vector_index: Índice vectorial para cualquier dataset
- vector_chunks: Fragmentos de documentos largos

// API integrada con datasets
POST /api/datasets/:id/vector-search    // Buscar en un dataset
POST /api/datasets/:id/vector-index     // Indexar entrada
GET  /api/datasets/:id/vector-status    // Estado del índice
POST /api/vector-search/global          // Buscar en todos los datasets (admin)
```

---

## Ventajas de la Migración

| Aspecto | Antes (Grimoire) | Después (Core) |
|---------|------------------|----------------|
| **Scope** | Memoria general del sistema | Extensión de cualquier dataset |
| **API** | Endpoints separados | Integrado con `/api/datasets/*` |
| **Configuración** | Instalar grimoire | Toggle en definición de dataset |
| **Flexibilidad** | Tablas fijas | Cualquier dataset puede usar vectores |
| **Mantenimiento** | Código duplicado | Centralizado en core |

---

## Guía de Migración para Usuarios

### 1. Actualizar Definición de Dataset

**Antes:**
```typescript
// Crear memoria en grimoire separado
POST /api/ai-memories
{
  "content": "Producto: Laptop Gamer XYZ",
  "memoryType": "knowledge",
  "metadata": { "category": "electronics" }
}
```

**Después:**
```typescript
// Definir dataset con extensión vector-search
POST /api/datasets
{
  "name": "products",
  "fields": [
    { "name": "name", "type": "text" },
    { "name": "description", "type": "textarea" },
    { "name": "price", "type": "number" }
  ],
  "extensions": {
    "vectorSearch": {
      "enabled": true,
      "fields": ["description"],  // Campos a indexar
      "autoIndex": true
    }
  }
}

// Crear entrada (se indexa automáticamente)
POST /api/datasets/products/entries
{
  "name": "Laptop Gamer XYZ",
  "description": "Potente laptop con RTX 4080...",
  "price": 1999
}
```

### 2. Actualizar Búsquedas

**Antes:**
```bash
POST /api/ai-memories/search
{
  "query": "laptop gaming potente",
  "limit": 10,
  "threshold": 0.7
}
```

**Después:**
```bash
POST /api/datasets/products/vector-search
{
  "query": "laptop gaming potente",
  "limit": 10,
  "threshold": 0.7
}

# O buscar globalmente (admin)
POST /api/vector-search/global
{
  "query": "laptop gaming potente",
  "datasetIds": ["products", "reviews"],
  "limit": 10
}
```

### 3. Indexación Manual (si autoIndex es false)

```bash
POST /api/datasets/products/vector-index
{
  "entryId": "uuid-de-la-entrada",
  "content": "Potente laptop con RTX 4080...",
  "fieldName": "description",
  "metadata": { "source": "manual" }
}
```

---

## Cambios en Base de Datos

### Migración de Datos

Para migrar datos existentes de `ai_memories` a `vector_index`:

```sql
-- Migrar memorias existentes
INSERT INTO vector_index (
  dataset_id, 
  entry_id, 
  content, 
  embedding, 
  field_name,
  metadata,
  created_at
)
SELECT 
  'legacy-ai-memories' as dataset_id,
  id::text as entry_id,
  content,
  embedding,
  memory_type as field_name,
  metadata,
  created_at
FROM ai_memories;

-- Nota: Los chunks se migran automáticamente con FK
```

### Tablas Nuevas

```sql
-- Tabla principal de índice vectorial
CREATE TABLE vector_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id VARCHAR(255) NOT NULL,
  entry_id UUID NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  model VARCHAR(100) DEFAULT 'text-embedding-3-small',
  field_name VARCHAR(255),
  is_chunked INTEGER DEFAULT 0,
  total_chunks INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'
);

-- Tabla de chunks para documentos largos
CREATE TABLE vector_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  index_id UUID REFERENCES vector_index(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  chunk_index INTEGER NOT NULL,
  total_chunks INTEGER NOT NULL,
  char_offset INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Uso Avanzado

### Búsqueda con Filtros

```bash
POST /api/datasets/products/vector-search
{
  "query": "laptop gaming",
  "fields": ["description", "specs"],  // Solo buscar en estos campos
  "threshold": 0.8,
  "limit": 20
}
```

### Indexación Programática

```typescript
import { indexContent } from '@gremius/core/vector-search';

// En tu código
await indexContent({
  datasetId: 'products',
  entryId: entry.id,
  content: entry.description,
  fieldName: 'description',
  metadata: { source: 'auto-index' }
});
```

### Búsqueda Semántica con Resultados Enriquecidos

```typescript
const results = await vectorSearch({
  datasetId: 'products',
  query: 'laptop potente para juegos',
  limit: 10,
  includeMetadata: true,
  includeChunks: true  // Para documentos largos
});

// Resultado:
{
  "query": "laptop potente para juegos",
  "results": [
    {
      "entryId": "uuid",
      "content": "Laptop Gamer XYZ con RTX 4080...",
      "similarity": 0.92,
      "fieldName": "description",
      "metadata": { "price": 1999 },
      "chunks": [...] // Si es documento largo
    }
  ]
}
```

---

## Compatibilidad

### Endpoints Legacy (si es necesario)

Si necesitas mantener compatibilidad temporal:

```typescript
// En tu router o middleware
// Redirect /api/ai-memories/search → /api/vector-search/global

app.post('/api/ai-memories/search', async (c) => {
  const body = await c.req.json();
  
  // Transformar payload antiguo al nuevo formato
  const newBody = {
    query: body.query,
    limit: body.limit || 10,
    threshold: body.threshold || 0.7,
    // Mapear memoryType a datasetIds si es necesario
  };
  
  // Llamar al nuevo endpoint
  return c.json(await globalVectorSearch(newBody));
});
```

---

## Troubleshooting

### Error: "vector_index table not found"

```bash
# Ejecutar migración de Drizzle
bunx drizzle-kit migrate

# O manualmente:
CREATE EXTENSION IF NOT EXISTS vector;
```

### Error: "No embeddings generated"

```bash
# Verificar OPENAI_API_KEY
export OPENAI_API_KEY=sk-...

# O usar zero vectors para testing
# (automático si no hay API key)
```

### Error: "Similarity search slow"

```sql
-- Verificar índices
SELECT * FROM pg_indexes WHERE tablename = 'vector_index';

-- Recrear índice IVFFlat si es necesario
CREATE INDEX vector_index_embedding_idx 
ON vector_index USING ivfflat (embedding vector_cosine_ops);
```

---

## Referencias

- **Nuevo README:** `packages/core/vector-search/README.md`
- **Grimoire Legacy:** `packages/grimoires/ai-memories/README.md` (archived)
- **Documentación API:** Ver OpenAPI en `/api/swagger`

---

## Resumen de Breaking Changes

| Cambio | Impacto | Solución |
|--------|---------|----------|
| Tablas renombradas | Alto | Ejecutar migración SQL |
| API endpoints cambiados | Alto | Actualizar llamadas HTTP |
| Concepto: memoria general → extensión dataset | Medio | Redefinir datasets con extensión |
| Eliminación de memoryType | Medio | Usar datasetId + fieldName |

---

**Para soporte adicional, consulta:**
- Issue #XXX (Migración AI Memories)
- Discusiones en GitHub
- Documentación de Vector Search
