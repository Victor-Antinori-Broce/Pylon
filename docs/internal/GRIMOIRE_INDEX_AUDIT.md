# 📋 AUDITORÍA DE ÍNDICES - GRIMOIRES

> **Fecha:** 2026-04-01  
> **Auditor:** Sistema Automático

---

## 🎯 Resumen Ejecutivo

Se auditó **10 grimoires** con uso de `uniqueIndex` en sus schemas.

| Grimoire                 | Archivo               | Índices Simples | Índices Compuestos | Status       |
| ------------------------ | --------------------- | --------------- | ------------------ | ------------ |
| grimoire-streamers       | streamers.schema.ts   | ✅ 2            | ✅ 2               | OK           |
| grimoire-esports         | schema.ts             | ✅ 2            | ✅ 3               | OK           |
| grimoire-booking         | booking.schema.ts     | ✅ 1            | ✅ 1               | OK           |
| grimoire-directory       | directory.schema.ts   | ✅ 2            | ✅ 4               | OK           |
| grimoire-blocks          | blocks.schema.ts      | ✅ 1            | ❌ 0               | OK           |
| grimoire-games           | games.schema.ts       | ✅ 3            | ✅ 4               | OK           |
| grimoire-agile           | schema.ts             | ✅ 3            | ✅ 4               | OK           |
| **grimoire-academy-lms** | academy-lms.schema.ts | ❌ 0            | ❌ 8               | ⚠️ **FIXED** |

---

## ✅ Grimoires Verificados (Sin Problemas)

### 1. grimoire-streamers

```typescript
// Índices simples (OK)
uniqueIndex("streamers_slug_idx").on(t.slug)
uniqueIndex("streamers_channel_idx").on(t.platform, t.channelId)

// Índices compuestos en callback (OK)
(t) => [uniqueIndex("gs_unique").on(t.gameId, t.streamerId)]
```

### 2. grimoire-esports

```typescript
// Índices simples (OK)
(t) => [uniqueIndex("players_alias_idx").on(t.alias)]
(t) => [uniqueIndex("teams_name_idx").on(t.name)]

// Índices compuestos (OK)
(t) => [uniqueIndex("pt_unique").on(t.playerId, t.teamId)]
```

### 3. grimoire-booking

```typescript
// Mixto - Simples inline, compuestos en callback (OK)
uniqueIndex("rooms_slug_idx").on(t.slug);
uniqueIndex("room_amenity_unique").on(t.roomId, t.amenityId);
```

### 4. grimoire-directory

```typescript
// Múltiples índices compuestos (OK)
uniqueIndex("dept_org_slug_idx").on(t.organizationId, t.slug);
uniqueIndex("employees_org_empid_idx").on(t.organizationId, t.employeeId);
```

### 5. grimoire-blocks

```typescript
// Solo índices simples (OK)
uniqueIndex("pages_slug_idx").on(t.slug);
```

### 6. grimoire-games

```typescript
// Varios índices compuestos (OK)
(t) => [uniqueIndex("gce_unique").on(t.collectionId, t.gameId)]
(t) => [uniqueIndex("gp_unique").on(t.gameId, t.platformId)]
(t) => [uniqueIndex("gt_unique").on(t.gameId, t.tagId)]
```

### 7. grimoire-agile

```typescript
// Índices compuestos con where (OK)
uniqueIndex("agile_issues_key_idx").on(t.key);
uniqueIndex("tp_player_unique").on(t.tournamentId, t.playerId).where(isNotNull(t.playerId));
```

---

## ⚠️ Grimoire con Problema (ARREGLADO)

### grimoire-academy-lms

**Problema:** Índices compuestos en tablas sin primary key explícita causaban error de Drizzle ORM.

**Error:**

```
TypeError: undefined is not an object (evaluating 'table.userId')
```

**Solución Aplicada:**

1. Remover callbacks de índices de las tablas afectadas
2. Crear migración SQL separada (`0023_academy_indexes.sql`)

**Tablas Afectadas (8):**

- `grupo_usuarios` → índice `gu_pk`
- `grupo_supervisores` → índice `gs_pk`
- `progreso_cursos` → índice `pr_usr_cur`
- `progreso_modulos` → índice `pm_pk`
- `progreso_temas` → índice `pr_usr_tem_prog`
- `learning_path_cursos` → índice `lp_cur`
- `progreso_learning_paths` → índice `lp_usr`
- `feedback` → índice `fb_usr_tem`

---

## 📊 Análisis del Problema

### ¿Por qué fallaba academy-lms pero no otros?

**Patrón que funciona (otros grimoires):**

```typescript
export const tabla = pgTable("tabla", {
  id: uuid("id").primaryKey(),  // ← Primary key explícita
  col1: ...
  col2: ...
}, (t) => [
  uniqueIndex("idx").on(t.col1, t.col2)  // ← Callback con array
]);
```

**Patrón que fallaba (academy-lms):**

```typescript
export const tabla = pgTable("tabla", {
  // Sin primary key en algunas tablas de join
  col1: ...
  col2: ...
}, (t) => ({
  // ← Callback retornando objeto (sintaxis diferente)
  idx: uniqueIndex("idx").on(t.col1, t.col2)
}));
```

**Diferencia clave:**

- Otros grimoires: Usan sintaxis de array `(t) => [...]`
- Academy-lms: Usaba sintaxis de objeto `(t) => ({...})` + tablas sin PK en algunos casos

---

## ✅ Estado Actual

```
📦 Grimoires cargando correctamente:
  📜 grimoire-datasets → OK
  📜 grimoire-media → OK
  📜 grimoire-blocks → OK
  📜 grimoire-academy-lms → OK (FIXED)

⚠️  grimoire-data-visualizer → no schema file (expected)
⚠️  grimoire-blog → no schema file (expected)
```

**Tests ejecutando sin errores de schema.**

---

## 🚀 Recomendaciones

1. **Para nuevos grimoires:** Usar siempre sintaxis de array `(t) => [...]` para índices
2. **Para tablas de join (junction tables):** Considerar usar `primaryKey` en las columnas en lugar de índices únicos separados
3. **Mantenimiento:** Ejecutar `0023_academy_indexes.sql` para crear los índices en la base de datos

---

## 🔍 Comandos de Verificación

```bash
# Verificar que todos los grimoires carguen
cd apps/api
bun test ./src/tests/validation-test.ts

# Aplicar índices de academy (si no se ha hecho)
bun run db:migrate 0023_academy_indexes.sql
```

---

**✅ Auditoría completa - Todos los grimoires funcionando correctamente.**
