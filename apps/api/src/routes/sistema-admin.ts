/**
 * Sistema: lo que administra la plataforma, no un kon
 * ============================================================================
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
 *
 * De las 120 tablas de una instalación, 45 no pertenecen a ningún kon. La mayor
 * parte ya tiene su pantalla —datasets, media, bloques, brain, agentes,
 * acciones, ajustes, vault—, pero un puñado no la tenía en ninguna parte:
 * usuarios, sesiones, kons instalados y el historial de migraciones.
 *
 * Esa era la única justificación real del visor genérico de tablas
 * (`/data-viewer`), que se ha retirado: era una interfaz sobre
 * `/api/explorer/<tabla>`, y esa superficie resolvía CUALQUIER tabla —secretos
 * y credenciales incluidos— con solo tener sesión. Un navegador de tablas
 * crudas tampoco encaja en una arquitectura donde cada kon es dueño de sus
 * datos y decide cómo se presentan.
 *
 * Lo que faltaba no era «ver cualquier tabla», sino unas pocas pantallas
 * concretas de plataforma. Eso es esto.
 *
 * ── AUTORIZACIÓN ───────────────────────────────────────────────────────────
 *
 * Todo aquí exige rol `admin`, no solo sesión. Son los usuarios del CMS y el
 * estado del esquema: `requireAuth` —que solo comprueba que existe sesión— es
 * exactamente el error que dejó abierto el explorador.
 *
 * Y NUNCA se devuelve nada de `auth_accounts`: ahí viven las credenciales.
 */

import { count, eq, sql } from "drizzle-orm";
import { Hono } from "hono";

import { db } from "../db";
import { authSessions, authUsers, installedKons, modules } from "../db/schema";
import { requireRole } from "../middleware/auth";

export const sistemaAdminRoutes = new Hono();

// Rol `admin` en TODAS. No hay ninguna lectura aquí que sea inocua.
sistemaAdminRoutes.use("/*", requireRole(["admin"]));

/** Filas de un resultado crudo, que varían según el driver. */
function filasDe<T>(resultado: unknown): T[] {
  if (Array.isArray(resultado)) return resultado as T[];
  const conRows = resultado as { rows?: unknown };
  return Array.isArray(conRows?.rows) ? (conRows.rows as T[]) : [];
}

/**
 * GET /usuarios — los usuarios del CMS.
 *
 * Se seleccionan las columnas UNA A UNA a propósito. Un `select()` a secas
 * devolvería la fila entera, y aunque hoy `auth_users` no guarda la contraseña
 * —está en `auth_accounts`— basta con que alguien añada una columna sensible
 * mañana para que empiece a viajar sola. Enumerar es aburrido y no se equivoca.
 */
sistemaAdminRoutes.get("/usuarios", async (c) => {
  const usuarios = await db
    .select({
      id: authUsers.id,
      email: authUsers.email,
      name: authUsers.name,
      role: authUsers.role,
      emailVerified: authUsers.emailVerified,
      createdAt: authUsers.createdAt,
    })
    .from(authUsers)
    .orderBy(authUsers.createdAt);

  return c.json({ data: usuarios, total: usuarios.length });
});

/**
 * PATCH /usuarios/:id/rol — cambiar el rol de alguien.
 *
 * ── LA PROTECCIÓN QUE IMPORTA ──────────────────────────────────────────────
 *
 * Un administrador no puede quitarse a sí mismo el rol, y no se puede dejar la
 * instalación sin ningún administrador. Sin esas dos, un clic deja el panel
 * inadministrable y la única salida es entrar por `psql` — cosa que quien
 * usa un CMS alojado no siempre puede hacer.
 */
sistemaAdminRoutes.patch("/usuarios/:id/rol", async (c) => {
  const id = c.req.param("id");
  const { role } = (await c.req.json()) as { role?: string };

  const validos = ["admin", "editor", "user"];
  if (!role || !validos.includes(role)) {
    return c.json({ error: `Rol inválido. Debe ser uno de: ${validos.join(", ")}` }, 400);
  }

  const yo = c.get("user") as { id?: string } | undefined;
  if (yo?.id === id && role !== "admin") {
    return c.json(
      {
        error: "No puedes quitarte tu propio rol de administrador",
        message: "Pídeselo a otro administrador; así nadie se queda fuera por un clic.",
      },
      409
    );
  }

  const [objetivo] = await db
    .select({ role: authUsers.role })
    .from(authUsers)
    .where(eq(authUsers.id, id))
    .limit(1);

  if (!objetivo) return c.json({ error: "Usuario no encontrado" }, 404);

  if (objetivo.role === "admin" && role !== "admin") {
    const [{ value: admins }] = await db
      .select({ value: count() })
      .from(authUsers)
      .where(eq(authUsers.role, "admin"));

    if (Number(admins) <= 1) {
      return c.json(
        {
          error: "Es el último administrador",
          message:
            "Quitarle el rol dejaría la instalación sin ningún administrador y " +
            "el panel sin quien lo administre. Nombra a otro primero.",
        },
        409
      );
    }
  }

  await db
    .update(authUsers)
    .set({ role: role as "admin" | "editor" | "user" })
    .where(eq(authUsers.id, id));

  // Un cambio de rol cierra las sesiones de esa persona. Sin esto, a quien se
  // le QUITA el rol de admin le seguía valiendo la sesión abierta (y la caché
  // de sesión en cookie de better-auth le mantenía el rol viejo). Con las
  // sesiones borradas, la caché caduca sola en ≤5 min y tiene que volver a
  // entrar con el rol nuevo. No se toca la de quien hace el cambio: solo
  // puede cambiarse a sí mismo a admin, que ya es.
  if (objetivo.role !== role && yo?.id !== id) {
    await db.delete(authSessions).where(eq(authSessions.userId, id));
  }

  console.log(`[Sistema] ${yo?.id ?? "?"} cambió el rol de ${id} a ${role}`);
  return c.json({ success: true, id, role });
});

/**
 * GET /estado — salud del esquema y de los kons.
 *
 * Reúne lo que antes solo se veía en los logs del contenedor o entrando por
 * `psql`: cuántas migraciones se han aplicado y cuándo fue la última, y qué
 * kons hay instalados y activos.
 *
 * Es de solo lectura A PROPÓSITO. El historial de migraciones se toca con el
 * runner, nunca desde el navegador: editarlo desincroniza historial y esquema
 * en silencio, y ese estado —«la migración consta aplicada y sus tablas no
 * están»— es exactamente el que costó un día entero de diagnóstico.
 */
sistemaAdminRoutes.get("/estado", async (c) => {
  const migraciones = filasDe<{ name: string; applied_at: string; baselined: boolean }>(
    await db.execute(
      sql`SELECT name, applied_at, baselined FROM kitsuden_migrations ORDER BY applied_at DESC LIMIT 10`
    )
  );

  const totalMigraciones =
    filasDe<{ value: number }>(
      await db.execute(sql`SELECT count(*)::int AS value FROM kitsuden_migrations`)
    )[0]?.value ?? 0;

  const kons = await db
    .select({ key: modules.key, name: modules.name, enabled: modules.enabled })
    .from(modules)
    .orderBy(modules.key);

  const instalados = await db
    .select({ konId: installedKons.konId, version: installedKons.version })
    .from(installedKons);

  return c.json({
    migraciones: {
      total: Number(totalMigraciones),
      ultimas: migraciones,
    },
    kons: {
      total: kons.length,
      activos: kons.filter((k) => k.enabled).length,
      lista: kons,
    },
    instalados,
  });
});
