/**
 * Webhook In Action Handler
 *
 * Handles incoming webhook requests.
 * Validates signatures, parses requests, and executes associated actions.
 */
import { createHmac, timingSafeEqual } from "crypto";
export async function executeWebhookInAction(action, context, 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
_webhookRequest) {
    const startTime = Date.now();
    const config = action.config;
    // Validate authentication if configured
    if (config.authType === "hmac") {
        const isValid = validateHmacSignature(_webhookRequest, { secret: config.secret });
        if (!isValid) {
            return {
                success: false,
                error: "Invalid signature",
                durationMs: Date.now() - startTime,
            };
        }
    }
    if (config.authType === "bearer") {
        const isValid = validateBearerToken(_webhookRequest, { secret: config.secret });
        if (!isValid) {
            return {
                success: false,
                error: "Invalid authorization",
                durationMs: Date.now() - startTime,
            };
        }
    }
    // For incoming webhooks, we just validate and store the request
    // The actual processing is done by the event system or can trigger other actions
    return {
        success: true,
        result: {
            received: true,
            event: context.event,
            timestamp: new Date().toISOString(),
        },
        durationMs: Date.now() - startTime,
    };
}
function validateHmacSignature(request, config) {
    if (!config.secret)
        return true; // No secret configured, skip validation
    const signatureHeader = request.headers["x-signature"] ||
        request.headers["x-hub-signature-256"] ||
        request.headers["x-gremius-signature"];
    if (!signatureHeader)
        return false;
    const body = typeof request.body === "string"
        ? request.body
        : JSON.stringify(request.body);
    const expectedSignature = createHmac("sha256", config.secret)
        .update(body)
        .digest("hex");
    // Extract signature from header (format: "sha256=abc123" or just "abc123")
    const providedSignature = signatureHeader.includes("=")
        ? signatureHeader.split("=")[1]
        : signatureHeader;
    try {
        const providedBuffer = Buffer.from(providedSignature, "hex");
        const expectedBuffer = Buffer.from(expectedSignature, "hex");
        if (providedBuffer.length !== expectedBuffer.length) {
            return false;
        }
        return timingSafeEqual(providedBuffer, expectedBuffer);
    }
    catch {
        return false;
    }
}
function validateBearerToken(request, config) {
    if (!config.secret)
        return true;
    const authHeader = request.headers["authorization"] || "";
    const token = authHeader.replace("Bearer ", "").trim();
    return token === config.secret;
}
//# sourceMappingURL=webhook-in-handler.js.map