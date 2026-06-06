# GremiusCMS como Framework Backend / BaaS

> **Evaluación de arquitectura y hoja de ruta para transformar GremiusCMS de CMS de gaming a framework backend desplegable como BaaS.**
>
> _Versión del análisis: 0.1_  
> _Fecha: 2026-04-19_

---

## 📊 Resumen Ejecutivo

GremiusCMS está **más cerca de ser un BaaS de lo que parece**. Su infraestructura de nivel 1 (Engine) ya posee la mayoría de las primitivas que requiere una plataforma backend moderna: autenticación multi-modal, RLS nativo, esquemas dinámicos JSONB, query engine, sandbox de funciones, colas, caché, y un protocolo MCP nativo para agentes de IA.

El problema no es capacidad técnica, sino **acoplamiento de dominio**. Hoy el sistema es un CMS de gaming con una arquitectura de BaaS por debajo, pero con tablas de dominio hardcodeadas en el core y un ecosistema de plugins (grimoires) que solo funciona dentro del monorepo.

| Métrica              | Score | Nota                                                          |
| -------------------- | ----- | ------------------------------------------------------------- |
| Infraestructura BaaS | 8/10  | Engine, RLS, JSONB, MCP, Actions. Sólido.                     |
| Extensibilidad       | 5/10  | Grimoires locales solamente. Sin registry ni npm.             |
| Genericidad del Core | 4/10  | Tablas `games`, `streamers`, `blog_posts` en schema core.     |
| API Auto-generada    | 5/10  | Datasets CRUD existe pero no es discoverable enough.          |
| Multi-tenancy        | 3/10  | Single-tenant por diseño. Sin `tenant_id` primitivo.          |
| Admin desacoplado    | 6/10  | SvelteKit con carga dinámica parcial. Aún rutas hardcodeadas. |

**Veredicto:** Para convertirse en framework BaaS, Gremius necesita principalmente **desacoplar el dominio gaming del core** y **hacer los grimoires instalables desde fuera del monorepo**.

---

## ✅ Fortalezas BaaS-Grade (Lo que ya funciona)

### 1. Esquemas Dinámicos (`datasets` + `data_entries` JSONB)

El corazón de cualquier BaaS es permitir que el usuario defina colecciones sin tocar SQL. Gremius ya lo tiene:

- `data_sets` define el esquema configurable por el usuario.
- `data_entries` almacena los payloads serializados en JSONB.
- Evita `ALTER TABLE` y bloqueos de DDL en producción.
- **Impacto:** Esto es exactamente lo que hace Directus, Supabase (con su layer), y Strapi.

### 2. Autenticación Multi-Modal

- **Humanos:** Better-Auth con sesiones seguras.
- **Máquinas:** API Keys legacy (`gremius_sk_*`).
- **Agentes NHI:** Non-Human Identities con scopes granulares, rate limiting propio, y tokens `grm_agent_*`.
- **Impacto:** Un BaaS real necesita todos estos modos. Gremius ya los tiene unificados en el middleware de auth.

### 3. Row-Level Security (RLS) Nativo de PostgreSQL

- Inyección de `app.current_user_id` por transacción.
- Políticas RLS filtran automáticamente en la base de datos, no en la aplicación.
- Protege contra fugas de datos incluso si un agente MCP genera queries incorrectos.
- **Impacto:** Enterprise-grade. La mayoría de CMS open source no tienen esto.

### 4. Query Engine (Gremius QL)

- Traduce queries JSON a SQL con auto-joins y filtros anidados.
- Expuesto en `/api/datasets` y usado por el data explorer.
- **Impacto:** La API de datos que necesita un BaaS para que el frontend haga queries complejos sin GraphQL manual.

### 5. MCP Server Nativo

- Endpoint `/api/mcp` con transporte SSE.
- Tools: `gremius_query_dataset`, `gremius_insert_record`, `gremius_dispatch_worker`.
- Resources: datasets, grimoires.
- **Impacto:** Diferenciador único. Ningún BaaS conocido expone su funcionalidad nativamente vía Model Context Protocol para agentes de IA.

### 6. Actions Unification

- Reemplaza `gremius_functions` + webhooks + agent triggers en una sola tabla `actions`.
- Tipos: `code`, `webhook_out`, `webhook_in`, `agent`.
- Triggers: `manual`, `cron`, `event`, `http`.
- **Impacto:** Arquitectura de plataforma, no de producto. Permite que usuarios del BaaS definan automatizaciones sin distinguir entre "cloud function" y "webhook".

