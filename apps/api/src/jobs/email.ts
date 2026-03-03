/**
 * GremiusCMS — Email Worker (Fail-Safe)
 *
 * Processes jobs from the gremius-email queue.
 *
 * TWO MODES:
 *   🟢 Live Mode  — SMTP credentials exist → sends real emails via nodemailer
 *   🟡 Mock Mode  — No SMTP credentials    → logs to console, job succeeds
 *
 * NEVER crashes if SMTP is missing. This is by design.
 */

import { createWorker, type EmailJobData } from "../lib/queue";
import type { Job } from "bullmq";

// ── SMTP Config Detection ──
function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || `GremiusCMS <noreply@${host || "localhost"}>`;
  const secure = process.env.SMTP_SECURE === "true";

  const isConfigured = !!(host && user && pass);

  return { host, port, user, pass, from, secure, isConfigured };
}

// ── Lazy nodemailer transporter (only created if SMTP exists) ──
let _transporter: any = null;

async function getTransporter() {
  if (_transporter) return _transporter;

  const smtp = getSmtpConfig();
  if (!smtp.isConfigured) return null;

  try {
    const nodemailer = await import("nodemailer");
    _transporter = nodemailer.default.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: smtp.user,
        pass: smtp.pass,
      },
    });

    await _transporter.verify();
    console.log("  📧 SMTP connection verified");

    return _transporter;
  } catch (err: any) {
    console.warn(`  ⚠️  SMTP connection failed: ${err.message} — falling back to Mock Mode`);
    _transporter = null;
    return null;
  }
}

// ── Email Templates ──
const templates: Record<string, (data: any) => { subject: string; html: string; text: string }> = {
  "send-welcome": (data) => ({
    subject: `Welcome to GremiusCMS, ${data.name || "Admin"}!`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <span style="font-size: 32px; font-weight: 800; color: #00E5FF;">⚡ GremiusCMS</span>
        </div>
        <h2 style="color: #1a1a2e;">Welcome aboard, ${data.name || "Admin"}!</h2>
        <p style="color: #444; line-height: 1.6;">
          Your GremiusCMS instance is ready. You've been set up as the <strong>Super Admin</strong>.
        </p>
        <p style="color: #444; line-height: 1.6;">
          Head to your admin panel to start building:
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${process.env.ADMIN_URL || "http://localhost:5173"}"
             style="background: #00E5FF; color: #0a0a12; padding: 12px 32px; border-radius: 8px;
                    text-decoration: none; font-weight: 700; display: inline-block;">
            Open Admin Panel →
          </a>
        </div>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">
          This email was sent by your GremiusCMS instance. If you didn't create this account, you can safely ignore this.
        </p>
      </div>
    `,
    text: `Welcome to GremiusCMS, ${data.name || "Admin"}! Your admin account is ready. Visit ${process.env.ADMIN_URL || "http://localhost:5173"} to get started.`,
  }),

  "send-recovery": (data) => ({
    subject: "GremiusCMS — Password Recovery",
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <span style="font-size: 32px; font-weight: 800; color: #00E5FF;">⚡ GremiusCMS</span>
        </div>
        <h2 style="color: #1a1a2e;">Password Reset</h2>
        <p style="color: #444; line-height: 1.6;">
          We received a request to reset your password. Click below to set a new one:
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${data.resetUrl || "#"}"
             style="background: #FF2A6D; color: #fff; padding: 12px 32px; border-radius: 8px;
                    text-decoration: none; font-weight: 700; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="color: #999; font-size: 13px;">
          This link expires in 1 hour. If you didn't request this, ignore this email.
        </p>
      </div>
    `,
    text: `Password reset requested for GremiusCMS. Visit ${data.resetUrl || "#"} to set a new password. Link expires in 1 hour.`,
  }),
};

// ── The Processor ──
async function processEmailJob(job: Job<EmailJobData & { name?: string; resetUrl?: string }>) {
  const { to, subject: rawSubject, html: rawHtml, text: rawText } = job.data;

  let subject = rawSubject;
  let html = rawHtml;
  let text = rawText || "";

  const template = templates[job.name];
  if (template) {
    const rendered = template(job.data);
    subject = rendered.subject;
    html = rendered.html;
    text = rendered.text;
  }

  const smtp = getSmtpConfig();

  // ═══ SCENARIO A: Live Mode ═══
  if (smtp.isConfigured) {
    const transporter = await getTransporter();
    if (transporter) {
      const info = await transporter.sendMail({
        from: smtp.from,
        to,
        subject,
        html,
        text,
      });
      console.log(`  📧 [SENT] To: ${to} | Subject: ${subject} | MessageId: ${info.messageId}`);
      return { sent: true, messageId: info.messageId };
    }
  }

  // ═══ SCENARIO B: Mock Mode ═══
  const divider = "─".repeat(52);
  console.log(`\n${divider}`);
  console.log(`  📧 [MOCK EMAIL] — No SMTP configured, logging instead`);
  console.log(`  To:      ${to}`);
  console.log(`  Subject: ${subject}`);
  console.log(`  Job:     ${job.name} (#${job.id})`);
  console.log(`${divider}\n`);

  return { sent: false, mock: true };
}

// ── Registration ──
export function registerEmailWorker() {
  const smtp = getSmtpConfig();
  const mode = smtp.isConfigured ? "🟢 Live (SMTP)" : "🟡 Mock (Console)";
  console.log(`  📧 Email Worker: ${mode}`);

  if (!smtp.isConfigured) {
    console.log(`     ℹ️  Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env for real emails`);
  }

  return createWorker("gremius-email", processEmailJob, { concurrency: 2 });
}
