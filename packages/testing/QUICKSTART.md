# Quickstart - Testing with Bun + Drizzle + Hono

## 1. Setup (1 minuto)

```bash
# Instalar dependencias del testing framework
cd packages/testing
bun add drizzle-orm pg pg-mem
bun run build

# En tu grimoire
cd packages/grimoires/grimoire-blog
bun add -d @gremius/testing
```

## 2. Crear Test (3 minutos)

```typescript
// packages/grimoires/grimoire-blog/blog.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from "bun:test";
import { eq } from "drizzle-orm";
import { createDrizzleSandbox } from "@gremius/testing/sandbox-drizzle";
import { postsTable, usersTable } from "./schema";

// Crear sandbox con D Rizzzle REAL
const sandbox = await createDrizzleSandbox({
  grimoires: ["grimoire-blog"],
  database: "pg-mem", // PostgreSQL en memoria (rápido)
  schema: { postsTable, usersTable },
  fixtures: {
    admin: { id: "admin-1", email: "admin@test.com", role: "admin" },
  },
});

beforeAll(() => sandbox.setup());
afterAll(() => sandbox.teardown());
afterEach(() => sandbox.reset());

describe("Blog Grimoire", () => {
  describe("POST /api/blog/posts", () => {
    it("creates post via Hono, stores via Drizzle", async () => {
      // 1. Llamar endpoint Hono
      const response = await sandbox.http.asUser(sandbox.fixtures.admin).post("/api/blog/posts", {
        title: "Hello Bun!",
        content: "Testing with real Drizzle",
        status: "published",
      });

      // 2. Verificar respuesta HTTP
      expect(response.status).toBe(201);
      expect(response.body.title).toBe("Hello Bun!");
      expect(response.body.slug).toBe("hello-bun");

      // 3. Verificar en base de datos REAL con Drizzle
      const posts = await sandbox.drizzle
        .select()
        .from(postsTable)
        .where(eq(postsTable.title, "Hello Bun!"));

      expect(posts).toHaveLength(1);
      expect(posts[0].content).toBe("Testing with real Drizzle");
      expect(posts[0].status).toBe("published");

      // 4. Verificar evento emitido
      sandbox.assert.events.emitted("blog:post:created", {
        postId: response.body.id,
      });
    });

    it("validates with Zod before Drizzle", async () => {
      const response = await sandbox.http.asUser(sandbox.fixtures.admin).post("/api/blog/posts", {
        // Falta title (requerido por Zod)
        content: "No title",
      });

      expect(response.status).toBe(400);

      // No debe haber nada en la base de datos
      const posts = await sandbox.drizzle.select().from(postsTable);

      expect(posts).toHaveLength(0);
    });
  });

  describe("GET /api/blog/posts", () => {
    it("queries real data from Drizzle", async () => {
      // Insertar datos directo con Drizzle
      await sandbox.drizzle.insert(postsTable).values([
        { title: "Post 1", slug: "post-1", status: "published" },
        { title: "Post 2", slug: "post-2", status: "draft" },
        { title: "Post 3", slug: "post-3", status: "published" },
      ]);

      // Query via Hono endpoint
      const response = await sandbox.http.get("/api/blog/posts?status=published");

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].status).toBe("published");
    });
  });

  describe("Drizzle Relations", () => {
    it("resolves author relation", async () => {
      // Crear usuario
      const [author] = await sandbox.drizzle
        .insert(usersTable)
        .values({ email: "author@test.com", name: "Author" })
        .returning();

      // Crear post con relación
      await sandbox.drizzle.insert(postsTable).values({
        title: "With Author",
        slug: "with-author",
        authorId: author.id,
      });

      // Query con join
      const result = await sandbox.drizzle.query.postsTable.findFirst({
        where: eq(postsTable.slug, "with-author"),
        with: {
          author: true, // Auto-join con Drizzle
        },
      });

      expect(result?.author.name).toBe("Author");
    });
  });

  describe("Transactions", () => {
    it("rolls back on error", async () => {
      await sandbox.transaction(async (tx) => {
        // Insertar en transacción
        await tx.insert(postsTable).values({
          title: "In Transaction",
          slug: "in-transaction",
        });

        // Verificar que existe en transacción
        const inTx = await tx.select().from(postsTable);
        expect(inTx).toHaveLength(1);

        // Rollback automático al final
      });

      // Verificar que NO existe fuera de la transacción
      const outside = await sandbox.drizzle.select().from(postsTable);
      expect(outside).toHaveLength(0);
    });
  });
});
```

