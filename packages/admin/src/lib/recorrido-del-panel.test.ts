/**
 * Lo que rompió el recorrido real del panel (2026-10-23) y no debe volver
 * ============================================================================
 *
 * Cada bloque es un fallo visto con Playwright contra una API de verdad:
 *
 *   · Page Builder: los bloques se editan y borran por /page-builder/blocks/:id.
 *     El cliente pedía /page-builder/pages/:p/blocks/:b, que no existe (404).
 *   · Agentes: el servicio hablaba con /api/admin (sobre {success,data}) cuando
 *     su contrato es /api/v1 (listas planas). La pantalla salía vacía.
 *   · Medios: con almacenamiento local la API da rutas `/media/...` que sirve
 *     ELLA; con el panel en otro origen eran miniaturas rotas.
 *   · Grimoires: con el registro cargado, un kon que no está en él no tiene
 *     configuración; pedirlo por id solo producía un 404 por visita.
 *   · Login: el editor (staff) entra; una cuenta «user» no.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Import estático: grimoire-loader carga todas las vistas con import.meta.glob
// y reimportarlo tras vi.resetModules() no termina en un tiempo razonable.
import { getGrimoireConfig } from "./grimoire-loader";

// Importar módulos de nuevo (vi.resetModules) cuesta segundos en Windows con la
// suite en paralelo; el límite por defecto de 5 s daba falsos fallos.
vi.setConfig({ testTimeout: 60_000 });

const BASE = import.meta.env.VITE_API_URL ?? "";

function respuesta(cuerpo: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => cuerpo } as Response;
}

describe("api: bloques del Page Builder", () => {
  beforeEach(() => vi.resetModules());

  it("actualiza y borra un bloque por su id, sin la página delante", async () => {
    const { api } = await import("./api");
    const llamadas: string[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      llamadas.push(`${init?.method ?? "GET"} ${String(url)}`);
      return respuesta({ id: "b1" });
    }) as typeof fetch;

    await api.updateBlock("p1", "b1", { content: {} });
    await api.deleteBlock("p1", "b1");

    expect(llamadas).toEqual([
      `PATCH ${BASE}/api/page-builder/blocks/b1`,
      `DELETE ${BASE}/api/page-builder/blocks/b1`,
    ]);
  });
});

describe("servicio de agentes", () => {
  beforeEach(() => vi.resetModules());

  it("lista agentes en /api/v1 y desenvuelve las trazas", async () => {
    const urls: string[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      urls.push(String(url));
      if (String(url).includes("/traces")) return respuesta({ traces: [{ id: "t1" }], total: 1 });
      return respuesta([{ id: "a1", name: "Bot" }]);
    }) as typeof fetch;

    const { listAgents, listTraces } = await import("./services/agents");
    expect(await listAgents()).toEqual([{ id: "a1", name: "Bot" }]);
    expect(await listTraces({ agentId: "a1" })).toEqual([{ id: "t1" }]);

    expect(urls[0]).toBe(`${BASE}/api/v1/agents`);
    expect(urls[1]).toMatch(new RegExp(`^${BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/api/v1/traces\\?.*agentId=a1`));
  });

  it("el chat del playground sigue en /api/admin/agents/:id/chat", async () => {
    const urls: string[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      urls.push(String(url));
      return respuesta({ success: true, response: "hola" });
    }) as typeof fetch;
    const { sendPlaygroundMessage } = await import("./services/agents");
    await sendPlaygroundMessage("a1", "hola");
    expect(urls).toEqual([`${BASE}/api/admin/agents/a1/chat`]);
  });
});

describe("urlDeMedio", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("resuelve /media/... contra la API cuando el panel vive en otro origen", async () => {
    vi.stubEnv("VITE_API_URL", "http://api.local:4000");
    vi.resetModules();
    const { urlDeMedio } = await import("./states/media.svelte");
    expect(urlDeMedio("/media/uploads/a.png")).toBe("http://api.local:4000/media/uploads/a.png");
    expect(urlDeMedio("https://cdn.example.com/a.png")).toBe("https://cdn.example.com/a.png");
    expect(urlDeMedio("//cdn.example.com/a.png")).toBe("//cdn.example.com/a.png");
  });

  it("sin VITE_API_URL (mismo origen) deja la ruta tal cual", async () => {
    vi.stubEnv("VITE_API_URL", "");
    vi.resetModules();
    const { urlDeMedio } = await import("./states/media.svelte");
    expect(urlDeMedio("/media/uploads/a.png")).toBe("/media/uploads/a.png");
  });
});

describe("grimoire-loader: configuración por kon", () => {

  it("no pide /registry/:id si el listado llegó y el kon no está", async () => {
    const urls: string[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      urls.push(String(url));
      return respuesta({ success: true, kons: [{ id: "kon-crm", name: "CRM" }] });
    }) as typeof fetch;
    expect(await getGrimoireConfig("kon-datasets")).toBeNull();
    expect(urls.filter((u) => u.includes("/api/admin/registry/"))).toEqual([]);
  });
});

describe("quién entra en el panel", () => {
  beforeEach(() => vi.resetModules());

  it("admin y editor son staff; user no", async () => {
    const roles: Record<string, boolean> = {};
    for (const role of ["admin", "editor", "user"]) {
      vi.resetModules();
      global.fetch = vi.fn(async () =>
        respuesta({ session: { id: "s" }, user: { id: "u", email: "x@y.z", role } })
      ) as typeof fetch;
      const auth = await import("./auth.svelte");
      await auth.checkSession();
      roles[role] = auth.isStaff();
    }
    expect(roles).toEqual({ admin: true, editor: true, user: false });
  });
});
