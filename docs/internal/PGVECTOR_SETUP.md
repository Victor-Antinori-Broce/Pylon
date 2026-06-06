# GremiusCMS + pgvector Configuration Guide

## Overview

GremiusCMS utiliza **pgvector** para funcionalidades de IA (embeddings vectoriales, búsqueda semántica, RAG). Esta guía explica cómo está configurado y qué pasa si conectas a PostgreSQL sin pgvector.

---

## ¿Está pgvector configurado?

### ✅ Sí, en Docker Compose

El `docker-compose.yml` usa la imagen oficial de pgvector:

```yaml
gremius_db:
  image: pgvector/pgvector:pg16 # ← PostgreSQL 16 + pgvector pre-instalado
  volumes:
    - ./docker/init-extensions.sql:/docker-entrypoint-initdb.d/init-extensions.sql:ro
```

El script `docker/init-extensions.sql` se ejecuta automáticamente:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### ✅ Sí, en el Código

El grimoire **"ai-memories"** usa el tipo `vector` de Drizzle ORM:

```typescript
// packages/grimoires/ai-memories/schema.ts
import { vector } from "drizzle-orm/pg-core";

export const aiMemories = pgTable("ai_memories", {
  embedding: vector("embedding", { dimensions: 1536 }), // ← Requiere pgvector
});
```

Las migraciones de Drizzle (`apps/api/drizzle/0000_easy_pandemic.sql`) incluyen estas tablas.

---

## ⚠️ Escenario Crítico: Primer Encendido

### ❌ **SÍ fallará** si usas PostgreSQL regular (sin pgvector)

Si configuras `DATABASE_URL` apuntando a PostgreSQL sin pgvector y ejecutas `docker compose up`:

```
❌ CRITICAL ERROR: pgvector is NOT installed!

PostgreSQL Connected: ✅
pgvector Extension:   ❌ MISSING
```

**¿Por qué falla?**

1. El contenedor de API ejecuta `bun run db:migrate` al inicio
2. Las migraciones incluyen tablas con columnas tipo `vector(1536)`
3. PostgreSQL sin pgvector no reconoce el tipo `vector`
4. La migración falla y el contenedor se detiene

### Comportamiento con el Script de Verificación

El nuevo script `docker/start-with-check.sh` **detecta esto ANTES** de migrar y muestra:

```
═══════════════════════════════════════════════════════════════
  PostgreSQL Connected: ✅
  pgvector Extension:   ❌ MISSING
═══════════════════════════════════════════════════════════════

GremiusCMS requires pgvector for AI features.

Solutions:
1️⃣  Use PostgreSQL with pgvector (Recommended):
    docker run -d --name gremius-db \
      -e POSTGRES_USER=gremius \
      -e POSTGRES_PASSWORD=gremiuspassword \
      -e POSTGRES_DB=gremius_prod \
      -p 5432:5432 \
      pgvector/pgvector:pg16

2️⃣  Install pgvector on existing PostgreSQL:
    CREATE EXTENSION IF NOT EXISTS vector;

3️⃣  Use cloud provider with pgvector:
    • Supabase (pre-installed)
    • AWS RDS (manual install)
    • Neon (enable in dashboard)

4️⃣  Run without AI (Advanced):
    See instructions below
═══════════════════════════════════════════════════════════════
```

### ❌ NO fuerza la instalación automática

GremiusCMS **no puede** instalar pgvector automáticamente porque:

1. Requiere privilegios de **superusuario** en PostgreSQL
2. La extensión debe instalarse en el servidor, no desde la app
3. Algunos proveedores cloud (AWS RDS, Supabase) requieren habilitarlo manualmente

---

## Soluciones

### Opción 1: Usar PostgreSQL con pgvector (Recomendado)

**Docker local:**

