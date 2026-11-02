/**
 * La superficie del panel es solo para admin (o staff, en el contenido).
 *
 * Auditoría 2026-10-12, comprobado contra la API de producción:
 * `GET /api/items/authSessions` devolvía sin sesión los tokens de sesión,
 * `PATCH /api/settings` y `/api/modules` no pedían nada, y cualquier cuenta
 * (el alta es abierta) podía ejecutar funciones, editar el blog o las páginas.
 */
import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import {
  puertaDeAdmin,
  reglaPara,
  RUTAS_SOLO_ADMIN,
  RUTAS_SOLO_ADMIN_TEMPRANAS,
} from "../../apps/api/src/middleware/auth-guard";

type Rol = "admin" | "editor" | "user" | null;

function app(rol: Rol, agente?: string[]) {
  const a = new Hono();
  a.use("*", async (c, next) => {
    if (agente) (c as any).set("agent", { scopes: agente });
    if (rol) (c as any).set("user", { id: "u1", role: rol });
    await next();
  });
  a.use("*", puertaDeAdmin([...RUTAS_SOLO_ADMIN_TEMPRANAS, ...RUTAS_SOLO_ADMIN]));
  a.all("*", (c) => c.text("dentro"));
  return a;
}

const estado = async (rol: Rol, metodo: string, camino: string, agente?: string[]) =>
  (await app(rol, agente).request(camino, { method: metodo })).status;

describe("reglaPara", () => {
  it("cubre lo peligroso que se vio abierto en producción", () => {
    for (const [m, p] of [
      ["GET", "/api/items/authSessions"],
      ["GET", "/api/items/authAccounts"],
      ["PATCH", "/api/settings"],
      ["DELETE", "/api/modules/kon-blog"],
      ["POST", "/api/functions/1/execute"],
      ["POST", "/api/actions/1/execute"],
      ["POST", "/api/relations/auth_users/inlines/x"],
      ["PATCH", "/api/v1/agents/1"],
      ["POST", "/api/graphql"],
      ["GET", "/api/generate-code/collections"],
      ["GET", "/admin/logs"],
      ["DELETE", "/api/admin/rate-limits/x"],
      ["POST", "/api/search/init"],
      ["PATCH", "/api/system/active-theme"],
      ["POST", "/api/blog"],
      ["PATCH", "/api/page-builder/pages/1"],
      ["POST", "/api/media/upload"],
      ["GET", "/api/blog/source/1"],
      ["PUT", "/api/cardsim/games"],
      ["POST", "/api/cardsim/games/pokemon/cards"],
      ["GET", "/api/crm/contacts"],
      ["GET", "/api/directory/employees"],
    ]) {
      expect(
        reglaPara([...RUTAS_SOLO_ADMIN_TEMPRANAS, ...RUTAS_SOLO_ADMIN], m!, p!),
        `${m} ${p}`
      ).not.toBeNull();
    }
  });

  it("no toca lo que usa el sitio público", () => {
    for (const [m, p] of [
      ["GET", "/api/settings"],
      ["GET", "/api/settings/social-live"],
      ["GET", "/api/data-sets/slug/x"],
      ["GET", "/api/blog"],
      ["GET", "/api/blog/mi-post"],
      ["GET", "/api/media/1"],
      ["POST", "/api/search"],
      ["GET", "/api/system/themes"],
      ["POST", "/api/cardsim/games/pokemon/decks"],
      ["POST", "/api/comments"],
      ["GET", "/api/itemsx"],
      ["OPTIONS", "/api/items/authSessions"],
    ]) {
      expect(
        reglaPara([...RUTAS_SOLO_ADMIN_TEMPRANAS, ...RUTAS_SOLO_ADMIN], m!, p!),
        `${m} ${p}`
      ).toBeNull();
    }
  });

  it("las barras repetidas no esquivan la puerta", () => {
    expect(reglaPara(RUTAS_SOLO_ADMIN, "GET", "//api//items/authSessions")).not.toBeNull();
  });
});

