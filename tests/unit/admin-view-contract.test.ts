/**
 * Contrato de vistas de admin agnósticas al framework
 * ============================================================================
 *
 * El grueso de estos tests es de SEGURIDAD, y no por celo: el `src` de una
 * vista sale de un `kon.json`, que en un marketplace es contenido de terceros,
 * y acaba convertido en una lectura de fichero por la API. Ésa es exactamente
 * la forma de un path traversal, así que cada vector se fija aquí.
 */

import { describe, expect, test } from "vitest";

import {
  adminAssetUrl,
  createViewContext,
  CustomViewError,
  descriptorFromView,
  isSafeAssetPath,
  isValidElementName,
  isValidKonId,
  resolveCustomView,
} from "../../packages/shared/src/admin-view";

// ── Nombres de custom element ────────────────────────────────────────────────

describe("nombre de custom element", () => {
  test("acepta nombres con guion, que es lo que exige la spec", () => {
    for (const name of ["broadcast-scoreboard", "kon-crm-board", "x-y", "a1-b2"]) {
      expect(isValidElementName(name), name).toBe(true);
    }
  });

  test("rechaza nombres sin guion: el navegador no los registraría", () => {
    for (const name of ["scoreboard", "Broadcast", "div", ""]) {
      expect(isValidElementName(name), name).toBe(false);
    }
  });

  test("rechaza mayúsculas y caracteres raros", () => {
    for (const name of ["Broadcast-Board", "broadcast_board", "broadcast board", "-leading"]) {
      expect(isValidElementName(name), name).toBe(false);
    }
  });

  test("rechaza los nombres reservados por la spec, que parecen válidos", () => {
    // Llevan guion y pasarían un regex ingenuo, pero el navegador los rechaza.
    for (const name of ["annotation-xml", "font-face", "missing-glyph"]) {
      expect(isValidElementName(name), name).toBe(false);
    }
  });
});

// ── Rutas de artefacto: la superficie de ataque ──────────────────────────────

describe("ruta de artefacto — path traversal", () => {
  test("acepta rutas relativas con extensión de front", () => {
    for (const src of ["admin/panel.js", "./admin/panel.js", "dist/view.mjs", "style.css"]) {
      expect(isSafeAssetPath(src), src).toBe(true);
    }
  });

  test("rechaza escapar del paquete del kon", () => {
    for (const src of [
      "../../../etc/passwd",
      "admin/../../../../.env",
      "..\\..\\windows\\system32\\config.js",
      "a/../../b.js",
    ]) {
      expect(isSafeAssetPath(src), src).toBe(false);
    }
  });

  test("rechaza rutas absolutas y URLs a otro origen", () => {
    for (const src of [
      "/etc/passwd",
      "/admin/panel.js",
      "http://evil.com/x.js",
      "https://evil.com/x.js",
      "//evil.com/x.js",
      "file:///etc/passwd",
      "data:text/javascript,alert(1)",
      "javascript:alert(1)",
    ]) {
      expect(isSafeAssetPath(src), src).toBe(false);
    }
  });

  test("rechaza bytes nulos y separadores de Windows", () => {
    expect(isSafeAssetPath("panel.js\0.png")).toBe(false);
    expect(isSafeAssetPath("admin\\panel.js")).toBe(false);
  });

  test("solo sirve artefactos de front, nunca fuentes ni secretos", () => {
    for (const src of [
      "panel.ts", // fuente: la compilación es cosa del kon
      "panel.svelte",
      "kon.json", // manifiesto
      ".env",
      "package.json",
      "panel", // sin extensión
      "panel.js.txt",
    ]) {
      expect(isSafeAssetPath(src), src).toBe(false);
    }
  });

  test("rechaza entradas no-string sin lanzar", () => {
    for (const bad of [undefined, null, 42, {}, []]) {
      expect(isSafeAssetPath(bad as unknown as string)).toBe(false);
    }
  });
});

// ── Id de kon ───────────────────────────────────────────────────────────────

