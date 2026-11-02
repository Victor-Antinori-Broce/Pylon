/**
 * Extracción del error real de Postgres.
 * ============================================================================
 *
 * Drizzle envuelve el error del driver y su `.message` puede llegar VACÍO. El
 * resultado es "falló el statement 8" sin decir por qué, que es la peor forma
 * de fallar en una migración: te deja mirando SQL correcto sin saber qué pasa.
 *
 * El motivo real vive en `cause` o en los campos propios de pg (`detail`,
 * `hint`, `code`). Esta función los recorre hasta encontrarlos.
 */
export function detallarError(e: unknown): string {
  const partes: string[] = [];
  const visto = new Set<unknown>();

  for (let cur: unknown = e; cur && !visto.has(cur); cur = (cur as { cause?: unknown }).cause) {
    visto.add(cur);
    const o = cur as { message?: string; detail?: string; hint?: string; code?: string };
    if (o.message) partes.push(o.message);
    if (o.detail) partes.push(`detalle: ${o.detail}`);
    if (o.hint) partes.push(`pista: ${o.hint}`);
    if (o.code) partes.push(`código: ${o.code}`);
  }

  return partes.length > 0 ? [...new Set(partes)].join("\n  ") : String(e);
}
