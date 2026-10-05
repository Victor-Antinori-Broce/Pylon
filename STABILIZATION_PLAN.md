# Plan de Estabilización — Kitsuden v0.8.0 → Beta Real

> **Estado actual:** Alpha avanzada con refactor arquitectónico masivo en curso.
> **Meta:** Llegar a una beta estable, testeada y lista para deploys de producción controlados.
> **Estimación total:** 3–4 semanas de trabajo enfocado (1 desarrollador senior).

---

## 🔄 Estado Actual Revisado (2026-06-16)

El proyecto ha avanzado significativamente desde la redacción original de este plan:

- ✅ **TypeScript strict** pasa limpio en API, shared, admin, sdk, mcp-server, cli y orm.
- ✅ **Builds** funcionan para shared, api (8.33 MB) y admin (adapter-static).
- ✅ **604 tests pasan** (413 en `apps/api/src/tests/` + 191 en `apps/api/src/tests-unit/`).
- ✅ **Auth unificado**: Better-Auth + Agents NHI; API keys legacy deprecadas.
- ✅ **Repo limpio**: `apps/api/src/modules/` eliminado; pocos artefactos compilados trackeados.
- ⚠️ **Tests críticos usan aserciones débiles** (especialmente RLS) que dan falsa confianza.
- ⚠️ **Docker/deploy** tiene secrets hardcodeados y problemas de seguridad.
- ⚠️ **Admin Svelte** builda pero tests fallan y hay links rotos en el dashboard.
- ⚠️ **Kons** tienen inconsistencias entre schemas locales y migraciones oficiales.

**Estimación actualizada para beta pública:** 2–3 semanas enfocadas en seguridad, calidad de tests, Docker y pulido del admin.

---

---

## Principios del Plan

1. **No reescribir, estabilizar.** El refactor a kons ya está en marcha; hay que terminarlo, no revertirlo.
2. **TypeScript como guardián.** Si `tsc --noEmit` no pasa limpio, no hay release.
3. **Tests antes de features.** Ningún nuevo feature hasta que los flows críticos tengan tests de integración.
4. **Un sistema de auth.** Tres sistemas conviviendo (cookies + API keys + agents) es una bomba de tiempo.
5. **Repo limpio.** Cero artefactos compilados en `src/`. Cero archivos basura en root.

---

## Fase 0: Checkpoint — Salvar el Estado Actual

**Tiempo estimado:** 1 día  
**Bloqueante para:** Todo lo demás

### Tareas

- [ ] Crear una rama `git checkout -b pre-stabilization-backup`
- [ ] Commitear TODO el estado actual (incluyendo los 690 archivos unstaged):
  ```bash
  git add -A
  git commit -m "checkpoint: pre-stabilization snapshot (690 files)"
  ```
- [ ] Crear un tag: `git tag v0.8.0-alpha-checkpoint`
- [ ] Subir la rama y el tag al remoto (si aplica)
- [ ] Crear una rama de trabajo: `git checkout -b stabilization/main`

### Criterio de salida

> Existe una rama/tag a la que se puede volver si algo se rompe durante la estabilización.

---

## Fase 1: Higiene del Repositorio

**Tiempo estimado:** 1–2 días  
**Bloqueante para:** Fase 2 (TypeScript)

### 1.1 Eliminar artefactos compilados del árbol de fuentes

**Problema:** `.js`, `.d.ts`, `.js.map`, `.d.ts.map` están mezclados con `.ts` en:

- `apps/api/src/`, `apps/api/scripts/`, `apps/api/migrations/`
- `packages/kons/*/`
- `packages/mcp-server/src/`
- `packages/sdk/src/`
- `packages/engine/src/`
- `packages/starters/*/`

**Comandos:**