### 7. Worker Sandbox

- Ejecución de código JavaScript/TypeScript definido por el usuario en entorno aislado con límites de memoria y timeout.
- **Impacto:** Table stakes para BaaS (equivalente a Cloud Functions / Supabase Edge Functions).

### 8. Arquitectura de 3 Niveles

- **Engine (Nivel 1):** Infraestructura inmutable.
- **Core (Nivel 2):** Funcionalidades conmutables (datasets, media).
- **Grimoires (Nivel 3):** Módulos de negocio dinámicos.
- **Impacto:** Es exactamente la separación de concerns que necesita un framework backend extensible.

---

## ❌ Bloqueadores y Deuda Técnica

### Bloqueador 1: Tablas de Dominio Hardcodeadas en el Core

En `apps/api/src/db/schema.ts` conviven tablas de infraestructura con tablas de dominio gaming:

```
Core (necesario para cualquier BaaS):
  auth_users, auth_sessions, api_keys, datasets, data_entries,
  modules, installed_grimoires, actions, agent_identities, site_settings

Dominio Gaming (específico, no debería estar aquí):
  games, platforms, streamers, tags, blog_posts, game_collections
```

**Problema:** Si alguien despliega Gremius para una app de logística o healthcare, sigue arrastrando tablas de juegos, streamers y plataformas de consola en su base de datos. Esto rompe la premisa de framework genérico.

**Esfuerzo para arreglar:** Medio. `games`, `streamers`, y `blog_posts` ya están parcialmente migrados a grimoires, pero sus definiciones en `schema.ts` del core siguen siendo la fuente de verdad para Drizzle.

### Bloqueador 2: Grimoires Solo desde Filesystem Local

El `module-loader` escanea `packages/grimoires/` dentro del monorepo:

```ts
// Aproximadamente lo que hace hoy:
loadModules(app); // escanea carpetas locales
```

**Problema:** Un BaaS framework se instala vía `npm install` o marketplace. No puede requerir que el usuario clone el monorepo de Gremius para añadir un módulo.

**Lo que se necesita:**

- Carga desde `node_modules/@gremius/*` y `gremius-grimoire-*`.
- Resolución de dependencias entre grimoires (`grimoire-games` requiere `grimoire-media`).
- CLI de instalación: `gremius install grimoire-crm`.

### Bloqueador 3: Admin UI Monolítico y Acoplado

`packages/admin` es SvelteKit con rutas estáticas por cada grimoire:

- `routes/games/+page.svelte`
- `routes/blog/+page.svelte`
- `routes/crm/+page.svelte`
- `routes/academy/+page.svelte`

**Problema:** Si un usuario instala un grimoire custom de terceros (ej. `grimoire-inventory`), el admin no tiene una ruta para renderizarlo. Aunque existe `grimoire-loader.ts` y el registro dinámico, aún hay vistas especiales hardcodeadas.

**Lo que se necesita:** Admin 100% generado a partir del `grimoire.json` y el `module registry`. Sin rutas estáticas por dominio.

### Bloqueador 4: Falta de Multi-Tenancy

El RLS se basa en `owner_id` y `user_id`, pero no existe `tenant_id` o `project_id` como primitiva del engine.

**Problema:** Un BaaS moderno (Supabase, Firebase, Appwrite) se despliega una vez y sirve múltiples proyectos. Gremius está diseñado como "una instancia = un proyecto".

**Nota:** Esto es opcional para la primera versión de framework, pero bloqueador para ofrecerlo como servicio cloud (SaaS).

### Bloqueador 5: API No Suficientemente Discoverable

Aunque existen rutas como `/api/datasets/:slug/entries` y `/api/explorer`, no hay un estándar tipo:

```
GET /api/items/{collection}
GET /api/items/{collection}/:id
POST /api/items/{collection}
```

**Problema:** Directus, Strapi y Supabase generan CRUD REST+GraphQL automáticamente por cada colección dataset. En Gremius, el consumidor necesita conocer la estructura interna (datasets vs grimoires) para saber qué endpoint usar.

---

## 🎯 Oportunidad de Mercado Única

Si se ejecuta el pivot correctamente, Gremius no competiría directamente con Supabase o Firebase. Competiría en una categoría sin dueño:

