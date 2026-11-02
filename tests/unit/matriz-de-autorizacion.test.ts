/**
 * Matriz de autorización: ninguna ruta nace abierta sin que alguien lo decida.
 * ============================================================================
 *
 * Dos partes:
 *
 *  1. SIEMPRE: la tabla `MATRIZ` (apps/api/src/middleware/matriz-de-autorizacion.ts)
 *     está bien formada y el comparador falla en los tres casos que importan
 *     (ruta sin clasificar, identidad que entra donde no debe, entrada vieja).
 *
 *  2. Con base de pruebas (`KITSUDEN_MATRIZ_DB`): monta la app REAL con todos
 *     los kons (`scripts/matriz-de-autorizacion.ts --comprobar`), la pide con
 *     seis identidades reales y exige que cada ruta casa con su nivel. Crea
 *     usuarios y agentes y ejecuta rutas: SOLO contra una base cuyo nombre
 *     contenga `test`, migrada con `migrate.ts --todos-los-kons`.
 *
 *       KITSUDEN_MATRIZ_DB=postgres://<rol app>@host/kitsuden_matriz_test
 *       KITSUDEN_MATRIZ_ADMIN_DB=postgres://<superusuario>@host/kitsuden_matriz_test
 *
 *     En CI va en el job `migraciones-de-todos-los-kons`, que ya tiene esa base.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  compararConMatriz,
  EXPECTATIVA,
  MATRIZ,
  type Nivel,
} from "../../apps/api/src/middleware/matriz-de-autorizacion";

const NIVELES: Nivel[] = [
  "publica",
  "usuario",
  "staff",
  "contenido",
  "admin",
  "restringida",
  "propia",
  "middleware",
];
const METODOS = ["GET", "POST", "PUT", "PATCH", "DELETE", "ALL"];

describe("la tabla MATRIZ", () => {
  it("cada entrada es `MÉTODO /api…` con un nivel conocido", () => {
    const claves = Object.keys(MATRIZ);
    expect(claves.length).toBeGreaterThan(500);
    for (const [clave, nivel] of Object.entries(MATRIZ)) {
      const [metodo, camino] = clave.split(" ");
      expect(METODOS, clave).toContain(metodo);
      expect(camino?.startsWith("/"), clave).toBe(true);
      expect(NIVELES, clave).toContain(nivel);
      if (nivel === "middleware") expect(metodo, clave).toBe("ALL");
    }
  });

  it("el número de escrituras públicas no sube sin decidirlo", () => {
    // Las escrituras públicas se cuentan: si sube, alguien abrió una a propósito
    const escriturasPublicas = Object.entries(MATRIZ).filter(
      ([k, n]) => n === "publica" && !k.startsWith("GET ") && !k.startsWith("ALL ")
    );
    expect(escriturasPublicas.length).toBeLessThanOrEqual(LIMITE_ESCRITURAS_PUBLICAS);
  });
});

/**
 * Escrituras públicas revisadas una a una el 2026-10-15 (alta y webhooks
 * firmados, calculadoras sin estado, suscripción/baja del boletín, enlace
 * mágico de miembros, inscripción de invitados con su token, búsqueda…).
 * Subir este número es una DECISIÓN: escribe en la revisión por qué.
 *
 * +3 (2026-10-28, OAuth para MCP, docs/agents/oauth.md): `POST /api/oauth/register`,
 * `/token` y `/revoke`. La especificación MCP 2026-07-28 los quiere sin sesión:
 * autentican al CLIENTE OAuth (PKCE, refresco, secreto), no a una cuenta; el
 * registro y el token van limitados por IP y fallan cerrados.
 */
const LIMITE_ESCRITURAS_PUBLICAS = 31;

