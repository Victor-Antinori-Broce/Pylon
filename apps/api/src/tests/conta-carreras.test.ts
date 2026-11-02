/**
 * Conta: dos peticiones a la vez no duplican asientos ni pierden saldos
 * ============================================================================
 *
 * Auditoría 2026-10-25: contabilizar, revertir y facturar comprobaban el
 * estado y escribían después, y los saldos se calculaban en la app («leer,
 * sumar, escribir»). Con dos peticiones simultáneas se revertía dos veces y se
 * perdían sumas. Ahora la transición se reclama con un UPDATE condicionado y
 * el saldo se suma en SQL.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { sql } from "drizzle-orm";

import { ContaService, validateLedgerLines } from "../../../../packages/kons/kon-conta/conta.service";
import { accounts } from "../../../../packages/kons/kon-conta/conta.schema";
import { db } from "../db";

import { isDatabaseAvailable, generateTestId } from "./setup";

let dbAvailable = false;

describe("conta sin carreras", () => {
  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
  });

  it("dos reversiones simultáneas: una pasa y la otra es 409", async () => {
    if (!dbAvailable) return;
    const svc = new ContaService(db as never);
    // La moneda por defecto de los apuntes (FK): una base recién migrada no la trae
    await db.execute(
      sql`INSERT INTO conta_currencies (code, name, symbol) VALUES ('USD', 'US Dollar', '$') ON CONFLICT (code) DO NOTHING`
    );
    const s = generateTestId().replace(/[^a-z0-9]/gi, "").slice(-10);
    const [caja] = await db.insert(accounts).values({ code: `C${s}`, name: "Caja", type: "asset" } as never).returning();
    const [ingresos] = await db
      .insert(accounts)
      .values({ code: `I${s}`, name: "Ingresos", type: "revenue" } as never)
      .returning();

    const { journal } = await svc.createJournal({
      date: "2026-10-25",
      description: "venta",
      lines: [
        { accountId: caja!.id, debit: "100" },
        { accountId: ingresos!.id, credit: "100" },
      ],
    });
    await svc.postJournal(journal.id);
    // Contabilizar otra vez el mismo asiento no vuelve a sumar
    let rechazado = false;
    try {
      await svc.postJournal(journal.id);
    } catch {
      rechazado = true;
    }
    expect(rechazado).toBe(true);

    const resultados = await Promise.allSettled([svc.reverseJournal(journal.id), svc.reverseJournal(journal.id)]);
    expect(resultados.filter((r) => r.status === "fulfilled").length).toBe(1);

    // Caja: +100 al contabilizar, −100 al revertir UNA vez → 0
    const filas = (await db.execute(
      sql`SELECT current_balance FROM conta_accounts WHERE id = ${caja!.id}`
    )) as unknown as { rows: { current_balance: string }[] };
    expect(Number(filas.rows[0]!.current_balance)).toBe(0);
  });

  it("el saldo de apertura entra por un asiento contra el patrimonio", async () => {
    if (!dbAvailable) return;
    const svc = new ContaService(db as never);
    const s2 = generateTestId().replace(/[^a-z0-9]/gi, "").slice(-10);
    // La siembra deja la cuenta 3000 (patrimonio); si no está, se crea aquí
    const hay = (await db.execute(sql`SELECT id FROM conta_accounts WHERE code = '3000'`)) as unknown as {
      rows: { id: string }[];
    };
    if (hay.rows.length === 0) {
      await db.insert(accounts).values({ code: "3000", name: "Owner's Equity", type: "equity" } as never);
    }
    const [banco] = await db.insert(accounts).values({ code: `B${s2}`, name: "Banco", type: "asset" } as never).returning();
    const asiento = await svc.abrirConSaldo(banco!.id, "250");
    expect(asiento?.journal.status).toBe("posted");
    const filas = (await db.execute(
      sql`SELECT current_balance FROM conta_accounts WHERE id = ${banco!.id}`
    )) as unknown as { rows: { current_balance: string }[] };
    expect(Number(filas.rows[0]!.current_balance)).toBe(250);
  });

  it("un asiento con dos monedas se rechaza", () => {
    const r = validateLedgerLines([
      { debit: "100", credit: "0", currency: "USD" },
      { debit: "0", credit: "100", currency: "EUR" },
    ]);
    expect(r.ok).toBe(false);
  });
});
