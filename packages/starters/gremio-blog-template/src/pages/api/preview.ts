/**
 * SSR API Endpoint for MDX/Markdown Live Preview
 *
 * Receives raw Markdown/MDX payload from the Admin panel's MdxEditor
 * and compiles it into HTML using `marked`.
 *
 * Supports CORS so the admin panel at localhost:5173 can fetch freely.
 */

import type { APIRoute } from "astro";
import { marked } from "marked";

export const POST: APIRoute = async ({ request }) => {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
        return new Response(null, {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
        });
    }

    try {
        const body = await request.json();
        const content = body.content || "";

        // Parse Markdown to HTML
        // We use marked for speed in the live preview.
        // Astro's internal MDX compiler is too heavy to run dynamically on every keystroke.
        const html = await marked.parse(content, { async: true });

        return new Response(JSON.stringify({ html }), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
        });
    } catch (error: any) {
        console.error("Preview compiler error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
        });
    }
};