describe("compararConMatriz", () => {
  const matriz: Record<string, Nivel> = {
    "GET /api/blog": "publica",
    "POST /api/items": "admin",
    "PATCH /api/blog/:id": "staff",
  };
  const cerrado = {
    anonimo: 401,
    usuario: 403,
    editor: 403,
    admin: 200,
    agente: 403,
    agenteContenido: 403,
  };

  it("todo en orden: sin fallos", () => {
    expect(
      compararConMatriz(
        [
          { clave: "GET /api/blog", estados: { anonimo: 200, usuario: 200, admin: 200 } },
          { clave: "POST /api/items", estados: cerrado },
          { clave: "PATCH /api/blog/:id", estados: { ...cerrado, editor: 404 } },
        ],
        matriz
      )
    ).toEqual([]);
  });

  it("una ruta nueva sin clasificar FALLA", () => {
    const f = compararConMatriz(
      [
        { clave: "GET /api/blog", estados: { anonimo: 200, usuario: 200, admin: 200 } },
        { clave: "POST /api/items", estados: cerrado },
        { clave: "PATCH /api/blog/:id", estados: { ...cerrado, editor: 404 } },
        { clave: "POST /api/nueva", estados: { anonimo: 200 } },
      ],
      matriz
    );
    expect(f.join("\n")).toContain("POST /api/nueva: ruta SIN CLASIFICAR");
  });

  it("una ruta de admin que deja entrar a un usuario FALLA", () => {
    const f = compararConMatriz(
      [
        { clave: "GET /api/blog", estados: { anonimo: 200, usuario: 200, admin: 200 } },
        { clave: "POST /api/items", estados: { ...cerrado, usuario: 200 } },
        { clave: "PATCH /api/blog/:id", estados: { ...cerrado, editor: 404 } },
      ],
      matriz
    );
    expect(f.join("\n")).toContain("POST /api/items [admin]: usuario → 200");
  });

  it("una entrada que ya no se monta FALLA (la tabla no se queda vieja)", () => {
    const f = compararConMatriz([{ clave: "GET /api/blog", estados: { anonimo: 200 } }], matriz);
    expect(f.join("\n")).toContain("POST /api/items: está en MATRIZ pero ya no se monta");
  });

  it("los niveles exigen lo que dicen", () => {
    expect(EXPECTATIVA.admin.editor).toBe(false);
    expect(EXPECTATIVA.staff.editor).toBe(true);
    expect(EXPECTATIVA.contenido.agenteContenido).toBe(true);
    expect(EXPECTATIVA.usuario.anonimo).toBe(false);
  });
});

const BASE = process.env.KITSUDEN_MATRIZ_DB;

describe.runIf(Boolean(BASE))("la app real contra la tabla (KITSUDEN_MATRIZ_DB)", () => {
  it(
    "toda ruta montada casa con su nivel para las seis identidades",
    () => {
      const r = spawnSync("bun", ["run", "scripts/matriz-de-autorizacion.ts", "--comprobar"], {
        cwd: resolve(__dirname, "../../apps/api"),
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_ENV: "test",
          KITSUDEN_TEST_DB: "postgres",
          LOG_LEVEL: "error",
          DATABASE_URL: BASE,
          DATABASE_ADMIN_URL: process.env.KITSUDEN_MATRIZ_ADMIN_DB ?? BASE,
          // El script mide sin Valkey (cuenta en memoria y la vacía). Antes este
          // valor caía en 127.0.0.1:6379, que en la máquina del propietario es el
          // Valkey de PRODUCCIÓN.
          REDIS_URL: "",
          VALKEY_URL: "",
        },
        maxBuffer: 64 * 1024 * 1024,
        timeout: 3 * 60 * 60 * 1000,
      });
      const discrepancias = (r.stdout ?? "").split("\n").filter((l) => l.includes("✗"));
      expect(discrepancias, discrepancias.join("\n")).toEqual([]);
      expect(r.status, r.stderr?.slice(-2000)).toBe(0);
    },
    3 * 60 * 60 * 1000
  );
});
