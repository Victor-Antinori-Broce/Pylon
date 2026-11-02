/**
 * Kons instalados por configuración + activación en caliente (fase C)
 * ============================================================================
 *
 * Tres cosas, contra Postgres de verdad y con el cargador de verdad:
 *
 *   1. EL FALLO DE /api/shop. kon-ecommerce declara `mountPath: "/api/shop"` en
 *      su código y su kon.json no decía nada: al arrancar se reservaban
 *      `/api/ecommerce` y `/api/custom/kon-ecommerce`, y tras activarlo con
 *      `PATCH /api/modules/kon-ecommerce` todo `/api/shop/*` daba 404 hasta
 *      reiniciar. El fixture `kon-tienda-prueba` tiene exactamente esa forma.
 *   2. INSTALADO = DECLARADO. El fixture se instala con `KITSUDEN_KONS`
 *      (id=ruta), no por estar en ninguna carpeta que el cargador recorra.
 *   3. SDK. Un kon que pide un SDK mayor que el del núcleo (`kon-futuro-prueba`,
 *      sdk 99) no se importa, no se monta y no se reserva, y el motivo sale en
 *      el informe de carga.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { join } from "node:path";

import { sql } from "drizzle-orm";
import { Hono } from "hono";

import { db } from "../db";
import { activarKonEnCaliente } from "../lib/kons-diferidos";
import { konInstalado, olvidarKonsInstalados } from "../lib/kons-instalados";
import { getInformeDeCarga, loadKons, rutasDeMontajeCandidatas } from "../lib/module-loader";
import { isDatabaseAvailable } from "./setup";

const TIENDA = join(import.meta.dir, "fixtures", "kon-tienda-prueba");
const FUTURO = join(import.meta.dir, "fixtures", "kon-futuro-prueba");

const entornoPrevio = process.env.KITSUDEN_KONS;
let hayBase = false;
let app: Hono;

async function fijarModulo(key: string, enabled: boolean): Promise<void> {
  await db.execute(sql`
    INSERT INTO modules (key, name, enabled) VALUES (${key}, ${key}, ${enabled})
    ON CONFLICT (key) DO UPDATE SET enabled = ${enabled}`);
}

beforeAll(async () => {
  hayBase = await isDatabaseAvailable();
  if (!hayBase) return;

  // Se SUMAN a lo que ya declare la instalación (kitsuden.kons.json).
  process.env.KITSUDEN_KONS = [
    entornoPrevio,
    `tienda-prueba=${TIENDA}`,
    `futuro-prueba=${FUTURO}`,
  ]
    .filter(Boolean)
    .join(",");
  olvidarKonsInstalados();

  await fijarModulo("kon-tienda-prueba", false); // instalado y APAGADO
  await fijarModulo("kon-futuro-prueba", true); // activo, pero SDK incompatible

  app = new Hono();
  await loadKons(app as never);
});

afterAll(async () => {
  if (hayBase) {
    await db.execute(
      sql`DELETE FROM modules WHERE key IN ('kon-tienda-prueba', 'kon-futuro-prueba')`
    );
  }
  if (entornoPrevio === undefined) delete process.env.KITSUDEN_KONS;
  else process.env.KITSUDEN_KONS = entornoPrevio;
  olvidarKonsInstalados();
});

describe("kons instalados por configuración", () => {
  it("KITSUDEN_KONS declara el kon y su ruta (sin recorrer carpetas)", () => {
    if (!hayBase) return;
    const kon = konInstalado("tienda-prueba");
    expect(kon?.id).toBe("kon-tienda-prueba");
    expect(kon?.origen).toBe("entorno");
    expect(kon?.ruta).toBe(TIENDA);
  });

  it("la ruta del código se reserva aunque el kon.json no la declare", async () => {
    const rutas = await rutasDeMontajeCandidatas(TIENDA, { id: "kon-tienda-prueba" }, false);
    expect(rutas).toContain("/api/escaparate");
  });
});

describe("activar en caliente un kon con mountPath solo en el código (/api/shop)", () => {
  it("apagado: su ruta existe y explica que no está activado", async () => {
    if (!hayBase) return;
    const r = await app.request("/api/escaparate/productos");
    expect(r.status).toBe(404);
    expect(((await r.json()) as { error?: string }).error).toBe("Kon no activado");
  });

  it("tras activarlo (lo que hace PATCH /api/modules/:key) responde SIN reiniciar", async () => {
    if (!hayBase) return;
    await fijarModulo("kon-tienda-prueba", true);
    const activacion = await activarKonEnCaliente("kon-tienda-prueba");
    expect(activacion).toEqual({ montado: true });

    const r = await app.request("/api/escaparate/productos");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ productos: ["taza"] });
  });
});

describe("SDK de kons incompatible", () => {
  it("no se importa, no se monta y el motivo queda en el informe", async () => {
    if (!hayBase) return;
    expect((globalThis as Record<string, unknown>).__konFuturoImportado).toBeUndefined();

    const informe = getInformeDeCarga();
    expect(informe.cargados).not.toContain("kon-futuro-prueba");
    const rechazo = informe.rechazados?.find((r) => r.id === "kon-futuro-prueba");
    expect(rechazo?.motivo).toMatch(/SDK de kons v99.*v1/);

    // Ni montado ni reservado: el camino no existe.
    const r = await app.request("/api/futuro-prueba");
    expect(r.status).toBe(404);
    expect(await r.text()).not.toContain("montado");
  });
});