describe("puertaDeAdmin", () => {
  it("usuario normal: 403 en el panel; admin: dentro", async () => {
    expect(await estado("user", "GET", "/api/items/authUsers")).toBe(403);
    expect(await estado("user", "PATCH", "/api/settings")).toBe(403);
    expect(await estado("admin", "GET", "/api/items/authUsers")).toBe(200);
    expect(await estado("admin", "PATCH", "/api/settings")).toBe(200);
  });

  it("contenido: editor entra, usuario no", async () => {
    expect(await estado("editor", "POST", "/api/blog")).toBe(200);
    expect(await estado("user", "POST", "/api/blog")).toBe(403);
    expect(await estado("editor", "PATCH", "/api/settings")).toBe(403);
  });

  it("sin sesión: 401", async () => {
    expect(await estado(null, "GET", "/api/items/authSessions")).toBe(401);
    expect(await estado(null, "DELETE", "/api/modules/kon-blog")).toBe(401);
  });

  it("agente: solo con scope admin", async () => {
    expect(await estado(null, "GET", "/api/items/x", ["datasets:read"])).toBe(401);
    expect(await estado(null, "GET", "/api/items/x", ["admin"])).toBe(200);
  });

  it("lo público sigue abierto", async () => {
    expect(await estado(null, "GET", "/api/settings")).toBe(200);
    expect(await estado(null, "GET", "/api/blog")).toBe(200);
  });
});

describe("index.ts monta las puertas en su sitio", () => {
  const fuente = require("node:fs").readFileSync(
    require("node:path").resolve(__dirname, "../../apps/api/src/index.ts"),
    "utf8"
  ).replace(/\r\n/g, "\n") as string;
  const pos = (s: string) => {
    const i = fuente.indexOf(s);
    expect(i, s).toBeGreaterThan(-1);
    return i;
  };

  it("la temprana va antes de las rutas críticas (observabilidad, límites, búsqueda) y de /api/system", () => {
    const puerta = pos('app.use("*", puertaDeAdmin(RUTAS_SOLO_ADMIN_TEMPRANAS))');
    expect(puerta).toBeLessThan(pos("registerCriticalFeatures(app);\n"));
    expect(puerta).toBeLessThan(pos('app.route("/api/system", systemRoutes)'));
  });

  it("la general va después de la sesión y antes de montar items/graphql/módulos y los kons", () => {
    const puerta = pos('app.use("*", puertaDeAdmin(RUTAS_SOLO_ADMIN))');
    expect(puerta).toBeGreaterThan(pos('app.use("*", enrichUserContext)'));
    for (const r of [
      'app.route("/", rpcSurface)',
      'app.route("/api/graphql", graphqlRoutes)',
      'app.route("/api/modules", modulesRoutes)',
      'app.route("/api/settings", settingsRoutes)',
      "await loadModules(app)",
    ]) {
      expect(puerta, r).toBeLessThan(pos(r));
    }
  });
});

describe("el alta del primer admin no queda detrás de la puerta (2026-10-15)", () => {
  it("POST /api/system/setup no lleva regla; el resto de escrituras de /api/system sí", () => {
    expect(reglaPara(RUTAS_SOLO_ADMIN_TEMPRANAS, "POST", "/api/system/setup")).toBeNull();
    expect(
      reglaPara(RUTAS_SOLO_ADMIN_TEMPRANAS, "POST", "/api/system/grimoire-state")
    ).not.toBeNull();
    expect(reglaPara(RUTAS_SOLO_ADMIN_TEMPRANAS, "POST", "/api/system/setup-x")).not.toBeNull();
    expect(
      reglaPara(RUTAS_SOLO_ADMIN_TEMPRANAS, "PATCH", "/api/system/active-theme")
    ).not.toBeNull();
  });
});
