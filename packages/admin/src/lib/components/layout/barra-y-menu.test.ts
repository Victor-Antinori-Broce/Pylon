/**
 * Barra superior y reintento de módulos
 * ============================================================================
 *
 * Dos fallos que el panel arrastraba tras la traducción:
 *
 *   1. La barra superior decía «Admin» y pintaba una «A» fija, también para un
 *      editor. Ahora enseña el nombre, el rol y el avatar reales.
 *   2. `/api/modules` se pedía una sola vez: un fallo pasajero al arrancar
 *      dejaba el menú incompleto hasta recargar. Ahora reintenta con espera
 *      creciente y, si sigue fallando, la barra ofrece «Reintentar».
 *
 * La tercera pieza de la ronda (la papelera de la tarjeta de agente) se prueba en
 * views/system-tools/AgentsView.layout.test.ts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale } from "$lib/i18n";
import { moduleStore } from "$lib/states/modules.svelte";

import UsuarioActual from "./UsuarioActual.svelte";

const SRC = join(import.meta.dirname, "..", "..", "..");
const leer = (...r: string[]) => readFileSync(join(SRC, ...r), "utf8");

const base = { id: "u1", email: "ana@ejemplo.com", image: null };

describe("barra superior: quién está usando el panel", () => {
  beforeEach(() => setLocale("en", { recargar: false }));

  it("un editor ve su nombre, «Editor» y su inicial — no «Admin» ni una «A»", () => {
    render(UsuarioActual, { props: { user: { ...base, name: "berta", role: "editor" } } });
    expect(screen.getByTestId("usuario-nombre").textContent?.trim()).toBe("berta");
    expect(screen.getByTestId("usuario-rol").textContent?.trim()).toBe("Editor");
    expect(screen.getByTestId("usuario-avatar").textContent?.trim()).toBe("B");
    expect(screen.getByTestId("usuario-avatar").getAttribute("aria-label")).toBe("berta (Editor)");
  });

  it("un admin sale como «Administrator»", () => {
    render(UsuarioActual, { props: { user: { ...base, name: "Ana", role: "admin" } } });
    expect(screen.getByTestId("usuario-rol").textContent?.trim()).toBe("Administrator");
  });

  it("en español el rol también se traduce", () => {
    setLocale("es", { recargar: false });
    render(UsuarioActual, { props: { user: { ...base, name: "Ana", role: "admin" } } });
    expect(screen.getByTestId("usuario-rol").textContent?.trim()).toBe("Administrador");
  });

  it("sin nombre, usa la parte local del email", () => {
    render(UsuarioActual, { props: { user: { ...base, name: "", role: "editor" } } });
    expect(screen.getByTestId("usuario-nombre").textContent?.trim()).toBe("ana");
    expect(screen.getByTestId("usuario-avatar").textContent?.trim()).toBe("A");
  });

  it("con imagen http(s) pinta el avatar", () => {
    render(UsuarioActual, {
      props: { user: { ...base, name: "Ana", role: "admin", image: "https://cdn.ejemplo.com/a.png" } },
    });
    const img = screen.getByTestId("usuario-avatar").querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://cdn.ejemplo.com/a.png");
  });

  it("una imagen con otro esquema se ignora y queda la inicial", () => {
    render(UsuarioActual, {
      props: { user: { ...base, name: "Ana", role: "admin", image: "javascript:alert(1)" } },
    });
    expect(screen.getByTestId("usuario-avatar").querySelector("img")).toBeNull();
    expect(screen.getByTestId("usuario-avatar").textContent?.trim()).toBe("A");
  });

  it("la barra ya no tiene la «A» fija y usa el componente", () => {
    const layout = leer("lib", "components", "layout", "SidebarLayout.svelte");
    expect(layout).not.toMatch(/>\s*A\s*<\/div>/);
    expect(layout).not.toContain('t("sidebarLayout.admin")');
    expect(layout).toContain("<UsuarioActual {user} />");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

const respuesta = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const LISTA = { docs: [{ key: "kon-blog", name: "Blog", enabled: true }], categories: {} };

describe("fetchModules reintenta los fallos pasajeros", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    moduleStore.modules = [];
    moduleStore.error = null;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("un error de red y luego bien: carga la lista y no deja error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network")).mockResolvedValueOnce(respuesta(200, LISTA));
    const p = moduleStore.fetchModules({ espera: 100 });
    await vi.advanceTimersByTimeAsync(100);
    await p;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(moduleStore.modules.map((m) => m.key)).toEqual(["kon-blog"]);
    expect(moduleStore.error).toBeNull();
    expect(moduleStore.loading).toBe(false);
  });

  it("espera creciente (100, 200) y se rinde al tercer intento", async () => {
    fetchMock.mockResolvedValue(respuesta(503));
    const p = moduleStore.fetchModules({ intentos: 3, espera: 100 });

    await vi.advanceTimersByTimeAsync(99);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(199);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await p;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(moduleStore.error).toBeTruthy();
    expect(moduleStore.loading).toBe(false);
  });

  it("un 403 no se reintenta: esperar no cambia la sesión", async () => {
    fetchMock.mockResolvedValue(respuesta(403));
    await moduleStore.fetchModules({ espera: 100 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(moduleStore.error).toBeTruthy();
  });

  it("una llamada nueva manda sobre la que estaba esperando", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network")).mockResolvedValueOnce(respuesta(200, LISTA));
    const vieja = moduleStore.fetchModules({ espera: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    await moduleStore.fetchModules();
    await vi.advanceTimersByTimeAsync(1000);
    await vieja;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(moduleStore.error).toBeNull();
    expect(moduleStore.modules).toHaveLength(1);
  });

  it("la barra lateral enseña «Reintentar» cuando se rinde", () => {
    const layout = leer("lib", "components", "layout", "SidebarLayout.svelte");
    expect(layout).toMatch(/\{#if esAdmin && moduleStore\.error\}/);
    expect(layout).toMatch(/onclick=\{\(\) => moduleStore\.fetchModules\(\)\}/);
    expect(layout).toContain('t("sidebarLayout.reintentar")');
  });
});
