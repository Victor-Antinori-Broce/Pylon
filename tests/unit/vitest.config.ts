// Vitest Configuration for Unit Tests

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "path";

import { defineConfig } from "vitest/config";

/**
 * Pruebas que necesitan un kon que NO está instalado → fuera de la suite.
 *
 * Desde la fase C los kons viven en el repo kitsuden-kons y se instalan en
 * packages/kons/<kon>/ (`kitsuden kon add`). Las pruebas DE un kon se fueron
 * con él; aquí quedan las del núcleo, y algunas usan un kon como ejemplo
 * (idempotencia con kon-ecommerce, el contrato de Inti con kon-games…). En un
 * clon limpio, sin kons, esas no tienen qué probar: se excluyen y se dice
 * cuáles, en vez de fallar con un ENOENT que parece un error del núcleo.
 */
function pruebasConKonsAusentes(): string[] {
  const dir = path.resolve(__dirname);
  const raiz = path.resolve(__dirname, "../..");
  const fuera: string[] = [];
  const ausentes = new Set<string>();
  const patrones = [
    /packages\/kons\/(kon-[a-z0-9-]+)/g,
    /"packages",\s*"kons",\s*"(kon-[a-z0-9-]+)"/g,
    /from\s+"@kitsuden\/(kon-[a-z0-9-]+)/g,
    // leer("kon-members/migrations/…") y similares: rutas relativas a packages/kons
    /["'`](kon-[a-z0-9-]+)\/(?:migrations|src|admin|graphics)\//g,
  ];
  for (const nombre of readdirSync(dir)) {
    if (!nombre.endsWith(".test.ts")) continue;
    const texto = readFileSync(path.join(dir, nombre), "utf8");
    // Una prueba que NOMBRA un kon sin necesitarlo (p. ej. que comprueba que
    // NO existe) lo dice con esta marca y no se excluye nunca.
    if (texto.includes("kitsuden-test: no-necesita-kons")) continue;
    const kons = new Set<string>();
    for (const patron of patrones) for (const m of texto.matchAll(patron)) kons.add(m[1]!);
    const faltan = [...kons].filter((k) => !existsSync(path.join(raiz, "packages", "kons", k)));
    if (faltan.length) {
      fuera.push(`tests/unit/${nombre}`);
      faltan.forEach((k) => ausentes.add(k));
    }
  }
  if (fuera.length) {
    console.log(
      `[vitest] ${fuera.length} prueba(s) fuera: usan kons no instalados ` +
        `(${[...ausentes].sort().join(", ")}). Instálalos con "kitsuden kon add" para correrlas.`
    );
  }
  return fuera;
}

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.git/**",
      "**/apps/**/node_modules/**",
      "**/packages/**/node_modules/**",
      ...pruebasConKonsAusentes(),
    ],
    coverage: {
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "tests/"],
    },
    setupFiles: ["./tests/unit/setup.ts"],

    /**
     * Arrancar PGlite (PostgreSQL embebido en WASM) y crear el esquema tarda
     * segundos, y más cuando varios ficheros compiten por CPU.
     *
     * Sin subir este techo, el `beforeAll` agota el tiempo y **vitest marca los
     * tests como OMITIDOS, no como fallidos** — que es la peor combinación
     * posible: la suite sale en verde mientras 32 tests de membresías y de
     * Broadcast no se han ejecutado. Pasó exactamente eso al crecer la suite.
     */
    hookTimeout: 60_000,
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@core": path.resolve(__dirname, "../../packages/core"),
      "@api": path.resolve(__dirname, "../../apps/api/src"),

      // `@/` es el alias interno de apps/api. Lo resuelve el tsconfig, así que
      // el código compila; sin esta línea vitest no lo encuentra y cualquier
      // test que importe un servicio de la API falla con "Cannot find package
      // '@/db'" — un error que no habla del test ni del servicio.
      "@/": path.resolve(__dirname, "../../apps/api/src") + "/",

      // `@kitsuden/shared` apunta a `dist/` vía package.json, así que en cuanto
      // se toca `src/` sin reconstruir, los tests fallan con "X is not a
      // function" — un error que no dice nada del cambio real y que ya ha
      // costado tiempo tres veces.
      //
      // Aquí se resuelve a FUENTE: los tests ejercitan lo que acabas de
      // escribir, no un artefacto viejo. Vitest transpila el TS igual.
      // Ojo: solo `shared`, que es puro. Aliasar `@kitsuden/engine` arrastraría
      // el arranque de la base de datos dentro de la suite unitaria.
      "@kitsuden/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
});
