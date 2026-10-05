# Arquitectura de Kitsuden

## Propósito a Vista de Pájaro (El "Por qué" y el "Cómo")

Este documento explica las decisiones de arquitectura de alto nivel del proyecto, cómo organizamos el código y por qué se toman ciertas decisiones técnicas relativas al manejo de datos dinámicos.

## Estructura de Carpetas — La Jerarquía de 3 Niveles

Kitsuden separa **baterías del framework** (lo que toda app querría) de **módulos
de dominio** (las apps que construyes encima). Ver [CORE.md](CORE.md) para el
mapa completo y la regla de clasificación.

- **`apps/api/` (Host):**
  El runtime. API sobre Bun + Hono, middlewares, seguridad, auth, enrutamiento,
  y servicios del host acoplados al runtime (Vault, Secrets, GraphQL auto).

- **`packages/engine/` (Nivel 1 — Engine):**
  Primitivos puros del framework, importables por `apps/api` Y por los kons vía
  `@kitsuden/engine`: authz, validation, errors, `repo()`, request-scope,
  interceptors, brain, code-graph, system-map, actions.

- **`packages/core/` (Nivel 2 — Kitsuden Core, las baterías):**
  Capacidades que toda app querría, como paquetes propios: `datasets`
  (`@kitsuden/datasets`), `media` (`@kitsuden/media`), `blocks` (`@kitsuden/blocks`),
  `vector-search`, `content-publishing`. Se cargan por el module-loader igual
  que un kon pero viven aquí para declarar que son infraestructura, no dominio.

- **`packages/kons/` (Nivel 3 — Kons de dominio):**
  Los módulos de negocio: games, esports, streamers, crm, agile, booking,
  directory, dms, conta, blog, academy-lms, ocr. Cada uno es una unidad
  funcional independiente. Un `kon-games` es una app sobre Kitsuden, no una
  batería del framework.

- **`packages/grimoires/` (Bundles):**
  Ecosistemas que agrupan kons y definen la experiencia visual. Un grimoire
  declara qué kons están activos mediante su `grimoire.json`.

- **`packages/admin/` (Admin UI):**
  Panel de administración construido con Svelte 5.

- **`packages/grimoires/` (Reinos/Ecosistemas):**
  Esta ubicación alberga los reinos — ecosistemas de negocio que agrupan kons y definen la experiencia visual. Un reino declara qué kons están activos mediante su `grimoire.json`. Anteriormente se llamaban "themes".

- **`packages/mcp-server/` (MCP Server):**
  Implementación del Model Context Protocol para permitir que agentes de IA (Claude, Cursor, etc.) interactúen con Kitsuden. Expone resources y tools vía SSE.

- **`packages/shared/` (Shared):**
  Esquemas Zod, tipos TypeScript, y utilidades compartidas entre todos los paquetes.

## El Flujo de Datos (Data Flow)

El ciclo vital de la información dentro del entorno de Kitsuden funciona en un esquema de tres fases:

1. **Entrada por Hono:**
   Cualquier petición (HTTP, inserción o lectura de contenido) toca primero nuestros endpoints expuestos mediante **Hono**. Aquí ocurren procesos como validación de cabeceras, manejo de tokens y control de rate limiting.
2. **Intercepción por el AppRegistry:**
   El controlador no procesa la lógica pesada por sí mismo, sino que delega la definición al `AppRegistry` (el registro dinámico de kons y esquemas del sistema de base de datos). El registro identifica rápidamente las definiciones de esquemas, los campos requeridos, relaciones dinámicas y validaciones pertinentes a ese módulo Vertical en específico.
3. **Persistencia en JSONB (`data_entries`):**
   Una vez que el manejador consolida y valida los datos, en vez de insertarlos en una tabla estricta fuertemente tipada de su entidad, el payload termina guardándose serializado dinámicamente en una columna de formato JSONB dentro de la tabla global de contenido dinámico `data_entries`.

## Model Context Protocol (MCP)

Kitsuden expone un servidor MCP en `/api/mcp` que permite la integración con agentes de IA:

### Protocolo

- **Versión**: 2024-11-05
- **Transporte**: SSE (Server-Sent Events)
- **Formato**: JSON-RPC 2.0

### Endpoints

```
GET  /api/mcp       # Conexión SSE para recibir eventos
POST /api/mcp       # Envío de mensajes JSON-RPC
```

### Tools Disponibles