> **"El único BaaS que los agentes de IA pueden usar nativamente vía MCP, con data entries JSONB para schemas dinámicos, grimoires como plugins de negocio, y RLS nativo de PostgreSQL."**

| Competidor              | Tiene                                                                        | No tiene                                                    |
| ----------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Supabase**            | Postgres, Auth, REST auto, Realtime                                          | MCP nativo, sistema de plugins verticales, worker sandbox   |
| **Directus**            | Admin potente, colecciones dinámicas                                         | MCP, grimoires, sandbox de código, query engine JSON        |
| **Strapi**              | Plugins, CMS flexible                                                        | RLS nativo DB-level, MCP, agentes NHI                       |
| **Firebase**            | Serverless, realtime, fácil                                                  | Relacional, RLS real, MCP, extensibilidad vertical          |
| **Gremius (potencial)** | MCP nativo, JSONB schemas, plugins verticales, RLS, sandbox, actions unified | Multi-tenancy, marketplace de grimoires, SDK auto-gen (aún) |

---

## 🔧 Hoja de Ruta: De CMS a Framework BaaS

### Fase 1 — Core Genérico: Romper el Acoplamiento de Dominio

**Objetivo:** El schema core debe ser 100% dominio-agnóstico.

- [x] Migrar `games`, `platforms`, `tags`, `streamers` de `apps/api/src/db/schema.ts` a `grimoire-games`.
- [x] Migrar `blog_posts` de `apps/api/src/db/schema.ts` a `grimoire-blog`.
- [x] Migrar `game_collections`, `game_collection_entries` al grimoire correspondiente.
- [x] Schema core ideal: solo `auth_*`, `datasets`, `data_entries`, `modules`, `installed_grimoires`, `actions`, `action_executions`, `agent_identities`, `agent_api_keys`, `agent_memory`, `agent_traces`, `agent_trace_steps`, `agent_feedback`, `agent_audit_logs`, `data_sources`, `site_settings`, `api_keys`, `media` (si media se mantiene como core), `formulas` (si es core genérico).
- [x] Crear `schema-merger` que combine el schema core con los schemas de grimoires activos en tiempo de build. (`apps/api/src/lib/schema-merger.ts`)

### Fase 2 — Runtime Extensible: Grimoires desde NPM

**Objetivo:** Que Gremius se pueda extender sin modificar el monorepo.

- [x] Rediseñar `module-loader` para escanear:
  - `packages/grimoires/*` (desarrollo local)
  - `node_modules/@gremius/grimoire-*` (oficiales)
  - `node_modules/gremius-grimoire-*` (comunidad)
- [x] Implementar resolución de dependencias de grimoires (`dependencies.grimoires` en `grimoire.json`).
- [x] Crear CLI `@gremius/cli` con comando `gremius install <grimoire>` que:
  - Instala el paquete npm.
  - Ejecuta migraciones SQL del grimoire.
  - Registra el grimoire en `installed_grimoires`.
  - Reinicia el loader (o hot-reloads).
- [x] Definir estructura estándar de paquete npm para grimoires (entry point, manifest, migraciones).

### Fase 2.5 — Hot Reload y Developer Experience

**Objetivo:** El API detecta cambios en grimoires, datasets y schema sin reinicio manual en desarrollo.

- [ ] Watcher de filesystem para grimoires locales (`packages/grimoires/*`) y realms
- [ ] Hot-reload de rutas Hono: desmontar y remontar routers de grimoires modificados sin restart del proceso
- [ ] Invalidación automática de cache GraphQL y OpenAPI cuando cambian schemas o datasets
- [ ] Reconexión transparente de sesiones MCP tras reload
- [ ] Comando CLI: `gremius dev --watch` (monitorea grimoires + reinicia API solo si es necesario)
- [ ] **Implementado parcialmente:** GraphQL ya invalida cache en mutaciones. Falta watcher de filesystem y remount dinámico de routers.

> **Prioridad:** Media. Hoy `docker compose restart gremius_api` funciona como workaround.

### Fase 3 — API Auto-Generada Descubrible

**Objetivo:** Cualquier dataset o grimoire expone REST + GraphQL automáticamente.

- [x] Unificar endpoint REST estándar para todos los datasets:
  ```
  GET    /api/items/{dataset}         # listar con query params/filtros
  GET    /api/items/{dataset}/:id     # obtener uno
  POST   /api/items/{dataset}         # crear
  PATCH  /api/items/{dataset}/:id     # actualizar
  DELETE /api/items/{dataset}/:id     # eliminar
  ```
