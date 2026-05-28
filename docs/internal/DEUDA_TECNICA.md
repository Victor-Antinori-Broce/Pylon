# 📋 Inventario de Deuda Técnica - GremiusCMS

**Fecha de auditoría:** 2026-04-26  
**Auditor:** Arquitecto de Sistemas Principal  
**Estado general:** 🟢 Muy baja — Refactor de admin completado

---

## 🎉 Mejoras Recientes (2026-04-26)

| Item | Estado Antes | Estado Después |
|------|--------------|----------------|
| Errores TypeScript | 60 errores | ✅ 0 errores |
| ESLint/Prettier | ❌ No configurado | ✅ Configurado y activo |
| CI/CD | ❌ Inexistente | ✅ GitHub Actions |
| Pre-commit hooks | ❌ No había | ✅ Husky + lint-staged |
| Código Legacy | 445 archivos | ✅ Eliminado |
| Tests Unitarios | 1 test | ✅ 20+ tests |
| Admin monolitos (CRM/Conta/Agile) | ⚠️ Existentes | ✅ **Eliminados** |
| API Client tipado | ❌ Strings sueltos | ✅ **Servicios completos** |
| Settings General | ⚠️ Mock | ✅ **Persiste vía PATCH** |
| Hybrid Rendering | ❌ No implementado | ✅ **100% funcional** |
| Rate Limiting | ❌ No implementado | ✅ **Implementado** |
| Observabilidad | ❌ No implementado | ✅ **Health checks + logs** |

---

## 🎯 Resumen Ejecutivo Actual

| Categoría | Items | Severidad | Estado |
|-----------|-------|-----------|--------|
| Errores TypeScript | 0 | 🟢 Baja | ✅ Resuelto |
| Código Legacy | 0 archivos | 🟢 Baja | ✅ Resuelto |
| CI/CD | Configurado | 🟢 Baja | ✅ Resuelto |
| Linting | Activo | 🟢 Baja | ✅ Resuelto |
| Admin monolitos | 0 | 🟢 Baja | ✅ Resuelto |
| Tests Faltantes | ~85% cobertura | 🟡 Media | 🔄 En progreso |
| Scheduling | No implementado | 🟡 Media | ⏳ Pendiente |
| Analytics | No implementado | 🟡 Media | ⏳ Pendiente |
| i18n | No implementado | 🟢 Baja | ⏳ Pendiente |
| CDN/Edge Cache | No implementado | 🟢 Baja | ⏳ Pendiente |

**Deuda Técnica Total:** ~10% (Reducida de ~45%)

---

## ✅ RESUELTO: Admin Monolitos → Hybrid Rendering

**Fecha de resolución:** 2026-04-22

**Archivos eliminados:**
- ✅ `packages/admin/src/views/crm/CRMView.svelte` — monolito CRM eliminado
- ✅ `packages/admin/src/views/conta/ContaView.svelte` — monolito Conta eliminado
- ✅ `packages/admin/src/views/agile/AgileView.svelte` — monolito Agile eliminado
- ✅ `packages/admin/src/views/crm/{Company,Contact,Activity,Deal}{List,Form}.svelte` — reemplazados por DataExplorer
- ✅ `packages/admin/src/views/conta/{Account,Journal,Ledger,Template,Disbursement}{List,Form}.svelte` — reemplazados
- ✅ `packages/admin/src/views/workers/` — eliminado
- ✅ `packages/admin/src/views/webhooks/` — eliminado
- ✅ `packages/admin/src/routes/workers/` — eliminado
- ✅ `packages/admin/src/routes/webhooks/` — eliminado

**Resultado:**
- CRM: de ~11 componentes a **2 custom views**
- Conta: de ~10 componentes a **4 custom views**
- Agile: de 1 monolito de 702 líneas a **0 custom views** (puro DataExplorer)
- % tablas en DataExplorer: **~75%** (supera meta de >70%)

---

## ✅ RESUELTO: API Client Tipado

**Fecha de resolución:** 2026-04-22

**Archivos creados:**
- `packages/admin/src/lib/services/crm.ts` — 348 líneas
- `packages/admin/src/lib/services/conta.ts` — 510 líneas
- `packages/admin/src/lib/services/agile.ts` — 262 líneas

**Impacto:** Cero llamadas API con strings sueltos en el admin.

---

## ✅ RESUELTO: Settings General Persistente

**Fecha de resolución:** 2026-04-22

- `saveGeneralSettings()` en Settings.svelte ahora hace `PATCH /api/settings` real
- Carga inicial desde `GET /api/settings`
- Persiste: siteName, siteDescription, siteUrl, branding.logoUrl

---

## ✅ RESUELTO: Rate Limiting

**Fecha de resolución:** 2026-04-19

- Global rate limit: 100 requests / 15 min
- Auth endpoints: 5 intentos / 15 min
- Implementado con `hono-rate-limiter`

---

## ✅ RESUELTO: Observabilidad

**Fecha de resolución:** 2026-04-19

- `/api/health` — health checks de DB, Queue, Realtime, Memory
- `/api/health/pgvector` — verificación de extensión vector
- Structured logging con Pino
- Request tracing con requestId

