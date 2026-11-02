/**
 * Hallazgos de la auditoría del núcleo del 2026-10-15, uno por bloque.
 *
 * Son las reglas PURAS que cierran cada agujero; la prueba de punta a punta
 * (la app real, con identidades reales) es la matriz de autorización:
 * `scripts/matriz-de-autorizacion.ts` + `tests/unit/matriz-de-autorizacion.test.ts`.
 */
import { describe, expect, it } from "bun:test";

import { validateBearerToken } from "../lib/actions/handlers/webhook-in-handler";
import { parseAgentApiKey } from "../services/agent-auth";
import { soloAjustesEditables } from "../routes/crud";
import { consultaSaltariaAislamiento, puedeUsarBatch } from "../routes/datasets-query";
import { puedeVerTabla } from "../services/graphify";

describe("Graphify: sin rol admin, solo tablas con RLS forzada", () => {
  // Antes: CUALQUIER cuenta leía por /api/graph/<tabla> todo lo que no
  // estuviera en la deny-list — suscriptores del boletín, contactos del CRM,
  // empleados, pedidos, `data_sources` con su contraseña, acciones con sus
  // secretos de webhook…
  const forzadas = new Set(["data_entries", "vault_proyectos", "builder_builds"]);

  it("un usuario no ve tablas sin RLS", () => {
    for (const t of [
      "nl_members",
      "crm_contacts",
      "data_sources",
      "actions",
      "audit_logs",
      "media",
    ]) {
      expect(puedeVerTabla(t, { esAdmin: false }, forzadas), t).toBe(false);
      expect(puedeVerTabla(t, {}, forzadas), t).toBe(false);
    }
  });

  it("un usuario solo ve colecciones del Vault aisladas por Postgres", () => {
    expect(puedeVerTabla("vault_proyectos", {}, forzadas)).toBe(true);
    // Auditoría 2026-10-25: las tablas de kons con RLS forzada recortan
    // COLUMNAS en su ruta; graph hace SELECT * y se saltaba ese recorte.
    const deKons = new Set([...forzadas, "directory_employees", "dms_document_files"]);
    for (const t of ["data_entries", "builder_builds", "directory_employees", "dms_document_files"]) {
      expect(puedeVerTabla(t, {}, deKons), t).toBe(false);
    }
    // Un vault_ sin RLS forzada tampoco
    expect(puedeVerTabla("vault_sin_rls", {}, forzadas)).toBe(false);
  });

  it("admin ve lo expuesto; la deny-list manda para todos", () => {
    expect(puedeVerTabla("crm_contacts", { esAdmin: true }, forzadas)).toBe(true);
    expect(puedeVerTabla("auth_sessions", { esAdmin: true }, new Set(["auth_sessions"]))).toBe(
      false
    );
    expect(puedeVerTabla("kitsuden_secrets", { esAdmin: true }, forzadas)).toBe(false);
  });
});

describe("POST /api/datasets/:id/query respeta el aislamiento por fila", () => {
  const porDueno = {
    readAccess: "authenticated",
    writeAccess: "authenticated",
    enableRLS: true,
    rlsRules: [{ field: "ownerId", operator: "eq", value: "__USER_ID__" }],
  } as never;

  it("dataset por dueño + usuario normal: la consulta se rechazaría", () => {
    expect(consultaSaltariaAislamiento(porDueno, { id: "u1", role: "user" })).toBe(true);
  });

  it("admin, o dataset sin reglas: se consulta", () => {
    expect(consultaSaltariaAislamiento(porDueno, { id: "a1", role: "admin" })).toBe(false);
    expect(
      consultaSaltariaAislamiento({ readAccess: "public", rlsRules: [] } as never, {
        id: "u1",
        role: "user",
      })
    ).toBe(false);
    expect(consultaSaltariaAislamiento(null, { id: "u1", role: "user" })).toBe(false);
  });
});

describe("PATCH /api/settings: lista blanca de columnas", () => {
  it("descarta id, updatedAt y lo desconocido", () => {
    const limpio = soloAjustesEditables({
      id: "otro-id",
      updatedAt: "2020-01-01",
      siteName: "Mi sitio",
      social: { twitch: "x" },
      cualquierCosa: 1,
    });
    expect(limpio).toEqual({ siteName: "Mi sitio", social: { twitch: "x" } });
  });

  it("un cuerpo que no es objeto no rompe", () => {
    expect(soloAjustesEditables(null)).toEqual({});
    expect(soloAjustesEditables("x")).toEqual({});
  });
});

describe("webhook entrante con Bearer: comparación en tiempo constante", () => {
  const req = (auth: string) => ({
    method: "POST",
    path: "/",
    headers: { authorization: auth },
    body: {},
  });

  it("acepta el secreto exacto y rechaza el resto (prefijos incluidos)", () => {
    expect(validateBearerToken(req("Bearer s3creto-largo"), { secret: "s3creto-largo" })).toBe(
      true
    );
    expect(validateBearerToken(req("Bearer s3creto-larg"), { secret: "s3creto-largo" })).toBe(
      false
    );
    expect(validateBearerToken(req("Bearer s3creto-largoX"), { secret: "s3creto-largo" })).toBe(
      false
    );
    expect(validateBearerToken(req(""), { secret: "s3creto-largo" })).toBe(false);
  });
});

