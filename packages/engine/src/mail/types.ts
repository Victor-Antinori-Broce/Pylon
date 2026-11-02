/**
 * Kitsuden — Mail: contratos
 * ============================================================================
 *
 * El modelo es el de Laravel (Mailable + drivers + fake) con lo mejor de
 * Django (backends intercambiables + outbox para tests), adaptado a TypeScript
 * sin clases obligatorias ni magia.
 *
 * Un Mailable declara QUÉ enviar (destinatarios, asunto, contenido, adjuntos);
 * el driver decide CÓMO. Nada aquí sabe de SMTP, de la DB ni del host — es un
 * módulo puro del engine, así que un kon puede definir sus correos sin
 * arrastrar infraestructura.
 */

// ── Direcciones ──────────────────────────────────────────────────────────────

/** `"a@b.com"` o `{ address, name }`. */
export type Address = string | { address: string; name?: string };

/** Normaliza una dirección a la forma canónica de cabecera. */
export function formatAddress(addr: Address): string {
  if (typeof addr === "string") return addr;
  return addr.name ? `${addr.name} <${addr.address}>` : addr.address;
}

/** Extrae solo el email (sin nombre) — útil para deduplicar y asertar. */
export function addressEmail(addr: Address): string {
  return typeof addr === "string" ? addr : addr.address;
}

// ── Adjuntos ─────────────────────────────────────────────────────────────────

export interface Attachment {
  /** Nombre con el que se ve en el cliente de correo. */
  filename: string;
  /** Contenido en memoria. Excluyente con `path`. */
  content?: string | Uint8Array;
  /** Ruta en disco. Excluyente con `content`. */
  path?: string;
  contentType?: string;
  /** Para imágenes embebidas: `<img src="cid:logo">`. */
  cid?: string;
}

// ── Sobre y contenido ────────────────────────────────────────────────────────

/** El "quién" del correo. */
export interface Envelope {
  to: Address | Address[];
  from?: Address;
  cc?: Address | Address[];
  bcc?: Address | Address[];
  replyTo?: Address;
  subject: string;
  /** Cabeceras extra (List-Unsubscribe, X-Entity-Ref-ID…). */
  headers?: Record<string, string>;
  /** Etiqueta para métricas/filtrado en el proveedor. */
  tag?: string;
}

/** El "qué" del correo. */
export interface Content {
  html?: string;
  /** Alternativa en texto plano. Si falta, se deriva del HTML. */
  text?: string;
}

// ── Mailable ─────────────────────────────────────────────────────────────────

/**
 * Un correo, como unidad reutilizable y testeable — el equivalente al Mailable
 * de Laravel.
 *
 * `name` es la clave con la que se asierta en los tests
 * (`mail.assertSent("welcome")`) y con la que un kon lo registra.
 */
export interface Mailable<TData = unknown> {
  /** Identificador estable, único por app (p.ej. "crm.deal-won"). */
  name: string;
  /** Construye el sobre a partir de los datos. */
  envelope(data: TData, ctx: MailContext): Envelope;
  /** Construye el cuerpo. */
  content(data: TData, ctx: MailContext): Content;
  /** Adjuntos, si los hay. */
  attachments?(data: TData, ctx: MailContext): Attachment[];
}

/** Contexto que recibe un Mailable al renderizarse. */
export interface MailContext {
  /** Idioma del destinatario (localización). Default: `defaultLocale`. */
  locale: string;
  /** Traduce una clave; devuelve la clave si no hay traducción. */
  t(key: string, vars?: Record<string, string | number>): string;
  /** URL pública de la app, para enlaces absolutos. */
  appUrl: string;
  /** Nombre de la app, para el layout. */
  appName: string;
}

// ── Mensaje ya renderizado ───────────────────────────────────────────────────

/** Lo que finalmente viaja al driver (y lo que ve el outbox en tests). */
export interface SentMessage {
  /** Nombre del Mailable que lo originó (clave de aserción). */
  mailable: string;
  to: string[];
  from: string;
  cc: string[];
  bcc: string[];
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  attachments: Attachment[];
  headers: Record<string, string>;
  locale: string;
  tag?: string;
  /** Id devuelto por el proveedor (si lo hay). */
  messageId?: string;
  sentAt: string;
}

// ── Driver ───────────────────────────────────────────────────────────────────

/**
 * Backend de envío — el equivalente a los EMAIL_BACKEND de Django.
 *
 * Que sea una interfaz (y no un `if` por proveedor) es lo que permite cambiar
 * SMTP ↔ Resend ↔ log ↔ memoria sin tocar una línea de la app, y es lo que
 * hace posible `mail.fake()`.
 */
export interface MailDriver {
  readonly name: string;
  send(message: SentMessage): Promise<{ messageId?: string }>;
  /** Comprobación opcional de conectividad al arrancar. */
  verify?(): Promise<boolean>;
}
