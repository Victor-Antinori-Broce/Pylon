/**
 * Vue App Entrypoint for Astro Islands
 * Configures Vue app-level plugins and error handling.
 */
import type { App } from "vue";

export default (app: App) => {
  app.config.errorHandler = (err, instance, info) => {
    console.error("[Vue Island Error]", info, err);
  };
};