```bash
# 1. Quitar del tracking de git (pero conservar en disco por si acaso)
git rm --cached -r apps/api/src/**/*.js apps/api/src/**/*.js.map apps/api/src/**/*.d.ts apps/api/src/**/*.d.ts.map
git rm --cached -r apps/api/scripts/**/*.js apps/api/scripts/**/*.js.map apps/api/scripts/**/*.d.ts apps/api/scripts/**/*.d.ts.map
git rm --cached -r apps/api/migrations/**/*.js apps/api/migrations/**/*.js.map apps/api/migrations/**/*.d.ts apps/api/migrations/**/*.d.ts.map

# 2. Kons
for dir in packages/kons/*/; do
  git rm --cached -r "$dir"*.js "$dir"*.js.map "$dir"*.d.ts "$dir"*.d.ts.map 2>/dev/null || true
done

# 3. MCP Server, SDK, Engine, Starters
git rm --cached -r packages/mcp-server/src/**/*.js packages/mcp-server/src/**/*.d.ts packages/mcp-server/src/**/*.js.map packages/mcp-server/src/**/*.d.ts.map
git rm --cached -r packages/sdk/src/**/*.js packages/sdk/src/**/*.d.ts packages/sdk/src/**/*.js.map packages/sdk/src/**/*.d.ts.map
git rm --cached -r packages/engine/src/**/*.js packages/engine/src/**/*.d.ts packages/engine/src/**/*.js.map packages/engine/src/**/*.d.ts.map
git rm --cached -r packages/starters/**/*.js packages/starters/**/*.d.ts packages/starters/**/*.js.map packages/starters/**/*.d.ts.map

# 4. Limpiar archivos basura de root
git rm --cached build-diag.txt build-diag2.txt kitsuden.md kitsuden_progress.txt null api.err tsc-errors.txt 2>/dev/null || true
rm -f build-diag.txt build-diag2.txt null api.err tsc-errors.txt

# 5. Commit
git add -A
git commit -m "chore: remove compiled artifacts and junk files from source tree"
```

**Nota:** El `.gitignore` ya tiene las reglas correctas. El problema es que estos archivos fueron commiteados antes de que existieran esas reglas.

### 1.2 Consolidar directorios de migraciones

**Problema:** Tres directorios de migraciones:

- `apps/api/drizzle/` (migraciones oficiales de Drizzle)
- `apps/api/src/db/migrations/` (migraciones SQL manuales)
- `apps/api/migrations/` (scripts TS de migración)

**Tareas:**

- [ ] Mover todo a `apps/api/drizzle/` (es el estándar de Drizzle Kit)
- [ ] Los scripts TS de migración (`cleanup-legacy-actions.ts`, etc.) pasan a `apps/api/scripts/migrations/`
- [ ] Actualizar `drizzle.config.ts` para que apunte al directorio correcto
- [ ] Verificar que `bun run db:migrate` sigue funcionando

### 1.3 Consolidar documentación de progreso

**Tareas:**

- [ ] Mover `progress.txt`, `progresssvelte.txt`, `apps/api/progress.txt`, `backendbaas.md`, `documentsbookstack.md` a un directorio `docs/internal/` o `notes/`
- [ ] Eliminar duplicados
- [ ] Archivar `apps/admin/svelte_migration.txt` si ya terminó la migración

### Criterio de salida

> `git ls-files | grep -E "\.(js|d\.ts|js\.map|d\.ts\.map)$"` solo muestra archivos que **deben** estar trackeados (ej: `package.json`, configs de JS).

---

## Fase 2: TypeScript Limpio

**Tiempo estimado:** 3–5 días  
**Bloqueante para:** Fase 4 (Tests)

### 2.1 Quitar `@ts-nocheck` del entry point y core

**Archivos críticos a limpiar (en orden de prioridad):**

| Prioridad | Archivo                              | Por qué                    |
| :-------- | :----------------------------------- | :------------------------- |
| P0        | `apps/api/src/index.ts`              | Entry point de toda la API |
| P0        | `apps/api/src/db/schema-core.ts`     | Schema base de la DB       |
| P0        | `apps/api/src/db/schema.ts`          | Compat layer               |
| P0        | `apps/api/src/lib/module-loader.ts`  | Carga dinámica de kons     |
| P0        | `apps/api/src/lib/schema-merger.ts`  | Merge de schemas           |
| P1        | `apps/api/src/routes/crud.ts`        | CRUD base                  |
| P1        | `apps/api/src/routes/agents.ts`      | Sistema de agentes         |
| P1        | `apps/api/src/routes/mcp.ts`         | MCP server                 |
| P2        | Kons (`packages/kons/*/*.ts`)        | Módulos de negocio         |
| P2        | Admin (`packages/admin/src/**/*.ts`) | Panel de admin             |

