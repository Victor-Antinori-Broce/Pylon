/**
 * Authentication Middleware
 * 
 * Provides route protection and role-based access control for API routes.
 */

import { createMiddleware } from 'hono/factory';

import { auth } from '../lib/auth';
// @ts-ignore - Type import used for JSDoc/context typing

/**
 * Middleware to require authentication
 * Injects user and session into context
 */
export const requireAuth = createMiddleware(async (c, next) => {
    const session = await auth.api.getSession({
        headers: c.req.raw.headers
    });

    if (!session) {
        return c.json({ error: "Unauthorized - Authentication required" }, 401);
    }

    // Inject user/session into context
    c.set('user', session.user);
    c.set('session', session.session);

    await next();
});

/**
 * Middleware factory to require specific roles
 * @param allowedRoles - Array of roles that are allowed to access the route
 */
export const requireRole = (allowedRoles: string[]) => createMiddleware(async (c, next) => {
    const session = await auth.api.getSession({
        headers: c.req.raw.headers
    });

    if (!session) {
        return c.json({ error: "Unauthorized - Authentication required" }, 401);
    }

    const user = session.user;
    const userRole = (user?.role as string) || 'user';

    if (!allowedRoles.includes(userRole)) {
        return c.json({ 
            error: "Forbidden - Insufficient permissions",
            required: allowedRoles,
            current: userRole
        }, 403) as unknown as Response;
    }

    // Inject user/session into context
    c.set('user', user);
    c.set('session', session.session);

    await next();
});

/**
 * Optional auth middleware - sets user if available but doesn't reject
 */
export const optionalAuth = createMiddleware(async (c, next) => {
    const session = await auth.api.getSession({
        headers: c.req.raw.headers
    });

    if (session) {
        c.set('user', session.user);
        c.set('session', session.session);
    }

    await next();
});
