/**
 * Guardián EN EJECUCIÓN: `.where()` dos veces sobre el mismo builder
 * ============================================================================
 *
 * `tests/unit/drizzle-where-encadenado.test.ts` busca la forma del defecto en
 * el TEXTO. Sirve, pero es una red con agujeros conocidos: no ve una
 * acumulación repartida entre funciones (`q = aplicarFiltro(q, cond)`), ni un
 * builder guardado en un campo, ni nada que no encaje en su expresión regular.
 *
 * Esto es lo otro: se parchean los builders de Drizzle para que la SEGUNDA
 * llamada a `.where()` sobre la misma instancia LANCE. Ya no importa cómo se
 * escribió; importa lo que ocurre. Un helper, un bucle o tres archivos de
 * distancia dan igual.
 *
 * ── LO QUE ESTO NO DEMUESTRA ────────────────────────────────────────────────
 *
 * Solo se dispara en los caminos que las pruebas EJECUTAN. No convierte el
 * guardián estático en redundante: uno cubre todo el código sin ejecutarlo y
 * con agujeros de forma; el otro cubre sin agujeros de forma pero solo lo que
 * se ejecuta. Se necesitan los dos, y el límite del segundo es la cobertura.
 *
 * ── POR QUÉ LANZAR NO ROMPE NADA LEGÍTIMO ───────────────────────────────────
 *
 * Porque en Drizzle no existe un uso legítimo: la segunda llamada sustituye la
 * condición de la primera. Quien lo hace a propósito ya está equivocado. Si
 * alguna vez esto salta sobre código correcto, el código correcto es el que hay
 * que mirar primero.
 */

import {
  PgDeleteBase,
  PgSelectBase,
  PgSelectQueryBuilderBase,
  PgUpdateBase,
} from "drizzle-orm/pg-core";

/** Instancias que ya recibieron un `.where()`. Débil: no retiene builders. */
const yaFiltrados = new WeakSet<object>();

export class DobleWhereError extends Error {
  constructor(operacion: string) {
    super(
      `${operacion}: segunda llamada a .where() sobre el MISMO builder. En Drizzle ` +
        `eso no suma la condición, SUSTITUYE la anterior — la consulta acaba ` +
        `filtrando solo por lo último y devuelve (o escribe) de más, sin error. ` +
        `Acumula en un array y llama a .where(and(...condiciones)) una sola vez. ` +
        `Si el filtro se construye entre varias funciones, pásate las CONDICIONES, ` +
        `no el builder.`
    );
    this.name = "DobleWhereError";
  }
}

/** Envuelve `where` de un prototipo para que la segunda vez lance. */
function vigilar(
  clase: { prototype: Record<string, unknown> } | undefined,
  etiqueta: string
): void {
  const proto = clase?.prototype;
  if (!proto || typeof proto.where !== "function") return;
  // Idempotente: los archivos de test se cargan varias veces por proceso.
  if ((proto.where as { __vigilado?: boolean }).__vigilado) return;

  const original = proto.where as (...args: unknown[]) => unknown;

  function vigilada(this: object, ...args: unknown[]): unknown {
    if (yaFiltrados.has(this)) throw new DobleWhereError(etiqueta);
    yaFiltrados.add(this);
    return original.apply(this, args);
  }
  (vigilada as { __vigilado?: boolean }).__vigilado = true;

  proto.where = vigilada;
}

export function instalarGuardiaWhere(): void {
  vigilar(PgSelectBase as never, "SELECT");
  vigilar(PgSelectQueryBuilderBase as never, "SELECT dinámico");
  vigilar(PgUpdateBase as never, "UPDATE");
  vigilar(PgDeleteBase as never, "DELETE");
}
