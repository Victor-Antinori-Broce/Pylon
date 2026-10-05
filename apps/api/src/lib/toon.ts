/**
 * Kitsuden — TOON Encoder & Middleware
 *
 * TOON (Token-Optimized Object Notation) is a compact, line-based format
 * designed for AI/LLM consumers that minimizes token usage vs JSON.
 *
 * Format:
 *   ~type:course
 *   id:abc-123
 *   title:Intro to TypeScript
 *   topics[0].id:t1
 *   topics[0].title:Variables
 *   ---
 *
 * Content negotiation:
 *   Accept: application/vnd.toon  →  TOON response
 *   Accept: application/json      →  standard JSON (default)
 *   ?format=toon (query param)    →  TOON response
 */

import { type MiddlewareHandler } from "hono";

import { encodeToon } from "./toon-tabular";

// ── TOON MIME type ─────────────────────────────────────────────
export const TOON_MIME = "application/vnd.toon";

// Re-export the canonical codec for consumers (SDK, tests).
export { encodeToon, decodeToon } from "./toon-tabular";

// ── Encoder ────────────────────────────────────────────────────

/**
 * Encode any JS value into TOON (Token-Oriented Object Notation), tabular form.
 *
 * Delegates to the canonical `encodeToon` (lib/toon-tabular.ts), which declares
 * object-array keys once and emits CSV rows — the token-saving shape. This
 * wrapper only unwraps the common `{ data: ... }` API envelope first so that a
 * list response encodes as a clean tabular block instead of a single-key object.
 */
export function encodeTOON(data: unknown): string {
  if (data === null || data === undefined) return "";

  // Unwrap common API envelope: { data: [...] } or { data: {...} }
  const payload =
    typeof data === "object" && data !== null && "data" in data && Object.keys(data).length <= 3
      ? (data as Record<string, unknown>).data
      : data;

  return encodeToon(payload);
}

// ── Hono Middleware ────────────────────────────────────────────

/**
 * Content-negotiation middleware for TOON.
 * Intercepts responses and transforms JSON → TOON when the client
 * sends `Accept: application/vnd.toon` or `?format=toon`.
 *
 * Standard clients (Vue/Astro) are unaffected — they receive JSON
 * as usual.
 */
export function toonMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    // Check if client wants TOON
    const acceptHeader = c.req.header("accept") || "";
    const formatParam = c.req.query("format");
    const wantsToon = acceptHeader.includes(TOON_MIME) || formatParam === "toon";

    if (!wantsToon) {
      // Standard request — pass through unchanged
      return next();
    }

    // Execute the handler normally
    await next();

    // Only transform JSON responses
    const contentType = c.res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return;

    try {
      // Clone and read the original JSON body
      const original = await c.res.json();

      // Encode as TOON
      const toonBody = encodeTOON(original);

      // Replace the response
      c.res = new Response(toonBody, {
        status: c.res.status,
        headers: {
          "Content-Type": TOON_MIME,
          "X-Kitsuden-Format": "toon",
        },
      });
    } catch {
      // If JSON parsing fails, leave the response unchanged
    }
  };
}
