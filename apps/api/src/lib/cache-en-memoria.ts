/**
 * Caché en la memoria del proceso: el sustituto de Valkey en instancia única
 * ============================================================================
 *
 * Sin `VALKEY_URL` (kitsuden2.md, B1b: Valkey es opcional y solo hace falta
 * para escalar en horizontal), las cachés que lo usaban —consultas, respuestas
 * de LLM, el agente— guardan aquí. Por PROCESO: con varias réplicas cada una
 * tendría la suya, y por eso con varias réplicas se configura Valkey.
 *
 * Tope de claves (`CACHE_MEMORY_MAX_KEYS`, 5.000): al llenarse se barren las
 * caducadas y, si sigue lleno, sale la más antigua (orden de inserción del
 * Map). Una caché nunca debe ser una fuga de memoria.
 */

interface Entrada {
  valor: string;
  caduca: number;
}

const entradas = new Map<string, Entrada>();

function maxClaves(): number {
  const n = Number(process.env.CACHE_MEMORY_MAX_KEYS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5000;
}

function barrer(ahora: number): void {
  for (const [clave, e] of entradas) if (e.caduca <= ahora) entradas.delete(clave);
}

export function memoriaGet(clave: string): string | null {
  const e = entradas.get(clave);
  if (!e) return null;
  if (e.caduca <= Date.now()) {
    entradas.delete(clave);
    return null;
  }
  return e.valor;
}

export function memoriaSet(clave: string, valor: string, ttlSegundos: number): void {
  const ahora = Date.now();
  entradas.delete(clave);
  if (entradas.size >= maxClaves()) barrer(ahora);
  while (entradas.size >= maxClaves()) {
    const primera = entradas.keys().next().value;
    if (primera === undefined) break;
    entradas.delete(primera);
  }
  entradas.set(clave, { valor, caduca: ahora + Math.max(1, ttlSegundos) * 1000 });
}

export function memoriaDel(clave: string): void {
  entradas.delete(clave);
}

/** Claves vivas que casan con un patrón de Valkey (`*` y `?`). */
export function memoriaKeys(patron: string): string[] {
  const re = new RegExp(
    `^${patron.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`
  );
  const ahora = Date.now();
  const vivas: string[] = [];
  for (const [clave, e] of entradas) {
    if (e.caduca <= ahora) entradas.delete(clave);
    else if (re.test(clave)) vivas.push(clave);
  }
  return vivas;
}

/** Solo para pruebas. */
export function vaciarCacheEnMemoria(): void {
  entradas.clear();
}