## 3. Ejecutar

```bash
# Con Bun (nativo)
bun test blog.test.ts

# Watch mode
bun test --watch blog.test.ts

# Con PostgreSQL real (más lento pero más realista)
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/gremius_test \
  bun test blog.test.ts
```

## 4. APIs Disponibles

### `sandbox.drizzle` - Drizzle ORM Real

```typescript
// Select
const posts = await sandbox.drizzle
  .select()
  .from(postsTable)
  .where(eq(postsTable.status, "published"));

// Insert
const [newPost] = await sandbox.drizzle.insert(postsTable).values({ title: "New" }).returning();

// Update
await sandbox.drizzle
  .update(postsTable)
  .set({ status: "archived" })
  .where(eq(postsTable.id, postId));

// Delete
await sandbox.drizzle.delete(postsTable).where(eq(postsTable.id, postId));

// Relations
const postWithAuthor = await sandbox.drizzle.query.postsTable.findFirst({
  where: eq(postsTable.id, postId),
  with: { author: true, comments: true },
});
```

### `sandbox.http` - HTTP Client para Hono

```typescript
// Autenticación
await sandbox.http.asUser("admin-1").get("/api/posts");
await sandbox.http.asUser({ id: "1", role: "admin" }).post("/api/posts", {...});
await sandbox.http.withToken("jwt-token").patch("/api/posts/1", {...});

// Métodos HTTP
await sandbox.http.get("/api/posts?status=published");
await sandbox.http.post("/api/posts", { title: "New" });
await sandbox.http.patch("/api/posts/1", { title: "Updated" });
await sandbox.http.put("/api/posts/1", { title: "Replaced" });
await sandbox.http.delete("/api/posts/1");
```

### `sandbox.assert` - Assertions

```typescript
// Database
await sandbox.assert.database.has("posts", { id: "123" });
await sandbox.assert.database.missing("posts", { id: "999" });
await sandbox.assert.database.count("posts", 5, { status: "published" });

// Events
sandbox.assert.events.emitted("blog:post:created");
sandbox.assert.events.emitted("blog:post:created", { postId: "123" });
sandbox.assert.events.notEmitted("blog:error");
```

### `sandbox.transaction()` - Transacciones Aisladas

```typescript
await sandbox.transaction(async (tx) => {
  // Todo aquí se hace rollback al final
  await tx.insert(postsTable).values({...});
  const posts = await tx.select().from(postsTable);
});
```

## 5. Estrategias de Base de Datos

### Opción A: pg-mem (Recomendado para CI/Unit tests)

```typescript
const sandbox = await createDrizzleSandbox({
  database: "pg-mem",
  schema: { postsTable },
});
// Rápido (<50ms por test), sin Docker
```

### Opción B: PostgreSQL Real con Transactions

```typescript
const sandbox = await createDrizzleSandbox({
  database: "postgres",
  databaseUrl: process.env.TEST_DATABASE_URL,
  schema: { postsTable },
});
// Más lento pero comportamiento 100% real
```

## 6. Fixtures

```typescript
// fixtures/blog-rich.ts
export default {
  users: [
    { id: "admin-1", email: "admin@test.com", role: "admin" },
    { id: "editor-1", email: "editor@test.com", role: "editor" }
  ],
  posts: [
    { id: "post-1", title: "Published", status: "published" },
    { id: "post-2", title: "Draft", status: "draft" }
  ]
};

// En test
const sandbox = await createDrizzleSandbox({
  grimoires: ["grimoire-blog"],
  schema: { postsTable, usersTable },
  fixtures: {
    users: [...],
    posts: [...]
  }
});

// Acceder
await sandbox.http.asUser(sandbox.fixtures.users[0]).post(...);
```

## ¿Problemas?

```bash
# Error: Cannot find module
bun run build  # en packages/testing

# Error: pg-mem not found
bun add -d pg-mem

# Error: database connection
# Asegúrate de que PostgreSQL esté corriendo para strategy: "postgres"
docker compose up db
```
