# Key Code Details (KCD) - Auditoría de Aportes de IA

Este documento presenta una auditoría técnica profunda (Code Audit) detallando el nivel de participación, porcentaje de código generado y la arquitectura clave implementada por la IA (Antigravity/Claude/etc.) como copiloto de desarrollo para los tres pilares críticos de la plataforma.

---

## 1. Zero Trust para Máquinas (NHI): Políticas RLS en PostgreSQL

**Porcentaje de Solución Creado por IA:** **~98%** (Arquitectura, SQL, y Middleware de Hono)
**Archivos Afectados/Creados:** >5 (Aprox. 800+ Líneas de Código)

### Resumen del Aporte

Se diseñó e implementó desde cero una **arquitectura híbrida de seguridad a nivel de datos (Row-Level Security)**. Al exponer canales directos a agentes de IA, era un riesgo inminente depender únicamente del filtrado en la capa de la aplicación (ORM). El aporte consistió en bajar la barrera de seguridad al propio motor de base de datos PostgreSQL, garantizando la imposibilidad de escalada de privilegios a través de inyecciones o alucinaciones de modelos.

### Archivos Clave y Código Generado

- `apps/api/src/db/rls-policies.sql` (172 líneas): Creación de políticas DDL nativas (`CREATE POLICY`) implementando segregación total de registros e inyectando roles y user IDs.
- `apps/api/src/middleware/rls-context.ts` (237 líneas): Un middleware avanzado que intercepta el ciclo de vida de la petición de Hono para inyectar transaccionalmente el ID del usuario (`app.current_user_id`) mediante el comando PostgreSQL `SET LOCAL`.
- `apps/api/src/middleware/transactional-rls.ts` & `apps/api/src/lib/rls-builder.ts`: Wrappers y helpers de Drizzle ORM que aseguran que absolutamente todas las queries pasen por un entorno de transacción protegido por RLS.
- Documentos arquitectónicos estratégicos (`RLS_SETUP_GUIDE.md`, `RLS_HYBRID_ARCHITECTURE.md`).

---

## 2. El estándar MCP en producción (Model Context Protocol)

**Porcentaje de Solución Creado por IA:** **100%** (Integración de SDK, Rutas, y Registro de Herramientas)
**Archivos Afectados/Creados:** >3 (Aprox. 400+ Líneas de Código)

### Resumen del Aporte

Implementación completa de un servidor backend que cumple estrictamente con el **Model Context Protocol (MCP)**, abriendo los datos de los Datasets de Gremius y la orquestación distribuida (Valkey) al ecosistema de IAs (como Claude, Cursor y otras NHI).

### Archivos Clave y Código Generado

- `packages/mcp-server/src/index.ts` (298 líneas): Creación del kernel del servidor MCP para Gremius utilizando `@modelcontextprotocol/sdk`.
  - **Recursos (Resources):** Registro de endpoints estandarizados (`gremius://datasets`, `gremius://grimoires`) para lectura directa del esquema de los datasets en el CMS.
  - **Herramientas (Tools):** Definición estandarizada con `inputSchema` de herramientas como `gremius_query_dataset`, `gremius_insert_record`, y `gremius_dispatch_worker`.
- Integración perfecta conectando las dependencias nativas del sistema, como Drizzle (`db`, `schema`) y BullMQ/Valkey (`queue`), hacia la capa stdio de transporte del MCP, habilitando el acceso asincrónico directo para los modelos.

---

## 3. FinOps y Optimización de Memoria (TOON Encoder)

**Porcentaje de Solución Creado por IA:** **100%** (Protocolo, Serializador y Middleware Interceptor)
**Archivos Afectados/Creados:** `apps/api/src/lib/toon.ts` (149 Líneas de Código)

### Resumen del Aporte

Enfrentando los altos gastos en la facturación de tokens que implican las respuestas JSON tradicionales cuando son procesadas por un LLM, se procedió a idear un protocolo de transferencia liviano. Se creó el modelo **TOON (Token-Optimized Object Notation)**, capaz de reducir radicalmente los tokens requeridos para inyectar un estado en un prompt (como por ejemplo al cargar las propiedades y el esquema de un Dataset en el contexto de la IA).

### Archivos Clave y Código Generado

- `apps/api/src/lib/toon.ts` (149 líneas): Diseño e implementación algorítmica de compresión semántica.
  - Conversión de representaciones JSON jerárquicas en formato plano indexado con `---` y corchetes (ej. `topics[0].id:t1`).
  - Implementación del middleware de negociación de contenido (_Content negotiation_) para interceptar cabeceras en Hono (`Accept: application/vnd.toon` o `?format=toon`) y transformar en tiempo de ejecución respuestas JSON de los endpoints a respuestas TOON sin necesidad de recodificar las rutas pre-existentes de la API.
  - Reducción drástica del tamaño en memoria (tokens) mediante diseño orientado a máquina.
