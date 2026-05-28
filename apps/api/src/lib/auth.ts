/**
 * Better-Auth Configuration
 *
 * Initializes Better-Auth with the Drizzle adapter (PostgreSQL),
 * credentials provider, and session-based authentication.
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
// @ts-ignore - Path alias
import { db } from "../db";
// @ts-ignore - Path alias
import { authUsers, authSessions, authAccounts, authVerifications } from "../db/schema";

// Build trusted origins dynamically from environment
function buildTrustedOrigins(): string[] {
    const origins = new Set<string>();

    // Always trust the API itself
    const authUrl = process.env.BETTER_AUTH_URL || "http://localhost:3001";
    origins.add(authUrl);

    // Admin panel
    const adminUrl = process.env.ADMIN_URL || "http://localhost:5173";
    origins.add(adminUrl);

    // Web frontend (if configured)
    const webUrl = process.env.WEB_URL || "http://localhost:4321";
    origins.add(webUrl);

    // ALLOWED_ORIGINS from config (comma-separated)
    const allowedOrigins = process.env.ALLOWED_ORIGINS;
    if (allowedOrigins) {
        allowedOrigins.split(",").forEach((o) => origins.add(o.trim()));
    }

    // Common dev ports as fallbacks
    if (process.env.NODE_ENV !== "production") {
        origins.add("http://localhost:3000");
        origins.add("http://localhost:3001");
        origins.add("http://localhost:5173");
        origins.add("http://localhost:4321");
    }

    return Array.from(origins).filter(Boolean);
}

// Better-Auth plugin context types
interface AuthContext {
    path: string;
    response?: {
        user?: {
            id: string;
            email: string;
            name?: string;
        };
    };
}

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg",
        schema: {
            user: authUsers,
            session: authSessions,
            account: authAccounts,
            verification: authVerifications,
        },
    }),

    // Base path matches the Hono mount point
    basePath: "/api/auth",

    // Session configuration
    session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24,      // Update session every 24 hours
        cookieCache: {
            enabled: true,
            maxAge: 60 * 5, // 5 minutes
        },
    },

    // Auth providers
    emailAndPassword: {
        enabled: true,
        minPasswordLength: 8,
    },

    // Social & Enterprise OAuth Providers (conditional)
    socialProviders: {
        ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET && {
            github: {
                clientId: process.env.GITHUB_CLIENT_ID,
                clientSecret: process.env.GITHUB_CLIENT_SECRET,
            },
        }),
        ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && {
            google: {
                clientId: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            },
        }),
        ...(process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET && {
            microsoft: {
                clientId: process.env.AZURE_AD_CLIENT_ID,
                clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
                tenantId: process.env.AZURE_AD_TENANT_ID || "common",
            },
        }),
    },

    // User fields
    user: {
        additionalFields: {
            role: {
                type: "string",
                required: false,
                defaultValue: "user",
                input: false,
            },
        },
    },

    // Trusted origins — built dynamically from environment
    trustedOrigins: buildTrustedOrigins(),

    // Lifecycle Hooks — Emit events for Workers/Functions to react to
    plugins: [
        {
            id: "gremius-hooks",
            hooks: {
                after: [
                    {
                        matcher: (context: AuthContext) => context.path === "/sign-up/email",
                        handler: async (ctx: AuthContext) => {
                            try {
                                if (ctx.response?.user) {
                                    const { hooks } = await import("./events");
                                    hooks.emit("auth:register", ctx.response.user);
                                }
                            } catch {
                                // Non-fatal: event emission failure should not break auth
                            }
                        },
                    } as unknown as { matcher: (context: unknown) => boolean; handler: (ctx: unknown) => Promise<void> },
                ],
            },
        },
    ],
});

export type Session = typeof auth.$Infer.Session;
