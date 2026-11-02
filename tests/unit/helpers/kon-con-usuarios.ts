/**
 * Banco de pruebas para los kons internos: PGlite con RLS de VERDAD y cinco
 * actores (anónimo, A, B, staff, admin).
 *
 * ── POR QUÉ UN ROL SIN SUPERUSUARIO ────────────────────────────────────────
 *
 * PGlite conecta como `postgres`, superusuario, y Postgres se salta la RLS
 * para un superusuario aunque la tabla tenga FORCE. Un test así daría las
 * políticas por buenas sin haberlas ejecutado nunca. Tras migrar (como
 * superusuario, igual que el runner real) se hace `SET ROLE` a un rol normal
 * —el equivalente de `kitsuden_app`— y TODO lo demás corre con él.
 *
 * Los ids de usuario tienen la forma de better-auth (texto, NO uuid) a
 * propósito: así se cazan las columnas `uuid` que no pueden guardarlos.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { MiddlewareHandler } from "hono";

export const USUARIOS = {
  a: { id: "usrA7kq2Lm9PzX4nT8vB1cD3eF5gH6jK", role: "user", email: "a@example.com", name: "Ana" },
  b: { id: "usrB2wE4rT6yU8iO0pA1sD3fG5hJ7kL", role: "user", email: "b@example.com", name: "Beto" },
  staff: {
    id: "usrS9zX7cV5bN3mQ1wE2rT4yU6iO8pA",
    role: "editor",
    email: "s@example.com",
    name: "Sara",
  },
  admin: {
    id: "usrAdm1nQ2wE3rT4yU5iO6pA7sD8fG9",
    role: "admin",
    email: "ad@example.com",
    name: "Root",
  },
} as const;

export type Actor = keyof typeof USUARIOS | "anon";

const CABECERA = "x-prueba-usuario";

function usuarioDeCabecera(valor: string | undefined) {
  if (!valor || !(valor in USUARIOS)) return null;
  return { ...USUARIOS[valor as keyof typeof USUARIOS] };
}

/** Dobles de `ctx.auth` que leen el actor de una cabecera de prueba. */
export function authDePrueba() {
  const optionalAuth: MiddlewareHandler = async (c, next) => {
    const u = usuarioDeCabecera(c.req.header(CABECERA));
    if (u) c.set("user" as never, u as never);
    await next();
  };
  const requireAuth: MiddlewareHandler = async (c, next) => {
    const u = usuarioDeCabecera(c.req.header(CABECERA));
    if (!u) return c.json({ error: "Unauthorized - Authentication required" }, 401);
    c.set("user" as never, u as never);
    await next();
  };
  const requireRole =
    (roles: string[]): MiddlewareHandler =>
    async (c, next) => {
      const u = usuarioDeCabecera(c.req.header(CABECERA));
      if (!u) return c.json({ error: "Unauthorized" }, 401);
      if (!roles.includes(u.role)) return c.json({ error: "Forbidden" }, 403);
      c.set("user" as never, u as never);
      await next();
    };
  return {
    optionalAuth,
    requireAuth,
    requireRole,
    getSession: async () => null,
    usuariosPorId: async () => new Map(),
  };
}

/** Petición como un actor. */
export function pedirComo(app: {
  request: (u: string, i?: RequestInit) => Response | Promise<Response>;
}) {
  return (actor: Actor, metodo: string, ruta: string, cuerpo?: unknown) => {
    const headers: Record<string, string> = {};
    if (actor !== "anon") headers[CABECERA] = actor;
    if (cuerpo !== undefined) headers["content-type"] = "application/json";
    return app.request(ruta, {
      method: metodo,
      headers,
      body:
        cuerpo === undefined
          ? undefined
          : typeof cuerpo === "string"
            ? cuerpo
            : JSON.stringify(cuerpo),
    });
  };
}

export const ROL_APP = "kon_prueba_app";

/**
 * PGlite con las migraciones del kon aplicadas como superusuario y la sesión
 * pasada después a un rol SIN privilegios especiales.
 */
export async function baseConRls(kon: string, migraciones: string[]) {
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

/** Pasa la sesión al rol de la app (después de sembrar como superusuario). */
export async function comoRolDeApp(cliente: PGlite) {
  await cliente.exec(`SET ROLE ${ROL_APP}`);
  const r = await cliente.query<{ su: boolean }>(
    `SELECT rolsuper OR rolbypassrls AS su FROM pg_roles WHERE rolname = current_user`
  );
  // Si esto fuera superusuario, toda prueba de RLS sería decorativa.
  if (r.rows[0]?.su !== false) throw new Error("el rol de prueba salta la RLS");
  return drizzle(cliente);
}

/** Ejecuta SQL crudo con el contexto RLS de un actor (dentro de una transacción). */
export async function sqlComo<T = Record<string, unknown>>(
  cliente: PGlite,
  actor: Actor,
  consulta: string,
  params: unknown[] = []
): Promise<T[]> {
  const u = actor === "anon" ? null : USUARIOS[actor];
  return cliente.transaction(async (tx) => {
    await tx.query(
      `select set_config('app.current_user_id', $1, true), set_config('app.current_user_role', $2, true)`,
      [u?.id ?? "anonimo", u?.role ?? "anon"]
    );
    const r = await tx.query<T>(consulta, params);
    return r.rows;
  });
}
