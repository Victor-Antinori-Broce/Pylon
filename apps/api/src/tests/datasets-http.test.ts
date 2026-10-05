/**
 * Dataset CRUD + Entries HTTP Tests
 *
 * Tests dataset and entry operations via HTTP through the Hono app.
 * Covers: create, list, entries CRUD, RLS filtering.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";

import { app } from "../index";

import { isDatabaseAvailable, clearTestData, generateTestId } from "./setup";

let dbAvailable = false;

function req(path: string, opts: RequestInit = {}, cookie?: string): Request {
  const headers = new Headers(opts.headers);
  if (cookie) headers.set("Cookie", cookie);
  headers.set("Content-Type", "application/json");
  return new Request(`http://localhost:3000${path}`, { ...opts, headers });
}

function extractCookie(headers: Headers): string {
  const setCookie = headers.get("set-cookie") || "";
  return setCookie.split(";")[0];
}

describe("Dataset HTTP CRUD", () => {
  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (dbAvailable) await clearTestData();
  });

  afterAll(async () => {
    if (dbAvailable) await clearTestData();
  });

  const userAEmail = `ds-user-a-${generateTestId()}@example.com`;
  const userBEmail = `ds-user-b-${generateTestId()}@example.com`;
  const password = "TestPassword123!";
  let cookieA = "";
  let cookieB = "";
  let userAId = "";
  let userBId = "";
  let datasetId = "";
  let entryId = "";

  describe("Setup Users", () => {
    it("should create user A and sign in", async () => {
      if (!dbAvailable) return;

      await app.request(
        req("/api/auth/sign-up/email", {
          method: "POST",
          body: JSON.stringify({ email: userAEmail, password, name: "User A" }),
        })
      );

      const res = await app.request(
        req("/api/auth/sign-in/email", {
          method: "POST",
          body: JSON.stringify({ email: userAEmail, password }),
        })
      );

      cookieA = extractCookie(res.headers);
      const session = await app.request(req("/api/auth/get-session", {}, cookieA));
      const body = (await session.json()) as any;
      userAId = body.user.id;
    });

    it("should create user B and sign in", async () => {
      if (!dbAvailable) return;

      await app.request(
        req("/api/auth/sign-up/email", {
          method: "POST",
          body: JSON.stringify({ email: userBEmail, password, name: "User B" }),
        })
      );

      const res = await app.request(
        req("/api/auth/sign-in/email", {
          method: "POST",
          body: JSON.stringify({ email: userBEmail, password }),
        })
      );

      cookieB = extractCookie(res.headers);
      const session = await app.request(req("/api/auth/get-session", {}, cookieB));
      const body = (await session.json()) as any;
      userBId = body.user.id;
    });
  });

  describe("Create Dataset", () => {
    it("should create a dataset via HTTP", async () => {
      if (!dbAvailable) return;

      const res = await app.request(
        req(
          "/api/data-sets",
          {
            method: "POST",
            body: JSON.stringify({
              name: `HTTP Test Dataset ${generateTestId()}`,
              slug: `http-ds-${generateTestId()}`,
              description: "Created via HTTP test",
              schema: {
                fields: [{ id: "f1", key: "title", type: "text", label: "Title", required: true }],
                version: "2.0",
              },
            }),
          },
          cookieA
        )
      );

      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.id).toBeDefined();
      expect(body.name).toContain("HTTP Test Dataset");
      datasetId = body.id;
    });

    it("should reject dataset creation without auth", async () => {
      if (!dbAvailable) return;

      const res = await app.request(
        req("/api/data-sets", {
          method: "POST",
          body: JSON.stringify({ name: "No Auth Dataset", slug: `no-auth-${generateTestId()}` }),
        })
      );

      expect(res.status).toBe(401);
    });
  });

  describe("List Datasets", () => {
    it("should list datasets", async () => {
      if (!dbAvailable) return;

      const res = await app.request(req("/api/data-sets", {}, cookieA));
      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(Array.isArray(body.docs)).toBe(true);
      expect(body.docs.length).toBeGreaterThan(0);
      expect(body.docs.some((d: any) => d.id === datasetId)).toBe(true);
    });

    it("should list datasets with limit", async () => {
      if (!dbAvailable) return;

      const res = await app.request(req("/api/data-sets?limit=1", {}, cookieA));
      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(body.docs.length).toBeLessThanOrEqual(1);
    });
  });

  describe("Dataset Entries", () => {
    it("should insert an entry into dataset", async () => {
      if (!dbAvailable) return;

      const res = await app.request(
        req(
          `/api/data-sets/${datasetId}/entries`,
          {
            method: "POST",
            body: JSON.stringify({
              title: "Test Entry A",
              data: { title: "Test Entry A", score: 42 },
              status: "published",
            }),
          },
          cookieA
        )
      );

      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(Array.isArray(body)).toBe(true);
      expect(body[0].title).toBe("Test Entry A");
      entryId = body[0].id;
    });

    it("should list entries for dataset", async () => {
      if (!dbAvailable) return;

      const res = await app.request(req(`/api/data-sets/${datasetId}/entries`, {}, cookieA));

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.docs.length).toBeGreaterThan(0);
      expect(body.docs[0].title).toBe("Test Entry A");
    });

    it("should reject entry insert without auth", async () => {
      if (!dbAvailable) return;

      const res = await app.request(
        req(`/api/data-sets/${datasetId}/entries`, {
          method: "POST",
          body: JSON.stringify({ title: "No Auth Entry" }),
        })
      );

      expect(res.status).toBe(401);
    });
  });

  describe("RLS Filtering", () => {
    it("should not show user A entries to user B (HTTP layer)", async () => {
      if (!dbAvailable) return;

      // User B lists entries for the same dataset
      const res = await app.request(req(`/api/data-sets/${datasetId}/entries`, {}, cookieB));

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;

      // RLS must filter entries created by user A when queried by user B.
      expect(body.docs.some((e: any) => e.id === entryId)).toBe(false);
      expect(body.docs.length).toBe(0);
    });
  });

  describe("Dataset Query Engine", () => {
    it("should query entries with filters via POST /api/datasets/:id/query", async () => {
      if (!dbAvailable) return;

      const res = await app.request(
        req(
          `/api/datasets/${datasetId}/query`,
          {
            method: "POST",
            body: JSON.stringify({
              where: { title: { eq: "Test Entry A" } },
            }),
          },
          cookieA
        )
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(1);
      expect(body.data[0].title).toBe("Test Entry A");
      expect(body.meta.total).toBe(1);
    });

    it("should batch insert entries", async () => {
      if (!dbAvailable) return;

      const res = await app.request(
        req(
          "/api/datasets/batch",
          {
            method: "POST",
            body: JSON.stringify({
              operations: [
                {
                  op: "create",
                  table: "dataEntries",
                  data: {
                    dataSetId: datasetId,
                    title: "Batch 1",
                    data: { index: 1 },
                    status: "published",
                  },
                },
                {
                  op: "create",
                  table: "dataEntries",
                  data: {
                    dataSetId: datasetId,
                    title: "Batch 2",
                    data: { index: 2 },
                    status: "published",
                  },
                },
              ],
            }),
          },
          cookieA
        )
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.results).toHaveLength(2);
      expect(body.results.every((r: any) => r.success)).toBe(true);
    });
  });
});