---

## 🟡 SEVERIDAD MEDIA (En Progreso)

### Cobertura de Tests (~15% actual, meta 60%)

**Estado Actual:**
| Tipo | Cantidad | Cobertura |
|------|----------|-----------|
| Tests E2E (Playwright) | 11 | ⚠️ Básica |
| Tests Unitarios Backend | 1 suite | ⚠️ Muy baja |
| Tests Unitarios Frontend | 20 | ✅ Aceptable |
| Tests de Integración | 0 | ❌ Faltante |

**Plan de Mejora:**
```
Fase 1 (1 semana): Tests críticos
  - Auth (login, registro, permisos)
  - RLS (aislamiento de datos)
  - Datasets (CRUD básico)

Fase 2 (2 semanas): Tests de integración
  - Flujo completo: crear dataset → agregar entry → publicar
  - Grimoires: activar/desactivar
  - MCP: tools y resources

Fase 3 (1 semana): Tests E2E
  - Login → Crear dataset → Agregar entrada
  - Cambiar realm → Verificar grimoires
```

**Archivos prioritarios para testing:**
- `apps/api/src/lib/auth.ts` — Critical
- `apps/api/src/middleware/transactional-rls.ts` — Critical
- `apps/api/src/routes/items.ts` — High (API unificada)
- `apps/api/src/routes/datasets.ts` — High

---

## ⏳ PENDIENTE: Scheduling / Publicación Programada

**Estado:** ❌ No implementado

**Problema:** No se puede programar publicación de contenido para el futuro.

**Impacto:** Limita workflows editoriales (blogs, landing pages).

**Solución Propuesta:**
```typescript
// 1. Agregar campo publishAt a entries
// 2. Job de cron cada minuto:
"UPDATE data_entries SET status='published' WHERE publishAt <= NOW()"
// 3. UI en admin: date picker en formularios
```

**Prioridad:** Media

---

## ⏳ PENDIENTE: Analytics Dashboard

**Estado:** ⚠️ Básico (solo observabilidad técnica)

**Problema:** Métricas de sistema (CPU, memoria) sí existen, pero NO métricas de negocio.

**Lo que falta:**
```typescript
// Métricas de producto:
- MAU/DAU (usuarios activos)
- Popularidad de datasets
- Entries creados por día
- Tiempo promedio de sesión
- Conversion rates
- API usage por endpoint
```

**Prioridad:** Media

---

## ⏳ PENDIENTE: Multi-idioma (i18n)

**Estado:** ❌ No implementado

**Problema:**
- UI del admin mezcla inglés/español
- Sin localización consistente
- Sin traducción de contenido

**Impacto:** Limitado a mercados unilingües.

**Prioridad:** Baja

---

## ⏳ PENDIENTE: CDN / Edge Caching

**Estado:** ❌ No implementado

**Problema:** Todo el tráfico va directo al servidor Bun.

**Solución:** Cloudflare, Nginx reverse proxy, o Varnish.

**Prioridad:** Baja (no bloqueante para MVP)

---

## 📊 Métricas de Calidad

### Antes vs Después

```
┌─────────────────────────────┬──────────┬──────────┐
│ Métrica                     │ Antes    │ Ahora    │
├─────────────────────────────┼──────────┼──────────┤
│ Errores TypeScript          │ 60       │ 0 ✅     │
│ Archivos Legacy             │ 445      │ 0 ✅     │
│ ESLint/Prettier             │ ❌       │ ✅       │
│ CI/CD                       │ ❌       │ ✅       │
│ Pre-commit Hooks            │ ❌       │ ✅       │
│ Admin monolitos             │ 3        │ 0 ✅     │
│ API Client tipado           │ ❌       │ ✅       │
│ Rate Limiting               │ ❌       │ ✅       │
│ Observabilidad              │ ❌       │ ✅       │
│ Tests (frontend)            │ 0        │ 20 ✅    │
│ Tests (backend)             │ 1        │ 1        │
│ Cobertura Total             │ ~5%      │ ~15%     │
│ Deuda Técnica Estimada      │ 45%      │ 10% 🎉   │
└─────────────────────────────┴──────────┴──────────┘
```

---

## 🎯 Próximos Pasos (Roadmap)

### Q2 2026
- [ ] Alcanzar 40% cobertura de tests
- [ ] Implementar scheduling / publicación programada
- [ ] Implementar analytics dashboard
- [ ] Mover tipos inline de Settings.svelte a `@gremius/shared`

### Q3 2026
- [ ] Alcanzar 60% cobertura de tests
- [ ] Implementar i18n
- [ ] Implementar CDN / edge caching
- [ ] Documentación API automática (OpenAPI completo)

---

## 📚 Referencias

- [CODE_QUALITY.md](./CODE_QUALITY.md) - Estándares de código
- [PROGRESS.md](./PROGRESS.md) - Progreso del proyecto
- `.github/workflows/ci.yml` - Pipeline de CI/CD
- `.eslintrc.cjs` - Configuración ESLint
- `.prettierrc` - Configuración Prettier
- `docs/PLAN_IMPLEMENTACION_ADMIN_SVELTE.md` - Refactor del admin
