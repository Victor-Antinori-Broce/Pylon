/**
 * En qué entorno corre el proceso, leído EN EJECUCIÓN.
 *
 * ── POR QUÉ NO `process.env.NODE_ENV` ──────────────────────────────────────
 *
 * La imagen de producción ejecuta un bundle hecho con `bun build`, y el
 * empaquetador de Bun SUSTITUYE la expresión literal `process.env.NODE_ENV`
 * por el valor que tenía al compilar. En la etapa de compilación del
 * Dockerfile no hay `NODE_ENV`, así que se congela como "development":
 *
 *     if (process.env.NODE_ENV === "production") return protectRoute(c, next);
 *
 * salía en `dist/index.js` como `if (false) ;`. Visto el 2026-10-12 en el
 * contenedor de producción: el visor de GraphQL se servía sin sesión, el
 * endpoint de depuración de SQL no se cerraba, los kons diferidos devolvían el
 * mensaje crudo de los errores 500 (SQL incluido) y better-auth confiaba en los
 * orígenes de desarrollo (`localhost:3000/3001/5173/4321`). Todo con el
 * contenedor declarando `NODE_ENV=production`.
 *
 * Con la clave en una variable el empaquetador no puede sustituir nada: la
 * lectura se hace siempre al ejecutar. Lo fija `tests/unit/entorno-en-ejecucion.test.ts`,
 * que además prohíbe volver a escribir `process.env.NODE_ENV` en `apps/api/src`.
 */

const CLAVE = "NODE_ENV";

export type Entorno = "development" | "production" | "test";

/** El valor tal cual (o `undefined`), sin normalizar. */
export function nodeEnvCrudo(): string | undefined {
  return process.env[CLAVE];
}

/** Acotado a los tres valores conocidos; cualquier otra cosa es desarrollo. */
export function entornoActual(): Entorno {
  const valor = nodeEnvCrudo();
  return valor === "production" || valor === "test" ? valor : "development";
}

export const enProduccion = (): boolean => nodeEnvCrudo() === "production";
export const enPruebas = (): boolean => nodeEnvCrudo() === "test";
