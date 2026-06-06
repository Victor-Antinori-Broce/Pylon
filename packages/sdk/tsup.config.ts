import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    minify: true,
    target: "es2022",
    platform: "neutral",
    outDir: "dist",
  },
  {
    entry: ["src/realtime.ts"],
    format: ["esm", "cjs"],
    dts: true,
    splitting: false,
    sourcemap: true,
    minify: true,
    target: "es2022",
    platform: "neutral",
    outDir: "dist/realtime",
  },
]);
