import { describe, it, expect, mock, beforeAll, afterAll, beforeEach } from "bun:test";
import { Hono } from "hono";

let selectResults: any[] = [];
let selectCallIndex = 0;
let insertReturning: any[] = [];

function getNextSelect() {
  return selectResults[selectCallIndex++] || [];
}

/**
 * `limit()` se puede esperar Y se le puede encadenar `offset()`: es lo que hace
 * el constructor de consultas de verdad. Cuando el mock solo devolvía una
 * promesa, añadir paginación a la ruta rompía el test con «offset is not a
 * function» — un fallo del doble, no del código.
 */
const conOffset = () => {
  const filas = getNextSelect();
  const promesa: any = Promise.resolve(filas);
  promesa.offset = () => Promise.resolve(filas);
  return promesa;
};

const mockDb = {
  select: mock(() => ({
    from: (table: any) => ({
      where: (cond: any) => ({
        limit: (n: number) => conOffset(),
        orderBy: (...args: any[]) => ({
          limit: (n: number) => conOffset(),
        }),
      }),
      orderBy: (...args: any[]) => ({
        limit: (n: number) => conOffset(),
      }),
      limit: (n: number) => conOffset(),
    }),
  })),
  insert: mock(() => ({
    values: (data: any) => ({
      returning: () => Promise.resolve(insertReturning),
    }),
  })),
  execute: mock(async () => ({})),
};

mock.module("../db", () => ({
  db: mockDb,
}));

mock.module("../db/schema", () => ({
  dataSets: { slug: "slug_col", name: "name_col", id: "id_col" },
  dataEntries: {
    id: "id_col",
    dataSetId: "dataSetId_col",
    sortOrder: "sortOrder_col",
  },
  siteSettings: { id: "id_col" },
}));

mock.module("./graphql", () => ({
  invalidateGraphQLCache: mock(async () => {}),
}));

mock.module("../lib/auth", () => ({
  auth: {
    api: {
      getSession: mock(async () => ({
        user: { id: "user-1", role: "admin" },
        session: { id: "session-1" },
      })),
    },
  },
}));

import { dataSetsRoutes } from "../routes/crud";

afterAll(() => {
  mock.restore();
});

function buildApp() {
  const app = new Hono();
  app.route("/datasets", dataSetsRoutes);
  return app;
}

async function getJson(res: Response) {
  const status = res.status;
  const body = (await res.json().catch(() => ({}))) as any;
  return { status, body };
}

describe("dataSets routes", () => {
  beforeEach(() => {
    selectResults = [];
    selectCallIndex = 0;
    insertReturning = [];
  });

  /**
   * La lista tiene la misma regla que la ficha: sin `policyJson` un dataset es
   * de administración (`checkReadAccess` solo deja pasar a admin), y este
   * harness no inyecta usuario. Antes la lista los enseñaba todos, así que un
   * dataset privado se leía entero desde el listado aunque su ficha diera 404.
   */
  it("GET /datasets enseña los públicos y calla los que no lo son", async () => {
    selectResults = [
      [
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Posts",
          policyJson: { readAccess: "public" },
        },
        { id: "22222222-2222-4222-8222-222222222222", name: "Secretos" },
      ],
    ];
    const app = buildApp();
    const res = await app.request("/datasets");
    const { status, body } = await getJson(res);
    expect(status).toBe(200);
    expect(body.docs.map((d: any) => d.name)).toEqual(["Posts"]);
    expect(body.totalDocs).toBe(1);
  });

  it("GET /datasets/slug/:slug returns a dataset", async () => {
    selectResults = [
      [
        {
          id: "11111111-1111-4111-8111-111111111111",
          slug: "posts",
          name: "Posts",
          policyJson: { readAccess: "public" },
        },
      ],
    ];
    const app = buildApp();
    const res = await app.request("/datasets/slug/posts");
    const { status, body } = await getJson(res);
    expect(status).toBe(200);
    expect(body.id).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("GET /datasets/slug/:slug returns 404 when missing", async () => {
    selectResults = [[]];
    const app = buildApp();
    const res = await app.request("/datasets/slug/missing");
    const { status, body } = await getJson(res);
    expect(status).toBe(404);
    expect(body.error).toContain("DataSet not found");
  });

  // El handler hace DOS selects: (1) el dataset para leer su policyJson,
  // (2) las entries ya filtradas por buildDatasetWhere.
  it("GET /datasets/:id/entries returns entries when policy allows read", async () => {
    selectResults = [
      [{ policyJson: { readAccess: "public", rlsRules: [] } }],
      [{ id: "e1", title: "Hello" }],
    ];
    const app = buildApp();
    const res = await app.request("/datasets/11111111-1111-4111-8111-111111111111/entries");
    const { status, body } = await getJson(res);
    expect(status).toBe(200);
    expect(body.docs.length).toBe(1);
  });

  it("GET /datasets/:id/entries → 404 when the dataset has no policy (deny-by-default)", async () => {
    // Sin policyJson, checkReadAccess solo permite admin. El harness no inyecta
    // usuario en esta ruta pública, así que debe denegarse — y con 404, no 403,
    // para no filtrar la existencia del dataset.
    selectResults = [[{ policyJson: null }], [{ id: "e1", title: "Hello" }]];
    const app = buildApp();
    const res = await app.request("/datasets/11111111-1111-4111-8111-111111111111/entries");
    const { status, body } = await getJson(res);
    expect(status).toBe(404);
    expect(body.error).toContain("DataSet not found");
  });

  it("GET /datasets/:id/entries → 404 when the dataset does not exist", async () => {
    selectResults = [[]];
    const app = buildApp();
    const res = await app.request("/datasets/nope/entries");
    const { status } = await getJson(res);
    expect(status).toBe(404);
  });

  it("POST /datasets creates a dataset with slug fallback", async () => {
    insertReturning = [{ id: "ds2", name: "My Dataset", slug: "my-dataset" }];
    const app = buildApp();
    const res = await app.request("/datasets", {
      method: "POST",
      body: JSON.stringify({ name: "My Dataset" }),
      headers: { "Content-Type": "application/json" },
    });
    const { status, body } = await getJson(res);
    expect(status).toBe(201);
    expect(body.slug).toBe("my-dataset");
  });

  it("POST /datasets/:id/entries creates a single entry", async () => {
    selectResults = [[{ id: "11111111-1111-4111-8111-111111111111", slug: "posts", schema: [] }]];
    insertReturning = [{ id: "e1", title: "Hello" }];
    const app = buildApp();
    const res = await app.request("/datasets/11111111-1111-4111-8111-111111111111/entries", {
      method: "POST",
      body: JSON.stringify({ title: "Hello", ownerId: "user-1" }),
      headers: { "Content-Type": "application/json" },
    });
    const { status, body } = await getJson(res);
    expect(status).toBe(201);
    expect(Array.isArray(body)).toBe(true);
  });

  it("POST /datasets/:id/entries creates multiple entries", async () => {
    selectResults = [[{ id: "11111111-1111-4111-8111-111111111111", slug: "posts", schema: [] }]];
    insertReturning = [{ id: "e1" }, { id: "e2" }];
    const app = buildApp();
    const res = await app.request("/datasets/11111111-1111-4111-8111-111111111111/entries", {
      method: "POST",
      body: JSON.stringify([{ title: "A" }, { title: "B" }]),
      headers: { "Content-Type": "application/json" },
    });
    const { status, body } = await getJson(res);
    expect(status).toBe(201);
    expect(body.length).toBe(2);
  });
});