- [x] OpenAPI spec dinámica que incluya automáticamente todos los datasets y grimoires activos.
- [ ] GraphQL schema dinámico generado del registry (ya tienes `/api/graphql` pero parece estático).
- [x] SDK auto-generado: `gremius generate-sdk --lang typescript` que cree tipos fuertes a partir del schema runtime.

### Fase 4 — Admin Desacoplado y Headless

**Objetivo:** El backend debe poder correr sin UI, y la UI debe ser 100% dinámica.

- [ ] Eliminar rutas estáticas de dominio en `packages/admin/src/routes/`.
- [x] Generar todas las rutas de admin dinámicamente desde `module-registry`:
  - Cada grimoire registra su `admin.views`.
  - El admin renderiza vistas genéricas (grid, kanban, form) basadas en metadatos.
  - Solo vistas especiales (ej. builder visual) pueden requerir componentes custom del grimoire.
- [x] Modo headless: flag de configuración para desactivar completamente el admin y servir solo API.
- [ ] Opcional: extraer el admin a su propio paquete desplegable (`@gremius/admin`), no embebido en `apps/`.

### Fase 5 — Multi-Tenancy (Opcional, para SaaS)

**Objetivo:** Una instancia de Gremius sirve múltiples proyectos/tenants.

- [ ] Agregar `tenant_id` (o `project_id`) como columna en todas las tablas core.
- [ ] Modificar RLS builder para incluir `tenant_id` en las políticas.
- [ ] Middleware de extracción de tenant (header, subdomain, o path).
- [ ] Aislamiento de datasets y grimoires por tenant.
- [ ] Nota: esto es complejo. Se puede posponer hasta que el modelo de negocio lo requiera.

---

## 🏗️ Arquitectura Objetivo (Futuro)

```
┌─────────────────────────────────────────────────────────────┐
│  CONSUMERS                                                   │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────────┐   │
│  │ Web App │ │ Mobile  │ │ Agent   │ │ Admin Panel     │   │
│  │ (Any)   │ │ (Any)   │ │ (MCP)   │ │ (Svelte/Custom) │   │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────────┬────────┘   │
└───────┼───────────┼───────────┼───────────────┼────────────┘
        │           │           │               │
        └───────────┴───────────┴───────────────┘
                          │
              ┌───────────▼───────────┐
              │   Gremius API         │
              │   (Hono + Engine)     │
              │                       │
              │  ┌─────────────────┐  │
              │  │ Auto REST/GraphQL│ │
              │  │ Gremius QL       │ │
              │  │ Actions Engine   │ │
              │  │ MCP Handler      │ │
              │  └─────────────────┘  │
              └───────────┬───────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   ┌────▼────┐      ┌─────▼─────┐    ┌─────▼──────┐
   │  Core   │      │ Grimoires │    │  Realms    │
   │         │      │ (plugins) │    │ (themes)   │
   │ datasets│      │           │    │            │
   │ media   │      │ games     │    │ esports    │
   │ auth    │      │ blog      │    │ corporate  │
   │ storage │      │ crm       │    │ healthcare │
   │         │      │ academy   │    │            │
   └─────────┘      └───────────┘    └────────────┘
                          │
              ┌───────────▼───────────┐
              │   PostgreSQL +        │
              │   Valkey + MinIO      │
              └───────────────────────┘
```

---

## 🧪 Criterios de Éxito

Gremius será un framework BaaS viable cuando:

1. **Un desarrollador puede hacer esto en 5 minutos:**

   ```bash
   npm create gremius-app my-backend
   cd my-backend
   npx gremius install grimoire-auth grimoire-media
   npm run dev
   # Ya tiene Auth + Storage REST API en /api
   ```

2. **Un desarrollador puede crear un grimoire sin tocar el monorepo:**

   ```bash
   mkdir my-grimoire && cd my-grimoire
   npm init
   # Escribe schema.ts + routes.ts + grimoire.json
   npm link
   cd ../my-backend
   npm link my-grimoire
   npx gremius enable my-grimoire
   ```

3. **El admin muestra automáticamente el nuevo grimoire** sin modificar `packages/admin`.

4. **La API del nuevo grimoire aparece en la OpenAPI spec** automáticamente.

---

## 📁 Archivos Relevantes para este Pivot

