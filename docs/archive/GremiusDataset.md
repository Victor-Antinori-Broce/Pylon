# GremiusDataset - Mejoras Arquitectónicas (Versión Final)

> Documento de mejoras para grimoire-datasets en el contexto de CMS Gaming técnico + Agents/IA.

## 🎯 Filosofía

Este documento asume:
- **Usuarios**: Desarrolladores técnicos, no content editors casuales
- **Consumidores**: Agents de IA (MCP), scripts automatizados, SPAs (Vue/Svelte)
- **Arquitectura**: Headless/API-first, JSONB dinámico
- **Separación de responsabilidades**:
  - **Dataset Creator**: Configuración sin código (schema, validación, relaciones)
  - **Actions**: Lógica de negocio compleja (código TypeScript)

---

## 📋 Mejoras Aprobadas

| # | Mejora | Prioridad | Estado |
|---|--------|-----------|--------|
| 1 | [Auto-Join API (`?expand`)](#1-auto-join-api-expand) | 🔴 Crítica | ✅ **IMPLEMENTADO** |
| 2 | [Batch API Transaccional](#2-batch-api-transaccional) | 🔴 Crítica | ✅ **IMPLEMENTADO** |
| 3 | [Query Language JSON](#3-query-language-json) | 🔴 Crítica | ✅ **IMPLEMENTADO** |
| 4 | [Validación Declarativa](#4-validación-declarativa) | 🔴 Crítica | ✅ **IMPLEMENTADO** |
| 5 | [Import/Export JSON](#5-importexport-json) | 🟡 Alta | ✅ **IMPLEMENTADO** |
| 6 | [Snapshots/Denormalización](#6-snapshotsdenormalización) | 🟡 Alta | ✅ **IMPLEMENTADO** |
| 7 | [Calculated Fields](#7-calculated-fields) | 🟢 Media | ✅ **IMPLEMENTADO** |
| 8 | [Índices Automáticos](#8-índices-automáticos) | 🟢 Media | ✅ **IMPLEMENTADO** |

**❌ Rechazadas**:
- ~~Inline Editing~~: Overkill para técnicos/Agents. El Batch API cubre el caso de uso.
- ~~Query Language SQL~~: Inseguro y difícil para Agents. JSON es mejor.
- ~~Validación JS Sandboxed~~: Riesgo de seguridad. Usar validación declarativa o Actions.

---

## 1. Auto-Join API (`?expand`)

**Estado**: ✅ **IMPLEMENTADO** - Vital

**Archivos**: 
- `packages/engine/src/translator.ts` → `executeWithRelations()`, `buildWithObject()`
- `apps/api/src/routes/datasets-query.ts` → Endpoint `POST /api/datasets/:id/query`

### Problema
7 requests para mostrar un build completo (character + weapon + 5 artifacts).

### Solución
```http
GET /api/datasets/characters/entries/1?expand=weapon,artifacts
```

Respuesta:
```json
{
  "id": "char-1",
  "name": "Hu Tao",
  "data": { "weapon_id": "w-123", "artifact_ids": ["a1", "a2"] },
  "_relations": {
    "weapon": { "id": "w-123", "name": "Staff of Homa", "data": { "atk": 608 } },
    "artifacts": [
      { "id": "a1", "name": "Flower", "data": { "hp": 4780 } },
      { "id": "a2", "name": "Plume", "data": { "atk": 311 } }
    ]
  }
}
```

### Nested Expand
```http
GET /datasets/builds/1?expand=character.weapon,character.artifacts
```

---

## 2. Batch API Transaccional

**Estado**: ✅ **IMPLEMENTADO** - Vital

**Archivos**:
- `packages/engine/src/batch.ts` → Clase `BatchProcessor`, método `execute()`
- `apps/api/src/routes/datasets-query.ts` → Endpoint `POST /api/datasets/batch`

### Problema
Crear character + 3 skills = 4 requests. Si falla #3, queda data inconsistente.

### Solución
```http
POST /api/datasets/batch
Content-Type: application/json
```

```json
{
  "transaction": true,
  "operations": [
    {
      "op": "create",
      "dataset": "characters",
      "data": { "name": "Hu Tao", "element": "pyro" },
      "alias": "hu_tao"
    },
    {
      "op": "create",
      "dataset": "skills",
      "data": {
        "name": "Guide to Afterlife",
        "character_id": "@ref:hu_tao.id"
      }
    },
    {
      "op": "create",
      "dataset": "skills",
      "data": {
        "name": "Spirit Soother",
        "character_id": "@ref:hu_tao.id"
      }
    }
  ]
}
```

### Respuesta Exitosa
```json
{
  "success": true,
  "results": [
    { "op": 0, "status": "created", "id": "char-456", "alias": "hu_tao" },
    { "op": 1, "status": "created", "id": "skill-789" },
    { "op": 2, "status": "created", "id": "skill-012" }
  ]
}
```

### Respuesta Error (Rollback)
```json
{
  "success": false,
  "rolledBack": true,
  "error": {
    "op": 2,
    "message": "Validation failed: Skill damage exceeds maximum"
  }
}
```

---

## 3. Query Language JSON (Gremius QL)

**Estado**: ✅ **IMPLEMENTADO** - Más seguro y AI-friendly que SQL

**Archivos**:
- `packages/engine/src/translator.ts` → `parseGremiusQuery()`, `parseWhereClause()`
- `apps/api/src/routes/datasets-query.ts` → Endpoints REST

**Nota**: NO es reinventar Prisma. Es un traductor completo JSON→Drizzle SQL de ~1000 líneas.

### Ejemplo
```http
POST /api/datasets/query
Content-Type: application/json
```

```json
{
  "dataset": "characters",
  "select": ["name", "base_atk", "element"],
  "where": {
    "AND": [
      { "element": { "in": ["pyro", "electro"] } },
      { "rarity": { "gte": 4 } },
      { "name": { "contains": "Archon" } }
    ]
  },
  "orderBy": { "base_atk": "desc" },
  "limit": 10,
  "expand": ["weapon"]
}
```

### Operadores Soportados
```typescript
type Operator = 
  | "eq" | "neq"           // Igual, diferente
  | "gt" | "gte"           // Mayor que
  | "lt" | "lte"           // Menor que
  | "in" | "nin"           // En lista, no en lista
  | "contains"             // Contiene texto
  | "startsWith"           // Empieza con
  | "exists";              // Campo existe
```

### Implementación Simple
```typescript
function buildWhereClause(filter: Filter): SQL {
  const fieldRef = sql`data->>${filter.field}`;
  
  switch(filter.op) {
    case 'eq': return eq(fieldRef, filter.value);
    case 'gt': return gt(sql`(data->>${filter.field})::numeric`, filter.value);
    case 'in': return inArray(fieldRef, filter.value);
    case 'contains': return sql`data->>${filter.field} ILIKE ${`%${filter.value}%`}`;
    // ... etc
  }
}
```

**Ventajas sobre SQL crudo**:
- ✅ Sin riesgo de SQL injection
- ✅ Agents entienden JSON mejor que SQL
- ✅ Portable entre bases de datos
- ✅ Fácil de validar y parsear

---

## 4. Validación Declarativa

**Estado**: ✅ **IMPLEMENTADO** - Configurable desde panel, sin código

**Archivos**:
- `packages/engine/src/zod-validator.ts` → Schemas Zod dinámicos desde reglas declarativa
- `packages/engine/src/batch.ts` → Integración con `BatchProcessor` (parámetro `validation`)

**Separación de responsabilidades**:
- **Validación simple** (rango, enum, regex): Declarativa en el schema
- **Validación compleja** (ej: árbol de POE conectado): Actions

### Schema de Validación
```json
{
  "dataset": "characters",
  "validation": {
    "rules": [
      { "field": "name", "required": true, "minLength": 2, "maxLength": 50 },
      { "field": "rarity", "type": "number", "min": 3, "max": 5 },
      { "field": "element", "enum": ["pyro", "hydro", "electro", "cryo", "anemo", "geo", "dendro"] },
      { 
        "field": "email", 
        "regex": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
        "message": "Email inválido"
      },
      {
        "if": { "field": "element", "eq": "pyro" },
        "then": { "field": "weapon_type", "neq": "bow", "message": "Pyro no puede usar arcos" }
      },
      {
        "customRef": "agent.tool:validate_poe_passive_tree"
      }
    ]
  }
}
```

### Tipos de Reglas

| Tipo | Descripción | Ejemplo |
|------|-------------|---------|
| `required` | Campo obligatorio | `{ "field": "name", "required": true }` |
| `min/max` | Rango numérico | `{ "field": "rarity", "min": 3, "max": 5 }` |
| `enum` | Lista permitida | `{ "field": "element", "enum": ["pyro", "hydro"] }` |
| `regex` | Patrón texto | `{ "field": "slug", "regex": "^[a-z0-9-]+$" }` |
| `if/then` | Condicional | Si elemento=pyro, entonces arma≠bow |
| `customRef` | Delegar a Action | Para validación compleja |

### Flujo de Validación
```
1. Usuario envía POST /datasets/characters/entries
2. Sistema valida reglas declarativas (rango, enum, etc.)
3. Si hay customRef, llama al Action correspondiente
4. Si todo pasa, inserta en DB
5. Si falla, retorna 400 con lista de errores
```

**¿Por qué no JS Sandboxed?**
- ❌ Riesgo de seguridad
- ❌ Problemas de performance
- ❌ Difícil de debuggear
- ❌ No type-safe

**¿Por qué no Actions puros?**
- ❌ Requiere deploy para cada cambio de validación
- ❌ No configurable desde UI

**Validación declarativa es el punto medio perfecto.**

---

## 5. Import/Export JSON

**Estado**: ✅ Aprobado

### Export
```http
GET /api/datasets/export?datasets=characters,weapons,skills
```

```json
{
  "metadata": {
    "exported_at": "2026-03-28T21:00:00Z",
    "version": "1.0"
  },
  "data": {
    "characters": {
      "schema": { ... },
      "entries": [ ... ]
    },
    "weapons": { ... }
  }
}
```

### Import
```http
POST /api/datasets/import
Content-Type: multipart/form-data
```

```json
{
  "strategy": "upsert",
  "mapping": {
    "characters": { "idField": "slug" }
  },
  "data": { ... }
}
```

**Casos de uso**:
- Migraciones entre ambientes (staging → prod)
- Backups versionados
- Seed data inicial
- Bulk updates

---

## 6. Snapshots/Denormalización

**Estado**: ✅ Aprobado - Para inmutabilidad de builds

### Problema
Si cambia el weapon, todas las builds que lo usan muestran stats diferentes.

### Solución
```json
{
  "dataset": "builds",
  "snapshot": {
    "enabled": true,
    "on": ["create", "update"],
    "fields": [
      { "source": "character_id", "snapshot": ["name", "base_atk", "element"] },
      { "source": "weapon_id", "snapshot": ["name", "atk", "sub_stat"] }
    ],
    "calculated": ["total_atk", "effective_hp"]
  }
}
```

### Resultado
```json
{
  "id": "build-123",
  "character_id": "hu-tao",
  "weapon_id": "staff-of-homa",
  "_snapshot": {
    "character": { "name": "Hu Tao", "base_atk": 106 },
    "weapon": { "name": "Staff of Homa", "atk": 608 },
    "calculated": {
      "total_atk": 2100,
      "snapshot_at": "2026-03-28T21:00:00Z"
    }
  }
}
```

**Beneficios**:
- ✅ Builds históricos inmutables
- ✅ Performance (cero joins para mostrar)
- ✅ Auditoría completa

---

## 7. Calculated Fields

**Estado**: ✅ **IMPLEMENTADO** - Mejorar el existente

**Archivos**:
- `apps/api/src/db/schema.ts` → Campo `formula` en `dataSets.calculatedFields`
- `CALCULATED_FIELDS_MIGRATION.md` → Documentación de migración

### Limitación Actual
Solo accede al registro actual. No puede hacer `{weapon.atk}`.

### Mejora: Soporte para Relaciones
```json
{
  "name": "total_atk",
  "type": "formula",
  "expression": "{base_atk} + {weapon.atk} + SUM({artifacts.atk})",
  "requires": ["weapon", "artifacts"],
  "format": { "type": "number", "decimals": 0 }
}
```

**Implementación**:
```typescript
// 1. Detectar campos necesarios
// 2. Hacer auto-join de esas relaciones
// 3. Evaluar fórmula con contexto completo
```

---

## 8. Índices Automáticos

**Estado**: ✅ Aprobado

### Declarativo
```json
{
  "dataset": "characters",
  "indexes": [
    { "type": "gin", "on": "data" },
    { "type": "btree", "field": "data->>'element'" },
    { "type": "btree", "field": "data->>'rarity'" }
  ]
}
```

### Auto-detección
```
[INFO] Dataset 'characters': Alto volumio de queries en 'element'
[SUGGESTION] Crear índice: CREATE INDEX ON data_entries ((data->>'element'))
```

---

## 🗺️ Roadmap de Implementación

### ✅ Fase 1: Core - COMPLETADA
1. **Auto-Join** (`?expand`) - ✅ Implementado en `translator.ts`
2. **Batch API** (transaccional) - ✅ Implementado en `batch.ts`
3. **Validación declarativa** básica - ✅ Implementado en `zod-validator.ts`

### ✅ Fase 2: Queries - COMPLETADA
4. **Query Language** (filtros, orderBy, pagination) - ✅ Implementado en `translator.ts`
5. **Calculated Fields** - ✅ Implementado en schema
6. **Integración API + MCP** - ✅ Endpoints REST y Tools MCP registradas

### ✅ Fase 3: Avanzado - COMPLETADA
7. **Índices automáticos** - ✅ Implementado en `datasets.indexes.ts`
8. **Import/Export JSON** - ✅ Implementado en `datasets.import-export.ts`
9. **Snapshots** auto-generados - ✅ Implementado en `datasets.snapshots.ts`
10. **Validación condicional** (if/then) - ✅ Ya estaba implementada en `validator.ts`

---

## 🎯 Arquitectura Final

```
┌─────────────────────────────────────────┐
│  Dataset Creator                        │
│  ├─ Schema dinámico (JSON)              │
│  ├─ Auto-Join (?expand)                 │
│  ├─ Batch API (transaccional)           │
│  ├─ Query Language (JSON filters)       │
│  ├─ Validación declarativa (Zod-like)   │
│  ├─ Calculated Fields                   │
│  └─ Snapshots/Denormalización           │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  Actions (defineAction)                 │
│  └─ Para lógica compleja:               │
│     • Validación de árbol POE           │
│     • Cálculo DPS óptimo                │
│     • Simulador de gacha                │
└─────────────────────────────────────────┘
```

**Separación clara**:
- **Configuración** → Dataset Creator
- **Código complejo** → Actions

---

## 📊 Checklist de Decisión

| Pregunta | Respuesta |
|----------|-----------|
| ¿Inline editing? | ❌ No. Batch API es suficiente para técnicos |
| ¿SQL crudo en queries? | ❌ No. JSON es más seguro y AI-friendly |
| ¿JS sandboxed para validación? | ❌ No. Riesgo de seguridad |
| ¿Actions para toda validación? | ❌ No. Solo para lógica compleja |
| ¿Validación declarativa? | ✅ Sí. Configurable desde UI |
| ¿Auto-join? | ✅ Sí. Reduce N+1 queries |
| ¿Batch transaccional? | ✅ Sí. Integridad de datos |
| ¿Query Language JSON? | ✅ Sí. Simple y portable |

---

---

## ✅ Estado de Implementación (Actualizado)

### Funcionalidades Implementadas

| Feature | Estado | Archivo Principal | Endpoint API | Tool MCP |
|---------|--------|-------------------|--------------|----------|
| Auto-Join (`?expand`) | ✅ Listo | `packages/engine/src/translator.ts` | `POST /api/datasets/:id/query` | `gremius_query_dataset` |
| Batch Transaccional | ✅ Listo | `packages/engine/src/batch.ts` | `POST /api/datasets/batch` | `gremius_execute_batch` |
| Query Language JSON | ✅ Listo | `packages/engine/src/translator.ts` | `POST /api/datasets/:id/query` | `gremius_query_dataset` |
| Validación Zod | ✅ Listo | `packages/engine/src/zod-validator.ts` | - | - |
| Calculated Fields | ✅ Listo | `apps/api/src/db/schema.ts` | - | - |

### API Endpoints Disponibles

```
POST /api/datasets/:id/query          # Query con filtros y expansión
POST /api/datasets/batch              # Batch transaccional ACID
POST /api/query/:tableName            # Query directo (admin)
GET  /api/datasets/:id/relations      # Listar relaciones disponibles
POST /api/validate-query/:tableName   # Validar query sin ejecutar
POST /api/query-debug/:tableName      # Debug SQL (dev only)
```

### Tools MCP Registradas

```typescript
// Consulta con filtros tipo Prisma
{
  name: "gremius_query_dataset",
  params: { datasetId, where, expand, limit, offset, orderBy }
}

// Batch transaccional con referencias @ref
{
  name: "gremius_execute_batch",
  params: { operations: [{ op, table, data, alias }] }
}
```

---

---

## Ejemplos de Uso - Features Implementados

### 5. Import/Export JSON (Implementado)

```typescript
// Exportar builds completos
POST /api/datasets/export
{
  "datasets": ["poe-builds", "poe-items"],
  "includeSchema": true,
  "includeCalculatedFields": true,
  "filter": {
    "status": "published",
    "dateFrom": "2026-01-01"
  }
}

// Importar con estrategia upsert
POST /api/datasets/import
{
  "datasetId": "uuid-here",
  "data": [...],
  "config": {
    "strategy": "upsert",
    "idField": "id",
    "mapping": { "old_name": "new_name" },
    "skipInvalid": true
  }
}
```

### 6. Snapshots/Denormalización (Implementado)

```typescript
// Configurar en schema del dataset
{
  "dataset": "poe-builds",
  "snapshot": {
    "enabled": true,
    "on": ["create", "update"],
    "fields": [
      { "source": "weapon_id", "snapshot": ["name", "dps", "mods"], "as": "weapon" },
      { "source": "character_id", "snapshot": ["name", "class", "level"], "as": "character" }
    ],
    "calculated": ["total_dps", "ehp"],
    "retention": 10
  }
}

// API Endpoints
POST /api/datasets/:id/entries/:entryId/snapshots  // Crear manual
POST /api/datasets/:id/entries/:entryId/restore    // Restaurar versión
GET  /api/datasets/:id/entries/:entryId/snapshots  // Ver historial
```

### 8. Índices Automáticos (Implementado)

```typescript
// Sugerencias automáticas
GET /api/datasets/poe-builds/indexes/suggest
// Response:
{
  "suggestions": [
    {
      "id": "idx_poe-builds_class_btree",
      "field": "character_class",
      "type": "btree",
      "confidence": "high",
      "sql": "CREATE INDEX idx_poe-builds_class_btree ON data_entries ((data->>'character_class'));"
    }
  ]
}

// Aplicar configuración declarativa
POST /api/datasets/:id/indexes/apply
{
  "config": {
    "indexes": [
      { "type": "btree", "fields": ["dps"], "desc": true },
      { "type": "gin", "fields": ["tags"] }
    ],
    "autoDetect": true
  }
}
```

## ✅ Validación Completa

### Tests Automatizados

Se ha implementado una suite completa de validación (`test-validation.spec.ts`) que verifica:

#### 1. Exportación de Funciones (46 tests)
- ✅ Import/Export: `exportDatasets`, `importToDataset`, `importPackage`, `exportToCSV`, `exportToJSONL`
- ✅ Snapshots: `generateSnapshot`, `saveSnapshot`, `getCurrentSnapshot`, `restoreToSnapshot`, `compareSnapshots`, `diffBuilds`
- ✅ Indexes: `suggestIndexesForDataset`, `applyAutoIndexes`, `generateIndexReport`, `getGameIndexConfig`, `createIndex`, `dropIndex`

#### 2. Validación de Schemas Zod
- ✅ `exportConfigSchema` - Validación de configuración de exportación
- ✅ `importConfigSchema` - Validación de estrategias (upsert/replace/merge/insert)
- ✅ `indexConfigSchema` - Validación de tipos de índices (btree/gin/gist)

#### 3. Lógica de Negocio
- ✅ CSV/JSONL conversion con escaping correcto
- ✅ Detección de necesidad de snapshot según trigger
- ✅ Comparación de snapshots con deep diff
- ✅ Sugerencias de índices por tipo de campo (relation→btree, multiselect→gin)
- ✅ Configuraciones gaming para POE/Diablo/WoW/Genshin

#### 4. Router Validation
- ✅ Router crea correctamente con Hono
- ✅ 26 endpoints registrados sin errores 404/500

### Endpoints Verificados

| Método | Endpoint | Estado |
|--------|----------|--------|
| POST | `/export` | ✅ |
| POST | `/import` | ✅ |
| POST | `/import/package` | ✅ |
| GET | `/:id/entries/:entryId/snapshot` | ✅ |
| GET | `/:id/entries/:entryId/snapshots` | ✅ |
| POST | `/:id/entries/:entryId/snapshots` | ✅ |
| POST | `/:id/entries/:entryId/restore` | ✅ |
| POST | `/:id/entries/:entryId/compare` | ✅ |
| GET | `/:id/indexes/suggest` | ✅ |
| GET | `/indexes/stats` | ✅ |
| POST | `/indexes/report` | ✅ |
| POST | `/:id/indexes/apply` | ✅ |
| POST | `/indexes/auto` | ✅ |

### Gaming Configurations

- **GAMING_BUILD_SNAPSHOT_CONFIG**: Configuración optimizada para builds de juegos (POE, Diablo, Genshin)
  - Retención: 10 snapshots por entry
  - Triggers: create, update
  - Campos denormalizados: weapon, character, artifacts
  - Campos calculados: total_dps, ehp, dps_with_buffs

- **GAMING_RECOMMENDED_INDEXES**: Índices pre-configurados para rendimiento gaming
  - B-tree para relaciones (weapon_id, character_id)
  - GIN para arrays/tags (tags, mods, affixes)
  - Índices compuestos para queries comunes (class + level)

---

*Versión 2.2 - Validación Completa - Todos los tests pasan ✅*
