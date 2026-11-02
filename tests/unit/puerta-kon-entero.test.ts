/**
 * Las puertas por prefijo y los scopes de TODO un kon (arreglos de la fase D)
 * ============================================================================
 *
 * Fase D (prueba e2e por HTTP, 2026-10-25): un agente con `crm:*` recibía 403
 * «Insufficient role» al crear una empresa por la ruta legada del CRM, aunque
 * la guía promete que `<kon>:*` da todo el kon. Las puertas de
 * `RUTAS_SOLO_ADMIN` solo conocían `admin` y el scope fino de las operaciones
 * del SDK. Ahora:
 *
 *   · `<kon>:*` / `kon:<kon>:*` abren la puerta de SU kon (y de ningún otro, ni
 *     del núcleo); `kon:*` no; una denegación del kon entero gana;
 *   · `/api/blog/source` (lee cualquier tabla) no se abre así;
 *   · booking y directory piden SESIÓN (decisión del propietario): cualquier
 *     cuenta, o un agente que pueda actuar como usuario ahí; deciden las
 *     políticas del kon. Un anónimo, 401.
 *
 * Sin el cambio: `crm:*` → 403, y un usuario en booking/directory → 403.
 */
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";

import { registrarRouterDeKon } from "../../apps/api/src/lib/rutas-de-kons";
import {
  denegacionesDeAgente,
  konAbiertoPorScope,
  puertaDeAdmin,
  RUTAS_SOLO_ADMIN,
} from "../../apps/api/src/middleware/auth-guard";

type Rol = "admin" | "editor" | "user" | null;

const KONS: [string, string][] = [
  ["kon-crm", "/api/crm"],
  ["kon-booking", "/api/booking"],
  ["kon-directory", "/api/directory"],
  ["kon-blog", "/api/blog"],
  ["kon-dms", "/api/dms"],
  ["kon-games", "/api/games"],
];

beforeAll(() => {
  for (const [id, montaje] of KONS) {
    const r = new Hono();
    r.all("/*", (c) => c.text("kon"));
    registrarRouterDeKon(id, montaje, r);
  }
});

function app(rol: Rol, agente?: string[]) {
  const a = new Hono();
  a.use("*", async (c, next) => {
    if (agente) {
      (c as any).set("agent", { scopes: agente });
      (c as any).set("user", { id: "ag-1", role: "agent", scopes: agente });
    } else if (rol) (c as any).set("user", { id: "u1", role: rol });
    await next();
  });
  a.use("*", denegacionesDeAgente);
  a.use("*", puertaDeAdmin(RUTAS_SOLO_ADMIN));
  a.all("*", (c) => c.text("dentro"));
  return a;
}

const estado = async (rol: Rol, metodo: string, camino: string, agente?: string[]) =>
  (await app(rol, agente).request(camino, { method: metodo })).status;

describe("`<kon>:*` abre la puerta de SU kon", () => {
  it("crm:* y kon:crm:* entran en las rutas legadas del CRM (antes: 403)", async () => {
    expect(await estado(null, "POST", "/api/crm/companies", ["mcp:connect", "crm:*"])).toBe(200);
    expect(await estado(null, "GET", "/api/crm/contacts", ["kon:crm:*"])).toBe(200);
    expect(await estado(null, "DELETE", "/api/dms/files/x/download", ["dms:*"])).toBe(200);
  });

  it("solo su kon: ni otro kon ni el núcleo", async () => {
    expect(await estado(null, "GET", "/api/dms/files/x/download", ["crm:*"])).toBe(403);
    expect(await estado(null, "GET", "/api/items/authUsers", ["crm:*"])).toBe(403);
    expect(await estado(null, "PATCH", "/api/settings", ["crm:*"])).toBe(403);
  });

  it("`kon:*` (todas las operaciones del SDK) no abre las rutas legadas", async () => {
    expect(await estado(null, "GET", "/api/crm/contacts", ["kon:*"])).toBe(403);
    expect(konAbiertoPorScope(["kon:*"], "/api/crm/contacts")).toBe(false);
  });

  it("un scope suelto del kon no abre la puerta de staff", async () => {
    expect(await estado(null, "GET", "/api/crm/contacts", ["crm:view"])).toBe(403);
  });

  it("una denegación del kon entero gana, `admin` incluido", async () => {
    expect(await estado(null, "GET", "/api/crm/contacts", ["crm:*", "!crm:*"])).toBe(403);
    expect(await estado(null, "GET", "/api/crm/contacts", ["admin", "!kon:crm:*"])).toBe(403);
    expect(konAbiertoPorScope(["admin", "!crm:*"], "/api/crm/x")).toBe(false);
  });

  it("`/api/blog/source` (lee cualquier tabla) no se abre con `blog:*`", async () => {
    expect(await estado(null, "POST", "/api/blog", ["blog:*"])).toBe(200);
    expect(await estado(null, "GET", "/api/blog/source/1", ["blog:*"])).toBe(403);
    expect(await estado(null, "GET", "/api/blog/source/1", ["admin"])).toBe(200);
  });

  it("los humanos, como antes", async () => {
    expect(await estado("editor", "GET", "/api/crm/contacts")).toBe(200);
    expect(await estado("user", "GET", "/api/crm/contacts")).toBe(403);
  });
});

describe("booking y directory: abiertos a quien tenga sesión", () => {
  for (const camino of ["/api/booking/bookings", "/api/directory/employees/x"]) {
    it(`${camino}: cualquier cuenta entra (decide el kon); un anónimo, 401`, async () => {
      expect(await estado("user", "GET", camino)).toBe(200);
      expect(await estado("user", "PATCH", camino)).toBe(200);
      expect(await estado("editor", "POST", camino)).toBe(200);
      expect(await estado(null, "GET", camino)).toBe(401);
    });
  }

  it("un agente: con scope del kon o `usuario:actuar`; una clave cualquiera, no", async () => {
    expect(await estado(null, "GET", "/api/booking/bookings", ["booking:*"])).toBe(200);
    expect(await estado(null, "POST", "/api/booking/bookings", ["usuario:actuar"])).toBe(200);
    expect(await estado(null, "GET", "/api/directory/employees", ["kon:directory:*"])).toBe(200);
    expect(await estado(null, "GET", "/api/booking/bookings", ["mcp:connect"])).toBe(403);
    expect(await estado(null, "GET", "/api/booking/bookings", ["crm:*"])).toBe(403);
  });
});
