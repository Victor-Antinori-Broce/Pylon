/**
 * Banco de pruebas de seguridad para kon-dms, kon-agile y kon-conta.
 * ============================================================================
 *
 * Monta las RUTAS REALES del kon contra PGlite (Postgres de verdad) con seis
 * actores: anónimo, A, B, miembro, staff (editor del sitio) y admin.
 *
 * Dos detalles que hacen que las pruebas digan algo:
 *
 *   · Rol SIN superusuario. PGlite conecta como `postgres`, y Postgres se salta
 *     la RLS de un superusuario aunque la tabla tenga FORCE: un test así daría
 *     las políticas por buenas sin ejecutarlas. Se migra como superusuario
 *     (igual que el runner) y después TODO corre con `SET ROLE` a un rol
 *     normal, el equivalente de `kitsuden_app`.
 *   · Ids de usuario con la forma de better-auth (texto de 32, NO uuid): así se
 *     cazan columnas `uuid` que no pueden guardarlos (kon-dms las tenía).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { MiddlewareHandler } from "hono";

export const ACTORES = {
  a: { id: "Aq7kL2mP9zX4nT8vB1cD3eF5gH6jK0wQ", role: "user", email: "a@example.com", name: "Ana" },
  b: { id: "Bw2E4rT6yU8iO0pA1sD3fG5hJ7kL9zXc", role: "user", email: "b@example.com", name: "Beto" },
  miembro: {
    id: "Mm3N5bV7cX9zA1sD2fG4hJ6kL8qW0eRt",
    role: "user",
    email: "m@example.com",
    name: "Mia",
  },
  staff: {
    id: "Ss9zX7cV5bN3mQ1wE2rT4yU6iO8pA0lK",
    role: "editor",
    email: "s@example.com",
    name: "Sara",
  },
  admin: {
    id: "Ad1nQ2wE3rT4yU5iO6pA7sD8fG9hJ0kZ",
    role: "admin",
    email: "ad@example.com",
    name: "Root",
  },
} as const;

export type Actor = keyof typeof ACTORES | "anon";

const CABECERA = "x-prueba-actor";
const CABECERA_AGENTE = "x-prueba-agente";

function actorDe(cabecera: string | undefined, agente: string | undefined) {
  if (agente) {
    // Un agente llega como `role: "agent"` con sus scopes (ver index.ts).
    return { id: "agente-de-prueba", role: "agent", scopes: agente.split(",") };
  }
  if (!cabecera || !(cabecera in ACTORES)) return null;
  return { ...ACTORES[cabecera as keyof typeof ACTORES] };
}

/** Doble de `ctx.auth` que toma el actor de una cabecera de prueba. */
export function authDePrueba() {
  const requireAuth: MiddlewareHandler = async (c, next) => {
    const u = actorDe(c.req.header(CABECERA), c.req.header(CABECERA_AGENTE));
    if (!u) return c.json({ error: "Unauthorized - Authentication required" }, 401);
    c.set("user" as never, u as never);
    await next();
  };
  const optionalAuth: MiddlewareHandler = async (c, next) => {
    const u = actorDe(c.req.header(CABECERA), c.req.header(CABECERA_AGENTE));
    if (u) c.set("user" as never, u as never);
    await next();
  };
  return { requireAuth, optionalAuth, getSession: async () => null };
}

type Peticionable = { request: (u: string, i?: RequestInit) => Response | Promise<Response> };

/** `pedir("a", "GET", "/ruta")` — petición como un actor. */
export function pedirComo(app: Peticionable) {
  return (
    actor: Actor | { agente: string[] },
    metodo: string,
    ruta: string,
    cuerpo?: unknown,
    extra: Record<string, string> = {}
  ) => {
    const headers: Record<string, string> = { ...extra };
    if (typeof actor === "object") headers[CABECERA_AGENTE] = actor.agente.join(",");
    else if (actor !== "anon") headers[CABECERA] = actor;
    let body: BodyInit | undefined;
    if (cuerpo instanceof FormData) body = cuerpo;
    else if (cuerpo !== undefined) {
      headers["content-type"] = "application/json";
      body = typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo);
    }
    return app.request(ruta, { method: metodo, headers, body });
  };
}

export const ROL_APP = "kon_seguro_app";

/** PGlite con las migraciones del kon aplicadas como superusuario. */
export async function baseMigrada(kon: string, migraciones: string[]): Promise<PGlite> {
  const cliente = new PGlite();
  for (const m of migraciones) {
    const ruta = resolve(__dirname, `../../../packages/kons/${kon}/migrations/${m}`);
    await cliente.exec(readFileSync(ruta, "utf8"));
  }
  await cliente.exec(`
    CREATE ROLE ${ROL_APP} NOLOGIN;
    GRANT USAGE ON SCHEMA public TO ${ROL_APP};
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROL_APP};
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${ROL_APP};
  `);
  return cliente;
}

/** Baja la sesión al rol de la app y devuelve el drizzle que usarán las rutas. */
export async function bajarARolDeApp(cliente: PGlite) {
  await cliente.exec(`SET ROLE ${ROL_APP}`);
  const r = await cliente.query<{ su: boolean }>(
    `SELECT rolsuper OR rolbypassrls AS su FROM pg_roles WHERE rolname = current_user`
  );
  if (r.rows[0]?.su !== false) throw new Error("el rol de prueba se salta la RLS");
  return drizzle(cliente);
}

/** SQL crudo con el contexto RLS de un actor, en una transacción. */
export async function sqlComo<T = Record<string, unknown>>(
  cliente: PGlite,
  actor: Actor,
  consulta: string,
  params: unknown[] = []
): Promise<T[]> {
  const u = actor === "anon" ? null : ACTORES[actor];
  return cliente.transaction(async (tx) => {
    await tx.query(
      `select set_config('app.current_user_id', $1, true), set_config('app.current_user_role', $2, true)`,
      [u?.id ?? "anonimo-sin-cuenta", u?.role ?? "anon"]
    );
    const r = await tx.query<T>(consulta, params);
    return r.rows;
  });
}

/** El cuerpo de error no puede llevar detalles del motor. */
export function sinDetallesInternos(texto: string): boolean {
  return !/violates|constraint|relation "|column "|syntax error|invalid input syntax|stack|at \w+ \(|pg_|duplicate key/i.test(
    texto
  );
}
