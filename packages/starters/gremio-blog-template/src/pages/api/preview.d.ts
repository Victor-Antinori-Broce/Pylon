/**
 * SSR API Endpoint for MDX/Markdown Live Preview
 *
 * Receives raw Markdown/MDX payload from the Admin panel's MdxEditor
 * and compiles it into HTML using `marked`.
 *
 * Supports CORS so the admin panel at localhost:5173 can fetch freely.
 */
import type { APIRoute } from "astro";
export declare const POST: APIRoute;
//# sourceMappingURL=preview.d.ts.map