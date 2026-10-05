# Plan de Implementación — Admin Svelte (Hybrid Rendering)

> Derivado de `adminkons.md` y el estado real del código en v0.8.0-beta  
> Objetivo: Reducir deuda técnica de vistas monolito, habilitar DataExplorer para el 70%+ de tablas, y separar concerns de admin vs producto.

---

## 🎉 ESTADO ACTUAL (Actualizado 2026-04-26)

**Todas las fases del plan original están COMPLETADAS.** El refactor del admin a Hybrid Rendering se completó exitosamente.

| Fase                                 | Estado            | Notas                                                  |
| ------------------------------------ | ----------------- | ------------------------------------------------------ |
| Fase 0: Infra Hybrid Rendering       | ✅ **COMPLETADA** | `KonPage` respeta `admin.views` desde `kon.json`       |
| Fase 1: CRM — De Monolito a Hybrid   | ✅ **COMPLETADA** | De ~11 componentes a 2 custom views justificadas       |
| Fase 2: Conta — Reducción de 60%     | ✅ **COMPLETADA** | De ~10 componentes a 4 custom views justificadas       |
| Fase 3: Agile — Decisión de Producto | ✅ **COMPLETADA** | Eliminado del admin. Puro DataExplorer (5 grids)       |
| Fase 4: API Client Tipado            | ✅ **COMPLETADA** | `crm.ts`, `conta.ts`, `agile.ts` creados y funcionando |
| Fase 5: Settings General + Cleanup   | ✅ **COMPLETADA** | Settings persiste vía PATCH, huérfanos eliminados      |

**Métricas de Éxito (Actual):**

| Métrica                  | Antes                   | Target | Después                     |
| ------------------------ | ----------------------- | ------ | --------------------------- |
| % tablas en DataExplorer | ~30%                    | > 70%  | **~75%** ✅                 |
| Custom views CRM         | ~11                     | 3-5    | **2** ✅                    |
| Custom views Conta       | ~10                     | 3-4    | **4** ✅                    |
| Custom views Agile       | 1 monolito (702 líneas) | 0-2    | **0** ✅                    |
| Llamadas API con strings | > 0                     | 0      | **0** ✅                    |
| Tipos inline en views    | > 0                     | 0      | **~5** ⚠️ (Settings.svelte) |

---

## Resumen del Refactor Ejecutado

### Lo que se hizo

1. **Backend (`admin-registry.ts`)**: Se implementó `extractViewsFromManifest()` que lee `admin.views` de cada `kon.json` como fuente primaria de configuración de vistas.

2. **Frontend (`kon-loader.ts`)**: Se eliminaron los monolitos del `KON_VIEW_REGISTRY` (CRM, Conta, Agile) y se registraron solo las vistas custom por ID (`kon-crm-dashboard`, `kon-conta-journal-form`, etc.).

3. **Cleanup**: Se eliminaron físicamente del filesystem los componentes obsoletos (`CompanyList.svelte`, `AccountList.svelte`, etc.) y los monolitos (`CRMView.svelte`, `ContaView.svelte`, `AgileView.svelte`).

4. **API Client Tipado**: Se crearon servicios completos en `packages/admin/src/lib/services/{crm,conta,agile}.ts` con CRUD tipado para todas las entidades.

5. **Settings General**: `saveGeneralSettings()` ya no es mock — hace `PATCH /api/settings` real.

---

## Nuevas Fases Pendientes (Post-Refactor)

### Fase 6: DataExplorer Enhancements (3-5 días)

**Objetivo**: Mejorar la experiencia del DataExplorer para casos edge.

- **Kanban con nombres legibles**: Resolver relaciones `stateId` → `state.name` en tarjetas
- **Row actions**: Botones inline (approve/decline) para intakes de Agile
- **Inline relations**: Mostrar contacts relacionados al editar un Company (Django-style inlines)

**Archivos a modificar:**

- `packages/admin/src/lib/components/admin/DataExplorer.svelte`
- `packages/admin/src/lib/components/admin/AutoFormModal.svelte`

---

### Fase 7: Testing (2-3 semanas)

**Objetivo**: Llegar a 60% de cobertura.

**Plan:**

```
Semana 1: Tests críticos
  - Auth flow completo (login, registro, permisos)
  - RLS (aislamiento de datos entre usuarios)
  - Datasets CRUD básico

Semana 2: Tests de integración
  - Flujo completo: crear dataset → agregar entry → publicar
  - Kons: activar/desactivar
  - MCP: tools y resources

Semana 3: Tests E2E
  - Login → Crear dataset → Agregar entrada
  - Cambiar grimoire → Verificar kons
```

**Archivos prioritarios:**

- `apps/api/src/middleware/transactional-rls.ts`
- `apps/api/src/routes/items.ts`
- `apps/api/src/routes/datasets.ts`

---

### Fase 8: Scheduling / Publicación Programada (2-3 días)

**Objetivo**: Permitir programar publicación de contenido.

- Agregar campo `publishAt` a entries
- Job de cron que revisa cada minuto: `UPDATE entries SET status='published' WHERE publishAt <= NOW()`
- UI en admin para seleccionar fecha/hora de publicación

---

### Fase 9: Analytics Dashboard (3-5 días)

**Objetivo**: Métricas de negocio/uso en el admin.

- MAU/DAU (usuarios activos)
- Popularidad de datasets
- Entries creados por día
- API usage por endpoint
- Gráficos en el dashboard del admin

---

## Riesgos y Mitigaciones (Actualizado)

| Riesgo                                    | Estado      | Mitigación                                                     |
| ----------------------------------------- | ----------- | -------------------------------------------------------------- |
| DataExplorer no cubre un caso edge        | ⚠️ Vigente  | Mantener vista custom como fallback; iterar sobre DataExplorer |
| Usuarios acostumbrados al layout monolito | ✅ Resuelto | Transición completada sin incidentes                           |
| Kanban de Agile no compatible             | ✅ Resuelto | Agile eliminado del admin; vive en grimoire si es necesario    |
| Breaking change en rutas                  | ✅ Resuelto | Rutas legacy siguen funcionando; sidebar apunta a `/g/{id}`    |

---

_Plan creado para Kitsuden v0.8.0-beta. Refactor completado 2026-04-22. Documento actualizado 2026-04-26._
