/**
 * Kitsuden — Correos del sistema
 * ============================================================================
 *
 * Los Mailables que trae el core (bienvenida, recuperación). Antes vivían como
 * HTML inline duplicado dentro de `jobs/email.ts`; ahora componen el layout
 * compartido y sus textos pasan por `ctx.t()`, así que se localizan.
 *
 * Un kon registra los suyos igual — ver `registerSystemMails` al final.
 */

import {
  button,
  heading,
  layout,
  panel,
  paragraph,
  type Mailable,
  type Mailer,
} from "@kitsuden/engine";

// ── Bienvenida ───────────────────────────────────────────────────────────────

export interface WelcomeData {
  to: string;
  name?: string;
}

export const welcomeMail: Mailable<WelcomeData> = {
  name: "system.welcome",

  envelope: (data, ctx) => ({
    to: data.to,
    subject: ctx.t("mail.welcome.subject", { app: ctx.appName }),
    tag: "welcome",
  }),

  content: (data, ctx) => ({
    html: layout({
      appName: ctx.appName,
      preheader: ctx.t("mail.welcome.preheader"),
      body:
        heading(ctx.t("mail.welcome.heading", { name: data.name ?? "Admin" })) +
        paragraph(ctx.t("mail.welcome.intro", { app: ctx.appName })) +
        paragraph(ctx.t("mail.welcome.cta_hint")) +
        button(ctx.t("mail.welcome.cta"), `${ctx.appUrl}/admin`),
    }),
  }),
};

// ── Recuperación de contraseña ───────────────────────────────────────────────

export interface RecoveryData {
  to: string;
  resetUrl: string;
  /** Minutos de validez del enlace. */
  expiresIn?: number;
}

export const recoveryMail: Mailable<RecoveryData> = {
  name: "system.password-recovery",

  envelope: (data, ctx) => ({
    to: data.to,
    subject: ctx.t("mail.recovery.subject", { app: ctx.appName }),
    tag: "recovery",
    headers: {
      // Un correo transaccional nunca debe agruparse en hilos con otros.
      "X-Entity-Ref-ID": `recovery-${Date.now()}`,
    },
  }),

  content: (data, ctx) => ({
    html: layout({
      appName: ctx.appName,
      preheader: ctx.t("mail.recovery.preheader"),
      body:
        heading(ctx.t("mail.recovery.heading")) +
        paragraph(ctx.t("mail.recovery.intro")) +
        button(ctx.t("mail.recovery.cta"), data.resetUrl) +
        panel(ctx.t("mail.recovery.expiry", { minutes: data.expiresIn ?? 60 })) +
        paragraph(ctx.t("mail.recovery.ignore")),
    }),
  }),
};

// ── Verificación de email ────────────────────────────────────────────────────
//
// No existía. El alta con email y contraseña no comprobaba que el correo fuera
// de quien se registraba: cualquiera podía crear una cuenta con la dirección de
// otra persona y entrar con ella. La plantilla de recuperación sí existía, pero
// nada la enviaba — el mismo problema por el otro lado.

export interface VerificationData {
  to: string;
  verifyUrl: string;
  name?: string;
  /** Minutos de validez del enlace. */
  expiresIn?: number;
}

export const verificationMail: Mailable<VerificationData> = {
  name: "system.email-verification",

  envelope: (data, ctx) => ({
    to: data.to,
    subject: ctx.t("mail.verify.subject", { app: ctx.appName }),
    tag: "verification",
    headers: {
      // Igual que la recuperación: transaccional, nunca agrupado en un hilo.
      "X-Entity-Ref-ID": `verify-${Date.now()}`,
    },
  }),

  content: (data, ctx) => ({
    html: layout({
      appName: ctx.appName,
      preheader: ctx.t("mail.verify.preheader"),
      body:
        heading(ctx.t("mail.verify.heading")) +
        paragraph(ctx.t("mail.verify.intro", { app: ctx.appName })) +
        button(ctx.t("mail.verify.cta"), data.verifyUrl) +
        panel(ctx.t("mail.verify.expiry", { minutes: data.expiresIn ?? 60 })) +
        paragraph(ctx.t("mail.verify.ignore")),
    }),
  }),
};

// ── Traducciones ─────────────────────────────────────────────────────────────

const EN: Record<string, string> = {
  "mail.welcome.subject": "Welcome to {app}",
  "mail.welcome.preheader": "Your instance is ready.",
  "mail.welcome.heading": "Welcome aboard, {name}",
  "mail.welcome.intro": "Your {app} instance is ready and you're set up as Super Admin.",
  "mail.welcome.cta_hint": "Head to the admin panel to start building:",
  "mail.welcome.cta": "Open admin panel",
  "mail.recovery.subject": "{app} — Password reset",
  "mail.recovery.preheader": "Reset your password.",
  "mail.recovery.heading": "Password reset",
  "mail.recovery.intro":
    "We received a request to reset your password. Click below to set a new one:",
  "mail.recovery.cta": "Reset password",
  "mail.recovery.expiry": "This link expires in {minutes} minutes.",
  "mail.recovery.ignore": "If you didn't request this, you can safely ignore this email.",
  "mail.verify.subject": "{app} — Confirm your email",
  "mail.verify.preheader": "Confirm your email address.",
  "mail.verify.heading": "Confirm your email",
  "mail.verify.intro": "Click below to confirm this email address for your {app} account:",
  "mail.verify.cta": "Confirm email",
  "mail.verify.expiry": "This link expires in {minutes} minutes.",
  "mail.verify.ignore": "If you didn't create an account, you can safely ignore this email.",
};

const ES: Record<string, string> = {
  "mail.welcome.subject": "Bienvenido a {app}",
  "mail.welcome.preheader": "Tu instancia está lista.",
  "mail.welcome.heading": "Bienvenido, {name}",
  "mail.welcome.intro": "Tu instancia de {app} está lista y tienes rol de Super Admin.",
  "mail.welcome.cta_hint": "Entra al panel para empezar a construir:",
  "mail.welcome.cta": "Abrir el panel",
  "mail.recovery.subject": "{app} — Recuperar contraseña",
  "mail.recovery.preheader": "Restablece tu contraseña.",
  "mail.recovery.heading": "Restablecer contraseña",
  "mail.recovery.intro":
    "Recibimos una solicitud para restablecer tu contraseña. Pulsa el botón para elegir una nueva:",
  "mail.recovery.cta": "Restablecer contraseña",
  "mail.recovery.expiry": "Este enlace caduca en {minutes} minutos.",
  "mail.recovery.ignore": "Si no lo solicitaste, puedes ignorar este correo.",
  "mail.verify.subject": "{app} — Confirma tu email",
  "mail.verify.preheader": "Confirma tu dirección de correo.",
  "mail.verify.heading": "Confirma tu email",
  "mail.verify.intro": "Pulsa el botón para confirmar esta dirección en tu cuenta de {app}:",
  "mail.verify.cta": "Confirmar email",
  "mail.verify.expiry": "Este enlace caduca en {minutes} minutos.",
  "mail.verify.ignore": "Si no creaste una cuenta, puedes ignorar este correo.",
};

/**
 * Registra los correos del sistema y sus traducciones.
 * Se llama una vez al arrancar; es idempotente.
 */
export function registerSystemMails(mailer: Mailer): void {
  mailer
    .registerAll([welcomeMail, recoveryMail, verificationMail])
    .addTranslations("en", EN)
    .addTranslations("es", ES);
}
