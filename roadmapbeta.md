# GremiusCMS — Beta Roadmap

> **Versión actual:** `v0.8.0-beta`  
> **Estado:** Estabilización en curso (ver [`STABILIZATION_PLAN.md`](./STABILIZATION_PLAN.md))  
> **Target Beta Release:** `v0.9.0-beta`  
> **Target Stable (v1.0):** Q3 2026

---

## 1. Visión de la Beta

GremiusCMS es un **BaaS/CMS híbrido modular** construido para equipos que necesitan flexibilidad de CMS sin sacrificar el control de un BaaS.

La beta está enfocada en validar la **arquitectura de grimoires** y el **sistema de datos dinámicos** con RLS. No buscamos feature parity con WordPress o Strapi; buscamos que el core sea sólido, predecible y extensible.

### ¿Para quién es esta beta?

- Equipos técnicos que quieren hostear su propio CMS/BaaS
- Developers que necesitan datasets dinámicos con auth y RLS nativo
- Proyectos de gaming, esports o contenido que pueden aprovechar los grimoires especializados
- **NO es para:** usuarios finales no técnicos, blogs personales simples, o quienes buscan " instalar un plugin y listo"

---

## 2. Feature Matrix

### ✅ Stable — Listo para producción controlada

Estos features tienen tests, pasan TypeScript strict, y están documentados.

| Feature | Descripción | Desde |
|:---|:---|:---|
| **Auth & Sessions** | Better-Auth con cookies, sesiones seguras, sign-up/sign-in | v0.7.0 |
| **Row-Level Security (RLS)** | Aislamiento de datos por usuario a nivel de PostgreSQL | v0.7.0 |
| **Dataset Engine** | Crear datasets dinámicos, insertar entries JSONB, query con filtros | v0.7.0 |
| **Grimoire Loader** | Carga dinámica de módulos desde `packages/grimoires/` | v0.8.0 |
| **MCP Server** | Protocolo Model Context para agentes de IA (Claude, Cursor) | v0.8.0 |
| **Agent System** | Identidades NHI (`grm_agent_*`), scopes, audit logs | v0.8.0 |
| **Queue Engine** | BullMQ + Valkey para jobs en background | v0.7.0 |
| **Webhook Engine** | HTTP callbacks con firma HMAC | v0.7.0 |
| **Docker Deploy** | `docker compose up` funcional con PostgreSQL + Valkey + MinIO | v0.7.0 |
| **OpenAPI Auto-Gen** | Documentación Swagger/Scalar generada de rutas Hono | v0.8.0 |

### 🟡 Beta — Funcional pero puede tener edges

Estos features funcionan pero necesitan más testing real o pulido de UX.

| Feature | Descripción | Riesgos conocidos |
|:---|:---|:---|
| **Grimoire Games** | Catálogo de juegos con IGDB sync | IGDB rate limits; sync async no testeado en carga |
| **Grimoire Streamers** | Integración Twitch/YouTube/Kick | APIs de terceros cambian sin aviso |
| **Grimoire Blog** | Posts con scheduling, tags, SEO | Scheduling no testeado bajo cron real |
| **Page Builder (Blocks)** | Sistema de bloques Astro para frontend | API de blocks en evolución |
| **Media Library** | Upload a S3/MinIO con transforms | Faltan tests de transformación de imágenes |
| **Real-time (WebSockets)** | Pub/sub via Valkey | Escalabilidad horizontal no validada |
| **Actions Engine** | Workers + Webhooks + Agents unificados | Migración desde sistema legacy en curso |
| **GraphQL API** | `/api/graphql` con reflection dinámica | Performance N+1 en queries complejas |
| **Admin Panel (Svelte)** | Panel de administración | Migración reciente desde Vue; algunas vistas incompletas |

### 🔴 Alpha / No disponible en beta

No usar en producción. APIs inestables o incompletas.

