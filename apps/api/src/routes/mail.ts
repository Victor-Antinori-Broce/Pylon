/**
 * Mail — Rutas de inspección y previsualización
 * ============================================================================
 *
 *   GET  /api/mail                    → Mailables registrados (core + kons)
 *   POST /api/mail/preview            → renderiza SIN enviar
 *   POST /api/mail/test               → envía una prueba real
 *
 * Sirven al admin (previsualizar plantillas antes de publicarlas) y a los
 * agentes vía MCP (descubrir qué correos existen y cómo se ven).
 *
 * Requiere admin: previsualizar revela plantillas y el envío de prueba consume
 * cuota del proveedor.
 */

import { mail } from "@kitsuden/engine";
import { Hono } from "hono";

import { protectRoute, requireAdmin } from "../middleware/auth-guard";

export const mailRoutes = new Hono();

mailRoutes.use("/*", protectRoute, requireAdmin);

/** Catálogo de correos disponibles. */
mailRoutes.get("/", (c) => {
  const names = mail.list();
  return c.json({
    driver: mail.driverName,
    total: names.length,
    // Agrupados por prefijo: "system.*" del core, "crm.*" del kon CRM…
    mailables: names.map((name) => ({
      name,
      owner: name.includes(".") ? name.split(".")[0] : "app",
    })),
  });
});

/**
 * Renderiza un Mailable sin enviarlo. Devuelve asunto, HTML y texto — lo que
 * el admin muestra en el iframe de previsualización.
 */
mailRoutes.post("/preview", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string;
    data?: Record<string, unknown>;
    locale?: string;
  };

  if (!body.name) {
    return c.json({ error: { code: "VALIDATION", message: "Falta 'name'" } }, 400);
  }
  if (!mail.has(body.name)) {
    return c.json(
      {
        error: {
          code: "NOT_FOUND",
          message: `Mailable "${body.name}" no registrado`,
          available: mail.list(),
        },
      },
      404
    );
  }

  try {
    const message = mail.render(body.name, body.data ?? {}, body.locale);
    return c.json({
      name: message.mailable,
      locale: message.locale,
      subject: message.subject,
      html: message.html,
      text: message.text,
      to: message.to,
      attachments: message.attachments.map((a) => a.filename),
    });
  } catch (err) {
    // Un Mailable puede fallar si le faltan datos: se devuelve el motivo en
    // vez de un 500 opaco, porque quien previsualiza está iterando el payload.
    return c.json(
      {
        error: {
          code: "RENDER_FAILED",
          message: err instanceof Error ? err.message : String(err),
        },
      },
      422
    );
  }
});

/** Envía un correo de prueba de verdad (útil para validar SMTP/Resend). */
mailRoutes.post("/test", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string;
    to?: string;
    data?: Record<string, unknown>;
    locale?: string;
  };

  if (!body.name || !body.to) {
    return c.json({ error: { code: "VALIDATION", message: "Faltan 'name' y 'to'" } }, 400);
  }
  if (!mail.has(body.name)) {
    return c.json(
      { error: { code: "NOT_FOUND", message: `Mailable "${body.name}" no registrado` } },
      404
    );
  }

  const result = await mail.send(body.name, { ...(body.data ?? {}), to: body.to }, body.locale);

  return c.json(
    {
      ok: result.ok,
      driver: mail.driverName,
      messageId: result.messageId,
      error: result.error,
      subject: result.message.subject,
      to: result.message.to,
    },
    result.ok ? 200 : 502
  );
});
