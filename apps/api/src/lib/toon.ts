/**
 * GremiusCMS — TOON Encoder & Middleware
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

// ── TOON MIME type ─────────────────────────────────────────────
export const TOON_MIME = "application/vnd.toon";

// ── Encoder ────────────────────────────────────────────────────

/**
 * Flatten a nested JS value into TOON key:value lines.
 * Arrays use bracket notation: items[0].name:foo
 * Objects use dot notation: user.email:test@example.com
 * Null/undefined are omitted.
 */
function flattenToLines(
    data: unknown,
    prefix = "",
    lines: string[] = []
): string[] {
    if (data === null || data === undefined) return lines;

    if (Array.isArray(data)) {
        for (let i = 0; i < data.length; i++) {
            flattenToLines(data[i], `${prefix}[${i}]`, lines);
        }
        return lines;
    }

    if (typeof data === "object" && data !== null) {
        for (const [key, value] of Object.entries(data)) {
            const path = prefix ? `${prefix}.${key}` : key;
            flattenToLines(value, path, lines);
        }
        return lines;
    }

    // Primitive value
    lines.push(`${prefix}:${String(data)}`);
    return lines;
}

/**
 * Encode any JS value into TOON format.
 * - Single objects get flattened into key:value lines
 * - Arrays of objects are separated by ---
 * - Adds a ~type hint at the top when possible
 */
export function encodeTOON(data: unknown): string {
    if (data === null || data === undefined) return "";

    // Unwrap common API envelope: { data: [...] } or { data: {...} }
    const payload =
        typeof data === "object" &&
            data !== null &&
            "data" in data &&
            Object.keys(data).length <= 3
            ? (data as Record<string, unknown>).data
            : data;

    // Handle array of records
    if (Array.isArray(payload)) {
        const parts: string[] = [];
        for (const item of payload) {
            const lines = flattenToLines(item);
            parts.push(lines.join("\n"));
        }
        return parts.join("\n---\n") + "\n";
    }

    // Single object
    if (typeof payload === "object" && payload !== null) {
        const lines = flattenToLines(payload);
        return lines.join("\n") + "\n";
    }

    // Primitive
    return String(payload) + "\n";
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
        const wantsToon =
            acceptHeader.includes(TOON_MIME) || formatParam === "toon";

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
                    "X-Gremius-Format": "toon",
                },
            });
        } catch {
            // If JSON parsing fails, leave the response unchanged
        }
    };
}