**Estrategia:**

1. Quitar `// @ts-nocheck`
2. Correr `cd apps/api && bunx tsc --noEmit`
3. Resolver errores de arriba hacia abajo (no dejar `any` salvajes; usar `unknown` + narrowing)
4. Si un archivo tiene >50 errores, dividirlo en subtareas

### 2.2 Estandarizar el `tsconfig.json`

**Tareas:**

- [ ] Activar `strict: true` en `apps/api/tsconfig.json`
- [ ] Asegurar que `skipLibCheck: true` está activo (para no pelear con dependencias)
- [ ] Agregar `noEmit: true` en tsconfig de dev (para prevenir compilaciones accidentales en src/)
- [ ] Asegurar que cada package del workspace tiene su propio `tsconfig.json` con `composite: true` si se usa project references

### 2.3 Prevenir compilaciones accidentales en src/

**Tareas:**

- [ ] Verificar que el script `build` de `package.json` root usa `outDir: "dist"` o equivalente
- [ ] En `apps/api/package.json`, el build es `bun build src/index.ts --outdir dist --target bun` ✅ (ya está bien)
- [ ] Verificar que `packages/shared` compila a `dist/` (no a src/)

### Criterio de salida

> `cd apps/api && bunx tsc --noEmit` pasa sin errores.  
> `cd packages/shared && pnpm exec tsc --noEmit` pasa sin errores.  
> Cero archivos en `src/` con `@ts-nocheck`.

---

## Fase 3: Arquitectura Estable — Consolidar Kons

**Tiempo estimado:** 4–6 días  
**Bloqueante para:** Fase 4 (Tests), Fase 5 (Auth)

### 3.1 Matar el código legacy de módulos monolíticos

**Problema:** `apps/api/src/modules/` aún tiene stubs que apuntan a kons (vistos en git status como archivos eliminados pero posiblemente referenciados en código).

**Tareas:**

- [ ] Verificar que NADA en el codebase importa desde `apps/api/src/modules/*`
- [ ] Si algo importa de ahí, redirigir a `packages/kons/*`
- [ ] Eliminar el directorio `apps/api/src/modules/` por completo
- [ ] Eliminar rutas legacy que re-exportan módulos antiguos (`apps/api/src/routes/blog.ts`, `collections.ts`, `games.ts`, `datasets.ts`, `datasets-openapi.ts`, `media.ts`, `upload.ts`, `theme-config.ts`)

### 3.2 Estabilizar el `module-loader`

**Problema:** `apps/api/src/lib/module-loader.ts` es un archivo crítico con `@ts-nocheck` y lógica compleja de resolución de módulos.

**Tareas:**

- [ ] Escribir tests unitarios para `module-loader.ts` (sin DB):
  - Resolución de paths (local, node_modules, grimoire bundled)
  - Orden de carga por prioridad
  - Manejo de dependencias faltantes
  - Graceful fallback si un kon falla al cargar
- [ ] Documentar el protocolo de kon (qué exporta `index.ts`, qué firma tiene `createRouter`)

### 3.3 Consolidar el schema

**Problema:** Existen múltiples capas de schema:

- `schema-core.ts` (tablas base)
- `schema.ts` (compat layer)
- `schema-all.ts` (para drizzle-kit)
- `schema-patch-blocks.ts` (parche)

**Tareas:**

- [ ] Definir una fuente única de verdad: **`schema-core.ts` es el schema base**
- [ ] `schema.ts` debe ser solo `export * from "./schema-core"` (sin tablas de dominio)
- [ ] Las tablas de dominio (games, streamers, etc.) viven SOLO en sus kons
- [ ] `schema-all.ts` debe importar `schema-core` + schemas de kons activos (dinámicamente o via lista estática)
- [ ] Aplicar la migración que elimina `gameId` de `data_sets` (pendiente desde Fase 1 del progress.txt)

### 3.4 Validar que todos los kons activos cargan

**Script de validación:**

```bash
# Este script debería existir y pasar limpio
bun run apps/api/src/tests/verify-dynamic-grimoires.ts
```

