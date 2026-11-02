/**
 * Kitsuden API bajo Node 22+ (kitsuden2.md G4)
 * ============================================================================
 *
 * Bun es el runtime principal (`bun run src/index.ts`: Bun usa el `export
 * default` de index.ts como servidor, con WebSockets). Esta entrada arranca la
 * MISMA app Hono con `@hono/node-server`, para no depender de Bun: si un
 * módulo nativo (sharp, argon2) o una incompatibilidad de Bun aparece en
 * producción, la API sigue pudiendo correr en Node.
 *
 *   bun build src/servidor-node.ts --target node --outdir dist-node \
 *     --external sharp --external @node-rs/argon2
 *   node dist-node/servidor-node.js
 *
 * (Lo hace `pnpm --dir apps/api build:node`; CI lo arranca y pide /api/health.)
 *
 * Diferencia con Bun: el tiempo real por WebSocket (`/api/realtime`) no está
 * (responde 501); todo lo demás —REST, MCP, SSE, la cola, las trazas— sí.
 */

import { serve } from "@hono/node-server";
import type { AddressInfo } from "node:net";

import { app } from "./index";
import { hostDeEscucha } from "./lib/host-de-escucha";

const port = Number(process.env.PORT) || 3001;
const hostname = hostDeEscucha();

const servidor = serve(
  {
    port,
    hostname,
    fetch: (req, env) => {
      if (new URL(req.url).pathname === "/api/realtime") {
        return new Response("Realtime WebSockets need the Bun runtime", { status: 501 });
      }
      // La misma forma que `server.requestIP(req)` de Bun: lib/ip-del-cliente.ts.
      const s = (env as { incoming?: { socket?: { remoteAddress?: string; remoteFamily?: string; remotePort?: number } } })
        .incoming?.socket;
      return app.fetch(req, {
        ip: { address: s?.remoteAddress ?? "", family: s?.remoteFamily ?? "", port: s?.remotePort ?? 0 },
        ...env,
      });
    },
  },
  (info: AddressInfo) => {
    console.log(`⚡ Kitsuden API (Node ${process.versions.node}) en http://${info.address}:${info.port}`);
  }
);

for (const senal of ["SIGTERM", "SIGINT"] as const) {
  process.once(senal, () => servidor.close());
}
