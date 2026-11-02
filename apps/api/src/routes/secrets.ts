/**
 * KITSUDEN Secrets Manager — Rutas (arquitectura KITSUDEN §7)
 *
 * Montado en /api/admin/secrets (protegido por el middleware admin global
 * de index.ts: solo usuarios con role=admin).
 *
 * IMPORTANTE: el valor en claro NUNCA se devuelve en list. Solo el hint
 * enmascarado.
 *
 * CHAINED SYNTAX (Hono RPC): rutas encadenadas + zValidator para que los
 * tipos de request/response fluyan al cliente via `SecretsAppType`.
 */

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import { logger } from "../lib/logger";
import {
  listSecrets,
  setSecret,
  deleteSecret,
  injectSecret,
  loadSecretsIntoEnv,
  isValidSecretKey,
} from "../services/secrets";

const setSecretSchema = z.object({
  key: z.string().min(2).max(200),
  value: z.string().min(1).max(10_000),
  description: z.string().max(1000).optional(),
  category: z.string().max(100).optional(),
  autoInject: z.boolean().optional(),
  injectNow: z.boolean().optional(),
});

export const secretsRoutes = new Hono()

  /**
   * GET /api/admin/secrets
   * Lista de secrets con valores enmascarados (nunca en claro).
   */
  .get("/", async (c) => {
    try {
      const secrets = await listSecrets();
      return c.json({ success: true, secrets, count: secrets.length });
    } catch (err) {
      logger.error({ error: (err as Error).message }, "[Secrets] list failed");
      return c.json({ success: false, error: (err as Error).message }, 500);
    }
  })

  /**
   * POST /api/admin/secrets
   * Crea o rota un secret. Por defecto lo inyecta en caliente (injectNow=true).
   */
  .post("/", zValidator("json", setSecretSchema), async (c) => {
    try {
      const body = c.req.valid("json");

      if (!isValidSecretKey(body.key)) {
        return c.json(
          {
            success: false,
            error:
              "Invalid key. Use UPPER_SNAKE_CASE (e.g. OPENAI_API_KEY); system variables (PATH, NODE_*, KITSUDEN_*, DATABASE_URL, PG*…) cannot be set here.",
          },
          400
        );
      }

      const user = c.get("user") as { id?: string } | null;
      const secret = await setSecret({ ...body, createdById: user?.id });

      logger.info(
        { key: body.key, userId: user?.id, injected: body.injectNow !== false },
        "[Secrets] Secret created/rotated"
      );

      return c.json({ success: true, secret });
    } catch (err) {
      return c.json({ success: false, error: (err as Error).message }, 500);
    }
  })

  /**
   * POST /api/admin/secrets/reload
   * Re-inyecta todos los secrets autoInject=true (equivalente al boot).
   */
  .post("/reload", async (c) => {
    try {
      const injected = await loadSecretsIntoEnv();
      return c.json({ success: true, injected });
    } catch (err) {
      return c.json({ success: false, error: (err as Error).message }, 500);
    }
  })

  /**
   * POST /api/admin/secrets/:key/inject
   * Hot injection manual de un secret en process.env (sin reinicio).
   */
  .post("/:key/inject", async (c) => {
    const key = c.req.param("key");
    try {
      const ok = await injectSecret(key);
      if (!ok) return c.json({ success: false, error: "Secret not found" }, 404);

      const user = c.get("user") as { id?: string } | null;
      logger.info({ key, userId: user?.id }, "[Secrets] Manual hot injection");
      return c.json({ success: true, key, injected: true });
    } catch (err) {
      return c.json({ success: false, error: (err as Error).message }, 500);
    }
  })

  /**
   * DELETE /api/admin/secrets/:key
   * Elimina el secret de la DB y de process.env.
   */
  .delete("/:key", async (c) => {
    const key = c.req.param("key");
    try {
      const deleted = await deleteSecret(key);
      if (!deleted) return c.json({ success: false, error: "Secret not found" }, 404);

      const user = c.get("user") as { id?: string } | null;
      logger.info({ key, userId: user?.id }, "[Secrets] Secret deleted");
      return c.json({ success: true, key });
    } catch (err) {
      return c.json({ success: false, error: (err as Error).message }, 500);
    }
  });

/** Hono RPC: tipo acumulado de todos los endpoints del Secrets Manager */
export type SecretsAppType = typeof secretsRoutes;