| Tool                       | Descripción                            |
| -------------------------- | -------------------------------------- |
| `kitsuden_query_dataset`   | Query registros con filtros opcionales |
| `kitsuden_insert_record`   | Insertar nuevo registro en dataset     |
| `kitsuden_dispatch_worker` | Encolar trabajo en BullMQ              |

### Resources Disponibles

| Resource | URI                   |
| -------- | --------------------- |
| Datasets | `kitsuden://datasets` |
| Kons     | `kitsuden://kons`     |

## Decisiones Clave (ADR - Architecture Decision Records)

### ADR-001: Persistencia de Modelos Dinámicos

> **Decidimos usar JSONB en data_entries en lugar de crear tablas SQL al vuelo para evitar cuellos de botella en migraciones multi-tenant.**

Mantener un ecosistema dinámico (esencial en un CMS) donde los usuarios pueden cambiar el esquema de los conjuntos de datos sin interactuar activamente con alteraciones `ALTER TABLE` nos permite escalar mucho más rápido, evita bloqueos exclusivos de la base de datos en producción y agiliza las migraciones sin tener una sobrecarga de DDL para cada "Vertical".

### ADR-002: Row-Level Security Nativo de PostgreSQL

> **Implementamos RLS a nivel de base de datos para garantizar aislamiento de datos incluso ante errores de la aplicación o queries generadas por IA.**

Usando `set_config('app.current_user_id', ...)` inyectamos el contexto de usuario en cada transacción, permitiendo que las políticas RLS de PostgreSQL filtren automáticamente los registros. Esto protege contra fugas de datos incluso si la lógica de la aplicación o un agente MCP generan queries incorrectos.

### ADR-003: Model Context Protocol para Agentes de IA

> **Exponemos funcionalidades del CMS vía MCP en lugar de APIs ad-hoc para cada agente.**

El protocolo estándar MCP permite que cualquier agente compatible (Claude Desktop, Cursor, etc.) se conecte a Kitsuden sin integraciones específicas. El servidor MCP reutiliza el mismo código de la API y respeta las mismas políticas de seguridad (RLS, auth).

---

## Diagrama de Arquitectura de Alto Nivel

```mermaid
flowchart TD
    Client((Cliente / UI)) -->|HTTP Request| Hono[Hono API Gateway
 apps/api/]
    AI[AI Agent<br/>Claude/Cursor] -->|MCP/SSE| Hono

    subgraph Backend Core
        Hono --> Mid[Middlewares
 Auth / RLS]
        Mid --> Reg{AppRegistry}
        Hono --> MCP[MCP Handler<br/>/api/mcp]
    end

    subgraph Ecosistema Modular
        Reg <-.->|Consulta
 Definiciones / Esquemas| Vert[packages/kons/<br/>Módulos Verticales]
    end

    subgraph Base de Datos PostgreSQL
        Reg -->|Serializa a JSONB| DB[(Tabla unificada
 data_entries)]
        MCP -->|RLS| DB
    end

    %% Estilos de los nodos
    style Client fill:#2a2a35,stroke:#00e5ff,stroke-width:2px,color:#fff
    style AI fill:#2a2a35,stroke:#ff9500,stroke-width:2px,color:#fff
    style Hono fill:#18181b,stroke:#00e5ff,color:#fff
    style MCP fill:#18181b,stroke:#ff9500,color:#fff
    style Reg fill:#18181b,stroke:#b388ff,color:#fff
    style DB fill:#18181b,stroke:#ff2a6d,color:#fff
    style Vert fill:#18181b,stroke:#00e676,color:#fff
```

---

## Diagrama de Base de Datos (Entity-Relationship)

Dado que la arquitectura vertical no crea tablas SQL estáticas por cada colección, los datos del "Core" viven unificados y relacionados de forma flexible. Aquí visualizamos cómo `content_metadata` (nuestra estructura base para la Épica 2) se vincula y enriquece a la data dinámica genérica almacenada en `data_entries`:

```mermaid
erDiagram
    TENANT ||--o{ DATA_ENTRIES : owns
    DATA_ENTRIES ||--|| CONTENT_METADATA : promoted_to
    DATA_ENTRIES {
        string datasetSlug "ej: 'games' (define a qué App pertenece)"
        jsonb data "Los datos reales del esquema"
    }
    CONTENT_METADATA {
        string slug "URL amigable"
        boolean isPublished
        jsonb seo "Meta tags"
    }
```
