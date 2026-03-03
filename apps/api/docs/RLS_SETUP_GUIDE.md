# Guía de Configuración RLS - El Muro de Titanio

## Checklist de Activación

### Paso 1: Migración de Base de Datos ✅
```bash
# Aplicar migración de Drizzle (columna owner_id)
cd apps/api
bun drizzle-kit migrate
```

**Verificación:**
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'data_entries' AND column_name = 'owner_id';
-- Debe retornar: owner_id | text
```

### Paso 2: Aplicar Políticas RLS
```bash
# Ejecutar script de aplicación de políticas
bun run scripts/apply-rls.ts
```

**Salida esperada:**
```
🛡️  Aplicando Políticas RLS Nativas de PostgreSQL...

📡 Verificando conexión a PostgreSQL...
   ✅ Conectado: PostgreSQL 15.x

📄 Cargando políticas desde rls-policies.sql...
   ✅ Archivo cargado (8908 bytes)

🔧 Aplicando políticas RLS...
   ✅ ALTER TABLE: data_entries
   ✅ CREATE POLICY: data_entries_owner_isolation
   ✅ CREATE POLICY: data_entries_public_read
   ✅ CREATE FUNCTION: is_rls_active
   ✅ CREATE FUNCTION: current_rls_user_id
   ✅ CREATE FUNCTION: set_rls_context
   ✅ CREATE FUNCTION: clear_rls_context
   ✅ CREATE INDEX: idx_data_entries_dataset_owner
   ✅ CREATE INDEX: idx_data_entries_data_owner

🔍 Verificando políticas aplicadas...
   ✅ 2 política(s) activa(s):
      • data_entries.data_entries_owner_isolation (ALL)
      • data_entries.data_entries_public_read (SELECT)

📊 Estado RLS en tablas críticas:
   data_entries: 🟢 RLS HABILITADO

════════════════════════════════════════════════════════════
✅ POLÍTICAS RLS APLICADAS EXITOSAMENTE
════════════════════════════════════════════════════════════
🛡️  El Muro de Titanio está activo.
```

### Paso 3: Verificar Integración API

El middleware ya está integrado en `apps/api/src/index.ts`:

```typescript
// Líneas clave:
app.use("/api/datasets/:id/entries", withTransactionalRLS());
app.use("/api/datasets/:slug/entries", withTransactionalRLS());
```

### Paso 4: Testing Manual

```bash
# 1. Iniciar API
cd apps/api
bun run dev

# 2. En otra terminal, testear con curl (autenticado)
curl -H "Cookie: session=..." \
     http://localhost:3001/api/datasets/test/entries

# 3. Verificar en logs que el contexto RLS se inyecta:
# [RLS] Iniciando transacción para usuario: user-xxx
```

### Paso 5: Verificación SQL Directa

```sql
-- Conectar a PostgreSQL
psql -d gremius

-- Ver contexto vacío (sin usuario)
SELECT current_setting('app.current_user_id', true);
-- Resultado: '' (vacío)

-- Simular contexto de usuario
SELECT set_config('app.current_user_id', 'test-user-123', false);
SELECT current_setting('app.current_user_id', true);
-- Resultado: 'test-user-123'

-- Query con RLS activo
SELECT id, title, owner_id FROM data_entries LIMIT 5;
-- Debe retornar SOLO registros donde owner_id = 'test-user-123'
-- o registros públicos (si existen)

-- Limpiar contexto
SELECT set_config('app.current_user_id', '', false);
```

---

## Solución de Problemas

### Error: "policy already exists"
**Solución:** El script maneja esto automáticamente (modo idempotente). Ignorar.

### Error: "permission denied for table data_entries"
**Causa:** El usuario de PostgreSQL no tiene permisos para crear políticas.
**Solución:** Ejecutar como superusuario o usuario con `CREATE POLICY` privilege.

### Error: "column owner_id does not exist"
**Causa:** Migración no aplicada.
**Solución:** Ejecutar `bun drizzle-kit migrate` primero.

### Los entries retornan vacíos cuando no deberían
**Causa:** El contexto RLS está establecido pero no hay coincidencias.
**Debug:**
```sql
-- Ver qué user_id está activo
SELECT current_setting('app.current_user_id', true);

-- Ver entries sin filtro RLS (como superuser)
SET row_security = off;
SELECT id, title, owner_id FROM data_entries;
```

---

## Rollback (Desactivar RLS)

```sql
-- Desactivar RLS en tabla
ALTER TABLE data_entries DISABLE ROW LEVEL SECURITY;

-- O eliminar políticas específicas
DROP POLICY IF EXISTS data_entries_owner_isolation ON data_entries;
DROP POLICY IF EXISTS data_entries_public_read ON data_entries;
```

---

## Monitoreo

### Logs de Seguridad
En desarrollo, el middleware loguea:
```
[RLS] Iniciando transacción para usuario: user-xxx
[RLS] Transacción completada: user-xxx
[RLS] Error en transacción para user-xxx: {...}
```

### Métricas Recomendadas
- Latencia p99 de endpoints con RLS
- Tasa de errores 403 (acceso denegado por RLS)
- Número de queries rechazadas por políticas RLS

---

## Soporte

- **Documentación técnica:** `docs/RLS_HYBRID_ARCHITECTURE.md`
- **Script de aplicación:** `scripts/apply-rls.ts`
- **Políticas SQL:** `src/db/rls-policies.sql`
- **Middleware:** `src/middleware/transactional-rls.ts`
