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
export declare const TOON_MIME = "application/vnd.toon";
/**
 * Encode any JS value into TOON format.
 * - Single objects get flattened into key:value lines
 * - Arrays of objects are separated by ---
 * - Adds a ~type hint at the top when possible
 */
export declare function encodeTOON(data: unknown): string;
/**
 * Content-negotiation middleware for TOON.
 * Intercepts responses and transforms JSON → TOON when the client
 * sends `Accept: application/vnd.toon` or `?format=toon`.
 *
 * Standard clients (Vue/Astro) are unaffected — they receive JSON
 * as usual.
 */
export declare function toonMiddleware(): MiddlewareHandler;
//# sourceMappingURL=toon.d.ts.map