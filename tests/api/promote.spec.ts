// spec: Épica 3 — Promote to Content E2E Tests

import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api";

let datasetId: string;

test.describe("Promote to Content", () => {
    test.beforeAll(async ({ request }) => {
        // Get a dataset to test with
        const res = await request.get(`${API}/data-sets`);
        const data = await res.json();
        if (data.docs && data.docs.length > 0) {
            datasetId = data.docs[0].id;
        }
    });

    // ── Promote Lifecycle ──
    test("Full promote/demote lifecycle", async ({ request }) => {
        test.skip(!datasetId, "No datasets available for testing");

        // Check status before
        const statusBefore = await request.get(
            `${API}/custom/promote/${datasetId}/status`
        );
        expect(statusBefore.ok()).toBeTruthy();
        const beforeData = await statusBefore.json();
        expect(beforeData.datasetId).toBe(datasetId);

        // PROMOTE
        const promoteRes = await request.post(
            `${API}/custom/promote/${datasetId}`,
            {
                data: {
                    slugPrefix: "test-content",
                    defaultSeoTemplate: {
                        titleSuffix: " | GremiusCMS",
                    },
                },
            }
        );
        expect(promoteRes.status()).toBe(201);
        const promoted = await promoteRes.json();
        expect(promoted.promoted).toBe(true);
        expect(promoted.datasetId).toBe(datasetId);
        expect(promoted.contentConfig.slugPrefix).toBe("test-content");

        // Check status after promotion
        const statusAfter = await request.get(
            `${API}/custom/promote/${datasetId}/status`
        );
        const afterData = await statusAfter.json();
        expect(afterData.promoted).toBe(true);

        // Duplicate promote should return 409
        const dupeRes = await request.post(
            `${API}/custom/promote/${datasetId}`,
            {
                data: { slugPrefix: "dupe" },
            }
        );
        expect(dupeRes.status()).toBe(409);

        // List content entries
        const entriesRes = await request.get(
            `${API}/custom/content/${datasetId}/entries`
        );
        expect(entriesRes.ok()).toBeTruthy();
        const entries = await entriesRes.json();
        expect(entries.docs).toBeDefined();
        expect(Array.isArray(entries.docs)).toBe(true);

        // If we have promoted entries, test slug lookup
        if (entries.docs.length > 0 && entries.docs[0].contentMeta) {
            const slug = entries.docs[0].contentMeta.slug;

            // Update CMS metadata
            const updateRes = await request.patch(
                `${API}/custom/content/entry/${entries.docs[0].id}`,
                {
                    data: {
                        seoMetadata: {
                            title: "Test SEO Title",
                            description: "Test SEO description",
                            noIndex: false,
                        },
                    },
                }
            );
            expect(updateRes.ok()).toBeTruthy();
            const updated = await updateRes.json();
            expect(updated.seoMetadata.title).toBe("Test SEO Title");
        }

        // DEMOTE
        const demoteRes = await request.delete(
            `${API}/custom/promote/${datasetId}`
        );
        expect(demoteRes.ok()).toBeTruthy();
        const demoted = await demoteRes.json();
        expect(demoted.demoted).toBe(true);

        // Verify demoted
        const statusDemoted = await request.get(
            `${API}/custom/promote/${datasetId}/status`
        );
        const demotedData = await statusDemoted.json();
        expect(demotedData.promoted).toBe(false);
    });

    // ── Validation ──
    test("Promote rejects missing slugPrefix", async ({ request }) => {
        test.skip(!datasetId, "No datasets available for testing");

        const res = await request.post(`${API}/custom/promote/${datasetId}`, {
            data: {},
        });
        expect(res.status()).toBe(400);
    });

    test("Promote nonexistent dataset returns 404", async ({ request }) => {
        const res = await request.post(
            `${API}/custom/promote/00000000-0000-0000-0000-000000000000`,
            {
                data: { slugPrefix: "nope" },
            }
        );
        expect(res.status()).toBe(404);
    });

    test("Demote nonexistent dataset returns 404", async ({ request }) => {
        const res = await request.delete(
            `${API}/custom/promote/00000000-0000-0000-0000-000000000000`
        );
        expect(res.status()).toBe(404);
    });

    // ── Public Slug ──
    test("Content slug lookup for nonexistent slug returns 404", async ({
        request,
    }) => {
        const res = await request.get(
            `${API}/custom/content/slug/nonexistent-slug-xyz`
        );
        expect(res.status()).toBe(404);
    });

    // ── Content metadata for non-promoted entry ──
    test("Update content meta on non-promoted entry returns 404", async ({
        request,
    }) => {
        const res = await request.patch(
            `${API}/custom/content/entry/00000000-0000-0000-0000-000000000000`,
            {
                data: { slug: "test" },
            }
        );
        expect(res.status()).toBe(404);
    });
});
