/**
 * Entorno de una prueba: un Kitsuden en memoria, recién hecho
 * ============================================================================
 *
 * Cada (caso, repetición) arranca con su propia PGlite, las migraciones REALES
 * de los kons y los routers montados como en la API. Nada se comparte entre
 * pruebas: lo que un agente deja a medias en un caso no le da pistas —ni se
 * las quita— al siguiente.
 *
 * Las herramientas llegan a la API por `api`, que imita a `apiRequest` del
 * servidor MCP: camino relativo a `/api`, y el error con su estado y su cuerpo
 * tal cual, que es lo que el agente lee.
 *
 * ── EN QUÉ NO ES PRODUCCIÓN ────────────────────────────────────────────────
 *
 *   · No hay base del núcleo: `/data-sets` y `/docs/openapi.json` no existen,
 *     así que `catalog_create`, `catalog_add_entries` y `kitsuden_describe_api`
 *     quedan fuera de las herramientas del agente.
 *   · Tampoco están las 27 herramientas genéricas del servidor: lo que se mide
 *     es si las de dominio bastan, no si el agente las prefiere.
 *   · La sesión es siempre de la organización. Los permisos tienen sus pruebas.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { Hono, type MiddlewareHandler } from "hono";

import {
  createMemoryStateStore,
  respondError,
  setStateStore,
  setStateTransport,
} from "@kitsuden/engine";

import { registerBroadcastPolicy } from "../../../../packages/kons/kon-broadcast/broadcast.policy";
import { createKonBroadcast } from "../../../../packages/kons/kon-broadcast/index";
import { registerEsportsPolicy } from "../../../../packages/kons/kon-esports/esports.policy";
import { createKonEsports } from "../../../../packages/kons/kon-esports/index";
import { createKonTierlist } from "../../../../packages/kons/kon-tierlist/index";
import { registerTierlistPolicy } from "../../../../packages/kons/kon-tierlist/tierlist.policy";
import {
  DOMAIN_TOOL_DEFINITIONS,
  runDomainTool,
  type LlamadaApi,
} from "../../../../packages/mcp-server/src/herramientas-de-dominio";
import { generarGuiaParaAgentes } from "../../src/lib/guia-para-agentes";
import { registrarRouterDeKon, rutasDeKons } from "../../src/lib/rutas-de-kons";
import { createTestKonContext } from "../../src/lib/test-kon-context";

const RAIZ = fileURLToPath(new URL("../../../../", import.meta.url));
const KONS = ["kon-esports", "kon-tierlist", "kon-broadcast"];

/** Las que necesitan la base del núcleo, que este entorno no tiene. */
const FUERA_DEL_ENTORNO = new Set([
  "catalog_create",
  "catalog_add_entries",
  "kitsuden_describe_api",
]);

export const HERRAMIENTAS_DEL_AGENTE = DOMAIN_TOOL_DEFINITIONS.filter(
  (d) => !FUERA_DEL_ENTORNO.has(d.name)
);

let migraciones: string[] | null = null;

function sqlDeMigraciones(): string[] {
  migraciones ??= KONS.flatMap((kon) => {
    const dir = join(RAIZ, "packages/kons", kon, "migrations");
    return readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(join(dir, f), "utf8"));
  });
  return migraciones;
}

const comoOrganizacion: MiddlewareHandler = async (c, next) => {
  c.set("user" as never, { id: "to-eval", role: "admin", email: "to@eval.local" } as never);
  await next();
};

let preparadoUnaVez = false;

export interface Entorno {
  /** Lo que usan las herramientas: la API de este Kitsuden. */
  api: LlamadaApi;
  /** Consulta directa a la base. Solo para preparar y calificar: el agente no la tiene. */
  sql<T = Record<string, unknown>>(consulta: string, params?: unknown[]): Promise<T[]>;
  /** Una herramienta de dominio; lanza si devuelve error. Para preparar y para el oráculo. */
  herramienta(nombre: string, args: Record<string, unknown>): Promise<any>;
  cerrar(): Promise<void>;
}

export async function crearEntorno(): Promise<Entorno> {
  const client = new PGlite();
  for (const sql of sqlDeMigraciones()) await client.exec(sql);

  if (!preparadoUnaVez) {
    // Broadcast publica el estado del overlay: aquí no hay sockets.
    setStateTransport({ broadcast() {} });
    setStateStore(createMemoryStateStore());
  }
  // Las políticas viven en un registro de proceso; volver a registrarlas no cambia nada.
  registerEsportsPolicy();
  registerTierlistPolicy();
  registerBroadcastPolicy();

  const ctx = createTestKonContext({
    db: { instance: drizzle(client) } as never,
    auth: {
      requireAuth: comoOrganizacion,
      optionalAuth: comoOrganizacion,
      requireRole: () => comoOrganizacion,
    } as never,
  });
  const esports = createKonEsports(ctx);
  const tierlist = createKonTierlist(ctx);
  const broadcast = createKonBroadcast(ctx);

  if (!preparadoUnaVez) {
    // Para la guía. La forma de las rutas es la misma en todas las pruebas.
    registrarRouterDeKon("kon-esports", "/api/esports", esports);
    registrarRouterDeKon("kon-tierlist", "/api/tierlist", tierlist);
    registrarRouterDeKon("kon-broadcast", "/api/broadcast", broadcast);
    preparadoUnaVez = true;
  }

  const app = new Hono();
  app.onError((err, c) => respondError(c, err));
  app.use("*", comoOrganizacion);
  // Igual que en apps/api/src/index.ts.
  app.get("/llms.txt", (c) =>
    c.text(
      generarGuiaParaAgentes({ baseUrl: "http://localhost:3000/api", rutas: rutasDeKons() }),
      200,
      { "content-type": "text/markdown; charset=utf-8" }
    )
  );
  app.route("/esports", esports);
  app.route("/tierlist", tierlist);
  app.route("/broadcast", broadcast);

  const api: LlamadaApi = async (path, method = "GET", body) => {
    const res = await app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      throw new Error(`API ${method} ${path} failed (${res.status}): ${await res.text()}`);
    }
    if (res.status === 204) return null;
    return (res.headers.get("content-type") ?? "").includes("json") ? res.json() : res.text();
  };

  return {
    api,
    async sql<T>(consulta: string, params: unknown[] = []) {
      return (await client.query<T>(consulta, params)).rows;
    },
    async herramienta(nombre, args) {
      const r = await runDomainTool(nombre, args, api);
      if (!r) throw new Error(`«${nombre}» no es una herramienta de dominio`);
      const texto = r.content[0].text;
      if (r.isError) throw new Error(`${nombre}: ${texto}`);
      try {
        return JSON.parse(texto);
      } catch {
        return texto;
      }
    },
    cerrar: () => client.close(),
  };
}