**Tareas:**

- [ ] Verificar que cada kon en `kitsuden.config.ts` con `enabled: true`:
  - Tiene su `kon.json` válido
  - Exporta `defineKon()` correctamente
  - Su `createRouter` no crashea al montarse
  - Sus dependencias están satisfechas

### Criterio de salida

> `apps/api/src/modules/` no existe.  
> El API arranca sin warnings de "legacy" ni "fallback".  
> `bun test src/tests/modules.test.ts` pasa y valida que todos los kons enabled resuelven.

---

## Fase 4: Tests de Integración Críticos

**Tiempo estimado:** 5–7 días  
**Bloqueante para:** Fase 7 (Release)

### 4.1 Tests de Auth HTTP end-to-end

**Nuevos archivos a crear:**

- `apps/api/src/tests/auth-http.test.ts`

**Cobertura mínima:**

- [ ] POST `/api/auth/sign-up` → crea usuario
- [ ] POST `/api/auth/sign-in` → retorna cookie válida
- [ ] GET `/api/auth/get-session` → retorna usuario autenticado
- [ ] Acceso a `/api/admin/*` sin auth → 401
- [ ] Acceso a `/api/admin/*` como user normal → 403
- [ ] Acceso a `/api/admin/*` como admin → 200

### 4.2 Tests de Dataset CRUD + Entries

**Archivo existente:** `datasets.test.ts` (tiene tests de DB pero no de HTTP).  
**Nuevo archivo:** `apps/api/src/tests/datasets-http.test.ts`

**Cobertura:**

- [ ] Crear dataset via HTTP
- [ ] Listar datasets
- [ ] Insertar entry JSONB
- [ ] Query entry con filtros
- [ ] Update entry
- [ ] Delete entry
- [ ] Verificar que RLS filtra entries de otro usuario

### 4.3 Tests de RLS end-to-end

**Archivo existente:** `rls.test.ts` (básico).  
**Nuevo archivo:** `apps/api/src/tests/rls-e2e.test.ts`

**Cobertura:**

- [ ] Usuario A crea un dataset y entry
- [ ] Usuario B no puede ver el entry de A (HTTP 404 o lista vacía)
- [ ] Usuario A puede ver su propio entry
- [ ] Admin puede ver entries de ambos (si aplica)
- [ ] Verificar que `set_config('app.current_user_id', ...)` se invoca en cada request

### 4.4 Tests de Kon HTTP

**Nuevo archivo:** `apps/api/src/tests/kon-games-http.test.ts` (ejemplo)

**Cobertura:**

- [ ] GET `/api/games` → lista juegos
- [ ] POST `/api/games` → crea juego (admin)
- [ ] GET `/api/games/:id` → retorna juego
- [ ] Verificar que las relaciones (games → platforms, tags) funcionan

### 4.5 Tests del MCP Server

**Nuevo archivo:** `apps/api/src/tests/mcp.test.ts`

**Cobertura mínima:**

- [ ] GET `/api/mcp` → establece conexión SSE
- [ ] POST `/api/mcp` → responde a `initialize`
- [ ] Tool `kitsuden_query_dataset` funciona via JSON-RPC
- [ ] Tool respeta RLS (no devuelve datos de otros usuarios)

### 4.6 Tests de Actions Engine

**Nuevo archivo:** `apps/api/src/tests/actions-engine.test.ts`

**Cobertura:**

- [ ] Registrar una action simple
- [ ] Disparar action via HTTP
- [ ] Verificar que se encola en BullMQ
- [ ] Verificar ejecución del worker

### 4.7 Cobertura mínima objetivo

| Módulo             | Tests mínimos | Tipo        |
| :----------------- | :------------ | :---------- |
| Auth HTTP          | 15            | Integration |
| Dataset CRUD       | 15            | Integration |
| RLS E2E            | 10            | Integration |
| Kons (2 ejemplos)  | 12            | Integration |
| MCP Server         | 8             | Integration |
| Actions Engine     | 8             | Integration |
| Module Loader      | 10            | Unit        |
| **Total objetivo** | **~78**       | —           |

Sumados a los 71 existentes = **~150 tests** para declarar beta.

### Criterio de salida

