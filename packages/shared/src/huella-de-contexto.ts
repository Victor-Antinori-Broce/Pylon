/**
 * Huella del contexto de decisión — QUÉ vio exactamente quien decidió (2026-11-07)
 * ============================================================================
 *
 * Cuando un humano aprueba o rechaza una propuesta, lo que «vio» es un
 * render concreto: método, camino, cuerpo, diff, ficheros retenidos y los
 * scopes con los que el agente proponía. Esta huella lo fija: sha-256 sobre
 * una forma canónica (claves ordenadas, sin `undefined`), de modo que dos
 * decisiones sobre el MISMO contexto producen la MISMA huella y cualquier
 * cambio de un byte la rompe. Es la respuesta a «¿aprobó esto, o algo
 * parecido?» — el equivalente al truncado de contexto de Pipecat: saber
 * exactamente dónde se interrumpió (aquí: qué se mostró al firmar).
 *
 * Isomórfico (la API y el panel lo usan): digest vía `crypto.subtle`, no
 * `node:crypto`.
 */

/** Un fichero retenido tal como aparece en la bandeja (sin bytes). */
export interface FicheroEnContexto {
  field: string;
  filename: string;
  sha256: string;
  size: number;
}

/** Todo lo que componía la pantalla de decisión. */
export interface ContextoDeDecision {
  method: string;
  path: string;
  tool: string | null;
  operationKey: string | null;
  /** El cuerpo guardado de la propuesta (ya sin secretos). */
  body: unknown;
  /** El diff que se mostró (puede ser `null`). */
  diff: unknown;
  /** Los ficheros retenidos, en el orden en que se muestran. */
  files: FicheroEnContexto[];
  /** Los scopes del agente al proponer. */
  scopes: unknown;
}

/**
 * JSON canónico: mismas claves ordenadas, sin `undefined`, `NaN`/`Infinity`
 * como `null`. Dos valores profundamente iguales dan el mismo texto.
 */
export function canonizar(valor: unknown): string {
  if (valor === undefined) return "null";
  if (valor === null || typeof valor === "number" || typeof valor === "boolean" || typeof valor === "string") {
    if (typeof valor === "number" && !Number.isFinite(valor)) return "null";
    return JSON.stringify(valor);
  }
  if (Array.isArray(valor)) return `[${valor.map(canonizar).join(",")}]`;
  if (typeof valor === "object") {
    const o = valor as Record<string, unknown>;
    const claves = Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort();
    return `{${claves.map((k) => `${JSON.stringify(k)}:${canonizar(o[k])}`).join(",")}}`;
  }
  return "null";
}

/** sha-256 hex del contexto, en la forma canónica. `crypto.subtle` (Node ≥ 20 y navegadores). */
export async function huellaDeContextoDeDecision(ctx: ContextoDeDecision): Promise<string> {
  const sutil = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!sutil) throw new Error("crypto.subtle is not available in this runtime");
  const bytes = new TextEncoder().encode(canonizar(ctx));
  const digest = await sutil.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
