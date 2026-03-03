import { defineConfig } from "astro/config";
import vue from "@astrojs/vue";
import tailwind from "@astrojs/tailwind";
import sitemap from "@astrojs/sitemap";
import node from "@astrojs/node";

export default defineConfig({
  site: import.meta.env.PUBLIC_SITE_URL || "http://localhost:4321",
  output: "server",

  adapter: node({
    mode: "standalone",
  }),

  integrations: [
    vue({
      appEntrypoint: "/src/pages/_app",
    }),
    tailwind(),
    sitemap(),
  ],

  vite: {
    ssr: {
      noExternal: ["@gremius/shared"],
    },
  },
});
