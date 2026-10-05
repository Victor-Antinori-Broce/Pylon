import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [sveltekit()],
  esbuild:
    mode === "production"
      ? {
          // BETA.md bloqueante #4: el bundle de producción no incluye ruido
          // de debug. En dev los console.* siguen disponibles.
          drop: ["console", "debugger"],
        }
      : undefined,
}));