| Archivo                              | Rol actual                  | Qué hay que hacer                               |
| ------------------------------------ | --------------------------- | ----------------------------------------------- |
| `apps/api/src/db/schema.ts`          | Schema monolítico           | Extraer tablas de dominio a grimoires           |
| `apps/api/src/lib/module-loader.ts`  | Carga grimoires locales     | Soporte para `node_modules`                     |
| `apps/api/src/index.ts`              | Entry point monolito        | Más genérico, sin rutas de dominio hardcodeadas |
| `packages/admin/src/routes/*`        | Rutas estáticas por dominio | Convertir a rutas dinámicas por registry        |
| `packages/engine/`                   | Exports del engine          | Mantenerlo puro, sin referencias a dominio      |
| `packages/grimoires/*/grimoire.json` | Manifests                   | Estándarizar como contrato de plugin            |
| `packages/shared/`                   | Tipos compartidos           | Agregar `GrimoirePackage` para npm              |

---

## 💬 Nota Final

El riesgo más grande no es técnico, es **de producto**: mantener el CMS de gaming funcionando mientras se extrae el framework genérico. La estrategia recomendada es **dogfooding**:

1. Extraer el framework genérico.
2. Reconstruir el CMS de gaming **como un realm** que instala grimoires.
3. Si el CMS de gaming sigue funcionando igual o mejor, el framework es real.

> _"El framework no es genérico si no puede reconstruir el producto original."_

---

## 🎧 Addendum: Visión Vibecoder

> _Este addendum fue añadido tras reconsiderar el propósito original del proyecto. Cambia el framing de "framework backend para developers" a "backend que tu IA configura por ti"._

### El propósito original

Gremius no nació para competir con Django ni con Power Apps. El propósito original es crear un **framework para vibecoders** — personas que programan con Cursor, Claude, Replit Agent, v0.dev, Bolt.new. Gente que puede construir un frontend impresionante en 2 horas pero se atora brutalmente cuando necesita backend.

### ¿Por qué esto cambia todo?

| Análisis anterior                        | Visión vibecoder                                   |
| ---------------------------------------- | -------------------------------------------------- |
| Framework para developers Python/TS      | Backend para personas que no saben SQL             |
| Competir con Django, Supabase, Strapi    | Ser el backend que Cursor configura por el usuario |
| MCP como "feature diferenciadora"        | MCP como **interfaz principal** del producto       |
| Grimoires como "plugins de arquitectura" | Grimoires como **templates que la IA activa**      |
| JSONB como "optimización técnica"        | JSONB como **evitar que el usuario vea SQL**       |

### El dolor del vibecoder hoy

```
Vibecoder: "Quiero que los usuarios se registren y guarden posts"
Cursor:    "Necesitas auth y base de datos"
Vibecoder: "...¿cómo?"
Cursor:    "Instala NextAuth, configura Prisma, crea el schema,
           corre migraciones, configura PostgreSQL, deploy en
           Vercel + Railway, variables de entorno..."
Vibecoder: *cierra la laptop*
```

**Con Gremius (visión):**

```
Vibecoder: "Configura mi backend: auth, usuarios, posts, emails"
Cursor vía MCP:
  ✅ Instala grimoire-auth
  ✅ Crea datasets users + posts
  ✅ Configura Action: email de bienvenida
  ✅ Genera hooks React listos
Vibecoder: docker compose up
# Funciona en 10 minutos
```

### Mercado validado

- **Cursor:** $100M+ revenue, millones de usuarios
- **Bolt.new:** viral, millones de proyectos generados
- **Supabase:** 1M+ proyectos, muchos de vibecoders frustrados con RLS/SQL
- **TAM estimado:** ~100M+ vibecoders (creciendo exponencialmente) vs ~30M developers tradicionales

**Ningún competidor** (Supabase, Firebase, Convex, PocketBase) fue diseñado pensando en que una IA lo configure por el usuario.

---

## 🚀 Plan Técnico: Backend en 15 Minutos (Vibecoder-First)

Este plan describe los cambios técnicos mínimos para que un vibecoder con Cursor tenga un backend completo funcionando en 15 minutos.

### Fase A: Setup Instantáneo (0 minutos de configuración)

#### A.1 — CLI de inicialización

```bash
npx gremius@latest init my-app
```

**Qué debe hacer:**

