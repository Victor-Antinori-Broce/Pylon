import { createMiddleware } from 'hono/factory';
import { auth } from '../lib/auth';
/**
 * Protect Route Middleware
 *
 * Supports both:
 * 1. Human authentication (Better-Auth cookies)
 * 2. Agent authentication (grm_agent_ API keys)
 *
 * Priority: Agent > Human (for API routes that support both)
 */
export const protectRoute = createMiddleware(async (c, next) => {
    // 1. Check if already authenticated as agent (from main auth middleware)
    const agent = c.get("agent");
    if (agent) {
        // Agent is already authenticated in main middleware
        await next();
        return;
    }
    // 2. Check if already authenticated as user (from main auth middleware)
    const user = c.get("user");
    if (user) {
        // User is already authenticated
        await next();
        return;
    }
    // 3. Try Better-Auth session
    const session = await auth.api.getSession({
        headers: c.req.raw.headers
    });
    if (session) {
        c.set('user', session.user);
        c.set('session', session.session);
        await next();
        return;
    }
    // 4. No authentication found
    return c.json({
        error: "Unauthorized",
        message: "Valid session or agent API key required"
    }, 401);
});
/**
 * Require Admin Middleware
 * Checks for admin role (users) or appropriate scopes (agents)
 */
export const requireAdmin = createMiddleware(async (c, next) => {
    const user = c.get("user");
    const agent = c.get("agent");
    // Human admin
    if (user && user.role === "admin") {
        await next();
        return;
    }
    // Agent with admin scope
    if (agent && agent.scopes.includes("admin")) {
        await next();
        return;
    }
    return c.json({
        error: "Forbidden",
        message: "Admin access required"
    }, 403);
});
/**
 * Require Scope Middleware (for agent-specific routes)
 */
export const requireScope = (scope) => createMiddleware(async (c, next) => {
    const agent = c.get("agent");
    if (!agent) {
        return c.json({
            error: "Forbidden",
            message: "Agent authentication required"
        }, 403);
    }
    if (!agent.scopes.includes(scope) && !agent.scopes.includes("admin")) {
        return c.json({
            error: "Forbidden",
            message: `Scope '${scope}' required`,
            granted: agent.scopes
        }, 403);
    }
    await next();
});
//# sourceMappingURL=auth-guard.js.map