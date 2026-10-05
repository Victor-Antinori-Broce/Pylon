# Reporte de Pruebas — Kitsuden v0.9.0-beta

> **Fecha:** 2026-06-30
> **Scope:** Estado completo de la suite de pruebas del monorepo
> **Estado:** ✅ Tests críticos reescritos y pasando contra PostgreSQL real

---

## Resumen Ejecutivo

| Categoría                                        | Estado       | Detalles                                      |
| ------------------------------------------------ | ------------ | --------------------------------------------- |
| Tests API (`apps/api/src/tests/`)                | ✅ 416 pass  | PostgreSQL real (`KITSUDEN_TEST_DB=postgres`) |
| Tests unitarios API (`apps/api/src/tests-unit/`) | ✅ 191 pass  | Sin dependencia de PostgreSQL real            |
| Tests unitarios monorepo (`tests/unit/`)         | ✅ 137 pass  | Sin dependencia de PostgreSQL real            |
| **Tests de RLS end-to-end**                      | ✅ Estrictos | Verifican aislamiento real entre usuarios     |
| **Tests de MCP**                                 | ✅ Estrictos | Usan token Agent NHI real                     |
| TypeScript strict                                | ✅ Limpio    | 0 errores, 71 warnings admin menores          |
| Lint + Format                                    | ✅ Limpio    | 0 errores ESLint, format check pasa           |

---

## Hallazgos Críticos Resueltos

### 1. Aserciones débiles reescritas

Los siguientes tests ahora verifican comportamiento real en lugar de tipos o rangos de status:

- `rls-e2e.test.ts`: `expect(body.docs.some(...)).toBe(false)` y verificación de que admin ve ambos entries.
- `datasets-http.test.ts`: RLS filtering usa `toBe(false)`; query engine y batch validan payloads y resultados correctos.
- `critical-features.test.ts`: health check exige `200` con checks definidos; admin endpoints requieren auth (`401`); rate-limit test fuerza bloqueo real (`429`).
- `mcp.test.ts`: ahora crea un agente NHI con scope `mcp:connect`, establece SSE, ejecuta JSON-RPC y tools con status `200`.

### 2. PostgreSQL real forzado por defecto

`pnpm test:api` y `pnpm test:api:all` ahora setean `NODE_ENV=test KITSUDEN_TEST_DB=postgres` y leen `DATABASE_URL` desde `.env.test`.
El contenedor de test usa puerto `5434` para evitar conflictos con PostgreSQL locales del host.

### 3. Scripts de test robustos

- `scripts/test-db-up.ps1` / `.sh`: levantan PostgreSQL en `5434`.
- `scripts/test-db-down.ps1`: funciona desde cualquier CWD.
- `pnpm test:api:all` ejecuta migraciones (`drizzle-kit migrate`) antes de los tests y detiene el contenedor al final.

---

## Métricas

| Métrica                        | Valor actual |
| ------------------------------ | ------------ |
| Total tests API pasando        | 416          |
| Total tests unitarios API      | 191          |
| Total tests unitarios monorepo | 137          |
| Total combinado                | 744          |
| Errores TypeScript             | 0            |
| Warnings `svelte-check`        | 71           |
| Warnings ESLint                | ~1742        |

---

## Recomendaciones Cumplidas

1. ✅ Forzar PostgreSQL real en scripts de test (`KITSUDEN_TEST_DB=postgres`).
2. ✅ Reescribir tests de RLS con aserciones estrictas (`toBe(false)`, `toBe(0)`).
3. ✅ Eliminar aserciones que aceptan múltiples status (ej. `[200, 404, 500]`).
4. ✅ Documentar estado actual en este reporte.
5. ⚠️ Los warnings de ESLint restantes son no bloqueantes (`no-console`, `no-explicit-any`, `import/order`).