- [x] Crear carpeta `my-app/` con estructura lista
- [x] Generar `docker-compose.yml` con PostgreSQL + Valkey + MinIO + API + Admin
- [x] Crear `.env` con valores por defecto seguros
- [x] Correr `docker compose up` e imprimir URLs:
  ```
  🚀 Gremius está listo:
     API:      http://localhost:3000/api/swagger
     Admin:    http://localhost:3001
     MCP:      http://localhost:3000/api/mcp
  ```
- [x] Seed de proyecto demo (`--template blog`, `--template saas`, `--template ecommerce`)
- [x] Soporte dual: `--mode vibecoder` (default) y `--mode developer`

**Archivos a modificar/crear:**

- [x] `packages/cli/src/commands/init.ts` — reescrito con modo vibecoder + developer
- [x] `packages/cli/templates/vibecoder/` — template base con docker-compose self-contained
- [x] `packages/cli/templates/blog/` — realm.json con datasets de posts y tags
- [x] `packages/cli/templates/saas/` — realm.json con datasets de teams, members, invoices
- [x] `packages/cli/templates/ecommerce/` — realm.json con datasets de products, categories, orders
- [x] `packages/cli/src/index.ts` — fusionado con comandos vibecoder (init, start, mcp, etc.)
- [x] `packages/cli/bin/create-gremius.js` — wrapper para `npx create-gremius`
- [x] `START-GUIDE.md` — actualizado con flujo `npx gremius init`

#### A.2 — Cloud option (sin Docker) — _Servicio Gremius Cloud a crear_

```bash
npx gremius@latest init my-app --cloud
```

**Esta funcionalidad requiere que crees y operes tu propio servicio cloud (Gremius Cloud).**
El CLI ya tiene la estructura para conectarse (`deployToGremiusCloud`), pero el backend SaaS (provisioning de proyectos, API keys, URLs, billing) es una plataforma separada que debes construir y desplegar.

**Qué haría:**

- Crear proyecto en tu infraestructura cloud (freemium)
- Devolver API key y URL al vibecoder
- El usuario nunca toca Docker ni servidores

**Nota:** El self-hosted local es para dev/test. El cloud es para producción sin tocar Docker.

---

### Fase B: MCP como Interfaz Principal (no documentación humana)

#### B.1 — Documentar tools MCP para IA

En vez de escribir docs para humanos, escribir "system prompts" para Cursor/Claude:

```markdown
# System prompt: Gremius MCP Assistant

You are a backend configuration assistant for Gremius.
Available tools:

- gremius_create_dataset(name, fields[])
- gremius_install_grimoire(id)
- gremius_define_action(trigger, type, config)
- gremius_enable_auth(methods=['email', 'google'])
- gremius_generate_frontend_hook(dataset, framework='react')

Rules:

1. Always use JSONB datasets for user-defined schemas.
2. Always enable RLS with owner-only rules by default.
3. Never expose raw SQL to the user.
4. Prefer grimoires over custom datasets when available.
```

**Archivos a crear:**

- [ ] `docs/mcp/cursor-system-prompt.md`
- [ ] `docs/mcp/claude-system-prompt.md`
- [ ] `docs/mcp/tool-reference.json` (schema de cada tool para la IA)

#### B.2 — Plugin/extension de Cursor (opcional pero potente)

- [ ] Extensión VS Code que conecta Cursor directamente al MCP de Gremius
- [ ] Botón derecho: "Add Gremius backend for this project"
- [ ] Auto-detecta el frontend (React, Vue, Svelte) y genera los hooks correspondientes

**Archivos a crear:**

- Nuevo: `packages/cursor-extension/`

---

### Fase C: Grimoires como Templates (no como plugins)

#### C.1 — Templates preconfigurados

El vibecoder no debe saber qué es un "grimoire". Debe decir:

```bash
npx gremius init my-app --template blog
npx gremius init my-app --template ecommerce
npx gremius init my-app --template saas-auth
npx gremius init my-app --template reservations
```

**Cada template = un Realm preconfigurado:**

- `blog`: grimoire-auth + grimoire-blog + grimoire-media
- `ecommerce`: grimoire-auth + grimoire-products + grimoire-media + grimoire-payments (futuro)
- `saas-auth`: grimoire-auth + grimoire-subscriptions + grimoire-team (futuro)

**Archivos a modificar:**

- [x] `packages/realms/` — crear `realm-blog`, `realm-ecommerce`, `realm-saas` (base existen, faltan templates específicos)
- [x] `packages/cli/src/commands/init.ts` — soporte `--template`

#### C.1b — Realm System Mejorado

