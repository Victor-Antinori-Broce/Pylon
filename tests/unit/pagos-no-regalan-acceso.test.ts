/**
 * Pagos: ningún evento sin cobrar da acceso (auditoría 2026-10-25)
 * ============================================================================
 *
 *   · PayPal: `APPROVAL_PENDING` era `trialing` (da acceso) y CREATED llega al
 *     abrir el checkout. Ahora es `incomplete`.
 *   · Lemon Squeezy: en `subscription_payment_*` el recurso es la FACTURA; se
 *     usaba su id como suscripción → fila huérfana `active` para siempre.
 *   · Un estado que no se reconoce ya no se da por `active`.
 *   · Stripe: un checkout con pago asíncrono sin cobrar no da acceso.
 */
import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { estadoTrasEvento } from "../../packages/kons/kon-payments/payments.service";
import type { PaymentEvent } from "../../packages/kons/kon-payments/payments.types";
import { lemonSqueezyProvider } from "../../packages/kons/kon-payments/providers/lemonsqueezy";
import { stripeProvider } from "../../packages/kons/kon-payments/providers/stripe";

const evento = (type: PaymentEvent["type"], status?: PaymentEvent["status"]) =>
  ({ type, status, provider: "x", externalId: "e", metadata: {}, occurredAt: "", raw: {} }) as unknown as PaymentEvent;

describe("estadoTrasEvento", () => {
  it("un estado desconocido no da acceso; un cobro sí", () => {
    expect(estadoTrasEvento(evento("subscription.created"))).toBe("incomplete");
    expect(estadoTrasEvento(evento("subscription.updated", "incomplete"))).toBe("incomplete");
    expect(estadoTrasEvento(evento("subscription.payment_succeeded"))).toBe("active");
    expect(estadoTrasEvento(evento("subscription.created", "active"))).toBe("active");
  });
});

describe("Lemon Squeezy", () => {
  const ls = lemonSqueezyProvider({ LEMONSQUEEZY_WEBHOOK_SECRET: "secreto" } as NodeJS.ProcessEnv);
  const firmar = (cuerpo: string) => createHmac("sha256", "secreto").update(cuerpo).digest("hex");

  it("el cobro de una renovación apunta a la SUSCRIPCIÓN, no a la factura", async () => {
    const cuerpo = JSON.stringify({
      meta: { event_name: "subscription_payment_success", custom_data: { userId: "u1" } },
      data: { id: "factura-99", attributes: { subscription_id: 1234, status: "paid", updated_at: "2026-10-25" } },
    });
    const ev = (await ls.parseWebhook(cuerpo, { "x-signature": firmar(cuerpo) })) as PaymentEvent;
    expect(ev.subscriptionId).toBe("1234");
    expect(estadoTrasEvento(ev)).toBe("active");
  });
});

describe("Stripe", () => {
  const stripe = stripeProvider({ STRIPE_WEBHOOK_SECRET: "whsec" } as NodeJS.ProcessEnv);
  const enviar = (objeto: Record<string, unknown>) => {
    const cuerpo = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: objeto } });
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", "whsec").update(`${t}.${cuerpo}`).digest("hex");
    return stripe.parseWebhook(cuerpo, { "stripe-signature": `t=${t},v1=${v1}` }) as Promise<PaymentEvent>;
  };

  it("checkout sin cobrar → incomplete; cobrado → active", async () => {
    const base = { object: "checkout.session", subscription: "sub_1", metadata: { userId: "u1" } };
    expect(estadoTrasEvento(await enviar({ ...base, payment_status: "unpaid" }))).toBe("incomplete");
    expect(estadoTrasEvento(await enviar({ ...base, payment_status: "paid" }))).toBe("active");
  });
});
