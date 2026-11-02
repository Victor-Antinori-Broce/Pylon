/**
 * Webhook SES/SNS del boletín: solo se aceptan avisos de TU tema
 * ============================================================================
 *
 * Auditoría 2026-10-25: la firma de SNS solo prueba que AWS envió el mensaje,
 * no que el tema sea el tuyo. Cualquiera con una cuenta de AWS publicaba en su
 * tema «quejas» con direcciones de tu lista y las daba de baja. Ahora sin
 * `SES_TOPIC_ARN` el adaptador no está configurado, y un mensaje de otro tema
 * se rechaza (antes incluso de mirar la firma no se sigue nada).
 */

import { describe, expect, it } from "vitest";

import { sesFeedback } from "../../packages/kons/kon-newsletter/feedback/ses";

describe("sesFeedback", () => {
  it("sin SES_TOPIC_ARN no está configurado", () => {
    expect(sesFeedback({ SES_FEEDBACK_ENABLED: "true" }).isConfigured()).toBe(false);
    expect(
      sesFeedback({ SES_FEEDBACK_ENABLED: "true", SES_TOPIC_ARN: "arn:aws:sns:eu-west-1:1:mio" }).isConfigured()
    ).toBe(true);
  });

  it("un sobre sin firma válida o de otro tema se rechaza", async () => {
    const ses = sesFeedback({ SES_FEEDBACK_ENABLED: "true", SES_TOPIC_ARN: "arn:aws:sns:eu-west-1:1:mio" });
    const sobre = {
      Type: "Notification",
      TopicArn: "arn:aws:sns:eu-west-1:666:del-atacante",
      Message: JSON.stringify({ notificationType: "Complaint", complaint: { complainedRecipients: [{ emailAddress: "v@x.com" }] } }),
      Signature: "AAAA",
      SigningCertURL: "https://example.com/cert.pem",
    };
    expect(await ses.parse(JSON.stringify(sobre), {})).toBeNull();
  });
});