| Feature | Estado | ETA |
|:---|:---|:---|
| **Grimoire Academy (LMS)** | En desarrollo; schema listo, UI pendiente | v1.0 |
| **Grimoire Booking** | Schema listo, sin rutas HTTP | v1.0 |
| **Grimoire DMS** | Migración a grimoire no completada | v1.0 |
| **Grimoire CRM** | En desarrollo activo | v1.0 |
| **Formula Engine** | Parser existente, sin UI de admin | v0.10.0 |
| **Vector Search / AI Memories** | Requiere pgvector; schema listo, API mínima | v0.10.0 |
| **Multi-tenant Realms** | Sistema de realms funcional pero sin isolamiento completo | v1.0 |
| **SDK Oficial** | `@gremius/sdk` existe pero sin documentación | v0.10.0 |
| **Astro Starter Theme** | Template existe pero sin actualizarse a grimoires v3 | v0.10.0 |

---

## 3. Arquitectura Soportada en Beta

```
┌─────────────────────────────────────────────┐
│  Cliente / Admin / Agente IA                │
└──────────────┬──────────────────────────────┘
               │ HTTP / SSE / WS
┌──────────────▼──────────────────────────────┐
│  Hono API (Bun)                             │
│  ├── Auth (Better-Auth)                     │
│  ├── Datasets & Entries (JSONB + RLS)       │
│  ├── Grimoires (carga dinámica)             │
│  ├── MCP Server (/api/mcp)                  │
│  ├── Actions Engine                         │
│  └── GraphQL                                │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  PostgreSQL 16  +  Valkey  +  MinIO         │
│  ├── Schema core (auth, datasets, settings) │
│  ├── Tablas de grimoires activos            │
│  └── RLS policies por tenant                │
└─────────────────────────────────────────────┘
```

**Lo que NO está soportado en beta:**
- Escalabilidad horizontal (el MCP usa SSE stateful; WebSockets son in-memory)
- Multi-region deploy
- Backups automáticos (debes configurarlos en PostgreSQL)
- Actualizaciones sin downtime (las migraciones usan DDL que puede bloquear)

---

## 4. Roadmap Post-Beta

### v0.9.0-beta (Actual — Estabilización)
- [ ] TypeScript strict limpio
- [ ] >140 tests de integración
- [ ] Auth unificado (Agents + Better-Auth)
- [ ] Admin Svelte funcional para CRUD core
- [ ] Repo limpio, Docker build sin warnings

### v0.10.0-beta (Polish & Grimoires)
- [ ] Formula engine funcional
- [ ] Vector search + AI memories
- [ ] SDK documentado y publicado
- [ ] Grimoire Academy beta
- [ ] Grimoire CRM funcional
- [ ] Mejoras de performance en GraphQL (dataloaders)
- [ ] WebSocket horizontal scaling (Redis adapter)

### v1.0.0 (Stable)
- [ ] Todos los grimoires core estables
- [ ] Multi-tenant con isolamiento completo de realms
- [ ] Admin UI 100% funcional (todas las vistas)
- [ ] Backup/restore integrado
- [ ] Zero-downtime migrations
- [ ] SLA-ready: monitoreo, alerting, health checks avanzados
- [ ] Documentación completa (API ref, guías, tutoriales)

### v1.1.0+ (Features)
- [ ] Marketplace de grimoires (instalar desde npm)
- [ ] Realms visuales con theming completo
- [ ] Mobile app para admin
- [ ] Integraciones nativas (Stripe, SendGrid, etc.)

---

## 5. Requisitos Técnicos para Beta

### Mínimo (dev / demo)
| Recurso | Especificación |
|:---|:---|
| CPU | 2 cores |
| RAM | 4 GB |
| Disco | 20 GB SSD |
| Runtime | Bun 1.1+ |
| Node | 20+ (solo para pnpm) |
| DB | PostgreSQL 16 con extensión `pgcrypto` y `vector` |
| Cache | Valkey 8+ (o Redis 7+) |
| Storage | MinIO o S3-compatible |

### Recomendado (producción beta)
| Recurso | Especificación |
|:---|:---|
| CPU | 4 cores |
| RAM | 8 GB |
| Disco | 50 GB SSD |
| PostgreSQL | 16 con pgvector + conexiones pool (PgBouncer) |
| Valkey | Cluster o sentinel para HA |
| MinIO | Distributed mode |

