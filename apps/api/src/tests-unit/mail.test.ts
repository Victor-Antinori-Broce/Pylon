import { existsSync } from "node:fs";
/**
 * Mail — Mailables, drivers, outbox y localización
 * ============================================================================
 *
 * Antes NO había forma de asertar "se envió el correo de bienvenida" sin tocar
 * SMTP. Esto es el equivalente a `Mail::fake()` de Laravel y a
 * `django.core.mail.outbox`: el driver de memoria captura los mensajes y se
 * asiertan sin red.
 */

import {
  Mailer,
  layout,
  heading,
  paragraph,
  button,
  htmlToText,
  memoryDriver,
  type Mailable,
} from "@kitsuden/engine";
import { describe, expect, test, beforeEach } from "bun:test";

interface WelcomeData {
  to: string;
  name: string;
}

const welcome: Mailable<WelcomeData> = {
  name: "welcome",
  envelope: (d, ctx) => ({
    to: d.to,
    subject: ctx.t("greeting", { name: d.name }),
    cc: "audit@example.com",
    tag: "onboarding",
  }),
  content: (d, ctx) => ({
    html: layout({
      appName: ctx.appName,
      body: heading(`Hola ${d.name}`) + paragraph("Bienvenido") + button("Entrar", ctx.appUrl),
    }),
  }),
};

const withAttachment: Mailable<{ to: string }> = {
  name: "invoice",
  envelope: (d) => ({ to: d.to, subject: "Tu factura" }),
  content: () => ({ html: "<p>Adjunta va la factura.</p>" }),
  attachments: () => [
    { filename: "factura.pdf", content: "PDF-DATA", contentType: "application/pdf" },
  ],
};

function newMailer() {
  const m = new Mailer({
    driver: memoryDriver(),
    from: { address: "no-reply@kitsuden.dev", name: "Kitsuden" },
    appName: "Kitsuden",
    appUrl: "https://app.kitsuden.dev",
    defaultLocale: "en",
    translations: {
      en: { greeting: "Welcome, {name}" },
      es: { greeting: "Bienvenido, {name}" },
    },
  });
  m.register(welcome).register(withAttachment);
  return m;
}

let mailer: Mailer;
beforeEach(() => {
  mailer = newMailer();
});

describe("registro de Mailables (lo que usa un kon)", () => {
  test("register / has / list", () => {
    expect(mailer.has("welcome")).toBe(true);
    expect(mailer.list()).toEqual(["invoice", "welcome"]);
  });

  test("enviar un Mailable no registrado LANZA (error de programación)", async () => {
    await expect(mailer.send("noExiste", {})).rejects.toThrow(/no está registrado/);
  });

  test("un 'kon' puede registrar el suyo después del arranque", async () => {
    mailer.register({
      name: "crm.deal-won",
      envelope: (d: any) => ({ to: d.to, subject: "Trato ganado" }),
      content: () => ({ html: "<p>🎉</p>" }),
    });
    const r = await mailer.send("crm.deal-won", { to: "sales@example.com" });
    expect(r.ok).toBe(true);
    mailer.assertSent("crm.deal-won");
  });
});

describe("envelope: to/cc/from/tag", () => {
  test("usa el from por defecto cuando el Mailable no lo declara", async () => {
    const r = await mailer.send("welcome", { to: "a@b.com", name: "Ada" });
    expect(r.message.from).toBe("Kitsuden <no-reply@kitsuden.dev>");
  });

  test("cc y tag llegan al mensaje", async () => {
    const r = await mailer.send("welcome", { to: "a@b.com", name: "Ada" });
    expect(r.message.cc).toEqual(["audit@example.com"]);
    expect(r.message.tag).toBe("onboarding");
  });

  test("sin destinatarios no se envía", async () => {
    mailer.register({
      name: "vacio",
      envelope: () => ({ to: [], subject: "x" }),
      content: () => ({ html: "x" }),
    });
    const r = await mailer.send("vacio", {});
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Sin destinatarios");
  });
});

describe("localización", () => {
  test("traduce según el locale e interpola variables", async () => {
    const en = await mailer.send("welcome", { to: "a@b.com", name: "Ada" });
    expect(en.message.subject).toBe("Welcome, Ada");

    const es = await mailer.send("welcome", { to: "a@b.com", name: "Ada" }, "es");
    expect(es.message.subject).toBe("Bienvenido, Ada");
    expect(es.message.locale).toBe("es");
  });

  test("locale desconocido cae al default, no a vacío", async () => {
    const r = await mailer.send("welcome", { to: "a@b.com", name: "Ada" }, "fr");
    expect(r.message.subject).toBe("Welcome, Ada");
  });

  test("clave sin traducción devuelve la clave (nunca string vacío)", () => {
    mailer.register({
      name: "sinTrad",
      envelope: (_d, ctx) => ({ to: "a@b.com", subject: ctx.t("clave.inexistente") }),
      content: () => ({ html: "x" }),
    });
    expect(mailer.render("sinTrad", {}).subject).toBe("clave.inexistente");
  });
});

describe("contenido", () => {
  test("deriva text/plain del HTML si no se da (evita penalización de spam)", async () => {
    const r = await mailer.send("welcome", { to: "a@b.com", name: "Ada" });
    expect(r.message.text.length).toBeGreaterThan(0);
    expect(r.message.text).toContain("Hola Ada");
    expect(r.message.text).not.toContain("<");
  });

  test("htmlToText conserva el destino de los enlaces", () => {
    const text = htmlToText('<a href="https://x.dev/reset">Entrar</a>');
    expect(text).toContain("https://x.dev/reset");
  });

  test("escapa datos del usuario (defensa contra inyección de HTML)", () => {
    const msg = mailer.render("welcome", { to: "a@b.com", name: "<script>alert(1)</script>" });
    expect(msg.html).not.toContain("<script>");
    expect(msg.html).toContain("&lt;script&gt;");
  });

  test("button rechaza URLs peligrosas", () => {
    expect(button("Click", "javascript:alert(1)")).toContain('href="#"');
    expect(button("Click", "https://ok.dev")).toContain('href="https://ok.dev"');
  });
});

