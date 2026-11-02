/**
 * Kitsuden — Mail: drivers intercambiables
 * ============================================================================
 *
 * El equivalente a los EMAIL_BACKEND de Django y a los mailers de Laravel.
 * Cambiar de proveedor es cambiar `MAIL_DRIVER`, nunca código de la app.
 *
 *   smtp     → nodemailer (cualquier SMTP: Gmail, SES, Mailgun, Postmark…)
 *   resend   → API HTTP de Resend (sin dependencia npm, usa fetch)
 *   log      → imprime a consola. Default en dev sin credenciales.
 *   memory   → guarda en un array. Es el backend de los tests (outbox).
 *
 * Ninguno se importa de forma estática: `nodemailer` se carga lazy solo si el
 * driver smtp se usa, así una app con Resend no paga ese coste.
 */

import type { MailDriver, SentMessage } from "./types";

// ── log ──────────────────────────────────────────────────────────────────────

/**
 * Imprime el correo en consola en vez de enviarlo.
 * Default cuando no hay credenciales: NUNCA revienta el flujo por falta de
 * config de correo (una alta de usuario no debe fallar porque falte SMTP).
 */
export function logDriver(): MailDriver {
  return {
    name: "log",
    async send(message: SentMessage) {
      const line = "─".repeat(60);
      // eslint-disable-next-line no-console -- este driver ES la salida
      console.log(
        `\n📧 ${line}\n` +
          `   Para:    ${message.to.join(", ")}\n` +
          `   De:      ${message.from}\n` +
          `   Asunto:  ${message.subject}\n` +
          (message.cc.length ? `   CC:      ${message.cc.join(", ")}\n` : "") +
          (message.attachments.length
            ? `   Adjuntos: ${message.attachments.map((a) => a.filename).join(", ")}\n`
            : "") +
          `   Mailable: ${message.mailable} (${message.locale})\n` +
          `${line}\n${message.text.slice(0, 500)}\n${line}\n`
      );
      return { messageId: `log-${Date.now()}` };
    },
  };
}

// ── memory (outbox de tests) ─────────────────────────────────────────────────

export interface MemoryDriver extends MailDriver {
  /** Todos los mensajes "enviados", en orden. El `mail.outbox` de Django. */
  readonly outbox: SentMessage[];
  clear(): void;
}

/**
 * Guarda los mensajes en memoria en vez de enviarlos.
 * Es lo que activa `mail.fake()` y lo que permite asertar en tests sin tocar
 * la red.
 */
export function memoryDriver(): MemoryDriver {
  const outbox: SentMessage[] = [];
  return {
    name: "memory",
    outbox,
    clear() {
      outbox.length = 0;
    },
    async send(message: SentMessage) {
      const messageId = `memory-${outbox.length + 1}`;
      outbox.push({ ...message, messageId });
      return { messageId };
    },
  };
}

// ── smtp ─────────────────────────────────────────────────────────────────────

export interface SmtpOptions {
  host: string;
  port?: number;
  user?: string;
  pass?: string;
  /** true para 465 (TLS implícito); false para 587 (STARTTLS). */
  secure?: boolean;
}

/** Envía por SMTP con nodemailer (carga diferida). */
export function smtpDriver(options: SmtpOptions): MailDriver {
  let transporter: any = null;

  async function getTransporter(): Promise<any> {
    if (transporter) return transporter;
    // Lazy: una app con Resend no debe pagar el coste de cargar nodemailer.
    // El import va con @ts-ignore porque `nodemailer` es dependencia del HOST
    // (apps/api), no del engine — el engine no debe declararla para no forzar
    // su instalación a quien use otro driver. Se resuelve en runtime.
    // @ts-ignore - dependencia opcional del host
    const mod: any = await import("nodemailer");
    const nodemailer = mod.default ?? mod;
    transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port ?? 587,
      secure: options.secure ?? false,
      ...(options.user && options.pass ? { auth: { user: options.user, pass: options.pass } } : {}),
    });
    return transporter;
  }

  return {
    name: "smtp",
    async verify() {
      try {
        await (await getTransporter()).verify();
        return true;
      } catch {
        return false;
      }
    },
    async send(message: SentMessage) {
      const info = await (
        await getTransporter()
      ).sendMail({
        from: message.from,
        to: message.to,
        cc: message.cc.length ? message.cc : undefined,
        bcc: message.bcc.length ? message.bcc : undefined,
        replyTo: message.replyTo,
        subject: message.subject,
        html: message.html,
        text: message.text,
        headers: message.headers,
        attachments: message.attachments.map((a) => ({
          filename: a.filename,
          content: a.content,
          path: a.path,
          contentType: a.contentType,
          cid: a.cid,
        })),
      });
      return { messageId: info?.messageId };
    },
  };
}

// ── resend ───────────────────────────────────────────────────────────────────

export interface ResendOptions {
  apiKey: string;
  /** Endpoint alternativo (self-host / proxy). */
  endpoint?: string;
}

/**
 * Envía por la API HTTP de Resend. Sin dependencia npm: solo `fetch`, así el
 * driver más usado hoy para deliverability no añade peso al paquete.
 */
export function resendDriver(options: ResendOptions): MailDriver {
  const endpoint = options.endpoint ?? "https://api.resend.com/emails";

  return {
    name: "resend",
    async send(message: SentMessage) {
      const body: Record<string, unknown> = {
        from: message.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.cc.length ? { cc: message.cc } : {}),
        ...(message.bcc.length ? { bcc: message.bcc } : {}),
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        ...(message.tag ? { tags: [{ name: "mailable", value: message.mailable }] } : {}),
      };

      if (message.attachments.length > 0) {
        body.attachments = message.attachments.map((a) => ({
          filename: a.filename,
          content:
            typeof a.content === "string"
              ? a.content
              : a.content
                ? Buffer.from(a.content).toString("base64")
                : undefined,
          path: a.path,
        }));
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Resend respondió ${res.status}: ${detail.slice(0, 200)}`);
      }

      const json = (await res.json().catch(() => ({}))) as { id?: string };
      return { messageId: json.id };
    },
  };
}

// ── Resolución por entorno ───────────────────────────────────────────────────

/**
 * Construye el driver a partir de variables de entorno.
 *
 * Orden: `MAIL_DRIVER` explícito → Resend si hay API key → SMTP si hay host →
 * log. Nunca lanza: sin config, el correo se loguea y la app sigue.
 */
export function driverFromEnv(env: Record<string, string | undefined> = process.env): MailDriver {
  const explicit = env.MAIL_DRIVER?.toLowerCase();

  if (explicit === "memory") return memoryDriver();
  if (explicit === "log") return logDriver();

  if (explicit === "resend" || (!explicit && env.RESEND_API_KEY)) {
    if (!env.RESEND_API_KEY) return logDriver();
    return resendDriver({ apiKey: env.RESEND_API_KEY });
  }

  if (explicit === "smtp" || (!explicit && env.SMTP_HOST)) {
    if (!env.SMTP_HOST) return logDriver();
    return smtpDriver({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT) || 587,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      secure: env.SMTP_SECURE === "true",
    });
  }

  return logDriver();
}
