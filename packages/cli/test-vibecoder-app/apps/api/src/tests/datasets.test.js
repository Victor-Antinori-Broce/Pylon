// @ts-nocheck
/**
 * Datasets Module Tests
 *
 * Tests for dataset CRUD operations, entries management,
 * and dynamic schema validation.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { db } from "../db";
import { dataSets, dataEntries } from "../db/schema";
import { eq } from "drizzle-orm";
import { isDatabaseAvailable, clearTestData, generateTestId } from "./setup";
let dbAvailable = false;
describe("Datasets Module", () => {
    beforeAll(async () => {
        dbAvailable = await isDatabaseAvailable();
        if (dbAvailable) {
            await clearTestData();
        }
    });
    afterAll(async () => {
        if (dbAvailable) {
            await clearTestData();
        }
    });
    describe("Dataset CRUD", () => {
        let datasetId;
        const testSlug = `test-dataset-${generateTestId()}`;
        it("should create a new dataset", async () => {
            if (!dbAvailable) {
                console.log("⚠️ Skipping: Database not available");
                return;
            }
            const [result] = await db
                .insert(dataSets)
                .values({
                name: `Test Dataset ${testSlug}`,
                slug: testSlug,
                description: "A test dataset for unit tests",
                schema: {
                    fields: [
                        {
                            id: "field-1",
                            key: "title",
                            type: "text",
                            label: "Title",
                            required: true,
                        },
                        {
                            id: "field-2",
                            key: "count",
                            type: "number",
                            label: "Count",
                            required: false,
                        },
                    ],
                    version: "2.0",
                },
            })
                .returning();
            expect(result).toBeDefined();
            expect(result.name).toContain("Test Dataset");
            expect(result.slug).toBe(testSlug);
            expect(result.schema).toHaveProperty("fields");
            expect(result.schema.fields).toHaveLength(2);
            datasetId = result.id;
        });
        it("should fetch dataset by ID", async () => {
            if (!dbAvailable)
                return;
            const [result] = await db
                .select()
                .from(dataSets)
                .where(eq(dataSets.id, datasetId))
                .limit(1);
            expect(result).toBeDefined();
            expect(result.id).toBe(datasetId);
            expect(result.slug).toBe(testSlug);
        });
        it("should update dataset schema", async () => {
            if (!dbAvailable)
                return;
            const newSchema = {
                fields: [
                    {
                        id: "field-1",
                        key: "title",
                        type: "text",
                        label: "Title",
                        required: true,
                    },
                    {
                        id: "field-2",
                        key: "count",
                        type: "number",
                        label: "Count",
                        required: false,
                    },
                    {
                        id: "field-3",
                        key: "description",
                        type: "text",
                        label: "Description",
                        required: false,
                    },
                ],
                version: "2.1",
            };
            const [result] = await db
                .update(dataSets)
                .set({
                schema: newSchema,
                updatedAt: new Date(),
            })
                .where(eq(dataSets.id, datasetId))
                .returning();
            expect(result).toBeDefined();
            expect(result.schema.fields).toHaveLength(3);
            expect(result.schema.version).toBe("2.1");
        });
        it("should list all datasets", async () => {
            if (!dbAvailable)
                return;
            const results = await db.select().from(dataSets);
            expect(results.length).toBeGreaterThan(0);
            expect(results.some((d) => d.id === datasetId)).toBe(true);
        });
        it("should delete dataset", async () => {
            if (!dbAvailable)
                return;
            await db.delete(dataSets).where(eq(dataSets.id, datasetId));
            const [result] = await db
                .select()
                .from(dataSets)
                .where(eq(dataSets.id, datasetId))
                .limit(1);
            expect(result).toBeUndefined();
        });
    });
    describe("Dataset Entries", () => {
        let datasetId;
        let entryId;
        beforeAll(async () => {
            if (!dbAvailable)
                return;
            // Create test dataset
            const [dataset] = await db
                .insert(dataSets)
                .values({
                name: `Entry Test Dataset ${generateTestId()}`,
                slug: `entry-test-${generateTestId()}`,
                schema: {
                    fields: [
                        { id: "f1", key: "title", type: "text", label: "Title", required: true },
                    ],
                    version: "2.0",
                },
            })
                .returning();
            datasetId = dataset.id;
        });
        afterAll(async () => {
            if (!dbAvailable)
                return;
            await db.delete(dataEntries).where(eq(dataEntries.datasetId, datasetId));
            await db.delete(dataSets).where(eq(dataSets.id, datasetId));
        });
        it("should create an entry in dataset", async () => {
            if (!dbAvailable)
                return;
            const [result] = await db
                .insert(dataEntries)
                .values({
                datasetId,
                data: {
                    title: "Test Entry",
                    count: 42,
                },
                status: "published",
            })
                .returning();
            expect(result).toBeDefined();
            expect(result.datasetId).toBe(datasetId);
            expect(result.data).toHaveProperty("title");
            expect(result.status).toBe("published");
            entryId = result.id;
        });
        it("should fetch entries by dataset", async () => {
            if (!dbAvailable)
                return;
            const results = await db
                .select()
                .from(dataEntries)
                .where(eq(dataEntries.datasetId, datasetId));
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].datasetId).toBe(datasetId);
        });
        it("should update an entry", async () => {
            if (!dbAvailable)
                return;
            const [result] = await db
                .update(dataEntries)
                .set({
                data: { title: "Updated Entry", count: 100 },
                updatedAt: new Date(),
            })
                .where(eq(dataEntries.id, entryId))
                .returning();
            expect(result).toBeDefined();
            expect(result.data.title).toBe("Updated Entry");
            expect(result.data.count).toBe(100);
        });
        it("should change entry status", async () => {
            if (!dbAvailable)
                return;
            const [result] = await db
                .update(dataEntries)
                .set({ status: "draft" })
                .where(eq(dataEntries.id, entryId))
                .returning();
            expect(result).toBeDefined();
            expect(result.status).toBe("draft");
        });
        it("should delete an entry", async () => {
            if (!dbAvailable)
                return;
            await db.delete(dataEntries).where(eq(dataEntries.id, entryId));
            const [result] = await db
                .select()
                .from(dataEntries)
                .where(eq(dataEntries.id, entryId))
                .limit(1);
            expect(result).toBeUndefined();
        });
    });
    describe("Complex Data Operations", () => {
        it("should handle nested JSON data", async () => {
            if (!dbAvailable)
                return;
            const [dataset] = await db
                .insert(dataSets)
                .values({
                name: `Complex Data Test`,
                slug: `complex-test-${generateTestId()}`,
                schema: { fields: [], version: "2.0" },
            })
                .returning();
            const complexData = {
                title: "Complex Entry",
                nested: {
                    array: [1, 2, 3],
                    object: { key: "value", nested: { deep: true } },
                    null: null,
                },
                metadata: {
                    tags: ["tag1", "tag2"],
                    createdBy: "test-user",
                },
            };
            const [entry] = await db
                .insert(dataEntries)
                .values({
                datasetId: dataset.id,
                data: complexData,
                status: "published",
            })
                .returning();
            expect(entry).toBeDefined();
            expect(entry.data.nested).toEqual(complexData.nested);
            expect(entry.data.metadata).toEqual(complexData.metadata);
            // Cleanup
            await db.delete(dataEntries).where(eq(dataEntries.id, entry.id));
            await db.delete(dataSets).where(eq(dataSets.id, dataset.id));
        });
        it("should handle concurrent entry creation", async () => {
            if (!dbAvailable)
                return;
            const [dataset] = await db
                .insert(dataSets)
                .values({
                name: `Concurrent Test`,
                slug: `concurrent-test-${generateTestId()}`,
                schema: { fields: [], version: "2.0" },
            })
                .returning();
            const promises = Array.from({ length: 5 }, (_, i) => db.insert(dataEntries).values({
                datasetId: dataset.id,
                data: { index: i },
                status: "published",
            }).returning());
            const results = await Promise.all(promises);
            expect(results).toHaveLength(5);
            // Cleanup
            await db.delete(dataEntries).where(eq(dataEntries.datasetId, dataset.id));
            await db.delete(dataSets).where(eq(dataSets.id, dataset.id));
        });
    });
});
//# sourceMappingURL=datasets.test.js.map