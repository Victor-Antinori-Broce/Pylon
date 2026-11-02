/**
 * Test Setup and Utilities
 *
 * Provides test database setup, teardown, and utility functions
 * for all test suites.
 */

import { eq, sql } from "drizzle-orm";

import { db, isPgMem } from "../db";
import { authUsers } from "../db/schema-core";

// Test database URL from environment
export const TEST_DATABASE_URL = process.env.DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env and configure your PostgreSQL test connection."
  );
}

/**
 * Check if a REAL PostgreSQL database is available.
 * Returns false when falling back to pg-mem, since pg-mem
 * does not fully support drizzle-orm 0.45.x for integration tests.
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return !isPgMem;
  } catch {
    return false;
  }
}

/**
 * Clear all test data
 */
export async function clearTestData() {
  // Delete in correct order to avoid foreign key constraints
  await db.execute(sql`DELETE FROM "data_entries"`);
  await db.execute(sql`DELETE FROM "data_sets"`);
  await db.execute(sql`DELETE FROM "auth_users" WHERE email LIKE 'test-%@example.com'`);
  await db.execute(sql`DELETE FROM "api_keys" WHERE name LIKE 'Test%'`);
}

/**
 * Setup test environment
 */
export async function setupTestEnv() {
  const isAvailable = await isDatabaseAvailable();

  if (!isAvailable) {
    console.error("❌ Database not available. Skipping tests that require DB.");
    console.error(`Expected database at: ${TEST_DATABASE_URL?.replace(/\/\/[^@]*@/, "//***@")}`);
    return false;
  }

  console.log("✅ Database connected, running tests...");
  return true;
}

/**
 * El rol de la aplicación (`kitsuden_app`) en la base de PRUEBAS.
 *
 * Las pruebas que miden la RLS «sola» se conectan como el usuario de la base
 * de tests, que en Docker y en CI es SUPERUSUARIO, y un superusuario se salta
 * la RLS. Hacen `SET LOCAL ROLE kitsuden_app`, el rol con el que sirve la API
 * en producción (lo crea docker/start-with-check.sh)… que en una base de
 * tests recién levantada no existía: fallaban con «role does not exist».
 *
 * Esto lo crea si falta (sin login, sin superusuario, sin BYPASSRLS) con los
 * mismos permisos que en producción, incluidas las tablas que solo admiten
 * INSERT (la cola y las trazas). Idempotente; sin superusuario no hace nada.
 */