### Notas de deploy
- **Bun es obligatorio.** No corre en Node (usa APIs específicas de Bun como `Bun.serve()` con WebSockets).
- **No usar SQLite.** El RLS y JSONB dependen de PostgreSQL.
- **Valkey, no solo Redis.** BullMQ necesita comandos que Valkey soporta mejor que Redis vanilla en ciertos deployments.

---

## 6. Cómo Reportar Bugs

### Antes de reportar
1. Verificar que estás en la última versión de la rama `stabilization/main`
2. Correr `bun test` y confirmar que los tests base pasan
3. Revisar [`STABILIZATION_PLAN.md`](./STABILIZATION_PLAN.md) para ver si es un known issue

### Template de bug report
```markdown
**Versión:** `v0.8.0-beta` (commit: `abc1234`)
**Entorno:** Docker / Local / Producción
**Runtime:** Bun 1.x

**Pasos para reproducir:**
1. ...
2. ...

**Comportamiento esperado:**
...

**Comportamiento actual:**
...

**Logs:**
```
(paste de logs)
```

**Grimoires activos:**
- grimoire-games: enabled
- grimoire-blog: enabled
- ...
```

### Canales
- **GitHub Issues:** Para bugs técnicos con repro steps
- **Discussions:** Para preguntas, feature requests, y ayuda de setup
- **NO por email:** Todo debe ser público para que otros beta testers puedan encontrar respuestas

---

## 7. Decisiones de Diseño que Podrían Sorprenderte

### ¿Por qué JSONB en lugar de tablas por dataset?
Para evitar `ALTER TABLE` al vuelo cuando un usuario cambia el schema de un dataset. Esto permite multi-tenant sin DDL dinámico. El tradeoff es que las queries complejas son más lentas que tablas normales, pero RLS + JSONB indexing mitiga esto para la mayoría de casos.

### ¿Por qué Bun y no Node?
Performance. Bun maneja WebSockets nativos, tiene un bundler integrado, y es significativamente más rápido en I/O intensivo. El tradeoff es menor ecosistema; por eso usamos Hono (funciona en ambos) y Drizzle (ORM compatible).

### ¿Por qué tres niveles (Engine / Core / Grimoires)?
Para que puedas desactivar funcionalidad sin tocar código. Si solo necesitas auth + datasets, apagas los grimoires. Si necesitas gaming, activas `grimoire-games`. Si eres una empresa, activas `grimoire-crm` y `grimoire-dms`.

### ¿Por qué MCP en lugar de una API propia para IA?
MCP es un estándar emergente. Soportar MCP significa que Claude Desktop, Cursor, y cualquier cliente MCP puede conectarse sin que escribamos un plugin por IDE.

---

## 8. FAQ Beta

**Q: ¿Puedo usar esto para un cliente real?**  
A: Solo si eres el developer del proyecto, entiendes la arquitectura, y aceptas que algunos edges pueden requerir que metas mano al código. No es "instalar y olvidar" todavía.

**Q: ¿Hay upgrades automáticos entre versiones beta?**  
A: No. Las migraciones de DB son manuales (`bun run db:migrate`). Entre betas puede haber breaking changes.

**Q: ¿Puedo escribir mi propio grimoire?**  
A: Sí, pero la API de `defineGrimoire()` todavía puede cambiar en v0.9.0. Espera a la v0.10.0 para grimoires de terceros estables.

**Q: ¿Qué pasa si desactivo un grimoire?**  
A: Sus rutas desaparecen de la API, pero sus tablas en PostgreSQL permanecen. No hay "uninstall limpio" todavía.

**Q: ¿El panel de admin funciona en móvil?**  
A: No optimizado. Funciona técnicamente, pero la UX es desktop-first.

---

## 9. Changelog Beta

### v0.8.0-beta (Actual)
- Migración de módulos monolíticos a grimoires (Fase 1–2)
- Actions Engine unificado (reemplaza functions + webhooks separados)
- Agent System con NHI y scopes
- MCP Server SSE
- Schema core desacoplado de dominio gaming
- Panel admin migrado a Svelte 5 (en progreso)

### v0.9.0-beta (Próximo — Estabilización)
- TypeScript strict
- >140 tests
- Auth unificado
- Repo limpio
- Admin funcional para flows críticos

---

*Última actualización: Mayo 2026*  
*Mantenedor: GremiusCMS Team*
