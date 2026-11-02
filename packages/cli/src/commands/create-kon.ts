/**
 * `kitsuden create-kon <name>` / `kitsuden kon:create <name>` — alias de
 * `kitsuden make kon <name>`.
 *
 * El generador que vivía aquí escribía un kon que no pasaba las guardias del
 * repo (tabla en camelCase, sin migración, sin `$schema`/`tier`, sin
 * `typecheck` ni `tsconfig.json`). Se sustituyó por make-kon.ts; este fichero
 * se queda porque `bin/kitsuden.js` y los proyectos creados con `init`
 * (script `make:kon`) llaman a `createKonCommand`.
 *
 * `--with-admin` y `--with-tests` se aceptan y no cambian nada: el kon
 * generado siempre trae su vista del panel y su prueba.
 */

import { makeKonCommand } from "./make-kon.js";

export async function createKonCommand(
  rawName: string,
  _options: { withAdmin?: boolean; withTests?: boolean } = {}
): Promise<void> {
  await makeKonCommand(rawName, {});
}