describe("id de kon", () => {
  test("acepta ids reales", () => {
    for (const id of ["kon-broadcast", "kon-crm", "media", "a"]) {
      expect(isValidKonId(id), id).toBe(true);
    }
  });

  test("rechaza cualquier cosa que pueda alterar una ruta", () => {
    for (const id of [
      "../otro",
      "kon/broadcast",
      "Kon-Broadcast",
      "",
      "-empieza-con-guion",
      "a".repeat(90),
    ]) {
      expect(isValidKonId(id), id).toBe(false);
    }
  });
});

// ── Resolución ───────────────────────────────────────────────────────────────

describe("resolución del descriptor", () => {
  test("construye la URL bajo la ruta de artefactos de la API", () => {
    const { url } = resolveCustomView({
      konId: "kon-broadcast",
      element: "broadcast-scoreboard",
      src: "./admin/scoreboard.js",
    });
    expect(url).toBe("/api/kons/kon-broadcast/admin-asset/admin/scoreboard.js");
  });

  test("respeta una base explícita", () => {
    expect(adminAssetUrl("kon-broadcast", "./a.js", "https://app.example")).toBe(
      "https://app.example/api/kons/kon-broadcast/admin-asset/a.js"
    );
  });

  test("los errores traen un código accionable, no un mensaje opaco", () => {
    const cases: [Record<string, string>, string][] = [
      [{ konId: "../x", element: "a-b", src: "a.js" }, "INVALID_KON"],
      [{ konId: "kon-broadcast", element: "noguion", src: "a.js" }, "INVALID_ELEMENT"],
      [{ konId: "kon-broadcast", element: "a-b", src: "../../x.js" }, "INVALID_SRC"],
    ];

    for (const [input, code] of cases) {
      try {
        resolveCustomView(input as never);
        throw new Error(`debería haber lanzado para ${JSON.stringify(input)}`);
      } catch (err) {
        expect(err).toBeInstanceOf(CustomViewError);
        expect((err as CustomViewError).code).toBe(code);
      }
    }
  });
});

// ── Lectura desde kon.json ──────────────────────────────────────────────────

describe("descriptor desde una vista declarada", () => {
  test("extrae el descriptor de una vista de tipo element", () => {
    expect(
      descriptorFromView("kon-broadcast", {
        type: "element",
        element: "broadcast-scoreboard",
        src: "./admin/scoreboard.js",
      })
    ).toEqual({
      konId: "kon-broadcast",
      element: "broadcast-scoreboard",
      src: "./admin/scoreboard.js",
    });
  });

  test("devuelve null para vistas normales, para poder caer al camino genérico", () => {
    expect(descriptorFromView("kon-broadcast", { type: "grid" })).toBeNull();
    expect(descriptorFromView("kon-broadcast", { type: "custom", element: "a-b" })).toBeNull();
    // Declaración incompleta: tampoco revienta, simplemente no aplica.
    expect(descriptorFromView("kon-broadcast", { type: "element", element: "a-b" })).toBeNull();
    expect(descriptorFromView("kon-broadcast", {})).toBeNull();
  });
});

// ── Contexto entregado a la vista ────────────────────────────────────────────

describe("contexto de la vista", () => {
  test("va versionado, para poder evolucionarlo sin romper a terceros", () => {
    const ctx = createViewContext({ konId: "kon-broadcast", viewId: "scoreboard" });
    expect(ctx.version).toBe(1);
    expect(ctx.apiBase).toBe("/api");
  });

  test("NUNCA incluye el token de sesión", () => {
    const ctx = createViewContext({ konId: "kon-broadcast", viewId: "scoreboard" });
    // La vista es código de terceros: entregarle un token lo haría exfiltrable.
    // Llama a la API con las cookies del navegador, como el resto del admin.
    const keys = Object.keys(ctx);
    for (const forbidden of ["token", "accessToken", "session", "apiKey", "secret"]) {
      expect(keys, `el contexto no debe exponer "${forbidden}"`).not.toContain(forbidden);
    }
    expect(JSON.stringify(ctx)).not.toMatch(/token|secret|password/i);
  });
});
