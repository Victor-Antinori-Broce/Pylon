# Análisis del Grimoire AI Memories

**Fecha de análisis:** 2026-03-19  
**Ubicación:** `packages/grimoires/ai-memories/`  
**Estado:** ✅ COMPLETO Y FUNCIONAL

---

## ¿Qué es AI Memories?

**AI Memories** es el "cerebro de IA" de Gremius. Es un sistema de almacenamiento semántico con embeddings vectoriales que permite:

1. **Búsqueda semántica**: Encontrar contenido por significado, no solo palabras clave
2. **Memoria conversacional**: Almacenar historial de chat con contexto
3. **RAG (Retrieval Augmented Generation)**: Recuperar información relevante para LLMs
4. **Document chunking**: Dividir documentos grandes en fragmentos indexables

---

## ¿Para qué sirve?

### Casos de Uso Principales

| Caso                     | Descripción                                                           | Endpoint                                            |
| ------------------------ | --------------------------------------------------------------------- | --------------------------------------------------- |
| **Base de conocimiento** | Almacenar FAQs, documentación, artículos                              | `POST /api/ai-memories`                             |
| **Memoria de chat**      | Guardar historial conversacional con TTL                              | `POST /api/ai-memories` (con `expiresAt`)           |
| **Búsqueda semántica**   | Buscar "programación" y encontrar "JavaScript, TypeScript, Python..." | `POST /api/ai-memories/search`                      |
| **Documentos grandes**   | Subir PDFs/textos largos, auto-fragmentados                           | `POST /api/ai-memories` (auto-chunking >2000 chars) |
| **Cache de búsqueda**    | Almacenar resultados de búsquedas frecuentes                          | `memoryType: "search-cache"`                        |

### Tecnologías

- **pgvector**: Extensión PostgreSQL para vectores
- **OpenAI Embeddings**: `text-embedding-3-small` (1536 dimensiones)
- **IVFFlat Index**: Índice de similitud aproximada rápida
- **Drizzle ORM**: Con soporte nativo para tipos `vector`

---

## Estructura del Grimoire

### Archivos

```
packages/grimoires/ai-memories/
├── schema.ts           # Tablas: ai_memories, ai_memory_chunks
├── memories.routes.ts  # API REST completa (631 líneas)
├── index.ts            # Exportaciones y health check
├── gremius.json        # Configuración del grimoire
├── grimoire.json       # Metadata
└── README.md           # Documentación completa
```

### Tablas de Base de Datos

**ai_memories:**

```sql
- id: uuid PRIMARY KEY
- content: text                    # Contenido textual
- embedding: vector(1536)          # Vector de OpenAI
- memory_type: varchar             # knowledge|conversation|document|search-cache
- metadata: jsonb                  # Tags, source, author, etc.
- created_by_id: uuid              # Usuario creador (opcional)
- created_at: timestamp
- updated_at: timestamp
- expires_at: timestamp            # TTL para memorias temporales
```

**ai_memory_chunks:**

```sql
- id: uuid PRIMARY KEY
- memory_id: uuid → ai_memories    # Relación padre
- content: text                    # Fragmento del documento
- embedding: vector(1536)          # Vector del fragmento
- chunk_index: int                 # Posición (0, 1, 2...)
- total_chunks: int                # Total de fragmentos
- metadata: jsonb                  # Offsets, overlap info
```

---

## API Endpoints

| Método | Endpoint                               | Descripción                    |
| ------ | -------------------------------------- | ------------------------------ |
| GET    | `/api/ai-memories`                     | Listar memorias con filtros    |
| POST   | `/api/ai-memories`                     | Crear memoria (auto-embedding) |
| GET    | `/api/ai-memories/:id`                 | Obtener memoria con chunks     |
| PATCH  | `/api/ai-memories/:id`                 | Actualizar memoria             |
| DELETE | `/api/ai-memories/:id`                 | Eliminar memoria               |
| POST   | `/api/ai-memories/search`              | Búsqueda semántica básica      |
| POST   | `/api/ai-memories/search/advanced`     | Búsqueda con operadores        |
| POST   | `/api/ai-memories/batch`               | Importación masiva             |
| POST   | `/api/ai-memories/batch/delete`        | Eliminación masiva             |
| GET    | `/api/ai-memories/stats/overview`      | Estadísticas                   |
| GET    | `/api/ai-memories/health/embedding`    | Estado del servicio OpenAI     |
| GET    | `/api/ai-memories/:id/chunks`          | Listar fragmentos              |
| DELETE | `/api/ai-memories/:id/chunks/:chunkId` | Eliminar fragmento             |

---

## Revisión de Documentación .md

### 1. AI_MEMORIES_COMPLETION.md

**Fecha:** 2026-03-07  
**Estado:** ✅ COMPLETE

> "The ai-memories grimoire has been fully implemented with comprehensive API routes..."

**Tareas completadas según este doc:**

- ✅ CRUD Operations (list, get, create, update, delete)
- ✅ Semantic Search (básica y avanzada)
- ✅ Document Chunking (auto >2000 chars)
- ✅ Batch Operations (bulk import/delete)
- ✅ Statistics & Health
- ✅ Chunk Management
- ✅ Integración con pgvector
- ✅ Integración con OpenAI

### 2. GRIMOIRES_ANALYSIS_COMPLETE.md

**Fecha:** 2026-03-15

**Recomendación clave:**

> "AI Memories → MOVER AL CORE como `packages/core/vector-search/`"

**Razón:** Es una "Capability Transversal" (debe estar disponible en cualquier dataset)

**Estado:**

- ✅ Ya fue migrado según este documento
- Ubicación destino: `packages/core/vector-search/`

