import { describe, it, expect, beforeAll, afterAll } from "bun:test";

let dbAvailable = false;

// Lazy-load DB-dependent modules to avoid schema-merger crash on non-DB tests
async function loadDbModules() {
  const { db } = await import("../db");
  const { dataSets, dataEntries } = await import("../db/schema-core");
  const { eq } = await import("drizzle-orm");
  const { isDatabaseAvailable, clearTestData, generateTestId } = await import("./setup");
  return { db, dataSets, dataEntries, eq, isDatabaseAvailable, clearTestData, generateTestId };
}

describe("RLS OwnerId Tests", () => {
  beforeAll(async () => {
    try {
      const { isDatabaseAvailable } = await loadDbModules();
      dbAvailable = await isDatabaseAvailable();
    } catch {
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      try {
        const { clearTestData } = await loadDbModules();
        await clearTestData();
      } catch {
        // ignore cleanup errors
      }
    }
  });

  // ── 1. Smoke test: source code contains ownerId assignment logic ──
  it("crud.ts should assign ownerId from context or payload", async () => {
    const file = Bun.file("src/routes/crud.ts");
    const text = await file.text();
    expect(text).toContain("ownerId = e.ownerId ?? c.get(\"user\")");
  });

  it("items.ts POST /:collection should include ownerId", async () => {
    const file = Bun.file("src/routes/items.ts");
    const text = await file.text();
    expect(text).toContain("ownerId");
    const postHandlerIndex = text.indexOf('itemsRoutes.post("/:collection"');
    expect(postHandlerIndex).toBeGreaterThan(-1);
    const nextHandlerIndex = text.indexOf("itemsRoutes.post", postHandlerIndex + 1);
    const snippet =
      nextHandlerIndex > -1
        ? text.slice(postHandlerIndex, nextHandlerIndex)
        : text.slice(postHandlerIndex);
    expect(snippet).toContain("ownerId");
  });

  // ── 2. DB integration: ownerId is persisted ──
  it("should persist ownerId in data_entries and data JSONB", async () => {
    if (!dbAvailable) {
      console.log("Skipping DB test — database not available");
      return;
    }

    const { db, dataSets, dataEntries, eq, generateTestId } = await loadDbModules();

    const testId = generateTestId();
    const slug = `test-dataset-${testId}`;

    // Create dataset
    const [dataset] = await db
      .insert(dataSets)
      .values({
        name: `Test Dataset ${testId}`,
        slug,
        description: "Test dataset for RLS ownerId",
        schema: [{ fieldName: "title", fieldType: "text", required: true }],
        policyJson: {
          readAccess: "authenticated",
          writeAccess: "authenticated",
          enableRLS: true,
          rlsRules: [{ field: "ownerId", operator: "eq", value: "{{current_user_id}}" }],
        },
      })
      .returning();

    expect(dataset).toBeDefined();
    expect(dataset.id).toBeDefined();

    // Insert data entry with explicit ownerId
    const [entry] = await db
      .insert(dataEntries)
      .values({
        dataSetId: dataset.id,
        title: "Test Entry",
        data: { foo: "bar" },
        ownerId: "test-user-123",
      })
      .returning();

    expect(entry).toBeDefined();
    expect(entry.ownerId).toBe("test-user-123");
    expect((entry.data as Record<string, unknown>).ownerId).toBe("test-user-123");

    // Clean up this test's data
    await db.delete(dataEntries).where(eq(dataEntries.dataSetId, dataset.id));
    await db.delete(dataSets).where(eq(dataSets.id, dataset.id));
  });

  // ── 3. Existing RLS policy checks ──
  it("rls-policies.sql should enable RLS on data_entries", async () => {
    const file = Bun.file("src/db/rls-policies.sql");
    const text = await file.text();
    expect(text).toContain("data_entries ENABLE ROW LEVEL SECURITY");
  });

  it("rls-policies.sql should reference current_setting app.current_user_id", async () => {
    const file = Bun.file("src/db/rls-policies.sql");
    const text = await file.text();
    expect(text).toContain("owner_id = current_setting('app.current_user_id', true)");
  });

  // ── 4. Default policy on dataset creation ──
  it("crud.ts should set enableRLS: true in default policyJson", async () => {
    const file = Bun.file("src/routes/crud.ts");
    const text = await file.text();
    expect(text).toContain("enableRLS: true");
  });
});
