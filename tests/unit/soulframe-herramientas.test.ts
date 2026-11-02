/**
 * Soulframe: Herramientas, Datasets y Planificador de Loadouts
 * ============================================================================
 *
 * Pruebas unitarias para el módulo puro apps/api/scripts/lib/soulframe.ts:
 * comprueba que los datos scrapeados de Soulframe Guide y Soulframe Wiki carguen,
 * que los esquemas de dataset sean válidos, que la tier list cubra los 12 pactos
 * y que el constructor de loadouts compile correctamente con compileBuilder.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { compileBuilder } from "../../packages/kons/kon-character-builder/character-builder.engine";
import {
  leerDatosSoulframe,
  planDeCargaSoulframe,
  SLUGS_SOULFRAME,
  type DatosSoulframe,
} from "../../apps/api/scripts/lib/soulframe";

const CARPETA_DATOS = join(__dirname, "..", "..", "gamedata", "games", "soulframe", "data");

describe("Soulframe: Carga de Datos y Datasets", () => {
  it("carga todos los archivos JSON desde gamedata/games/soulframe/data", () => {
    expect(existsSync(CARPETA_DATOS)).toBe(true);

    const datos = leerDatosSoulframe(CARPETA_DATOS);
    expect(datos.pactos.length).toBe(12);
    expect(datos.armas.length).toBeGreaterThanOrEqual(50);
    expect(datos.jefes.length).toBe(15);
    expect(datos.items.length).toBe(40);
    expect(datos.armaduras.length).toBe(39);
    expect(datos.runas.length).toBe(16);
    expect(datos.npcs.length).toBe(7);
  });

  it("los pactos tienen virtudes cardinales válidas y tiers asignados", () => {
    const datos = leerDatosSoulframe(CARPETA_DATOS);
    const virtudesValidas = new Set(["Courage", "Grace", "Spirit"]);
    const tiersValidos = new Set(["S+", "S", "A", "B", "C"]);

    for (const p of datos.pactos) {
      expect(virtudesValidas.has(p.virtue)).toBe(true);
      expect(tiersValidos.has(p.tier)).toBe(true);
      expect(p.skills.length).toBeGreaterThan(0);
    }
  });

  it("las armas tienen campos numéricos y categorías consistentes", () => {
    const datos = leerDatosSoulframe(CARPETA_DATOS);
    const wulder = datos.armas.find((w) => w.name === "Wulder");
    expect(wulder).toBeDefined();
    expect(wulder?.baseAtk).toBe(46);
    expect(wulder?.stagger).toBe(24);
    expect(wulder?.virtueGate).toContain("no Virtue gate");

    const marrowsBane = datos.armas.find((w) => w.name === "Marrow's Bane");
    expect(marrowsBane).toBeDefined();
    expect(marrowsBane?.baseAtk).toBe(54);
    expect(marrowsBane?.stagger).toBe(40);
  });
});

describe("Soulframe: Plan de Carga e Integración con Kitsuden", () => {
  let datos: DatosSoulframe;

  it("genera un PlanDeCarga válido sin tocar base de datos", () => {
    datos = leerDatosSoulframe(CARPETA_DATOS);
    const plan = planDeCargaSoulframe(datos);

    expect(plan.juego.slug).toBe("soulframe");
    expect(plan.juego.developer).toBe("Digital Extremes");
    expect(plan.datasets.length).toBe(7);
    expect(plan.tierLists.length).toBe(1);
    expect(plan.builders.length).toBe(1);
    expect(plan.wiki?.paginas.length).toBe(3);
  });

  it("la Tier List de pactos cubre todos los pactos sin duplicados", () => {
    datos = leerDatosSoulframe(CARPETA_DATOS);
    const plan = planDeCargaSoulframe(datos);
    const tierList = plan.tierLists[0];

    expect(tierList.slug).toBe(SLUGS_SOULFRAME.tierlistPactos);
    expect(tierList.items.length).toBe(12);

    for (const pacto of datos.pactos) {
      expect(tierList.placement[pacto.slug]).toBeDefined();
    }
  });

  it("el creador de loadouts compila correctamente en el motor de kons", () => {
    datos = leerDatosSoulframe(CARPETA_DATOS);
    const plan = planDeCargaSoulframe(datos);
    const builder = plan.builders[0];

    expect(builder.slug).toBe(SLUGS_SOULFRAME.loadoutBuilder);

    // Comprobar que compileBuilder valida las fórmulas sin errores
    const compilado = compileBuilder(builder.definition as any);
    expect(compilado.definition.slots.length).toBeGreaterThan(0);
    expect(compilado.definition.derived.length).toBe(2);
    expect(compilado.system).toBeDefined();
  });
});
