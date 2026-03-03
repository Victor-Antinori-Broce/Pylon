import { createMiddleware } from 'hono/factory';
import { auth } from '../lib/auth';

export const protectRoute = createMiddleware(async (c, next) => {
    const session = await auth.api.getSession({
        headers: c.req.raw.headers
    });

    if (!session) {
        return c.json({ error: "Unauthorized" }, 401);
    }

    // Inject user/session into context
    c.set('user', session.user);
    c.set('session', session.session);

    await next();
});
