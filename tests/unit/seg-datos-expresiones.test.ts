/**
 * Seguridad (datos): los campos calculados de datasets NO ejecutan código
 * ============================================================================
 *
 * `evaluateExpression` hacía `new Function("return " + expresión)()` con los
 * valores de la fila pegados como texto. Cualquiera que pudiera guardar una
 * fórmula (y antes bastaba una cuenta gratuita) ejecutaba código en el
 * servidor al listar `GET /api/datasets/:id/entries?includeCalculated=true`.
 * Y aunque la fórmula fuera inocente, un VALOR de texto acabado en `\` cerraba
 * la cadena y ejecutaba lo de detrás.
 *
 * Estas pruebas fallan con la versión anterior: la marca global se pone.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  evaluateCalculatedField,
  evaluateExpression,
} from "../../packages/core/datasets/datasets.calculated";
import {
  evaluarExpresionSegura,
  LIMITES_DE_EXPRESION,
} from "../../packages/core/datasets/expresion-segura";
import {
  inferTableName,
  tablaRelacionadaPermitida,
} from "../../packages/core/datasets/datasets.snapshots";

const g = globalThis as Record<string, unknown>;

afterEach(() => {
  delete g.__seg_datos_pwned;
});

const fila = (row: Record<string, unknown>) => ({ row });

describe("evaluateExpression no ejecuta código", () => {
  it("una fórmula con código JS devuelve null y no lo ejecuta", () => {
    for (const malicioso of [
      "globalThis.__seg_datos_pwned = 1",
      "(globalThis.__seg_datos_pwned = 1, 2)",
      "(1).constructor.constructor('globalThis.__seg_datos_pwned = 1')()",
      "this.constructor.constructor('globalThis.__seg_datos_pwned = 1')()",
      "process.exit(1)",
      "[].map.constructor('globalThis.__seg_datos_pwned=1')()",
      "{x}.constructor",
      "`${globalThis.__seg_datos_pwned = 1}`",
    ]) {
      expect(evaluateExpression(malicioso, fila({ x: 1 })), malicioso).toBeNull();
      expect(g.__seg_datos_pwned, malicioso).toBeUndefined();
    }
  });

  it("el VALOR de un campo de texto no puede cerrar la cadena e inyectar", () => {
    // Con la versión anterior el `\` del valor escapaba la barra que añadía
    // el «escapado», la comilla siguiente cerraba la cadena y lo que venía
    // detrás se ejecutaba: `"\\" + (globalThis.x = 1) //"`.
    const B = "\\";
    const valor = `${B}" + (globalThis.__seg_datos_pwned = 1) //`;
    const r = evaluateExpression("{nombre}", fila({ nombre: valor }));
    expect(g.__seg_datos_pwned).toBeUndefined();
    expect(r).toBe(valor);

    const r2 = evaluateExpression(
      "{a} + {b}",
      fila({ a: `x${B}`, b: "); globalThis.__seg_datos_pwned=1;//" })
    );
    expect(g.__seg_datos_pwned).toBeUndefined();
    expect(r2).toBe(`x${B}); globalThis.__seg_datos_pwned=1;//`);
  });

  it("un campo llamado como el prototipo no alcanza nada", () => {
    expect(evaluarExpresionSegura("{constructor} + 1", {})).toBe(1);
    expect(evaluarExpresionSegura("{__proto__} + 1", {})).toBe(1);
  });

  it("sigue calculando lo que calculaba", () => {
    const row = { price: 10, quantity: 3, discount: 0.5, nombre: "Espada", nivel: 7, activo: true };
    expect(evaluateExpression("{price} * {quantity} * (1 - {discount})", fila(row))).toBe(15);
    expect(evaluateExpression("Math.round({price} / 3)", fila(row))).toBe(3);
    expect(evaluateExpression("max({price}, {quantity}, 42)", fila(row))).toBe(42);
    expect(evaluateExpression('{nombre} + " (" + {nivel} + ")"', fila(row))).toBe("Espada (7)");
    expect(evaluateExpression('{nivel} >= 5 ? "alto" : "bajo"', fila(row))).toBe("alto");
    expect(evaluateExpression("{activo} && {price} > 5", fila(row))).toBe(true);
    expect(evaluateExpression("2 ** 10 % 1000", fila(row))).toBe(24);
    expect(evaluateExpression("-{price} + {sinValor}", fila(row))).toBe(-10);
    // Un campo calculado de tipo fórmula pasa por el mismo intérprete.
    expect(
      evaluateCalculatedField(
        { type: "formula", config: { expression: "{price} * 2" } } as never,
        fila(row)
      )
    ).toBe(20);
  });

  it("topes: longitud, anidamiento y número de piezas", () => {
    expect(
      evaluateExpression("1+".repeat(LIMITES_DE_EXPRESION.longitud) + "1", fila({}))
    ).toBeNull();
    const profunda = "(".repeat(100) + "1" + ")".repeat(100);
    expect(evaluateExpression(profunda, fila({}))).toBeNull();
    const negaciones = "-".repeat(1500) + "1";
    expect(evaluateExpression(negaciones, fila({}))).toBeNull();
    // Dentro de los topes, funciona.
    expect(evaluateExpression("(".repeat(20) + "1" + ")".repeat(20), fila({}))).toBe(1);
  });
});

describe("snapshots: nunca copian filas de tablas de cuentas o secretos", () => {
  it("rechaza las tablas vetadas y acepta las de contenido", () => {
    for (const campo of [
      "auth_account_id",
      "authAccountId",
      "session_id",
      "user_id",
      "api_key_id",
      "agent_id",
    ]) {
      expect(tablaRelacionadaPermitida(inferTableName(campo)), campo).toBe(false);
    }
    for (const campo of ["weapon_id", "characterId"]) {
      expect(tablaRelacionadaPermitida(inferTableName(campo)), campo).toBe(true);
    }
    expect(tablaRelacionadaPermitida('weapons"; drop table x; --')).toBe(false);
  });
});
