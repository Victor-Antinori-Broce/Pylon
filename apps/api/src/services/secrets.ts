/**
 * Kitsuden — Prefect-Style Secrets Manager (arquitectura KITSUDEN §7)
 *
 * Administración de variables de entorno y claves de API con:
 *   - Cifrado AES-256-GCM en reposo (PostgreSQL, tabla kitsuden_secrets)
 *   - Inyección en caliente en process.env sin reiniciar Bun
 *   - Carga automática al boot (autoInject=true)
 *   - Rotación con timestamp de auditoría
 *
 * CLAVE MAESTRA:
 *   KITSUDEN_SECRETS_KEY (env) — 32+ chars recomendados. Si no existe, se deriva
 *   de BETTER_AUTH_SECRET con un warning (útil en dev, NO en producción).
 *
 * La UI del admin consume las rutas de routes/secrets.ts (/api/admin/secrets).
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { db } from "../db";
import { kitsudenSecrets } from "../db/schema-core";
import { logger } from "../lib/logger";

// ═══════════════════════════════════════════════════════════════
// CLAVE MAESTRA
// ═══════════════════════════════════════════════════════════════

const KEY_SALT = "kitsuden-secrets-v1"; // salt fijo: la entropía viene de la master key

let cachedKey: Buffer | null = null;

function getMasterKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.KITSUDEN_SECRETS_KEY || process.env.BETTER_AUTH_SECRET;
  if (!raw) {
    throw new Error(
      "Secrets Manager requires KITSUDEN_SECRETS_KEY (or BETTER_AUTH_SECRET as fallback) to be set"
    );
  }
  if (!process.env.KITSUDEN_SECRETS_KEY) {
    logger.warn(
      "[Secrets] KITSUDEN_SECRETS_KEY not set — deriving from BETTER_AUTH_SECRET. " +
        "Set a dedicated KITSUDEN_SECRETS_KEY in production."
    );
  }

  cachedKey = scryptSync(raw, KEY_SALT, 32);
  return cachedKey;
}

// ═══════════════════════════════════════════════════════════════
// CRYPTO (AES-256-GCM)
// ═══════════════════════════════════════════════════════════════

export interface EncryptedValue {
  valueEncrypted: string; // hex
  iv: string; // hex (12 bytes)
  authTag: string; // hex (16 bytes)
}

export function encryptSecret(plaintext: string): EncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getMasterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    valueEncrypted: encrypted.toString("hex"),
    iv: iv.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
  };
}

export function decryptSecret(payload: EncryptedValue): string {
  const decipher = createDecipheriv("aes-256-gcm", getMasterKey(), Buffer.from(payload.iv, "hex"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.valueEncrypted, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

// ═══════════════════════════════════════════════════════════════
// BOOTSTRAP — resiliencia en entornos sin migraciones aplicadas
// ═══════════════════════════════════════════════════════════════

const SECRET_KEY_RE = /^[A-Z][A-Z0-9_]{1,199}$/;

/**
 * Claves que NO se pueden poner desde el gestor (auditoría 2026-10-25): los
 * secretos se inyectan en `process.env`, y estas cambian cómo arranca o se
 * protege el proceso — `PATH`/`NODE_OPTIONS`/`LD_PRELOAD` alcanzan a
 * `pg_dump` y a cualquier proceso hijo (ejecución de código), y las de
 * configuración apagarían en silencio la seguridad (`NODE_ENV`, secretos de
 * auth, la base, CORS, los interruptores de Kitsuden). Se configuran en el
 * `.env` del despliegue, no desde el panel.
 */
const CLAVES_RESERVADAS = new Set([
  "PATH",
  "HOME",
  "SHELL",
  "TMPDIR",
  "TEMP",
  "TMP",
  "NODE_ENV",
  "NODE_OPTIONS",
  "NODE_PATH",
  "NODE_TLS_REJECT_UNAUTHORIZED",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "DATABASE_URL",
  "DATABASE_ADMIN_URL",
  "DATABASE_DDL_URL",
  "REDIS_URL",
  "ALLOWED_ORIGINS",
  "PORT",
  "HOST",
]);
const PREFIJOS_RESERVADOS = ["LD_", "DYLD_", "BUN_", "NODE_", "PG", "POSTGRES_", "APP_DB_", "KITSUDEN_", "ENABLE_", "VALKEY_"];

