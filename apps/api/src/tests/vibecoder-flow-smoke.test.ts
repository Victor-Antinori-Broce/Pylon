/**
 * SMOKE E2E — Flujo Vibecoder completo (integración, requiere PostgreSQL de test)
 *
 * Valida el camino crítico de la beta de punta a punta contra el app real
 * (in-process via app.request, mismo patrón que auth-http.test.ts):
 *
 *   1. Registro + promoción a admin
 *   2. Activar grimoire → settings reflejan activeGrimoire
 *      + contrato de theme (config.theme que consume applyGrimoireTheme)
 *   3. Habilitar un kon → /api/modules lo reporta enabled
 *      (contrato que consume el sidebar dinámico)
 *   4. /api/admin/registry/:konId responde config de vistas
 *      (contrato que consume GrimoirePage en /g/kon-x)
 *   5. KITSUDEN Vault: CREATE TABLE real → CRUD de filas → lectura via Graphify
 *   6. Secrets Manager: crear → HOT INJECTION verificada en process.env → borrar
 *
 * Correr con: pnpm test:api:all (levanta la DB de test en el puerto 5434)
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";

import { konInstalado } from "../lib/kons-instalados";

// El flujo usa kon-crm, un kon INSTALABLE (kitsuden-kons).
const itConCrm = konInstalado("kon-crm")?.ruta ? it : it.skip;

import { app } from "../index";

import { isDatabaseAvailable, clearTestData, generateTestId, entrarComo } from "./setup";

let dbAvailable = false;

function req(path: string, opts: RequestInit = {}, cookie?: string): Request {
  const headers = new Headers(opts.headers);
  if (cookie) headers.set("Cookie", cookie);
  headers.set("Content-Type", "application/json");
  return new Request(`http://localhost:3000${path}`, { ...opts, headers });
}

const testId = generateTestId();
const email = `vibecoder-${testId}@example.com`;
const password = "VibecoderSmoke123!";
const collection = `smoke_${testId.toLowerCase().replace(/[^a-z0-9_]/g, "")}`;
const secretKey = "VIBE_SMOKE_SECRET";

let cookie = "";
let vaultWasEnabled: string | undefined;

describe("SMOKE E2E — flujo vibecoder", () => {
  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (!dbAvailable) return;
    await clearTestData();
    // Vault es flag-gated: habilitarlo solo durante este smoke
    vaultWasEnabled = process.env.KITSUDEN_VAULT_ENABLED;
    process.env.KITSUDEN_VAULT_ENABLED = "true";
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    // Limpieza best-effort (ignora errores si algún paso no llegó a crear)
    try {
      await app.request(
        req(`/api/admin/vault/${collection}?confirm=${collection}`, { method: "DELETE" }, cookie)
      );
    } catch {
      /* noop */
    }
    try {
      await app.request(req(`/api/admin/secrets/${secretKey}`, { method: "DELETE" }, cookie));
    } catch {
      /* noop */
    }
    try {
      await app.request(
        req(
          "/api/system/grimoire-state",
          { method: "POST", body: JSON.stringify({ action: "deactivate" }) },
          cookie
        )
      );
    } catch {
      /* noop */
    }
    if (vaultWasEnabled === undefined) delete process.env.KITSUDEN_VAULT_ENABLED;
    else process.env.KITSUDEN_VAULT_ENABLED = vaultWasEnabled;
    await clearTestData();
  });

  // ─────────────────────────────────────────────────────────────
  // PASO 1 — Registro y promoción a admin
  // ─────────────────────────────────────────────────────────────
  it("1. registra un usuario y lo promueve a admin", async () => {
    if (!dbAvailable) return;

    // Alta + correo verificado + rol admin en la base + entrada, con una IP
    // propia (los endpoints /api/admin/* exigen admin; ver tests/setup.ts para
    // la verificación de correo y el límite de altas por IP). El alta ya no
    // devuelve una sesión utilizable: sin correo confirmado no hay entrada.
    ({ cookie } = await entrarComo(app, {
      email,
      password,
      name: `Vibecoder ${testId}`,
      role: "admin",
    }));
    expect(cookie.length).toBeGreaterThan(0);
  });

  // ─────────────────────────────────────────────────────────────
  // PASO 2 — Grimoire: activación + contrato de theme
  // ─────────────────────────────────────────────────────────────
  it("2. activa un grimoire y expone su theme (contrato de applyGrimoireTheme)", async () => {
    if (!dbAvailable) return;

    const activate = await app.request(
      req(
        "/api/system/grimoire-state",
        {
          method: "POST",
          body: JSON.stringify({ action: "activate", grimoireId: "grimoire-default" }),
        },
        cookie
      )
    );
    expect(activate.status).toBe(200);

    const settingsRes = await app.request(req("/api/settings", {}, cookie));
    expect(settingsRes.status).toBe(200);
    const settings = (await settingsRes.json()) as {
      activeGrimoire?: string | null;
      activeTheme?: string | null;
    };
    expect(settings.activeGrimoire || settings.activeTheme).toBe("grimoire-default");
  });

  // Contrato con el panel: `applyGrimoireTheme` (packages/admin/src/lib/theme.svelte.ts)
  // lee `config.theme` del grimoire activo. Antes la API no lo devolvía.
  it("2b. GET /api/system/grimoires expone config.theme del grimoire activo", async () => {
    if (!dbAvailable) throw new Error("sin base de datos: nada que comprobar");

    // Contrato del theme: el panel lee config.theme del grimoire activo
    const grimoiresRes = await app.request(req("/api/system/grimoires", {}, cookie));
    expect(grimoiresRes.status).toBe(200);
    const grimoires = (await grimoiresRes.json()) as Array<{
      id: string;
      config?: { theme?: { primary_color?: string } };
    }>;
    const active = grimoires.find((g) => g.id === "grimoire-default");
    expect(active).toBeDefined();
    expect(active?.config?.theme?.primary_color).toBeDefined();
  });

  // ─────────────────────────────────────────────────────────────
  // PASO 3 — Kon habilitado aparece en el contrato del sidebar
  // ─────────────────────────────────────────────────────────────
  itConCrm("3. habilita kon-crm y /api/modules lo reporta enabled (contrato del sidebar)", async () => {
    if (!dbAvailable) return;

    const toggle = await app.request(
      req(
        "/api/modules/kon-crm",
        { method: "PATCH", body: JSON.stringify({ enabled: true }) },
        cookie
      )
    );
    expect([200, 201]).toContain(toggle.status);

    const modulesRes = await app.request(req("/api/modules", {}, cookie));
    expect(modulesRes.status).toBe(200);
    const data = (await modulesRes.json()) as {
      categories: Record<string, { modules: Array<{ key: string; enabled: boolean }> }>;
    };
    const all = Object.values(data.categories).flatMap((cat) => cat.modules ?? []);
    const crm = all.find((m) => m.key === "kon-crm");
    expect(crm).toBeDefined();
    expect(crm?.enabled).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────
  // PASO 4 — /g/kon-x: contrato que consume GrimoirePage
  // ─────────────────────────────────────────────────────────────
  itConCrm("4. /api/admin/registry/kon-crm devuelve config de vistas para /g/kon-crm", async () => {
    if (!dbAvailable) return;

    const res = await app.request(req("/api/admin/registry/kon-crm", {}, cookie));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      success: boolean;
      kon?: { id: string; views: unknown[]; defaultView: string };
      grimoire?: { id: string; views: unknown[]; defaultView: string };
    };
    expect(data.success).toBe(true);
    const config = data.kon ?? data.grimoire;
    expect(config?.id).toBe("kon-crm");
    expect(Array.isArray(config?.views)).toBe(true);
    expect(config?.views.length ?? 0).toBeGreaterThan(0);
  });

  // ─────────────────────────────────────────────────────────────
  // PASO 5 — Vault DDL real + CRUD + lectura via Graphify
  // ─────────────────────────────────────────────────────────────
  it("5a. Vault crea una tabla REAL con RLS", async () => {
    if (!dbAvailable) return;

    const res = await app.request(
      req(
        "/api/admin/vault",
        {
          method: "POST",
          body: JSON.stringify({
            collection,
            columns: [
              { name: "titulo", type: "text", required: true },
              { name: "puntos", type: "integer", indexed: true },
            ],
          }),
        },
        cookie
      )
    );
    const data = (await res.json()) as { success: boolean; table: string; graphify: string };
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.table).toBe(`vault_${collection}`);
    expect(data.graphify).toBe(`/api/graph/vault_${collection}`);
  });

  let rowId = "";

  it("5b. inserta y actualiza filas (parametrizado, bajo RLS)", async () => {
    if (!dbAvailable) return;

    const insert = await app.request(
      req(
        `/api/admin/vault/${collection}/rows`,
        { method: "POST", body: JSON.stringify({ titulo: "Primera fila vibecoder", puntos: 10 }) },
        cookie
      )
    );
    expect(insert.status).toBe(201);
    const inserted = (await insert.json()) as { success: boolean; row: { id: string } };
    expect(inserted.success).toBe(true);
    rowId = inserted.row.id;

    const patch = await app.request(
      req(
        `/api/admin/vault/${collection}/rows/${rowId}`,
        { method: "PATCH", body: JSON.stringify({ puntos: 42 }) },
        cookie
      )
    );
    expect(patch.status).toBe(200);
  });

  it("5c. Graphify sirve la colección Vault (lectura relacional automática)", async () => {
    if (!dbAvailable) return;

    // El grafo incluye la tabla vault_*
    const graph = await app.request(req("/api/graph", {}, cookie));
    expect(graph.status).toBe(200);
    const graphData = (await graph.json()) as { success: boolean; tables: string[] };
    expect(graphData.tables).toContain(`vault_${collection}`);

    // Listado con filtro de igualdad
    const list = await app.request(
      req(`/api/graph/vault_${collection}?puntos=42&limit=10`, {}, cookie)
    );
    expect(list.status).toBe(200);
    const listData = (await list.json()) as {
      success: boolean;
      rows: Array<{ id: string; titulo: string; puntos: number }>;
    };
    expect(listData.success).toBe(true);
    expect(listData.rows.length).toBe(1);
    expect(listData.rows[0]!.titulo).toBe("Primera fila vibecoder");
    expect(listData.rows[0]!.puntos).toBe(42);

    // Registro puntual
    const single = await app.request(req(`/api/graph/vault_${collection}/${rowId}`, {}, cookie));
    expect(single.status).toBe(200);
  });

  it("5d. ALTER TABLE en caliente + DROP con confirmación", async () => {
    if (!dbAvailable) return;

    const addCol = await app.request(
      req(
        `/api/admin/vault/${collection}/columns`,
        { method: "POST", body: JSON.stringify({ name: "notas", type: "text" }) },
        cookie
      )
    );
    expect(addCol.status).toBe(200);

    // DROP sin confirmación debe rechazarse
    const dropNoConfirm = await app.request(
      req(`/api/admin/vault/${collection}`, { method: "DELETE" }, cookie)
    );
    expect(dropNoConfirm.status).toBe(400);

    const drop = await app.request(
      req(`/api/admin/vault/${collection}?confirm=${collection}`, { method: "DELETE" }, cookie)
    );
    expect(drop.status).toBe(200);
  });

  // ─────────────────────────────────────────────────────────────
  // PASO 6 — Secrets Manager: hot injection REAL en process.env
  // ─────────────────────────────────────────────────────────────
  it("6. crea un secret y verifica la inyección en caliente en process.env", async () => {
    if (!dbAvailable) return;

    delete process.env[secretKey];

    const create = await app.request(
      req(
        "/api/admin/secrets",
        {
          method: "POST",
          body: JSON.stringify({
            key: secretKey,
            value: "valor-smoke-123",
            category: "general",
            injectNow: true,
          }),
        },
        cookie
      )
    );
    expect(create.status).toBe(200);

    // La promesa Prefect-style: el proceso ya ve el valor SIN reiniciar
    expect(process.env[secretKey]).toBe("valor-smoke-123");

    // La lista solo expone el hint enmascarado, nunca el valor
    const list = await app.request(req("/api/admin/secrets", {}, cookie));
    const listData = (await list.json()) as {
      secrets: Array<{ key: string; hint: string }>;
    };
    const found = listData.secrets.find((s) => s.key === secretKey);
    expect(found).toBeDefined();
    expect(found?.hint).not.toContain("valor-smoke-123");

    // Borrar limpia DB y process.env
    const del = await app.request(
      req(`/api/admin/secrets/${secretKey}`, { method: "DELETE" }, cookie)
    );
    expect(del.status).toBe(200);
    expect(process.env[secretKey]).toBeUndefined();
  });
});
