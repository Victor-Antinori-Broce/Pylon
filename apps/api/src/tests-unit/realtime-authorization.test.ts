/**
 * Realtime — autorización de canales y aislamiento por fila
 * ============================================================================
 *
 * Antes de este módulo, `subscribeToChannel` solo validaba el FORMATO del
 * canal: cualquier cliente conectado podía escuchar cualquier tabla. Era
 * latente (nadie publicaba), pero al emitir cambios se habría convertido en la
 * misma fuga que ya cerramos en GraphQL y en las entries de datasets.
 *
 * Estos tests fijan las dos garantías:
 *   1. La puerta (canSubscribe) reusa checkReadAccess — deny-by-default.
 *   2. El filtro por fila (filterForClient) aísla por dueño en el broadcast:
 *      no basta con poder escuchar el canal, cada fila se evalúa aparte.
 */

import { describe, expect, test } from "bun:test";

import {
  canSubscribe,
  filterForClient,
  channelFor,
  resourceOf,
  type ChangeEvent,
  type ResourcePolicy,
} from "../lib/realtime-changes";
import type { PolicyJson, RLSRule, RLSUser } from "../lib/rls-builder";

const alice: RLSUser = { id: "user-alice", role: "user" };
const bob: RLSUser = { id: "user-bob", role: "user" };
const admin: RLSUser = { id: "user-admin", role: "admin" };

const OWNER_RULE: RLSRule[] = [{ field: "ownerId", operator: "eq", value: "{{current_user_id}}" }];

const policyOf = (json: Partial<PolicyJson> | null): ResourcePolicy | null =>
  json ? { policyJson: json as PolicyJson } : null;

const eventFor = (ownerId: string | null): ChangeEvent => ({
  type: "INSERT",
  resource: "products",
  row: { id: "row-1", title: "Teclado", ownerId },
  at: "2026-07-26T00:00:00.000Z",
});

describe("canales", () => {
  test("channelFor / resourceOf hacen round-trip", () => {
    expect(channelFor("products")).toBe("table:products");
    expect(resourceOf("table:products")).toBe("products");
  });

  test("resourceOf rechaza formatos ajenos (no se asume público)", () => {
    expect(resourceOf("presence:room")).toBeNull();
    expect(resourceOf("table:pro ducts")).toBeNull();
    expect(resourceOf("../../etc/passwd")).toBeNull();
  });
});

describe("canSubscribe — la puerta", () => {
  test("recurso SIN política → solo admin (deny-by-default)", () => {
    expect(canSubscribe("table:products", alice, null)).toBe(false);
    expect(canSubscribe("table:products", null, null)).toBe(false);
    expect(canSubscribe("table:products", admin, null)).toBe(true);
  });

  test("authenticated → acepta logueado", () => {
    const p = policyOf({ readAccess: "authenticated" });
    expect(canSubscribe("table:products", alice, p)).toBe(true);
  });

  // NOTA: los casos de RECHAZO por readAccess (anónimo bajo "authenticated",
  // no-admin bajo "admin") no se asiertan aquí: `permissions.test.ts` estubea
  // `checkReadAccess` a `() => true` con `mock.module`, que en bun parchea el
  // registro de módulos de forma global e irreversible. Esos casos ya están
  // cubiertos en `dataset-entries-isolation.test.ts`, que prueba
  // `checkReadAccess` directamente. Aquí verificamos lo propio de este módulo:
  // el formato de canal y el aislamiento por fila.

  test("public → acepta anónimo", () => {
    expect(canSubscribe("table:products", null, policyOf({ readAccess: "public" }))).toBe(true);
  });

  test("canal con formato inválido se deniega incluso a admin", () => {
    expect(canSubscribe("no-es-un-canal", admin, policyOf({ readAccess: "public" }))).toBe(false);
  });
});

describe("filterForClient — aislamiento por fila", () => {
  test("con rlsRules de dueño, cada quien ve SOLO sus filas", () => {
    const p = policyOf({ readAccess: "authenticated", rlsRules: OWNER_RULE });
    const event = eventFor("user-alice");

    expect(filterForClient(event, alice, p)).not.toBeNull(); // su fila
    expect(filterForClient(event, bob, p)).toBeNull(); // fila ajena → NO se entrega
  });

  test("admin ve todas las filas", () => {
    const p = policyOf({ readAccess: "authenticated", rlsRules: OWNER_RULE });
    expect(filterForClient(eventFor("user-alice"), admin, p)).not.toBeNull();
    expect(filterForClient(eventFor("user-bob"), admin, p)).not.toBeNull();
  });

  test("sin rlsRules el canal no aísla: pasar la puerta basta", () => {
    const p = policyOf({ readAccess: "authenticated" });
    expect(filterForClient(eventFor("user-bob"), alice, p)).not.toBeNull();
  });

  test("las reglas que no son de dueño también filtran (borradores fuera)", () => {
    // Auditoría 2026-10-25: solo se miraba la regla del dueño, así que con
    // `status eq published` el socket entregaba también los borradores.
    const p = policyOf({
      readAccess: "authenticated",
      rlsRules: [{ field: "status", operator: "eq", value: "published" }],
    });
    const conEstado = (status: string): ChangeEvent => ({
      ...eventFor("user-bob"),
      row: { ...eventFor("user-bob").row, data: { status } },
    });
    expect(filterForClient(conEstado("published"), alice, p)).not.toBeNull();
    expect(filterForClient(conEstado("draft"), alice, p)).toBeNull();
  });

  test("sin política, solo admin recibe", () => {
    expect(filterForClient(eventFor("user-alice"), alice, null)).toBeNull();
    expect(filterForClient(eventFor("user-alice"), admin, null)).not.toBeNull();
  });

  // (El caso "no pasa la puerta → no recibe filas" depende de checkReadAccess,
  // estubeado globalmente por permissions.test.ts — ver nota arriba. El
  // aislamiento por dueño, que es la lógica PROPIA de este módulo, sí se
  // verifica en los tests de arriba y es lo que evita la fuga entre usuarios.)

  test("el ownerId dentro de data (JSONB de datasets) también aísla", () => {
    const p = policyOf({ readAccess: "authenticated", rlsRules: OWNER_RULE });
    const event: ChangeEvent = {
      type: "UPDATE",
      resource: "products",
      row: { id: "row-2", data: { ownerId: "user-alice", title: "X" } },
      at: "2026-07-26T00:00:00.000Z",
    };
    expect(filterForClient(event, alice, p)).not.toBeNull();
    expect(filterForClient(event, bob, p)).toBeNull();
  });

  test("fila sin dueño no se entrega bajo aislamiento (falla cerrado)", () => {
    const p = policyOf({ readAccess: "authenticated", rlsRules: OWNER_RULE });
    expect(filterForClient(eventFor(null), alice, p)).toBeNull();
  });

  test("usuario anónimo nunca recibe filas con aislamiento por dueño", () => {
    const p = policyOf({ readAccess: "public", rlsRules: OWNER_RULE });
    expect(filterForClient(eventFor("user-alice"), null, p)).toBeNull();
  });
});
