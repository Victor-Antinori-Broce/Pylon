import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * El códec TOON vive en apps/api/src/lib/toon-tabular.ts y tiene dos copias
 * para paquetes que no pueden depender de la API (el SDK, sin dependencias, y
 * el servidor MCP independiente). Una copia que se queda atrás es un cliente
 * que lee mal lo que la API escribe: se exige que sean idénticas.
 */
const RAIZ = join(import.meta.dir, "..", "..", "..", "..");
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), "utf8").replace(/\r\n/g, "\n");

describe("copias del códec TOON", () => {
  const canonica = leer("apps/api/src/lib/toon-tabular.ts");
  for (const copia of ["packages/sdk/src/toon.ts", "packages/mcp-server/src/toon.ts"]) {
    it(`${copia} es idéntica a apps/api/src/lib/toon-tabular.ts`, () => {
      expect(leer(copia)).toBe(canonica);
    });
  }
});