describe("clave de agente con `_` en el secret (base64url)", () => {
  // Antes se partía por `_`: con un `_` dentro del secret —la mitad de las
  // claves emitidas— keyId y secret salían mal y la clave nunca autenticaba.
  it("separa tipo, keyId y secret aunque el secret lleve `_` y `-`", () => {
    const p = parseAgentApiKey("kitsuden_agent_claude-desktop_0123456789abcdef_ab_cd-ef_gh");
    expect(p).toEqual({
      type: "claude-desktop",
      keyId: "0123456789abcdef",
      secret: "ab_cd-ef_gh",
      isLegacy: false,
    });
  });

  it("sin `_` en el secret, igual que antes", () => {
    expect(parseAgentApiKey("kitsuden_agent_custom_0123456789abcdef_abcDEF123")?.secret).toBe(
      "abcDEF123"
    );
  });
});

describe("POST /api/data-sets: la regla de dueño por defecto usa el marcador que rls-builder entiende", () => {
  it("es __USER_ID__ (antes {{current_user_id}}, que se comparaba literal y no casaba nunca)", async () => {
    const { DATASET_RLS_DUENO } = await import("../routes/crud");
    const { buildDrizzleWhere } = await import("../lib/rls-builder");
    expect(DATASET_RLS_DUENO).toBe("__USER_ID__");
    // Es el marcador que rls-builder sustituye por el id de la sesión (su
    // USER_ID_PLACEHOLDER); el resto de valores los compara literalmente.
    const fuente = await Bun.file(
      new URL("../../../../packages/shared/src/rls-builder.ts", import.meta.url)
    ).text();
    expect(fuente).toContain('const USER_ID_PLACEHOLDER = "__USER_ID__"');
  });
});

describe("POST /api/datasets/batch se autoriza a sí misma", () => {
  it("solo admin o agente con scope admin", () => {
    expect(puedeUsarBatch({ role: "admin" }, undefined)).toBe(true);
    expect(puedeUsarBatch({ role: "editor" }, undefined)).toBe(false);
    expect(puedeUsarBatch({ role: "user" }, undefined)).toBe(false);
    expect(puedeUsarBatch(null, undefined)).toBe(false);
    // un agente sin `admin` no pasa aunque su usuario sintético diga otra cosa
    expect(puedeUsarBatch({ role: "admin" }, { scopes: ["datasets:write"] })).toBe(false);
    expect(puedeUsarBatch({ role: "agent" }, { scopes: ["admin"] })).toBe(true);
  });
});

describe("lecturas de filas de datasets: un cubo por cliente, más bajo", () => {
  it("GET de entries (cualquier dataset) usa LECTURA_DE_ENTRADAS; el resto no", async () => {
    const { configPorPatron, LECTURA_DE_ENTRADAS } = await import("../lib/rate-limiter");
    expect(configPorPatron("GET", "/api/data-sets/abc/entries")).toBe(LECTURA_DE_ENTRADAS);
    expect(configPorPatron("GET", "/api/datasets/abc/entries/x")).toBe(LECTURA_DE_ENTRADAS);
    expect(configPorPatron("POST", "/api/data-sets/abc/entries")).toBeNull();
    expect(configPorPatron("GET", "/api/data-sets/abc")).toBeNull();
    expect(LECTURA_DE_ENTRADAS.limit).toBeLessThan(300);
    // la clave NO incluye la ruta: barrer 50 datasets gasta el mismo cubo
    const c = {
      req: { header: () => undefined, path: "/api/data-sets/a/entries" },
      env: { ip: { address: "203.0.113.9" } },
    } as never;
    const c2 = {
      req: { header: () => undefined, path: "/api/data-sets/b/entries" },
      env: { ip: { address: "203.0.113.9" } },
    } as never;
    expect(LECTURA_DE_ENTRADAS.keyGenerator!(c)).toBe(LECTURA_DE_ENTRADAS.keyGenerator!(c2));
  });
});

describe("explorador: ni tokens ni contraseñas en las respuestas, ni member_signins", () => {
  it("quita columnas secretas en snake y camel, deja las normales", async () => {
    const { sinColumnasSecretas, esColumnaSecreta, TABLAS_PROHIBIDAS } =
      await import("../lib/tablas-explorables");
    expect(TABLAS_PROHIBIDAS.has("member_signins")).toBe(true);
    const fila = {
      email: "a@x",
      unsub_token: "t",
      confirmToken: "t",
      password: "p",
      token_hash: "h",
      ingest_token: "i",
      tokens_in: 5,
      title: "x",
    };
    expect(sinColumnasSecretas({ data: [fila] })).toEqual({
      data: [{ email: "a@x", tokens_in: 5, title: "x" }],
    });
    expect(esColumnaSecreta("tokensOut")).toBe(false);
    expect(esColumnaSecreta("keyHash")).toBe(true);
  });
});
