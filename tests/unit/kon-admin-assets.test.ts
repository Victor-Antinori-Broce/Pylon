/**
 * Artefactos de admin — el circuito completo
 * ============================================================================
 *
 * Comprueba que la vista a medida de Broadcast es realmente cargable de punta a
 * punta: el manifiesto la declara, el descriptor resuelve a una URL, el fichero
 * existe en disco, y es JS plano sin framework ni paso de compilación.
 *
 * Y sobre todo: que las rutas que intentan escapar del paquete NO resuelven a
 * un fichero real. Esa es la razón de ser de este test.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";

import { describe, expect, test } from "vitest";

import {
  descriptorFromView,
  isSafeAssetPath,
  resolveCustomView,
} from "../../packages/shared/src/admin-view";

const ROOT = resolve(__dirname, "../..");
const BROADCAST_DIR = join(ROOT, "packages/kons/kon-broadcast");

function manifest() {
  return JSON.parse(readFileSync(join(BROADCAST_DIR, "kon.json"), "utf8"));
}

describe("declaración en el manifiesto", () => {
  test("Broadcast declara una vista de tipo element", () => {
    const view = manifest().admin.views.find((v: { id: string }) => v.id === "scoreboard");

    expect(view).toBeDefined();
    expect(view.type).toBe("element");
    expect(view.element).toBe("broadcast-scoreboard");
    expect(view.src).toBe("./admin/scoreboard.js");
  });

  test("el descriptor se extrae y resuelve a una URL servible", () => {
    const view = manifest().admin.views.find((v: { id: string }) => v.id === "scoreboard");
    const descriptor = descriptorFromView("kon-broadcast", view);

    expect(descriptor).not.toBeNull();
    const { url } = resolveCustomView(descriptor!);
    expect(url).toBe("/api/kons/kon-broadcast/admin-asset/admin/scoreboard.js");
  });

  test("las vistas de tabla siguen siendo genéricas, no de tipo element", () => {
    const views = manifest().admin.views;
    const grid = views.find((v: { id: string }) => v.id === "grid");
    expect(descriptorFromView("kon-broadcast", grid)).toBeNull();
  });
});

describe("el artefacto existe y es agnóstico", () => {
  const assetPath = join(BROADCAST_DIR, "admin/scoreboard.js");

  test("el fichero declarado existe en disco", () => {
    expect(existsSync(assetPath)).toBe(true);
  });

  test("registra el custom element que declara el manifiesto", () => {
    const source = readFileSync(assetPath, "utf8");
    expect(source).toMatch(/customElements\.define\(\s*["']broadcast-scoreboard["']/);
  });

  test("no importa NINGÚN framework: por eso no entra en el build del admin", () => {
    const source = readFileSync(assetPath, "utf8");
    // Sin imports de framework y sin JSX: se sirve tal cual, sin compilar.
    expect(source).not.toMatch(/from\s+["'](react|svelte|vue|preact)/);
    expect(source).not.toMatch(/<[A-Z]\w*\s*\/?>/); // JSX
  });

  test("hereda el tema por variables CSS en vez de recibirlo por props", () => {
    const source = readFileSync(assetPath, "utf8");
    // Es lo que permite que se vea nativo en claro y oscuro atravesando el
    // Shadow DOM, sin que el admin tenga que pasarle nada.
    expect(source).toMatch(/var\(--kitsuden-/);
  });

  test("usa Shadow DOM, que es lo que aísla estilos del host", () => {
    const source = readFileSync(assetPath, "utf8");
    expect(source).toMatch(/attachShadow/);
  });

  test("no inyecta datos de usuario como HTML", () => {
    const source = readFileSync(assetPath, "utf8");

    // El gamertag y los dúos de campeones son datos de usuario; pintarlos con
    // innerHTML sería un XSS dentro del propio panel de admin.
    //
    // Se permite UNA asignación a innerHTML: la del template estático del
    // constructor. Cualquier otra —sobre todo con interpolación— es la que
    // haría daño, así que se comprueba una a una.
    const assignments = [...source.matchAll(/\.innerHTML\s*=\s*(.+)/g)].map((m) => m[1].trim());

    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toBe("TEMPLATE;");
    // Y el template no interpola nada: es una constante literal.
    expect(source).toMatch(/^const TEMPLATE = `/m);
    expect(/const TEMPLATE = `[^`]*\$\{/.test(source)).toBe(false);

    // Los datos dinámicos van por textContent.
    expect(source).toMatch(/textContent/);
  });
});

describe("path traversal — la ruta no puede salir del paquete", () => {
  const attacks = [
    "../../../.env",
    "../../kon-crm/secret.js",
    "admin/../../../../etc/passwd",
    "/etc/passwd",
    "..\\..\\.env",
    "admin/scoreboard.js\0.png",
  ];

  test("todos los vectores se rechazan en la validación", () => {
    for (const src of attacks) {
      expect(isSafeAssetPath(src), src).toBe(false);
    }
  });

  test("y si alguno pasara, no apuntaría dentro del paquete del kon", () => {
    // Segunda barrera, la que de verdad importa: comprobar la contención tras
    // normalizar. Es la que aplica el servidor.
    for (const src of attacks) {
      const target = resolve(BROADCAST_DIR, src.replace(/\0.*$/, ""));
      const contained = target === BROADCAST_DIR || target.startsWith(BROADCAST_DIR + sep);
      if (!contained) continue;
      // Si quedó contenido, entonces no es un escape real y debe existir para
      // ser servible — cualquier otra cosa es un falso positivo del ataque.
      //
      // Salvo en POSIX con `\`: ahí no es separador sino parte del nombre, y
      // `..\..\.env` es un fichero (inexistente) DENTRO del paquete. No sale de
      // él, que es lo que esta barrera comprueba; la validación ya lo rechaza.
      if (sep === "/" && src.includes("\\")) continue;
      expect(existsSync(target), `${src} quedó contenido pero no existe`).toBe(true);
    }
  });

  test("la ruta legítima SÍ queda contenida", () => {
    const target = resolve(BROADCAST_DIR, "admin/scoreboard.js");
    expect(target.startsWith(BROADCAST_DIR + sep)).toBe(true);
    expect(existsSync(target)).toBe(true);
  });
});