describe("adjuntos", () => {
  test("viajan en el mensaje", async () => {
    const r = await mailer.send("invoice", { to: "a@b.com" });
    expect(r.message.attachments).toHaveLength(1);
    expect(r.message.attachments[0].filename).toBe("factura.pdf");
  });
});

describe("fake() + outbox + aserciones", () => {
  test("assertSent / assertNotSent", async () => {
    mailer.fake();
    await mailer.send("welcome", { to: "ada@example.com", name: "Ada" });

    mailer.assertSent("welcome");
    mailer.assertNotSent("invoice");
    expect(() => mailer.assertSent("invoice")).toThrow(/Se esperaba que se enviara/);
  });

  test("assertSent con predicado", async () => {
    mailer.fake();
    await mailer.send("welcome", { to: "ada@example.com", name: "Ada" });

    mailer.assertSent("welcome", (m) => m.subject.includes("Ada"));
    expect(() => mailer.assertSent("welcome", (m) => m.subject.includes("Bob"))).toThrow(
      /predicado/
    );
  });

  test("assertSentTo ignora el formato 'Nombre <email>'", async () => {
    mailer.fake();
    mailer.register({
      name: "conNombre",
      envelope: () => ({ to: { address: "ada@example.com", name: "Ada L." }, subject: "x" }),
      content: () => ({ html: "x" }),
    });
    await mailer.send("conNombre", {});
    mailer.assertSentTo("conNombre", "ada@example.com");
  });

  test("assertSentCount", async () => {
    mailer.fake();
    await mailer.send("welcome", { to: "a@b.com", name: "A" });
    await mailer.send("welcome", { to: "c@d.com", name: "C" });

    mailer.assertSentCount("welcome", 2);
    expect(() => mailer.assertSentCount("welcome", 1)).toThrow(/se esperaban 1/i);
  });

  test("el outbox conserva el orden y se puede limpiar", async () => {
    mailer.fake();
    await mailer.send("welcome", { to: "a@b.com", name: "A" });
    await mailer.send("invoice", { to: "a@b.com" });

    expect(mailer.sent().map((m) => m.mailable)).toEqual(["welcome", "invoice"]);
    mailer.clearSent();
    expect(mailer.sent()).toHaveLength(0);
  });

  test("restore() devuelve el driver real", () => {
    const before = mailer.driverName;
    mailer.fake();
    mailer.restore();
    expect(mailer.driverName).toBe(before);
  });
});

describe("resiliencia", () => {
  test("un driver que falla NO lanza: devuelve ok:false", async () => {
    const m = newMailer();
    m.setDriver({
      name: "roto",
      async send() {
        throw new Error("SMTP caído");
      },
    });

    const r = await m.send("welcome", { to: "a@b.com", name: "Ada" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("SMTP caído");
    // El mensaje renderizado sigue disponible para diagnóstico.
    expect(r.message.subject).toBe("Welcome, Ada");
  });
});

describe("render() sin enviar (preview del admin)", () => {
  test("devuelve el mensaje completo sin tocar el driver", () => {
    const msg = mailer.render("welcome", { to: "a@b.com", name: "Ada" }, "es");
    expect(msg.subject).toBe("Bienvenido, Ada");
    expect(msg.html).toContain("<!doctype html>");
    expect(mailer.sent()).toHaveLength(0); // no se envió nada
  });
});

// kon-crm es un kon INSTALABLE (repo kitsuden-kons): sin él, esta prueba no
// tiene a quién probar y se salta, en vez de fallar el clon limpio del núcleo.
const CRM_MAILS = new URL("../../../../packages/kons/kon-crm/crm.mails.ts", import.meta.url);

describe("un kon aporta sus propios correos (requisito de plugins)", () => {
  test.skipIf(!existsSync(CRM_MAILS))("kon-crm registra su Mailable y sus traducciones en el Mailer compartido", async () => {
    const { registerCrmMails } = await import(CRM_MAILS.href);

    const m = new Mailer({
      driver: memoryDriver(),
      from: "no-reply@kitsuden.dev",
      appName: "Kitsuden",
      appUrl: "https://app.kitsuden.dev",
      defaultLocale: "en",
    });

    // El kon solo recibe el Mailer — no toca el host ni la config del correo.
    registerCrmMails(m);
    expect(m.has("crm.deal-won")).toBe(true);

    const r = await m.send("crm.deal-won", {
      to: "sales@example.com",
      dealName: "ACME anual",
      amount: "12.000 €",
      companyName: "ACME",
      dealUrl: "https://app.kitsuden.dev/crm/deals/1",
    });

    expect(r.ok).toBe(true);
    m.assertSentTo("crm.deal-won", "sales@example.com");
    // Usa el layout compartido del engine, no HTML propio duplicado.
    expect(r.message.html).toContain("<!doctype html>");
    expect(r.message.subject).toBe("Deal won: ACME anual");

    // Y sus traducciones también funcionan.
    const es = m.render(
      "crm.deal-won",
      { to: "x@y.z", dealName: "ACME anual", amount: "12.000 €", companyName: "ACME" },
      "es"
    );
    expect(es.subject).toBe("Trato ganado: ACME anual");
  });
});
