# Fase 3 Deploy Checklist

## Pre-Deploy Checklist

- [ ] Backup de base de datos realizada
- [ ] Código actualizado en servidor (git pull)
- [ ] Dependencias instaladas (bun install)
- [ ] Variables de entorno configuradas
- [ ] Servicio de base de datos funcionando
- [ ] Puerto de API disponible

## Deploy Steps

### 1. Preparar Backend

```bash
cd apps/api

# Instalar dependencias
bun install

# Compilar (si es necesario)
bun run build
```

### 2. Aplicar Migración de Schema

```bash
# Generar migración
bunx drizzle-kit generate

# Aplicar migración
bunx drizzle-kit push
```

**Verificar:** Las tablas `actions` y `action_executions` deben existir.

### 3. Reiniciar Servicio

```bash
# Si usas PM2
pm2 restart api

# O directamente
bun run src/index.ts
```

**Verificar en logs:**

```
[Actions] Engine initialized
⏰ Cron Scheduler initialized: X job(s) loaded
```

### 4. Migrar Datos

```bash
# En el servidor, ejecutar:
bun run src/db/migrations/migrate-to-actions.ts
```

**Verificar:**

- Functions migradas: X
- Webhooks migradas: X

### 5. Verificar Integración

```bash
# Ejecutar tests de integración
bun run src/db/migrations/verify-actions-integration.ts
```

**Esperado:** Todos los tests pasan (✅)

### 6. Verificar Funcionalidad

#### 6.1 UI Admin

- [ ] Abrir `/actions` en admin
- [ ] Ver lista de actions (workers + webhooks unificados)
- [ ] Crear test action
- [ ] Ejecutar test action
- [ ] Ver logs de ejecución

#### 6.2 API Endpoints

```bash
# Listar actions
curl http://localhost:3001/api/actions

# Crear action
curl -X POST http://localhost:3001/api/actions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Action",
    "type": "code",
    "trigger": "manual",
    "config": { "code": "export default async (ctx) => { return { ok: true }; }" }
  }'

# Ejecutar action (reemplazar ID)
curl -X POST http://localhost:3001/api/actions/{id}/execute
```

#### 6.3 Cron Jobs

- [ ] Verificar en logs: `⏰ [CRON] Scheduled "name"`
- [ ] Esperar próxima ejecución programada
- [ ] Verificar que se ejecuta correctamente

#### 6.4 Event Dispatch

- [ ] Crear entry en un dataset con action asociada
- [ ] Verificar que se dispara el action
- [ ] Verificar logs de ejecución

### 7. Backward Compatibility

- [ ] Testear `/api/functions` (legacy) - debe seguir funcionando
- [ ] Testear `/api/custom/webhooks` (legacy) - debe seguir funcionando
- [ ] Testear redirecciones `/workers` → `/actions`
- [ ] Testear redirecciones `/webhooks` → `/actions`

### 8. Monitoreo

Después del deploy, monitorear por 24-48 horas:

```bash
# Logs en tiempo real
pm2 logs api

# Verificar errores
grep -i "error\|failed\|exception" /var/log/gremius/api.log

# Métricas de base de datos
psql -c "SELECT type, status, COUNT(*) FROM actions GROUP BY type, status;"
psql -c "SELECT status, COUNT(*) FROM action_executions WHERE created_at > NOW() - INTERVAL '1 hour' GROUP BY status;"
```

#### Métricas Importantes

- [ ] Actions activos: `SELECT COUNT(*) FROM actions WHERE status = 'active';`
- [ ] Ejecuciones exitosas última hora
- [ ] Ejecuciones fallidas última hora
- [ ] Tiempo promedio de ejecución
- [ ] Errores en logs

## Post-Deploy (Después de 1-2 semanas de estabilidad)

### Cleanup de Legacy (Opcional)

**⚠️ Solo ejecutar después de verificar estabilidad completa**

```bash
# Dry run primero
bun run src/db/migrations/cleanup-legacy-actions.ts --dry-run

# Ejecutar cleanup
bun run src/db/migrations/cleanup-legacy-actions.ts --execute --force
```

Esto eliminará:

- Tabla `gremius_functions`
- Tabla `function_executions`
- Tabla `webhooks` (si existe)
- Enums legacy

### Limpieza de Código (Opcional)

Después del cleanup de DB, se puede eliminar:

- `apps/api/src/routes/functions.ts` (o marcar como deprecated)
- Código legacy en `function-dispatcher.ts`
- Fallbacks en UI para APIs legacy

## Rollback Plan

Si algo sale mal:

### 1. Revertir Código

```bash
git checkout <commit-anterior>
pm2 restart api
```

### 2. Restaurar DB (si es necesario)

```bash
# Restaurar desde backup
pg_restore -d gremius backup-pre-actions-unification.dump
```

**Nota:** Los datos nuevos creados en `actions` no se perderán, pero no serán accesibles por el código viejo.

## Troubleshooting

### Problema: "actions table does not exist"

**Solución:** Aplicar migración con `drizzle-kit push`

### Problema: "No actions found" después de migración

**Solución:** Verificar que `migrate-to-actions.ts` se ejecutó sin errores. Revisar `actions.legacy_id` y `actions.legacy_type`.

### Problema: Cron jobs no se ejecutan

**Solución:**

1. Verificar en logs: `⏰ Cron Scheduler initialized`
2. Verificar actions con `trigger = 'cron'` y `status = 'active'`
3. Verificar expresiones cron válidas

### Problema: Eventos no disparan actions

**Solución:**

1. Verificar `initActionsEngine()` en logs
2. Verificar mapeo de eventos en `EVENT_MAP`
3. Verificar `triggerConfig.eventName` en actions

### Problema: Legacy API no funciona

**Solución:** Verificar que los IDs mapean correctamente entre `legacy_id` y `actions.id`

## Contacto

En caso de problemas graves durante el deploy:

- Revisar logs detalladamente
- Ejecutar `verify-actions-integration.ts` para diagnóstico
- Consultar documentación en `docs/ACTIONS_UNIFICATION.md`
