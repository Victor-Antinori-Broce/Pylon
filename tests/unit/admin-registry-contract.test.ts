/**
 * Contrato público del Admin Registry
 * ============================================================================
 *
 * `GET /api/admin/registry` es lo que permite que alguien construya su propio
 * panel en React, Vue o lo que sea. Eso solo es cierto si el contrato no cambia
 * en silencio, así que aquí se fija: la versión se declara, y las tres
 * respuestas de la ruta la incluyen.
 *
 * Las aserciones sobre la ruta son ESTÁTICAS (leen el fuente) a propósito.
 * Levantar la app en la suite unitaria arrastraría los mocks globales de bun,
 * que en este repo ya han provocado fallos fantasma — ver `test-suite-caveats`.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, test } from "vitest";

import {
  ADMIN_REGISTRY_VERSION,
  CONTRACT_HEADER,
  assertSupportedContract,
} from "../../packages/shared/src/admin-registry-contract";

const ROOT = resolve(__dirname, "../..");
const ROUTE = readFileSync(join(ROOT, "apps/api/src/routes/admin-registry.ts"), "utf8");

describe("versión del contrato", () => {
  test("está declarada y es un entero positivo", () => {
    expect(Number.isInteger(ADMIN_REGISTRY_VERSION)).toBe(true);
    expect(ADMIN_REGISTRY_VERSION).toBeGreaterThan(0);
  });

  test("la cabecera tiene el nombre acordado", () => {
    expect(CONTRACT_HEADER).toBe("X-Kitsuden-Contract");
  });
});

describe("la ruta publica la versión", () => {
  test("las tres respuestas de éxito incluyen `contract`", () => {
    // registry completo, kon concreto y refresh. Si alguien añade una cuarta
    // respuesta sin versión, un cliente de terceros no podrá validarla.
    const occurrences = ROUTE.match(/contract:\s*ADMIN_REGISTRY_VERSION/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(3);
  });

  test("también va en cabecera, para decidir sin parsear el cuerpo", () => {
    expect(ROUTE).toContain("CONTRACT_HEADER");
    expect(ROUTE).toMatch(/admin-registry\/v\$\{ADMIN_REGISTRY_VERSION\}/);
  });

  test("la versión se importa del contrato compartido, no se escribe a mano", () => {
    // Un literal suelto se desincronizaría del contrato en cuanto suba.
    expect(ROUTE).toMatch(/from ["']@kitsuden\/shared["']/);
    expect(ROUTE).not.toMatch(/contract:\s*\d/);
  });
});

describe("negociación desde el cliente", () => {
  test("acepta una respuesta de la versión actual", () => {
    expect(() => assertSupportedContract({ contract: ADMIN_REGISTRY_VERSION })).not.toThrow();
  });

  test("acepta una versión ANTERIOR: el cliente nuevo lee al servidor viejo", () => {
    expect(() => assertSupportedContract({ contract: 1 }, 5)).not.toThrow();
  });

  test("rechaza una versión MÁS NUEVA con un mensaje que dice qué hacer", () => {
    expect(() => assertSupportedContract({ contract: 9 }, 1)).toThrow(/Actualiza el cliente/);
  });

  test("rechaza una respuesta sin versión, que sería un Kitsuden pre-v1", () => {
    expect(() => assertSupportedContract({ kons: [] })).toThrow(/no declara versión/);
    expect(() => assertSupportedContract(null)).toThrow(/no declara versión/);
    expect(() => assertSupportedContract({ contract: "1" })).toThrow(/no declara versión/);
  });
});

describe("forma del contrato — lo que un panel de terceros puede asumir", () => {
  test("el tipo de vista incluye el mecanismo agnóstico", () => {
    const contract = readFileSync(
      join(ROOT, "packages/shared/src/admin-registry-contract.ts"),
      "utf8"
    );
    // Si desaparece "element", las vistas a medida de terceros dejan de existir.
    expect(contract).toMatch(/"grid" \| "kanban" \| "calendar" \| "custom" \| "element"/);
  });

  test("las reglas de evolución están escritas junto al contrato", () => {
    const contract = readFileSync(
      join(ROOT, "packages/shared/src/admin-registry-contract.ts"),
      "utf8"
    );
    // Sin esto, "versionado" es solo un número que nadie sabe cuándo subir.
    expect(contract).toMatch(/Reglas de evolución/);
    expect(contract).toMatch(/añadir campos opcionales/);
  });
});
