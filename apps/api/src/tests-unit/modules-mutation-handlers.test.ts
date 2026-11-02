/**
 * Modules Mutation Handlers — Unit Tests
 */

import { describe, it, expect, mock, beforeEach, afterAll } from "bun:test";

import { createMockContext, getLastJsonResponse } from "../tests/mock-context";

// ─── DB proxy ───────────────────────────────────────────────────────────────
let selectResults: any[][] = [];
let insertResult: any[] = [];
let updateResult: any[] = [];
let deleteResult: any[] = [];
let selectCallIndex = 0;

function createDbProxy(result: any): any {
  return new Proxy(() => {}, {
    get(_target, prop) {
      if (prop === "then") return (resolve: any) => resolve(result);
      return createDbProxy(result);
    },
    apply(_target, _thisArg, _args) {
      return createDbProxy(result);
    },
  });
}

function getNextSelectResult() {
  return selectResults[selectCallIndex++] || [];
}

const mockDb = {
  select: mock(() => createDbProxy(getNextSelectResult())),
  insert: mock(() => createDbProxy(insertResult)),
  update: mock(() => createDbProxy(updateResult)),
  delete: mock(() => createDbProxy(deleteResult)),
  execute: mock(() => Promise.resolve({ rows: [{ cnt: 0 }] })),
};

mock.module("../db", () => ({ db: mockDb, mergedSchema: {} }));
mock.module("drizzle-orm", () => ({
  eq: () => "eq",
  and: () => "and",
  sql: Object.assign(() => "sql", { raw: (s: string) => s }),
}));
mock.module("../services/scanner", () => ({
  runModuleMigrations: mock(() => Promise.resolve()),
  // `updateModuleHandler` lo usa para leer las tablas que declara el manifiesto
  // antes de dar el kon por instalado.
  scanPackages: mock(() => Promise.resolve([])),
}));

/**
 * Instalar el esquema se simula: aqui se prueba el HANDLER, no las migraciones.
 *
 * `resultadoMigracion` es lo que devuelve la simulacion, y cada prueba lo
 * ajusta. Importa que sea configurable porque la regla nueva —no activar un kon
 * cuyas tablas no existen— solo se puede probar controlando esa respuesta.
 */
let resultadoMigracion: {
  aplicadas: string[];
  yaEstaban: string[];
  tablasQueFaltan: string[];
  conexion: "admin" | "app";
} = { aplicadas: [], yaEstaban: [], tablasQueFaltan: [], conexion: "app" };

mock.module("../lib/migraciones-kon", () => ({
  aplicarMigracionesDeKon: mock(() => Promise.resolve({ konId: "x", ...resultadoMigracion })),
}));

import { updateModuleHandler } from "../routes/modules";

afterAll(() => mock.restore());

beforeEach(() => {
  selectResults = [];
  insertResult = [];
  updateResult = [];
  deleteResult = [];
  selectCallIndex = 0;
  resultadoMigracion = { aplicadas: [], yaEstaban: [], tablasQueFaltan: [], conexion: "app" };
});

// ═════════════════════════════════════════════════════════════════════════════
// updateModuleHandler
// ═════════════════════════════════════════════════════════════════════════════

describe("updateModuleHandler", () => {
  it("returns 409 when disabling with active dependents", async () => {
    // First select for _existingModule, then dbModules for check, then execute for checkCanDisable
    selectResults = [
      [{ key: "kon-media", enabled: true, grimoireId: null }],
      [{ key: "kon-media", enabled: true, grimoireId: null }],
    ];
    // Make checkCanDisable think there are dependents by returning cnt > 0
    mockDb.execute = mock(() => Promise.resolve({ rows: [{ cnt: 5 }] }));
    const c = createMockContext({ params: { key: "kon-media" }, body: { enabled: false } });
    const res = await updateModuleHandler(c);
    expect(res.status).toBe(409);
    mockDb.execute = mock(() => Promise.resolve({ rows: [{ cnt: 0 }] }));
  });

  it("inserts new module when not existing and enabled=true", async () => {
    selectResults = [
      [], // _existingModule
      [], // dbModules for check (not called because enabled !== false)
      [], // existing for upsert
      [{ key: "kon-blog", enabled: true, name: "Blog", category: "optional" }],
    ];
    const c = createMockContext({ params: { key: "kon-blog" }, body: { enabled: true } });
    const res = await updateModuleHandler(c);
    expect(res.status).toBe(200);
  });

  it("no activa un kon cuyas tablas siguen sin existir", async () => {
    /**
     * La regla que evita el estado que motivo todo esto: `modules.enabled` en
     * true y CERO tablas del kon en la base.
     *
     * Antes, un fallo de migracion se registraba con `console.error` y el kon
     * se marcaba como habilitado igual. Aparecia en el menu y cada una de sus
     * pantallas devolvia 500 o un formulario sin campos.
     */
    resultadoMigracion = {
      aplicadas: [],
      yaEstaban: [],
      tablasQueFaltan: ["cursos", "modulos"],
      conexion: "app",
    };
    selectResults = [[], [], [], []];
    const c = createMockContext({
      params: { key: "kon-academy-lms" },
      body: { enabled: true },
    });
    const res = await updateModuleHandler(c);
    expect(res.status).toBe(409);
    expect((getLastJsonResponse(c)?.data as { missingTables?: string[] })?.missingTables).toEqual([
      "cursos",
      "modulos",
    ]);
  });

  it("updates existing module settings", async () => {
    selectResults = [
      [{ key: "kon-blog", enabled: true, grimoireId: null }],
      [{ key: "kon-blog", enabled: true, grimoireId: null }],
      [{ key: "kon-blog", enabled: true, grimoireId: null }],
    ];
    const c = createMockContext({
      params: { key: "kon-blog" },
      body: { settings: { foo: 1 } },
    });
    const res = await updateModuleHandler(c);
    expect(res.status).toBe(200);
  });

  it("returns registry defaults when no DB record and no enabled flag", async () => {
    selectResults = [
      [], // _existingModule
      [], // existing for upsert
    ];
    const c = createMockContext({ params: { key: "kon-media" }, body: {} });
    const res = await updateModuleHandler(c);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.key).toBe("kon-media");
  });
});
