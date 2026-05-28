/**
 * Authentication Middleware
 *
 * Provides route protection and role-based access control for API routes.
 */
/**
 * Middleware to require authentication
 * Injects user and session into context
 */
export declare const requireAuth: import("hono").MiddlewareHandler<any, string, {}, Response | (Response & import("hono").TypedResponse<{
    error: string;
}, 401, "json">)>;
/**
 * Middleware factory to require specific roles
 * @param allowedRoles - Array of roles that are allowed to access the route
 */
export declare const requireRole: (allowedRoles: string[]) => import("hono").MiddlewareHandler<any, string, {}, Response>;
/**
 * Optional auth middleware - sets user if available but doesn't reject
 */
export declare const optionalAuth: import("hono").MiddlewareHandler<any, string, {}, Response>;
//# sourceMappingURL=auth.d.ts.map