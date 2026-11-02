/**
 * jsdom montado DESDE el test, no con `// @vitest-environment jsdom`.
 *
 * Con el comentario, vitest carga jsdom al ARRANCAR el worker, y ese arranque
 * tiene un límite fijo de 60 s (`START_TIMEOUT` en vitest 4, no configurable).
 * jsdom arrastra cientos de ficheros: medido 2026-10-18 en Windows, 2,8 s en
 * caliente y 27 s en frío; con la suite entera compitiendo por disco y CPU se
 * pasaba del minuto y el fichero moría con «Timeout waiting for worker to
 * respond» sin ejecutar un solo test (y sin que ningún test fallara: la suite
 * solo contaba un error).
 *
 * Aquí se monta el MISMO entorno (`builtinEnvironments.jsdom` de vitest, el
 * que usa el comentario) durante la importación del fichero, que no tiene ese
 * límite: el worker arranca en el entorno node al instante y jsdom carga lo que
 * tenga que tardar.
 */
import { afterAll } from "vitest";
import { builtinEnvironments } from "vitest/environments";

export async function montarJsdom(): Promise<void> {
  const entorno = await builtinEnvironments.jsdom.setup(globalThis, {});
  afterAll(async () => {
    await entorno.teardown(globalThis);
  });
}