### 3. GRIMOIRE_CORE_MIGRATION_PLAN.md

**Recomendación:**

> "AI Memories debería convertirse en una extensión de dataset: `[x] Enable vector search`"

**Cambio propuesto en API:**

```typescript
// Antes (grimoire separado)
POST /api/ai-memories/search

// Después (extensión de dataset)
POST /api/datasets/:id/search/vector
```

### 4. TOON_PGVECTOR_AUDIT.md

**Fecha:** 2026-03-07 (anterior a la finalización)

**Estado en ese momento:**

> "ai-memories Schema: ⚠️ Schema Only - No API routes implemented"

**Nota:** Este documento es anterior a la finalización. Después se completaron todas las rutas.

---

## ¿Sugieren los .md algún cambio?

### ✅ Sí, hay recomendaciones documentadas:

| Documento                           | Sugerencia                             | Prioridad |
| ----------------------------------- | -------------------------------------- | --------- |
| **GRIMOIRES_ANALYSIS_COMPLETE.md**  | Mover a `packages/core/vector-search/` | Alta      |
| **GRIMOIRE_CORE_MIGRATION_PLAN.md** | Convertir en extensión de dataset      | Alta      |
| **AI_MEMORIES_COMPLETION.md**       | Mantener como está (ya está completo)  | N/A       |

### 🔍 Cambios Sugeridos Detallados

#### 1. Migración al Core (packages/core/vector-search/)

**Razón:** El vector search es una capability transversal que debería estar disponible en cualquier dataset, no solo como grimoire separado.

**Propuesta de arquitectura:**

```typescript
// Cualquier dataset puede habilitar búsqueda vectorial
{
  name: "products",
  fields: [...],
  extensions: {
    vectorSearch: {
      enabled: true,
      searchableFields: ["description", "content"]
    }
  }
}

// API unificada
POST /api/datasets/products/search/vector
{ "query": "laptops gaming", "limit": 10 }
```

#### 2. Unificación con el nuevo sistema Agent Memory

**Observación importante:** El nuevo sistema `AgentMemory` (Fase 4) que implementamos usa una tabla similar pero simplificada (`agent_memory`).

**Potencial consolidación:**

- `ai-memories`: Memoria general del sistema (conocimiento, documentos)
- `agent-memory`: Memoria específica de agentes (contexto, preferencias)
- **Consideración:** Podrían fusionarse en una sola tabla con `owner_type: 'system' | 'agent'`

#### 3. Mejoras Sugeridas (no críticas)

Según TOON_PGVECTOR_AUDIT.md:

1. Agregar tests unitarios para el chunking
2. Agregar benchmarks de token savings vs JSON
3. Considerar modelo de embeddings local (sin depender de OpenAI)

---

## Comparación: AI Memories vs Agent Memory (Nuevo)

| Característica          | AI Memories                                     | Agent Memory (Fase 4)                       |
| ----------------------- | ----------------------------------------------- | ------------------------------------------- |
| **Propósito**           | Memoria general del sistema                     | Memoria específica de agentes               |
| **Tabla**               | `ai_memories`                                   | `agent_memory`                              |
| **Vector embeddings**   | ✅ Sí (1536 dims)                               | ✅ Soporte (campo definido)                 |
| **Chunking**            | ✅ Automático                                   | ❌ No implementado                          |
| **Owner**               | `created_by_id` (opcional)                      | `agent_id` (requerido, FK)                  |
| **Tipos**               | knowledge, conversation, document, search-cache | short_term, long_term, episodic, semantic   |
| **Categorías**          | En metadata                                     | ✅ Enum (general, conversation, task, etc.) |
| **TTL**                 | ✅ expires_at                                   | ✅ valid_until                              |
| **LRU Tracking**        | ❌ No                                           | ✅ access_count, last_accessed_at           |
| **Garbage Collection**  | ❌ No                                           | ✅ Endpoint /cleanup                        |
| **Relación con Agente** | Indirecta                                       | Directa (FK + ownership)                    |

### 💡 Recomendación de Consolidación

```typescript
// Opción A: Mantener separados (actual)
// - ai-memories: Conocimiento general, documentos
// - agent-memory: Contexto de agentes individuales

// Opción B: Fusionar (propuesta)
// Una sola tabla memories con:
// - scope: 'system' | 'agent' | 'user'
// - owner_id: depende del scope
// - memory_category: knowledge | conversation | agent-context | etc.
```

**Veredicto:** Por ahora mantener separados. Tienen propósitos distintos:

- AI Memories = Base de conocimiento global (RAG)
- Agent Memory = Estado interno de agentes (contexto de sesión)

---

## Conclusión

### Estado Actual

✅ **AI Memories está COMPLETO y FUNCIONAL**

- Todas las rutas API implementadas
- Integración con OpenAI y pgvector
- Documentación exhaustiva

### Cambios Sugeridos en Documentación

1. **Migrar al Core** (`packages/core/vector-search/`): Sugerido en análisis de arquitectura
2. **Convertir en extensión de dataset**: Para que cualquier dataset pueda usar búsqueda vectorial
3. **No modificar funcionalidad actual**: Está completo y probado

### Relación con Fase 4 (Agent Memory)

- Son sistemas complementarios, no competidores
- AI Memories = Memoria "pública" del sistema
- Agent Memory = Memoria "privada" de cada agente
- Podrían integrarse: Agent Memory podría buscar en AI Memories para RAG

### Acción Recomendada

**Por ahora: NO realizar cambios.** El sistema funciona bien como grimoire. La migración al core puede planificarse para una fase futura de refactorización mayor.
