/**
 * Dataset CRUD + Entries HTTP Tests
 *
 * Tests dataset and entry operations via HTTP through the Hono app.
 * Covers: create, list, entries CRUD, RLS filtering.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";

import { db } from "../db";
import { dataSets } from "../db/schema";
import { app } from "../index";

import { isDatabaseAvailable, clearTestData, generateTestId, entrarComo } from "./setup";

let dbAvailable = false;

function req(path: string, opts: RequestInit = {}, cookie?: string): Request {
  const headers = new Headers(opts.headers);
  if (cookie) headers.set("Cookie", cookie);
  headers.set("Content-Type", "application/json");
  return new Request(`http://localhost:3000${path}`, { ...opts, headers });
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
  let cookieAdmin = "";
  let userAId = "";
  let userBId = "";
  let datasetId = "";
  let entryId = "";

  describe("Setup Users", () => {
    it("should create user A and sign in", async () => {
      if (!dbAvailable) return;

      // Crear un dataset (`POST /api/data-sets`) es de staff según la matriz
      // de autorización: A es editora. B se queda como usuario normal, que es
      // justo a quien el aislamiento entre usuarios tiene que proteger.
      ({ cookie: cookieA, userId: userAId } = await entrarComo(app, {
        email: userAEmail,
        password,
        name: "User A",
        role: "editor",
      }));
    });

    it("should create user B and sign in", async () => {
      if (!dbAvailable) return;

      ({ cookie: cookieB, userId: userBId } = await entrarComo(app, {
        email: userBEmail,
        password,
        name: "User B",
      }));
    });

    it("should create an admin and sign in", async () => {
      if (!dbAvailable) return;

      // La consulta Kitsuden QL sobre un dataset con filas por dueño y
      // `/api/datasets/batch` son solo de admin desde la auditoría del
      // 2026-10-15 (ver «Dataset Query Engine» abajo).
      ({ cookie: cookieAdmin } = await entrarComo(app, {
        email: `ds-admin-${generateTestId()}@example.com`,
        password,
        name: "Dataset Admin",
        role: "admin",
      }));
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

    it("opens the dataset to accounts (it is closed by default): only an admin can", async () => {
      if (!dbAvailable) return;

      const res = await app.request(
        req(
          `/api/data-sets/${datasetId}`,
          { method: "PATCH", body: JSON.stringify({
          policyJson: {
            readAccess: "authenticated",
            writeAccess: "authenticated",
            enableRLS: true,
            rlsRules: [{ field: "ownerId", operator: "eq", value: "__USER_ID__" }],
          },
        }) },
          cookieAdmin
        )
      );
      expect(res.status).toBe(200);
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

    it("pasa de 200 filas y pagina con offset", async () => {
      if (!dbAvailable) return;

      // Más de los 200 de antes: los últimos por nombre tienen que seguir saliendo
      const prefijo = `zz-tope-${Date.now()}`;
      const nuevos = Array.from({ length: 205 }, (_, i) => ({
        id: crypto.randomUUID(),
        name: `${prefijo}-${String(i).padStart(3, "0")}`,
        slug: `${prefijo}-${i}`,
        schema: [],
        policyJson: { readAccess: "public", writeAccess: "admin" },
      }));
      await db.insert(dataSets).values(nuevos);

      const todos = (await (
        await app.request(req("/api/data-sets?limit=1000", {}, cookieA))
      ).json()) as any;
      const nombres = todos.docs.map((d: any) => d.name);
      expect(nombres).toContain(`${prefijo}-204`);

      const pagina = async (offset: number) =>
        ((await (
          await app.request(req(`/api/data-sets?limit=100&offset=${offset}`, {}, cookieA))
        ).json()) as any).docs.map((d: any) => d.id);
      const [a, b] = [await pagina(0), await pagina(100)];
      expect(a.filter((id: string) => b.includes(id))).toEqual([]);
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

    // ?count=exact (rendimiento, 2026-10-27): el recuento pasa por la MISMA
    // visibilidad que las filas. B no ve las de A: su recuento es 0, no el total.
    it("?count=exact cuenta solo lo que ve quien pregunta (y limit=0 no lee filas)", async () => {
      if (!dbAvailable) return;

      const deA = (await (
        await app.request(req(`/api/data-sets/${datasetId}/entries?count=exact`, {}, cookieA))
      ).json()) as any;
      expect(deA.totalCount).toBe(deA.docs.length);
      expect(deA.totalCount).toBeGreaterThan(0);

      const soloContarA = (await (
        await app.request(req(`/api/data-sets/${datasetId}/entries?count=exact&limit=0`, {}, cookieA))
      ).json()) as any;
      expect(soloContarA.docs).toEqual([]);
      expect(soloContarA.totalCount).toBe(deA.totalCount);

      const resB = await app.request(req(`/api/data-sets/${datasetId}/entries?count=exact&limit=0`, {}, cookieB));
      expect(resB.status).toBe(200);
      expect(((await resB.json()) as any).totalCount).toBe(0);

      // Sin el parámetro, la respuesta es la de siempre
      const sinContar = (await (
        await app.request(req(`/api/data-sets/${datasetId}/entries`, {}, cookieA))
      ).json()) as any;
      expect("totalCount" in sinContar).toBe(false);
    });
  });

  describe("Dataset Query Engine", () => {
    it("should refuse the query engine to non-admins on a per-owner dataset (403)", async () => {
      if (!dbAvailable) return;

      // El motor de consultas no sabe aplicar las `rlsRules` de la política:
      // con un dataset aislado por dueño, cualquier cuenta con lectura veía por
      // aquí las filas de todos. Hasta que las entienda, solo admin
      // (`consultaSaltariaAislamiento` en routes/datasets-query.ts).
      const res = await app.request(
        req(
          `/api/datasets/${datasetId}/query`,
          { method: "POST", body: JSON.stringify({ where: { title: { eq: "Test Entry A" } } }) },
          cookieA
        )
      );
      expect(res.status).toBe(403);
    });

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
          cookieAdmin
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

      // `/api/datasets/batch` opera sobre cualquier tabla en una transacción:
      // solo admin (matriz de autorización y `puedeUsarBatch`).
      const prohibido = await app.request(
        req(
          "/api/datasets/batch",
          { method: "POST", body: JSON.stringify({ operations: [] }) },
          cookieA
        )
      );
      expect(prohibido.status).toBe(403);

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
          cookieAdmin
        )
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.results).toHaveLength(2);
      // Cada resultado lleva `status: "created"` y el resumen va en `meta`
      // (routes/datasets-query.ts); ya no hay un `success` por operación.
      expect(body.results.every((r: any) => r.status === "created")).toBe(true);
      expect(body.meta.successfulOperations).toBe(2);
      expect(body.meta.failedOperations).toBe(0);
    });
  });
});