> `bun test` pasa con >140 tests.  
> Cobertura de líneas >60% en `apps/api/src/` (usar `bun test --coverage`).

---

## Fase 5: Auth Unificado

**Tiempo estimado:** 3–4 días  
**Bloqueante para:** Fase 7 (Release)

### 5.1 Deprecar API Keys legacy (`Bearer kitsuden_sk_*`)

**Problema:** El sistema tiene tres auth:

1. Better-Auth cookies (humanos)
2. API Keys legacy (`kitsuden_sk_`) — DEPRECATED
3. Agent NHI (`kitsuden_agent_`) — nuevo

**Tareas:**

- [ ] Migrar todas las integraciones que usan `kitsuden_sk_` a Agents
- [ ] Agregar un script de migración: `scripts/migrate-api-keys-to-agents.ts`
  - Lee `apiKeys` de la DB
  - Crea un Agent por cada API key
  - Genera nuevo token `kitsuden_agent_xxx`
  - Guarda mapping para notificar al usuario
- [ ] Cambiar el middleware de API keys para loggear `warn`: `"API Keys are deprecated, migrate to Agents"`
- [ ] Plan de eliminación: v0.9.0 elimina API keys legacy

### 5.2 Consolidar permisos de Agentes

**Tareas:**

- [ ] Verificar que `agent-rbac.ts` cubre todos los scopes necesarios
- [ ] Documentar los scopes disponibles (`dataset:read`, `dataset:write`, `admin`, etc.)
- [ ] Tests de agent auth:
  - Agent con scope correcto → acceso permitido
  - Agent sin scope → 403
  - Agent con token inválido → 401

### Criterio de salida

> Solo quedan 2 sistemas de auth: Better-Auth (humanos) y Agents (máquinas/NHI).  
> API keys legacy siguen funcionando pero loggean warning de deprecación.  
> Existe un script de migración documentado.

---

## Fase 6: Admin UI Consolidado

**Tiempo estimado:** 3–4 días  
**Bloqueante para:** Fase 7 (Release)

### 6.1 Determinar el estado real del admin ✅ COMPLETED

**Resultados:**

- ✅ `packages/admin/` compila y builda exitosamente (`svelte-check`: 0 errores, 315 warnings a11y/CSS; `vite build`: success en ~53s)
- ✅ `apps/admin/` **ya fue eliminado** en migración anterior. No existe.
- ✅ `apps/admin/src/_legacy_vue_archive/` **ya fue eliminado**. No existe.
- ✅ Directorios vacíos `Pylon/` y `pylon1/` eliminados (artifacts basura)

**Warnings restantes (no bloqueantes):**

- 315 warnings de `svelte-check`, mayormente:
  - `a11y_label_has_associated_control` — labels sin `for` explícito
  - `element_invalid_self_closing_tag` — self-closing en non-void elements
  - `css_unknown_at_rule` — `@apply` de Tailwind no reconocido por el checker

**Tareas pendientes:**

- [ ] Probar flujo completo con servidor corriendo: Login → Dashboard → Datasets → Entries → Settings
- [ ] Documentar vistas rotas en un `packages/admin/ROADMAP.md` (si las hay)

### 6.2 Decisión: ¿matar o revivir vistas rotas?

**Opción A (Recomendada para Beta):**

- Mantener solo las vistas que funcionan
- Esconder las rotas rotas del router
- Documentar qué no está listo

**Opción B (Si hay tiempo):**

- Arreglar las vistas críticas (Datasets, Entries, Auth)

### 6.3 Archivos Vue legacy — ESTADO

**Eliminados:**

- ✅ `apps/admin/` — eliminado en migración anterior
- ✅ `apps/admin/src/_legacy_vue_archive/` — eliminado en migración anterior
- ✅ `Pylon/`, `pylon1/` — directorios vacíos eliminados

**Nota:** `packages/starters/kitsuden-blog-template/` usa Astro + Vue islands como starter template oficial. Esto NO es legacy — es un producto activo que ofrece Vue como opción de frontend. No eliminar.

**Orphan code pendiente de decisión:**

