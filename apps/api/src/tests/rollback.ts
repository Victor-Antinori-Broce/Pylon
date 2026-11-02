/**
 * Tests con ROLLBACK por test (kitsuden2.md, C6)
 * ============================================================================
 *
 *   import { itConRollback } from "./rollback";
 *
 *   itConRollback("crea un post", async (tx) => {
 *     await repo(blogPosts).create({ … });     // va a `tx` por el request-scope
 *     await tx.insert(tabla).values({ … });    // o explícito
 *     expect(…);
 *   });                                         // ROLLBACK: nada queda en la base
 *
 * La alternativa a `clearTestData()` (`DELETE FROM` sin WHERE en tablas
 * enteras): cada test corre dentro de UNA transacción que se revierte al
 * acabar. Más rápido (no hay que borrar), y aislado (no se pisan dos ficheros
 * que comparten tablas). Medido en `rollback-por-test.test.ts`.
 *
 * Lo que entra en la transacción del test:
 *   · `repo()`, `dbDeLaPeticion()` y los kons (resuelven por el request-scope).
 *   · `tx` explícito.
 *   · Una petición `app.request(…)` que pase por `transaccionRls`: el
 *     middleware ve que ya hay transacción y NO abre otra. Sus escrituras se
 *     revierten con el test.
 *
 * Lo que NO entra (y por eso esto no sustituye a todo):
 *   · El `db` global usado directamente (`db.insert(…)`): va a otra conexión
 *     del pool y SÍ se confirma.
 *   · Los savepoints anidados (`tx.transaction`) funcionan; un COMMIT real no.
 *
 * NO lo uses en tests que verifican el COMMIT de verdad: la transacción de la
 * petición (transaccion-de-la-peticion.test.ts), la cola y su atomicidad
 * (cola-postgres.test.ts), la RLS de una petición con su propio usuario
 * (dentro de un test con rollback, el middleware reutiliza el contexto del
 * test en vez de fijar el de la petición: pásale el usuario a `itConRollback`).
 */

import { it } from "bun:test";

import { runInRequestScope } from "../../../../packages/engine/src/request-scope";
import {
  fijarContextoRls,
  type ConexionTransaccional,
  type UsuarioRls,
} from "../../../../packages/engine/src/rls-peticion";
import { db, type DatabaseTransaction } from "../db";

const REVERTIR = Symbol("revertir-test");

/**
 * Ejecuta `fn` en una transacción que SIEMPRE se revierte. `usuario` fija el
 * contexto RLS (por defecto, el sistema: id y rol vacíos).
 */
export async function conRollback<T>(
  fn: (tx: DatabaseTransaction) => Promise<T>,
  usuario: UsuarioRls | null = null
): Promise<T> {
  let resultado: T | undefined;
  try {
    await db.transaction(async (tx) => {
      if (usuario) await fijarContextoRls(tx as unknown as ConexionTransaccional, usuario);
      await runInRequestScope({ tx, user: null }, async () => {
        resultado = await fn(tx as unknown as DatabaseTransaction);
      });
      throw REVERTIR;
    });
  } catch (err) {
    if (err !== REVERTIR) throw err;
  }
  return resultado as T;
}

/** `it` de bun cuyo cuerpo corre en `conRollback`. */
export function itConRollback(
  nombre: string,
  fn: (tx: DatabaseTransaction) => Promise<unknown>,
  opciones: { usuario?: UsuarioRls | null; timeout?: number } = {}
): void {
  it(
    nombre,
    async () => {
      await conRollback(async (tx) => {
        await fn(tx);
      }, opciones.usuario ?? null);
    },
    opciones.timeout
  );
}
