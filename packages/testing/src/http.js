/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * HTTP TEST CLIENT - Make requests to grimoire routers
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { Hono } from "hono";
/**
 * Create HTTP test client for making requests to grimoires
 */
export function createTestHttpClient(grimoires, context) {
    const requestContext = {
        headers: {}
    };
    // Combine all grimoire routers into one app
    const app = new Hono();
    for (const [id, grimoire] of Object.entries(grimoires)) {
        const mountPath = grimoire.definition.mountPath || `/api/${id.replace(/^grimoire-/, "")}`;
        app.route(mountPath, grimoire.router);
    }
    // Middleware to inject test context
    app.use("*", async (c, next) => {
        if (requestContext.user) {
            c.set("user", requestContext.user);
            c.set("testUser", requestContext.user);
        }
        if (requestContext.token) {
            c.set("token", requestContext.token);
        }
        await next();
    });
    const client = {
        asUser: (userIdOrUser) => {
            if (typeof userIdOrUser === "string") {
                // Look up user from fixtures or create mock
                requestContext.user = {
                    id: userIdOrUser,
                    email: `${userIdOrUser}@test.com`,
                    name: `Test User ${userIdOrUser}`,
                    role: "user"
                };
            }
            else {
                requestContext.user = userIdOrUser;
            }
            return client;
        },
        withToken: (token) => {
            requestContext.token = token;
            requestContext.headers["Authorization"] = `Bearer ${token}`;
            return client;
        },
        withHeaders: (headers) => {
            Object.assign(requestContext.headers, headers);
            return client;
        },
        get: async (path) => {
            return makeRequest(app, "GET", path, null, requestContext.headers);
        },
        post: async (path, body) => {
            return makeRequest(app, "POST", path, body, requestContext.headers);
        },
        patch: async (path, body) => {
            return makeRequest(app, "PATCH", path, body, requestContext.headers);
        },
        put: async (path, body) => {
            return makeRequest(app, "PUT", path, body, requestContext.headers);
        },
        delete: async (path) => {
            return makeRequest(app, "DELETE", path, null, requestContext.headers);
        }
    };
    return client;
}
/**
 * Execute a request against the Hono app
 */
async function makeRequest(app, method, path, body, headers) {
    // Build request
    const url = new URL(path, "http://localhost");
    const requestInit = {
        method,
        headers: {
            "Content-Type": "application/json",
            ...headers
        }
    };
    if (body && method !== "GET") {
        requestInit.body = JSON.stringify(body);
    }
    const request = new Request(url.toString(), requestInit);
    // Execute request
    const response = await app.fetch(request);
    // Parse response
    const responseBody = await parseResponseBody(response);
    return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseBody,
        json: async () => responseBody,
        text: async () => typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody)
    };
}
/**
 * Parse response body based on content type
 */
async function parseResponseBody(response) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        try {
            return await response.json();
        }
        catch {
            return await response.text();
        }
    }
    return await response.text();
}
export default { createTestHttpClient };
//# sourceMappingURL=http.js.map