- [x] `realm.json` extendido con `grimoireConfig` (overrides por grimoire: displayName, hiddenTables, extraViews, defaultView).
- [x] `realm.json` extendido con `seed` (configuración de seed.sql).
- [x] `apps/api/src/lib/realm-lifecycle.ts` — ejecuta seed.sql del realm en startup (runOnce, tracking en DB).
- [x] `apps/api/src/services/admin-registry.ts` — aplica overrides del realm activo al admin registry.

#### C.2 — Marketplace de templates

```bash
npx gremius install template-healthcare
npx gremius install template-inventory
```

- [ ] Templates de comunidad instalables vía CLI
- [ ] Revenue share para creadores de templates

---

### Fase D: API Auto-Generada y Unificada

#### D.1 — Endpoint estándar para TODO

Hoy hay `/api/datasets/:slug/entries` (datasets) y `/api/games` (grimoires). El vibecoder no debe saber la diferencia.

```
GET    /api/items/{collection}         # listar
GET    /api/items/{collection}/:id     # obtener uno
POST   /api/items/{collection}         # crear
PATCH  /api/items/{collection}/:id     # actualizar
DELETE /api/items/{collection}/:id     # eliminar
```

Donde `{collection}` puede ser:

- Un dataset JSONB (`users`, `tasks`, `projects`)
- Una tabla de grimoire (`games`, `blog_posts`)
- Cualquier tabla del sistema (`auth_users` con RLS aplicado)

**Archivos a modificar:**

- [ ] `apps/api/src/routes/crud.ts` — unificar bajo `/api/items/*`
- [ ] `apps/api/src/lib/module-loader.ts` — registrar cada grimoire en el router unificado

#### D.2 — OpenAPI spec dinámica real

- [ ] Generar automáticamente `openapi.json` que incluya todos los datasets y grimoires activos
- [ ] Actualizar en runtime (no solo en build)
- [ ] La IA consume este spec para saber qué endpoints existen

**Archivos a modificar:**

- [ ] `apps/api/src/routes/docs-dynamic.ts` — generación real de spec

---

### Fase E: Generación de Código Frontend

#### E.1 — Endpoint de code generation

```http
POST /api/generate-code
{
  "dataset": "users",
  "framework": "react",
  "type": "hook" // o "component", "form"
}
```

**Respuesta:**

```typescript
// Generated by Gremius for dataset "users"
export function useUsers() {
  const { data, error } = useSWR("/api/items/users", fetcher);
  return { users: data, loading: !error && !data, error };
}

export function useCreateUser() {
  return async (userData) => {
    const res = await fetch("/api/items/users", {
      method: "POST",
      body: JSON.stringify(userData),
    });
    return res.json();
  };
}
```

**Archivos a crear:**

- Nuevo: `apps/api/src/routes/codegen.ts`
- Nuevo: `packages/codegen/src/react.ts`
- Nuevo: `packages/codegen/src/vue.ts`
- Nuevo: `packages/codegen/src/svelte.ts`

#### E.2 — MCP tool para code generation

- [ ] `gremius_generate_frontend_hook(dataset, framework)` — la IA llama esto y pega el código en el frontend

---

### Fase F: Auth Zero-Config

#### F.1 — Auth activado por defecto

En el template por defecto:

- [ ] Auth email/password habilitado
- [ ] RLS con regla "owner only" aplicada a todos los datasets nuevos
- [ ] Session management con Better-Auth funciona sin configuración

#### F.2 — Social auth con un comando

```bash
npx gremius auth add google --client-id xxx --client-secret yyy
```

- [ ] Modifica `.env` y reinicia el contenedor
- [ ] La IA puede hacer esto vía MCP sin que el usuario entienda OAuth

**Archivos a modificar:**

- [ ] `apps/api/src/lib/auth.ts` — detectar config social auth en runtime
- [ ] `packages/cli/src/commands/auth.ts`

---

### Fase G: Deploy One-Click

#### G.1 — CLI deploy

```bash
gremius deploy
```

**Objetivo:** Detectar el provider y deployar.

**Implementado:**

- [x] **Railway:** `railway up` + variables de entorno (`packages/cli/src/deploy/railway.ts`)

**Opcionales (providers adicionales):**

- [ ] **Render:** Blueprint + deploy
- [ ] **Fly.io:** `fly launch` + postgres + valkey
- [ ] **VPS propio:** SSH + Docker Compose + Caddy/nginx

