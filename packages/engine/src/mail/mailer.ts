/**
 * Kitsuden — Mail: el Mailer
 * ============================================================================
 *
 * Junta las piezas: registro de Mailables (incluidos los de kons), drivers
 * intercambiables, localización y el modo `fake()` para tests.
 *
 *   mail.register(welcomeMail);              // un kon registra el suyo
 *   await mail.send("welcome", { name });    // enviar
 *
 *   mail.fake();                             // en tests
 *   mail.assertSent("welcome", m => m.to.includes("a@b.com"));
 *
 * El Mailer es una CLASE con una instancia por defecto exportada. La clase
 * permite tener mailers aislados en tests concurrentes; la instancia por
 * defecto es la que usa la app.
 */

import { driverFromEnv, memoryDriver, type MemoryDriver } from "./drivers";
import { htmlToText } from "./templates";
import {
  addressEmail,
  formatAddress,
  type Address,
  type MailContext,
  type MailDriver,
  type Mailable,
  type SentMessage,
} from "./types";

export interface MailerOptions {
  driver?: MailDriver;
  /** Remitente por defecto si el Mailable no especifica uno. */
  from?: Address;
  appName?: string;
  appUrl?: string;
  defaultLocale?: string;
  /** Traducciones: `{ es: { "mail.greeting": "Hola" } }`. */
  translations?: Record<string, Record<string, string>>;
}

/** Resultado de un envío. */
export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  message: SentMessage;
}

