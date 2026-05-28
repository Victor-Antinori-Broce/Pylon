/**
 * Protect Route Middleware
 *
 * Supports both:
 * 1. Human authentication (Better-Auth cookies)
 * 2. Agent authentication (grm_agent_ API keys)
 *
 * Priority: Agent > Human (for API routes that support both)
 */
export declare const protectRoute: import("hono").MiddlewareHandler<any, string, {}, Response | (Response & import("hono").TypedResponse<{
    error: string;
    message: string;
}, 401, "json">)>;
/**
 * Require Admin Middleware
 * Checks for admin role (users) or appropriate scopes (agents)
 */
export declare const requireAdmin: import("hono").MiddlewareHandler<any, string, {}, Response | (Response & import("hono").TypedResponse<{
    error: string;
    message: string;
}, 403, "json">)>;
/**
 * Require Scope Middleware (for agent-specific routes)
 */
export declare const requireScope: (scope: string) => import("hono").MiddlewareHandler<any, string, {}, Response | (Response & import("hono").TypedResponse<{
    error: string;
    message: string;
}, 403, "json">)>;
//# sourceMappingURL=auth-guard.d.ts.map