> Estos providers adicionales son opcionales. Railway cubre el 80% de casos vibecoder. Si tu comunidad los solicita, puedes agregarlos siguiendo el patrón de `railway.ts`.

#### G.2 — Health check post-deploy

```bash
gremius status
# ✅ API: https://api.miapp.com
# ✅ DB: PostgreSQL connected
# ✅ Auth: 3 methods enabled
# ✅ Grimoires: 4 active
```

---

### Fase H: Admin 100% Dinámico (sin rutas hardcodeadas)

#### H.1 — El admin debe renderizar todo desde el registry

- [ ] Eliminar `routes/games/+page.svelte`, `routes/blog/+page.svelte`, etc.
- [x] Ruta única dinámica: `routes/g/[id]/+page.svelte`
- [x] Lee `grimoire.json` → renderiza grid/kanban/form genérico
- [x] Solo vistas especiales (ej. page builder) requieren componentes custom

**Archivos a modificar:**

- [x] `packages/admin/src/routes/` — consolidar en rutas dinámicas (`g/[id]`)
- [x] `packages/admin/src/lib/grimoire-loader.ts` — renderizado genérico de vistas

---

### Fase I: Documentación para IA (no para humanos)

#### I.1 — AI-First Docs

En vez de:

> "Para crear un dataset, ve al admin y haz clic en..."

Escribir:

```markdown
## MCP Tool: gremius_create_dataset

**When to use:** The user wants to store custom data.
**When NOT to use:** A grimoire already exists for this use case.

**Parameters:**

- name: string (kebab-case, e.g., "blog-posts")
- fields: array of { name, type, required }

**Example conversation:**
User: "I want to store blog posts with title and content"
→ Call: gremius_create_dataset("blog-posts", [
{ name: "title", type: "text", required: true },
{ name: "content", type: "richtext", required: true }
])
```

**Archivos a crear:**

- Nuevo: `docs/ai/` (documentación optimizada para LLMs, no humanos)
- Nuevo: `docs/ai/mcp-tools.md`
- Nuevo: `docs/ai/grimoire-selection.md`
- Nuevo: `docs/ai/troubleshooting.md`

---

## 📋 Resumen del Plan (Checklist Ejecutable)

### Semana 1-2: Setup

- [ ] Crear CLI `@gremius/cli` con `init` command
- [ ] Template `default` (auth + datasets + admin)
- [ ] Template `blog` (auth + blog + media)
- [ ] Docker Compose lista para `docker compose up`

### Semana 3-4: MCP

- [ ] Documentar todos los tools MCP en formato IA-friendly
- [ ] System prompt oficial para Cursor
- [ ] System prompt oficial para Claude

### Semana 5-6: API Unificada

- [ ] Implementar `/api/items/{collection}` para datasets y grimoires
- [ ] OpenAPI spec dinámica real
- [ ] Introspection endpoint para que la IA descubra el schema

### Semana 7-8: Code Generation

- [ ] Endpoint `/api/generate-code` (React hooks primero)
- [ ] MCP tool `gremius_generate_frontend_hook`

### Semana 9-10: Deploy

- [x] `gremius deploy` para Railway
- [x] `gremius status` post-deploy
- [ ] _(Opcional)_ `gremius deploy` para Render / Fly.io / VPS

### Semana 10-11: Hot Reload

- [ ] Watcher de grimoires y remount dinámico de rutas
- [ ] Invalidación automática de GraphQL/OpenAPI en cambios de schema
- [ ] CLI `gremius dev --watch`

### Semana 12-13: Admin Dinámico

- [ ] Rutas dinámicas en admin
- [ ] Renderizado genérico de vistas de grimoire
- [ ] Eliminar rutas estáticas hardcodeadas

---

## 🎯 Criterio de Éxito Vibecoder

Gremius será un backend para vibecoders cuando:

1. **Un vibecoder sin conocimiento de backend pueda decirle a Cursor:**

   > "Configura mi backend para una app de reservas con auth, servicios, citas y notificaciones"

   Y en **< 15 minutos** tenga:
   - Auth funcionando
   - API REST documentada
   - Hooks React generados
   - Admin panel accesible
   - Deploy en la nube

2. **El tutorial "Cursor + Gremius" tenga 100K+ views** en YouTube/TikTok

3. **El free tier tenga 10K+ proyectos activos** creados por vibecoders

> _"No construyas un mejor PostgreSQL. Construye el backend que la IA configura por el usuario."_