export function claveDeSecretoReservada(key: string): boolean {
  return CLAVES_RESERVADAS.has(key) || PREFIJOS_RESERVADOS.some((p) => key.startsWith(p));
}

export function isValidSecretKey(key: string): boolean {
  return SECRET_KEY_RE.test(key) && !claveDeSecretoReservada(key);
}

let tableEnsured = false;

/**
 * CREATE TABLE IF NOT EXISTS — permite usar el Secrets Manager aunque las
 * migraciones de drizzle-kit no se hayan regenerado todavía.
 * (La tabla también está declarada en schema-core.ts para futuras
 * generaciones con `bun run db:generate`.)
 */
/**
 * Comprueba que la tabla de secretos existe. Ya NO la crea.
 *
 * Antes hacia `CREATE TABLE IF NOT EXISTS` al arrancar, como apano para
 * entornos sin migraciones aplicadas. Eso dejo de funcionar —y esta bien que
 * dejara de funcionar— cuando la API paso a conectarse con un rol sin
 * privilegios para que RLS se aplique de verdad: ese rol no tiene CREATE sobre
 * el esquema, asi que la sentencia falla con
 *
 *     permission denied for schema public
 *
 * incluso con la tabla ya creada, porque Postgres comprueba el permiso antes
 * que el IF NOT EXISTS.
 *
 * El sintoma era enganoso: el `catch` de `loadSecretsIntoEnv` registraba
 * "[Secrets] Boot injection skipped (DB unavailable?)" y la base estaba
 * perfectamente disponible. Se culpaba a la conexion de un problema de permisos
 * sobre una tabla que, ademas, ya existia.
 *
 * La tabla la crea ahora `src/db/migrations/0037_tablas_declaradas_sin_migracion.sql`,
 * que es donde tiene que estar: crear esquema es trabajo de una migracion, no
 * de un servicio arrancando.
 */
export async function ensureSecretsTable(): Promise<void> {
  if (tableEnsured) return;

  const filas = await db.execute(
    sql`SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'kitsuden_secrets'`
  );
  const encontrada = Array.isArray(filas)
    ? filas.length > 0
    : ((filas as { rows?: unknown[] }).rows?.length ?? 0) > 0;

  if (!encontrada) {
    throw new Error(
      "La tabla kitsuden_secrets no existe. Falta aplicar las migraciones: " +
        "ejecuta `bun run scripts/migrate.ts` con la conexion de administrador."
    );
  }

  tableEnsured = true;
}

// ═══════════════════════════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════════════════════════

export interface SecretMeta {
  id: string;
  key: string;
  description: string | null;
  category: string;
  autoInject: boolean;
  lastRotatedAt: Date | null;
  lastInjectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** Preview enmascarado del valor: "sk-a•••••z9" */
  hint: string;
}

function maskValue(plaintext: string): string {
  if (plaintext.length <= 6) return "•".repeat(plaintext.length);
  return `${plaintext.slice(0, 3)}${"•".repeat(5)}${plaintext.slice(-2)}`;
}

export async function listSecrets(): Promise<SecretMeta[]> {
  await ensureSecretsTable();
  const rows = await db.select().from(kitsudenSecrets).orderBy(kitsudenSecrets.key);

  return rows.map((row) => {
    let hint = "••••••";
    try {
      hint = maskValue(
        decryptSecret({ valueEncrypted: row.valueEncrypted, iv: row.iv, authTag: row.authTag })
      );
    } catch {
      hint = "⚠ undecryptable (master key changed?)";
    }
    return {
      id: row.id,
      key: row.key,
      description: row.description,
      category: row.category,
      autoInject: row.autoInject,
      lastRotatedAt: row.lastRotatedAt,
      lastInjectedAt: row.lastInjectedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      hint,
    };
  });
}