const asArray = (v: Address | Address[] | undefined): Address[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

export class Mailer {
  private mailables = new Map<string, Mailable<any>>();
  private driver: MailDriver;
  private options: Required<Omit<MailerOptions, "driver" | "from">> & { from: Address };
  /** Driver real, guardado mientras `fake()` está activo. */
  private realDriver: MailDriver | null = null;

  constructor(options: MailerOptions = {}) {
    this.driver = options.driver ?? driverFromEnv();
    this.options = {
      from: options.from ?? process.env.MAIL_FROM ?? "noreply@localhost",
      appName: options.appName ?? process.env.APP_NAME ?? "Kitsuden",
      appUrl: options.appUrl ?? process.env.APP_URL ?? "http://localhost:3000",
      defaultLocale: options.defaultLocale ?? process.env.MAIL_LOCALE ?? "en",
      translations: options.translations ?? {},
    };
  }

  // ── Registro (lo que permite que un kon aporte sus correos) ─────────────

  /**
   * Registra un Mailable. Un kon llama a esto en su hook de arranque y sus
   * correos quedan disponibles para toda la app — sin tocar el host.
   */
  register<T>(mailable: Mailable<T>): this {
    if (this.mailables.has(mailable.name)) {
      console.warn(`  ⚠️  Mailable "${mailable.name}" se está re-registrando`);
    }
    this.mailables.set(mailable.name, mailable);
    return this;
  }

  /** Registra varios de una vez. */
  registerAll(mailables: Mailable<any>[]): this {
    for (const m of mailables) this.register(m);
    return this;
  }

  has(name: string): boolean {
    return this.mailables.has(name);
  }

  /** Nombres registrados (para diagnóstico y para el admin). */
  list(): string[] {
    return Array.from(this.mailables.keys()).sort();
  }

  // ── Localización ──────────────────────────────────────────────────────────

  /** Añade/mezcla traducciones de un locale (un kon puede aportar las suyas). */
  addTranslations(locale: string, entries: Record<string, string>): this {
    this.options.translations[locale] = {
      ...(this.options.translations[locale] ?? {}),
      ...entries,
    };
    return this;
  }

  private contextFor(locale?: string): MailContext {
    const active = locale ?? this.options.defaultLocale;
    const dict = this.options.translations[active] ?? {};
    const fallback = this.options.translations[this.options.defaultLocale] ?? {};

    return {
      locale: active,
      appUrl: this.options.appUrl,
      appName: this.options.appName,
      t: (key, vars) => {
        // locale activo → locale por defecto → la propia clave (nunca vacío)
        let out = dict[key] ?? fallback[key] ?? key;
        if (vars) {
          for (const [k, v] of Object.entries(vars)) {
            out = out.replaceAll(`{${k}}`, String(v));
          }
        }
        return out;
      },
    };
  }

  // ── Render + envío ────────────────────────────────────────────────────────

  /** Renderiza sin enviar — útil para previsualizar en el admin y para tests. */
  render<T>(name: string, data: T, locale?: string): SentMessage {
    const mailable = this.mailables.get(name);
    if (!mailable) {
      throw new Error(
        `Mailable "${name}" no está registrado. Disponibles: ${this.list().join(", ") || "(ninguno)"}`
      );
    }

    const ctx = this.contextFor(locale);
    const envelope = mailable.envelope(data, ctx);
    const content = mailable.content(data, ctx);
    const attachments = mailable.attachments?.(data, ctx) ?? [];

    const html = content.html ?? "";
    // Sin text/plain los filtros de spam penalizan: se deriva siempre.
    const text = content.text ?? htmlToText(html);

    return {
      mailable: name,
      to: asArray(envelope.to).map(formatAddress),
      from: formatAddress(envelope.from ?? this.options.from),
      cc: asArray(envelope.cc).map(formatAddress),
      bcc: asArray(envelope.bcc).map(formatAddress),
      replyTo: envelope.replyTo ? formatAddress(envelope.replyTo) : undefined,
      subject: envelope.subject,
      html,
      text,
      attachments,
      headers: envelope.headers ?? {},
      locale: ctx.locale,
      tag: envelope.tag,
      sentAt: new Date().toISOString(),
    };
  }

  /**
   * Envía un Mailable.
   *
   * NO lanza si el driver falla: devuelve `{ ok: false, error }`. Un correo
   * caído no debe tumbar la operación que lo originó (un alta de usuario no
   * puede fallar porque el SMTP esté saturado). Quien necesite el fallo
   * explícito revisa `result.ok`.
   */
  async send<T>(name: string, data: T, locale?: string): Promise<SendResult> {
    // `render` SÍ propaga, a diferencia del envío: un Mailable no registrado es
    // un error de programación, no una incidencia de correo, y no debe acabar
    // camuflado en un `{ ok: false }` junto a los fallos recuperables.
    // (Esto era un `try { ... } catch (err) { throw err }`, que hacía justo
    // esto mismo con más ruido.)
    const message: SentMessage = this.render(name, data, locale);

    if (message.to.length === 0) {
      return { ok: false, error: "Sin destinatarios", message };
    }

    try {
      const { messageId } = await this.driver.send(message);
      return { ok: true, messageId, message: { ...message, messageId } };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);

      console.error(`  ✉️  Fallo al enviar "${name}": ${error}`);
      return { ok: false, error, message };
    }
  }

  // ── Driver ────────────────────────────────────────────────────────────────

  setDriver(driver: MailDriver): this {
    this.driver = driver;
    return this;
  }

  get driverName(): string {
    return this.driver.name;
  }

  /** Verifica la conexión del driver (si la soporta). */
  async verify(): Promise<boolean> {
    return this.driver.verify ? this.driver.verify() : true;
  }

  // ── Testing (Mail::fake de Laravel + outbox de Django) ────────────────────

  private get outbox(): SentMessage[] {
    const mem = this.driver as MemoryDriver;
    if (!mem.outbox) {
      throw new Error("mail.fake() no está activo — llama a mail.fake() primero.");
    }
    return mem.outbox;
  }

  /**
   * Sustituye el driver por el de memoria: nada sale a la red y todo queda en
   * el outbox para asertar. Guarda el driver real para restaurarlo.
   */
  fake(): this {
    if (!this.realDriver) this.realDriver = this.driver;
    this.driver = memoryDriver();
    return this;
  }

  /** Restaura el driver real y vacía el outbox. */
  restore(): this {
    if (this.realDriver) {
      this.driver = this.realDriver;
      this.realDriver = null;
    }
    return this;
  }

  /** Todos los mensajes capturados (el `mail.outbox` de Django). */
  sent(name?: string): SentMessage[] {
    const all = this.outbox;
    return name ? all.filter((m) => m.mailable === name) : all;
  }

  clearSent(): this {
    (this.driver as MemoryDriver).clear?.();
    return this;
  }

  /** ¿Se envió este Mailable (y opcionalmente cumpliendo un predicado)? */
  wasSent(name: string, predicate?: (m: SentMessage) => boolean): boolean {
    const matches = this.sent(name);
    return predicate ? matches.some(predicate) : matches.length > 0;
  }

  /** Aserción: lanza con contexto útil si no se envió. */
  assertSent(name: string, predicate?: (m: SentMessage) => boolean): void {
    if (this.wasSent(name, predicate)) return;
    const enviados = this.outbox.map((m) => m.mailable);
    throw new Error(
      predicate
        ? `Se esperaba "${name}" cumpliendo el predicado, pero ninguno coincide. Enviados: [${enviados.join(", ")}]`
        : `Se esperaba que se enviara "${name}". Enviados: [${enviados.join(", ") || "ninguno"}]`
    );
  }

  /** Aserción inversa. */
  assertNotSent(name: string): void {
    if (this.sent(name).length === 0) return;
    throw new Error(
      `No se esperaba enviar "${name}", pero se envió ${this.sent(name).length} vez/veces.`
    );
  }

  /** Aserción de cantidad. */
  assertSentCount(name: string, expected: number): void {
    const actual = this.sent(name).length;
    if (actual !== expected) {
      throw new Error(`Se esperaban ${expected} envíos de "${name}", hubo ${actual}.`);
    }
  }

  /** Aserción de destinatario, sin importar el formato "Nombre <a@b>". */
  assertSentTo(name: string, email: string): void {
    this.assertSent(name, (m) =>
      m.to.some((t) => addressEmail(t).toLowerCase().includes(email.toLowerCase()))
    );
  }
}

/** Instancia por defecto — la que usa la app. */
export const mail = new Mailer();