```bash
docker run -d \
  --name gremius-pgvector \
  -e POSTGRES_USER=gremius \
  -e POSTGRES_PASSWORD=gremiuspassword \
  -e POSTGRES_DB=gremius_dev \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

**Proveedores Cloud:**

| Proveedor    | Instrucciones                                           |
| ------------ | ------------------------------------------------------- |
| **Supabase** | pgvector viene pre-instalado ✅                         |
| **AWS RDS**  | Crear extensión manualmente: `CREATE EXTENSION vector;` |
| **Neon**     | Soporta pgvector, habilitar en dashboard                |
| **Railway**  | Usar template de pgvector                               |

### Opción 2: Deshabilitar funcionalidades de IA

Si NO puedes instalar pgvector, excluye el grimoire `ai-memories`:

**1. No incluir en `gremius.config.ts`:**

```typescript
// gremius.config.ts
export default {
  modules: [
    // ❌ No incluir "ai-memories"
    "promote",
    "blocks",
    "blog",
    // ...
  ],
};
```

**2. Usar schema sin AI:**
Modifica `apps/api/src/db/schema-all.ts` para no exportar el schema de ai-memories:

```typescript
// Comentar o eliminar esta línea:
// export * from "../../../../packages/grimoires/ai-memories/schema";
```

**3. Regenerar migraciones:**

```bash
cd apps/api
rm -rf drizzle/
bun run db:generate  # Generar nuevas migraciones sin tablas de AI
```

> ⚠️ **Nota:** Esto eliminará completamente las funcionalidades de IA (embeddings, búsqueda semántica, RAG).

### Opción 3: pgvector en esquema separado (Avanzado)

Para mantener el core funcional sin IA, puedes:

1. Crear un schema separado para AI:

```sql
CREATE SCHEMA ai;
CREATE EXTENSION IF NOT EXISTS vector SCHEMA ai;
```

2. Modificar el schema de ai-memories para usar el schema `ai`.

3. Manejar errores de conexión a AI gracefulmente.

---

## Verificación de pgvector

Para verificar si pgvector está instalado:

```sql
-- Conectarse a PostgreSQL
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Debería retornar:
-- extname | extversion | extnamespace | ...
-- vector  | 0.5.1      | 2200         | ...
```

Desde la aplicación:

```typescript
// Health check endpoint
app.get("/api/health/pgvector", async (c) => {
  try {
    const result = await db.execute(sql`SELECT 1 FROM pg_extension WHERE extname = 'vector'`);
    return c.json({ pgvector: result.rows.length > 0 });
  } catch {
    return c.json({ pgvector: false });
  }
});
```

---

## Detección en Tiempo de Ejecución

El schema merger dinámico carga `ai-memories` solo si está configurado:

```typescript
// apps/api/src/lib/schema-merger.ts
const allGrimoires = new Set([...modules, ...realmGrimoires]);
// Si "ai-memories" no está en allGrimoires, sus tablas no se cargan
```

PERO las **migraciones** (`drizzle/0000_easy_pandemic.sql`) ya están generadas e incluyen las tablas de AI.

### Flujo correcto para PostgreSQL sin pgvector:

1. **Antes de migrar:** Excluir `ai-memories` de `gremius.config.ts`
2. **Regenerar migraciones:** `bun run db:generate` (sin tablas de AI)
3. **Ejecutar migraciones:** `bun run db:migrate`

---

## Resumen

| Escenario                       | Resultado                             |
| ------------------------------- | ------------------------------------- |
| Docker Compose oficial          | ✅ Funciona (pgvector incluido)       |
| PostgreSQL externo CON pgvector | ✅ Funciona (crear extensión manual)  |
| PostgreSQL externo SIN pgvector | ❌ Migraciones fallan                 |
| Configurar sin AI               | ✅ Posible (excluir ai-memories)      |
| Instalación automática          | ❌ No posible (requiere superusuario) |

---

## Referencias

- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [Drizzle ORM pgvector](https://orm.drizzle.team/docs/column-types/pg#vector)
- [Gremius AI Memories Grimoire](../packages/grimoires/ai-memories/)
