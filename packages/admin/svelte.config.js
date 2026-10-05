import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/**
 * SvelteKit configuration for the admin package.
 *
 * Note: the `typecheck` script runs svelte-check with
 * `--diagnostic-sources "js,svelte"`. CSS diagnostics are intentionally
 * excluded because svelte-check does not run PostCSS/Tailwind, which causes
 * false-positive warnings for `@apply` and `line-clamp`. Vite still validates
 * and processes CSS during `pnpm run build`.
 */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      fallback: "index.html",
    }),
    alias: {
      $lib: "src/lib",
      $components: "src/lib/components",
      $views: "src/views",
      $stores: "src/stores",
      $types: "src/types",
    },
  },
};

export default config;