export async function setSecret(input: {
  key: string;
  value: string;
  description?: string;
  category?: string;
  autoInject?: boolean;
  createdById?: string;
  /** Inyectar inmediatamente en process.env (default: true) */
  injectNow?: boolean;
}): Promise<SecretMeta> {
  await ensureSecretsTable();

  if (!isValidSecretKey(input.key)) {
    throw new Error(
      "Invalid secret key. Use UPPER_SNAKE_CASE (e.g. OPENAI_API_KEY), max 200 chars."
    );
  }
  if (!input.value || input.value.length === 0) {
    throw new Error("Secret value cannot be empty");
  }

  const encrypted = encryptSecret(input.value);
  const now = new Date();

  const [existing] = await db
    .select({ id: kitsudenSecrets.id })
    .from(kitsudenSecrets)
    .where(eq(kitsudenSecrets.key, input.key))
    .limit(1);

  if (existing) {
    await db
      .update(kitsudenSecrets)
      .set({
        valueEncrypted: encrypted.valueEncrypted,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        description: input.description,
        category: input.category ?? "general",
        autoInject: input.autoInject ?? true,
        lastRotatedAt: now,
        updatedAt: now,
      })
      .where(eq(kitsudenSecrets.id, existing.id));
  } else {
    await db.insert(kitsudenSecrets).values({
      key: input.key,
      valueEncrypted: encrypted.valueEncrypted,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      description: input.description,
      category: input.category ?? "general",
      autoInject: input.autoInject ?? true,
      createdById: input.createdById,
    });
  }

  // Hot injection: la magia Prefect-style — sin reiniciar Bun
  if (input.injectNow !== false) {
    await injectSecret(input.key);
  }

  const all = await listSecrets();
  return all.find((s) => s.key === input.key)!;
}

export async function deleteSecret(key: string): Promise<boolean> {
  await ensureSecretsTable();
  const result = await db.delete(kitsudenSecrets).where(eq(kitsudenSecrets.key, key)).returning();
  if (result.length > 0) {
    // También lo removemos del entorno vivo
    delete process.env[key];
    logger.info({ key }, "[Secrets] Secret deleted and removed from process.env");
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════
// HOT INJECTION
// ═══════════════════════════════════════════════════════════════

/**
 * Desencripta un secret y lo inyecta en process.env EN CALIENTE.
 * Cualquier código que lea process.env[KEY] a partir de este momento
 * verá el valor nuevo, sin reiniciar el proceso.
 */
export async function injectSecret(key: string): Promise<boolean> {
  await ensureSecretsTable();
  const [row] = await db
    .select()
    .from(kitsudenSecrets)
    .where(eq(kitsudenSecrets.key, key))
    .limit(1);
  if (!row) return false;

  const value = decryptSecret({
    valueEncrypted: row.valueEncrypted,
    iv: row.iv,
    authTag: row.authTag,
  });

  // Una guardada antes de que existiera la lista de reservadas no se inyecta
  if (claveDeSecretoReservada(key)) {
    logger.warn({ key }, "[Secrets] Reserved key not injected into process.env");
    return false;
  }
  process.env[key] = value;
  await db
    .update(kitsudenSecrets)
    .set({ lastInjectedAt: new Date() })
    .where(eq(kitsudenSecrets.id, row.id));

  logger.info({ key }, "[Secrets] Secret hot-injected into process.env");
  return true;
}

/**
 * Carga todos los secrets con autoInject=true en process.env.
 * Se llama al boot del servidor (index.ts). Falla de forma no-fatal si la
 * DB no está disponible todavía.
 */
export async function loadSecretsIntoEnv(): Promise<number> {
  try {
    await ensureSecretsTable();
    const rows = await db
      .select()
      .from(kitsudenSecrets)
      .where(eq(kitsudenSecrets.autoInject, true));

    let injected = 0;
    for (const row of rows) {
      if (claveDeSecretoReservada(row.key)) {
        logger.warn({ key: row.key }, "[Secrets] Reserved key not injected into process.env");
        continue;
      }
      try {
        process.env[row.key] = decryptSecret({
          valueEncrypted: row.valueEncrypted,
          iv: row.iv,
          authTag: row.authTag,
        });
        injected++;
      } catch (err) {
        logger.warn(
          { key: row.key, error: (err as Error).message },
          "[Secrets] Failed to decrypt secret during boot injection (master key changed?)"
        );
      }
    }

    if (injected > 0) {
      await db.execute(
        sql`UPDATE kitsuden_secrets SET last_injected_at = now() WHERE auto_inject = true`
      );
    }
    return injected;
  } catch (err) {
    // El mensaje ya no adivina la causa. Decia "(DB unavailable?)" ante
    // cualquier fallo, y la unica vez que salto de verdad fue por una tabla
    // ausente con la base perfectamente disponible: mando a mirar donde no era.
    logger.warn(
      { error: (err as Error).message },
      "[Secrets] No se inyectaron secretos al arrancar"
    );
    return 0;
  }
}
