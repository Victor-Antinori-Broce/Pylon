// Vitest Configuration for Unit Tests

import { defineConfig } from "vitest/config";
import path from "path";

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
