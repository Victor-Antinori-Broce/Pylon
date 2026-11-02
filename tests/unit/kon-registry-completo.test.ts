/**
 * El registro conoce todos los kons
 * ============================================================================
 *
 * KON_REGISTRY clasificaba 13 de los 33 kons del repositorio. Los otros 24
 * arrancaban igual —el loader escanea el disco, no esta tabla— pero salían del
 * arranque sin categoría, sin `tables` y sin `dependsOn`.
 *
 * El fallo no se veía: no aparecía un hueco ni un aviso, esos kons
 * sencillamente no estaban en el panel de módulos ni en el grafo de
 * dependencias. Por eso hace falta una prueba y no basta con rellenar la lista
 * una vez: al kon número 34 le volvería a pasar.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { KON_REGISTRY, KON_KEYS } from "../../apps/api/src/services/module-registry";
import { KONS_INSTALADOS } from "./helpers/kons-conocidos";

const RAIZ = join(__dirname, "..", "..");
const KONS = join(RAIZ, "packages", "kons");

function konsEnDisco(): string[] {
  return readdirSync(KONS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(KONS, e.name, "kon.json")))
    .map((e) => e.name);
}

describe("KON_REGISTRY", () => {
  it("clasifica todos los kons que hay en disco", () => {
    const registrados = new Set(KON_KEYS);
    const ausentes = konsEnDisco().filter((kon) => !registrados.has(kon));

    expect(
      ausentes,
      `Estos kons existen en packages/kons/ pero el registro no los conoce, así ` +
        `que cargan sin metadatos y no salen en el panel: ${ausentes.join(", ")}`
    ).toEqual([]);
  });

  it("no repite claves", () => {
    // La lista curada y la derivada se concatenan: una clave en las dos
    // duplicaría la ficha en el panel.
    const vistas = new Set<string>();
    const repetidas = KON_KEYS.filter((k) => (vistas.has(k) ? true : (vistas.add(k), false)));

    expect(repetidas).toEqual([]);
  });

  it("toda entrada trae los campos que el panel consume", () => {
    const incompletas = KON_REGISTRY.filter(
      (k) =>
        !k.key ||
        !k.name ||
        !k.category ||
        !Array.isArray(k.tables) ||
        !Array.isArray(k.dependsOn) ||
        !Array.isArray(k.referencedBy)
    ).map((k) => k.key);

    expect(incompletas).toEqual([]);
  });

  it("las tablas derivadas son nombres, no fichas", () => {
    // `tables` en kon.json admite cadenas o `{name, label, ...}`. Si la ficha
    // se cuela sin aplanar, el panel intenta `SELECT COUNT(*) FROM [object Object]`.
    const malFormadas = KON_REGISTRY.filter((k) =>
      k.tables.some((t) => typeof t !== "string" || t.length === 0)
    ).map((k) => k.key);

    expect(malFormadas).toEqual([]);
  });

  it("las dependencias declaradas apuntan a kons que existen", () => {
    const conocidos = new Set([...KON_KEYS, ...konsEnDisco()]);
    const rotas: string[] = [];

    for (const kon of KON_REGISTRY) {
      for (const dep of kon.dependsOn) {
        // kon-media / kon-datasets / kon-blocks viven en packages/core.
        if (
          !conocidos.has(dep) &&
          !existsSync(join(RAIZ, "packages", "core", dep.replace(/^kon-/, "")))
        ) {
          rotas.push(`${kon.key} → ${dep}`);
        }
      }
    }

    expect(rotas).toEqual([]);
  });

  it.skipIf(!KONS_INSTALADOS.has("kon-crm"))("respeta la curación a mano por encima de lo derivado", () => {
    // kon-crm está curado: trae `referencedBy`, que no se puede deducir del
    // manifiesto. Si lo derivado lo pisara, se perdería el grafo.
    const crm = KON_REGISTRY.find((k) => k.key === "kon-crm");

    expect(crm).toBeDefined();
    expect(crm!.category).toBe("optional");
    expect(crm!.color).toBe("#E91E63");
  });

  it.skipIf(!KONS_INSTALADOS.has("kon-crm"))("completa desde el manifiesto los huecos de una ficha curada", () => {
    // kon-crm estaba curado con `tables: []` porque sus 6 tablas vivían en
    // `database.tables`, el campo que no lee nadie. La ficha curada conserva
    // lo suyo (color, categoría) y toma del manifiesto lo que le faltaba.
    const crm = KON_REGISTRY.find((k) => k.key === "kon-crm")!;
    const manifiesto = JSON.parse(readFileSync(join(KONS, "kon-crm", "kon.json"), "utf8"));

    expect(crm.tables.length).toBeGreaterThan(0);
    expect(crm.tables).toEqual(
      manifiesto.tables.map((t: unknown) => (typeof t === "string" ? t : (t as any).name))
    );
  });

  it.skipIf(!KONS_INSTALADOS.has("kon-wiki"))("un kon no curado entra con lo que declara su manifiesto", () => {
    const wiki = KON_REGISTRY.find((k) => k.key === "kon-wiki");
    const manifiesto = JSON.parse(readFileSync(join(KONS, "kon-wiki", "kon.json"), "utf8"));

    expect(wiki).toBeDefined();
    expect(wiki!.name).toBe(manifiesto.name);
    expect(wiki!.icon).toBe(manifiesto.icon);
  });
});
