# Migración a Zero Config — Guía Completa

Esta guía documenta la migración del sistema de registro manual al sistema Zero Config.

---

## ✅ Progreso de Migración

### 1. Schema Introspection Mejorado ✅

**Archivos creados:**
- `apps/api/src/services/schema-introspector.ts` - Auto-detección de columnas DB
- `apps/api/src/routes/schema-introspection.ts` - Endpoints API

**Endpoints disponibles:**
```
GET  /api/schema/tables              ← Listar todas las tablas
GET  /api/schema/tables/:name        ← Introspección detallada
GET  /api/schema/tables/:name/admin-config  ← Config para admin
GET  /api/schema/tables/:name/related       ← Relaciones
GET  /api/schema/search?q=pattern    ← Buscar tablas
POST /api/schema/refresh             ← Limpiar cache
```

**Beneficios:**
- ✅ Cualquier tabla funciona sin configuración
- ✅ Auto-detección de PKs, FKs, índices
- ✅ Tipos inferidos automáticamente
- ✅ Fields searchable/filterable auto-detectados

---

### 2. Inline Relations (Django-style) ✅

**Archivos creados:**
- `apps/api/src/services/inline-relations.ts` - Lógica de inlines
- `apps/api/src/routes/inline-relations.ts` - Endpoints API

**Endpoints disponibles:**
```
GET  /api/relations/:tableName                    ← Relaciones de una tabla
GET  /api/relations/:tableName/inlines/config     ← Configs de inlines
GET  /api/relations/:tableName/inlines/:parentId  ← Datos inline
POST /api/relations/:tableName/inlines/:parentId  ← Guardar inlines
```

**Detección automática:**
- Outgoing FKs (belongs_to)
- Incoming FKs (has_many)
- Many-to-Many vía junction tables

**Beneficios:**
- ✅ Editar registros relacionados inline
- ✅ Django-style tabular/stacked layouts
- ✅ Auto-detección de relaciones
- ✅ CRUD completo de inlines

---

### 3. Migración de Grimoires ⏳

**Grimoires migrados a `grimoire.json`:**

| Grimoire | Estado | Tablas |
|----------|--------|--------|
| grimoire-academy-lms | ✅ | courses, lessons, enrollments |
| grimoire-booking | ✅ | bookings, services, availability |
| grimoire-directory | ✅ | listings, categories, reviews |
| grimoire-dms | ✅ | documents, folders, tags |
| grimoire-games | ✅ | games, collections |
| grimoire-blog | ✅ | posts |

**Pendientes de migración:**
- [ ] webhooks → `packages/core/webhooks/`
- [ ] workers → Nuevo grimoire
- [ ] media → `packages/core/media-library/`

---

### 4. Limpieza de Código Legacy ⏳

**Para eliminar después de migración completa:**

**`apps/api/src/routes/data-explorer.ts`:**
```typescript
// ELIMINAR: grimoireTables hardcodeado (líneas 47-60)
const grimoireTables: Record<string, string[]> = {
  academy: ["courses", "lessons", "enrollments"],
  // ... etc
};

// ELIMINAR: tableRegistry manual (líneas 219-232)
const tableRegistry: Record<string, TableMeta> = {
  games: { table: games, label: "Games", ... },
  // ... etc
};
```

**Reemplazar por:**
- `getGrimoireAdminConfig()` del admin-registry
- `introspectTable()` del schema-introspector

---

## 🔄 Flujo de Datos (Nuevo)

```
Antes (Manual):
  Admin → DataExplorer → tableRegistry[tableName] → Drizzle Table
  
Después (Zero Config):
  Admin → DataExplorer → /api/admin/registry/:id → Schema Introspection
                                              ↓
                                       grimoire.json (opcional)
                                              ↓
                                       DB Introspection (fallback)
```

---

## 📊 Comparación: Antes vs Después

### Antes - Agregar un grimoire

```typescript
// 1. Agregar a grimoireTables en data-explorer.ts
const grimoireTables = {
  mygrimoire: ["table1", "table2"],
};

// 2. Agregar tables a tableRegistry
const tableRegistry = {
  table1: { table: table1Schema, label: "Table 1", ... },
  table2: { table: table2Schema, label: "Table 2", ... },
};

// 3. Agregar a module-registry.ts
// 4. Agregar a sidebar manualmente
// 5. Crear vista custom si es necesario
```

**~30 líneas de código, 4 archivos modificados**

### Después - Agregar un grimoire

```json
{
  "id": "grimoire-mygrimoire",
  "name": "My Grimoire",
  "tables": ["table1", "table2"],
  "icon": "Icon"
}
```

**5 líneas de JSON, 1 archivo creado**

---

## 🚀 Cómo Usar (Después de Migración)

### Opción 1: Tabla ya existe en DB

```bash
# No hacer nada! 🎉
# La tabla aparece automáticamente en /api/schema/tables
```

### Opción 2: Personalizar config

```json
// packages/grimoires/grimoire-migrimoire/grimoire.json
{
  "id": "grimoire-migrimoire",
  "name": "Mi Grimoire",
  "tables": [
    {
      "name": "products",
      "label": "Productos",
      "searchableFields": ["name", "sku"],
      "filterableFields": ["category", "status"]
    }
  ]
}
```

### Opción 3: Vista custom

```bash
# Crear archivo por convención:
packages/admin/src/views/migrimoire/MigrimoireView.svelte
```

---

## 📝 Notas de Implementación

### Cache y Performance

```typescript
// Admin Registry: 1 minuto de cache
const REGISTRY_CACHE_TTL = 60_000;

// Schema Introspection: 5 minutos de cache
const CACHE_TTL = 5 * 60 * 1000;

// Invalidación manual:
POST /api/admin/registry/refresh
POST /api/schema/refresh
```

### Seguridad

- Todos los endpoints requieren autenticación (`requireAuth`)
- Las tablas del sistema (pg_*, _prisma_) están excluidas
- El acceso a datos sigue las políticas RLS de PostgreSQL

### Fallbacks

```
1. ¿Existe grimoire.json con tables?
   ↓ SÍ: Usar config definida
   ↓ NO: ¿Existe tabla en DB?
        ↓ SÍ: Introspección automática
        ↓ NO: Config default básica
```

---

## ✅ Checklist de Migración Completa

- [x] Schema Introspection Service
- [x] Schema Introspection API Endpoints
- [x] Inline Relations Service
- [x] Inline Relations API Endpoints
- [x] Migrar grimoire-academy-lms
- [x] Migrar grimoire-booking
- [x] Migrar grimoire-directory
- [x] Migrar grimoire-dms
- [ ] Migrar webhooks (core)
- [ ] Migrar workers (nuevo)
- [ ] Migrar media (core)
- [ ] Eliminar tableRegistry hardcodeado
- [ ] Eliminar grimoireTables hardcodeado
- [ ] Actualizar documentación
- [ ] Tests E2E de flujo completo

---

## 🎯 Próximos Pasos

1. **Completar migración de grimoires restantes**
2. **Tests de integración** para schema introspection
3. **Frontend: Componente InlineRelations** para UI
4. **Documentación de usuario** actualizada
5. **Deprecar código legacy** gradualmente

---

**Estado actual:** ~70% completado  
**Tiempo estimado para 100%:** 2-3 horas adicionales