- ⚠️ `capacitaciones_app/` — App Django LMS de 63 archivos + 29 migraciones. No referenciada en docker-compose ni package.json. Aparece en `module-registry.ts` como tablas relacionadas a `kon-academy-lms`. **Requiere confirmación del usuario para eliminar.**

### Criterio de salida

> `pnpm dev` en `packages/admin` arranca sin errores.

- Login funcional
- CRUD de datasets funcional
- Settings funcional
  > Las vistas no listas están ocultas, no rotas.

---

## Fase 7: Release Beta

**Tiempo estimado:** 1–2 días  
**Bloqueante para:** Nada (es la meta)

### 7.1 Versionado y Changelog

- [ ] Actualizar `package.json` root a `0.9.0-beta`
- [ ] Actualizar todos los `package.json` de workspaces a la misma versión
- [ ] Escribir `CHANGELOG.md` con todo lo que cambió desde la última versión usable
- [ ] Tag: `git tag v0.9.0-beta`

### 7.2 Docker y Deploy

- [ ] Verificar que `docker compose build` funciona sin `--no-frozen-lockfile` (sincronizar pnpm-lock.yaml)
- [ ] Verificar que `docker compose up` levanta API + DB + Admin + Valkey
- [ ] Verificar health checks (`/api/health`)
- [ ] Script de deploy: `scripts/deploy.sh` debe ser funcional y documentado

### 7.3 Documentación mínima para beta testers

- [ ] `README.md` actualizado con instrucciones de setup
- [ ] `START-GUIDE.md` verificado paso a paso
- [ ] Documentar qué está listo y qué no (ej: "El page builder está en alpha")

### 7.4 Checklist final

- [ ] `tsc --noEmit` limpio en API, shared, admin
- [ ] `bun test` pasa (>140 tests)
- [ ] `pnpm run lint` pasa
- [ ] `pnpm run format:check` pasa
- [ ] Docker build limpio
- [ ] Repo limpio (cero archivos compilados en src/)
- [ ] Un solo sistema de auth activo (agents), legacy deprecated
- [ ] Admin funcional para flows críticos
- [ ] Changelog escrito

---

## Calendario Sugerido (1 desarrollador full-time)

| Semana       | Fases                              | Entregable                                                     |
| :----------- | :--------------------------------- | :------------------------------------------------------------- |
| **Semana 1** | Fase 0 + Fase 1 + Fase 2 (parcial) | Repo limpio, entry point sin `@ts-nocheck`, tsc limpio en core |
| **Semana 2** | Fase 2 (resto) + Fase 3            | Toda la API pasa tsc, kons consolidados, modules/ eliminado    |
| **Semana 3** | Fase 4 + Fase 5 (parcial)          | >140 tests pasando, auth unificado en progreso                 |
| **Semana 4** | Fase 5 (resto) + Fase 6 + Fase 7   | Beta release v0.9.0-beta, admin funcional, docs actualizadas   |

---

## Métricas de Éxito

| Métrica                            | Actual                               | Meta Beta                |
| :--------------------------------- | :----------------------------------- | :----------------------- |
| Archivos `@ts-nocheck` en API      | ~13 (scripts/utils)                  | 0 (entry point/core)     |
| Tests                              | 604                                  | >140 (cantidad superada) |
| Cobertura de líneas real           | ~15%                                 | >60%                     |
| Sistemas de auth activos           | 2                                    | 2 (1 legacy deprecado)   |
| Archivos compilados en src/        | ~18                                  | 0                        |
| Tiempo de `bun test`               | ~50s                                 | <2s                      |
| `docker compose build`             | Funcional con problemas de seguridad | Limpio y seguro          |
| Tests de RLS con aserciones reales | ❌                                   | ✅                       |
| Docker sin secrets hardcodeados    | ❌                                   | ✅                       |
| Admin tests pasando                | ❌                                   | ✅                       |

---

## Notas Finales

- **No agregues features nuevos durante la estabilización.** Ni un solo kon nuevo.
- **Si algo se siente "rápido y sucio", es señal de que va en `ROADMAP.md`, no en el código.**
- **El objetivo de beta no es que esté perfecto; es que esté predecible.** Un beta tester debe poder deployar, romperlo, y saber por qué se rompió.

¿Te parece realista? ¿Quieres que empecemos por alguna fase en particular?
