/**
 * Kitsuden — Mail
 * ============================================================================
 * Sistema de correo con Mailables (Laravel), drivers intercambiables y outbox
 * de tests (Django), layout compartido y localización.
 *
 * Módulo PURO del engine: no importa la DB, el host ni infraestructura, así que
 * un kon puede definir y registrar sus correos sin acoplarse a apps/api.
 */

export {
  formatAddress,
  addressEmail,
  type Address,
  type Attachment,
  type Envelope,
  type Content,
  type Mailable,
  type MailContext,
  type SentMessage,
  type MailDriver,
} from "./types";

export {
  logDriver,
  memoryDriver,
  smtpDriver,
  resendDriver,
  driverFromEnv,
  type MemoryDriver,
  type SmtpOptions,
  type ResendOptions,
} from "./drivers";

export {
  layout,
  heading,
  paragraph,
  button,
  panel,
  code,
  table,
  esc,
  htmlToText,
  type LayoutOptions,
} from "./templates";

export { Mailer, mail, type MailerOptions, type SendResult } from "./mailer";