export async function asegurarRolDeApp(): Promise<boolean> {
  const [su] = (await db.execute(sql`SELECT current_setting('is_superuser') AS su`)).rows as Array<{ su: string }>;
  if (su?.su !== "on") return false;
  await db.execute(sql.raw(`DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kitsuden_app') THEN
    CREATE ROLE kitsuden_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$`));
  await db.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO kitsuden_app`));
  await db.execute(sql.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kitsuden_app`));
  await db.execute(sql.raw(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kitsuden_app`));
  // Como las migraciones 0056 y 0057: la cola y las trazas, solo INSERT.
  for (const tabla of ["kitsuden_outbox", "kitsuden_trazas"]) {
    await db.execute(sql.raw(`DO $$ BEGIN
      IF to_regclass('public.${tabla}') IS NOT NULL THEN
        EXECUTE 'REVOKE ALL ON ${tabla} FROM kitsuden_app';
        EXECUTE 'GRANT INSERT ON ${tabla} TO kitsuden_app';
      END IF;
    END $$`));
  }
  return true;
}

/**
 * Generate unique test IDs
 */
export function generateTestId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create test user data
 */
export function createTestUserData() {
  const id = generateTestId();
  return {
    email: `${id}@example.com`,
    password: "TestPassword123!",
    name: `Test User ${id}`,
  };
}

/**
 * Create test dataset data
 */
export function createTestDatasetData() {
  const id = generateTestId();
  return {
    name: `Test Dataset ${id}`,
    slug: `test-dataset-${id}`,
    description: "A test dataset",
    schema: [{ fieldName: "title", fieldType: "text", required: true }],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTRAR COMO UN USUARIO DE PRUEBA
// ═══════════════════════════════════════════════════════════════════════════
//
// Los tests de integración se dan de alta y entran por HTTP
// (`/api/auth/sign-up/email` + `/api/auth/sign-in/email`). Desde la ronda de
// seguridad del 2026-10-15 eso, a pelo, ya no funciona, por dos motivos que
// son CORRECTOS en producción y que aquí hay que sortear sin tocarlos:
//
//   1. `requireEmailVerification: true` (lib/auth.ts): quien se acaba de dar
//      de alta no entra con contraseña (403) hasta confirmar el correo. En un
//      test no hay correo que pulsar: se marca `emailVerified` en la base.
//
//   2. El limitador (lib/rate-limiter.ts) deja 5 altas por hora y 10 entradas
//      cada 5 minutos POR IP. `app.request(...)` no tiene socket, así que
//      todas las peticiones de toda la suite eran el mismo cliente «unknown»
//      (lib/ip-del-cliente.ts) y a la sexta alta empezaba el 429. Cada alta y
//      cada entrada lleva su propia IP en `X-Forwarded-For`.
//
// Las IP son de los rangos de DOCUMENTACIÓN (RFC 5737), que `esPrivada()` da
// por públicas: una privada se saltaría y volvería a contar como «unknown».
// El punto de partida es aleatorio para que dos corridas seguidas contra el
// mismo Valkey no repitan la misma secuencia de cubos.

const RANGOS_DE_DOCUMENTACION = ["198.51.100", "203.0.113", "192.0.2"];
let siguienteIp = Math.floor(Math.random() * 3 * 254);

/** Una IP pública de documentación distinta en cada llamada. */
export function ipDePrueba(): string {
  const n = siguienteIp++ % (3 * 254);
  return `${RANGOS_DE_DOCUMENTACION[Math.floor(n / 254)]}.${(n % 254) + 1}`;
}

export interface UsuarioDePrueba {
  email: string;
  password: string;
  name: string;
  /** Rol que se le pone en la base antes de entrar (por defecto `user`). */
  role?: "admin" | "editor" | "user";
}

/** Solo la cookie de sesión (`…session_token=…`), sin la caché de sesión. */
export function cookieDeSesion(headers: Headers): string {
  const todas =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : (headers.get("set-cookie") ?? "").split(/,(?=\s*[^;,=\s]+=)/);
  const sesion = todas.find((c) => c.includes("session_token=")) ?? todas[0] ?? "";
  return sesion.split(";")[0]!.trim();
}

/**
 * Da de alta al usuario, lo deja verificado (y con `role` si se pide) y entra.
 *
 * No se pasa la cookie de caché de sesión (`session_data`): guarda el rol
 * durante 5 minutos, y un test que cambia el rol a mitad vería el viejo.
 */
export async function entrarComo(
  app: { request: (input: Request) => Response | Promise<Response> },
  usuario: UsuarioDePrueba
): Promise<{ cookie: string; userId: string }> {
  const peticion = (ruta: string, cuerpo: unknown) =>
    new Request(`http://localhost:3000${ruta}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": ipDePrueba() },
      body: JSON.stringify(cuerpo),
    });

  const alta = await app.request(
    peticion("/api/auth/sign-up/email", {
      email: usuario.email,
      password: usuario.password,
      name: usuario.name,
    })
  );
  if (alta.status !== 200) {
    throw new Error(`entrarComo: el alta respondió ${alta.status}: ${await alta.text()}`);
  }

  const [fila] = await db
    .update(authUsers)
    .set({ emailVerified: true, ...(usuario.role ? { role: usuario.role } : {}) })
    .where(eq(authUsers.email, usuario.email.toLowerCase()))
    .returning({ id: authUsers.id });
  if (!fila) throw new Error(`entrarComo: no aparece ${usuario.email} en auth_users`);

  const entrada = await app.request(
    peticion("/api/auth/sign-in/email", { email: usuario.email, password: usuario.password })
  );
  if (entrada.status !== 200) {
    throw new Error(`entrarComo: la entrada respondió ${entrada.status}: ${await entrada.text()}`);
  }

  return { cookie: cookieDeSesion(entrada.headers), userId: fila.id };
}

