/**
 * Better-Auth Configuration
 *
 * Initializes Better-Auth with the Drizzle adapter (PostgreSQL),
 * credentials provider, and session-based authentication.
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import { authUsers, authSessions, authAccounts, authVerifications } from "../db/schema";

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
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Social & Enterprise OAuth Providers (Condicionales)
    // ═══════════════════════════════════════════════════════════════════════
    socialProviders: {
        // GitHub - Para desarrolladores (solo si está configurado)
        ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET && {
            github: {
                clientId: process.env.GITHUB_CLIENT_ID,
                clientSecret: process.env.GITHUB_CLIENT_SECRET,
            },
        }),
        // Google - Para usuarios generales (solo si está configurado)
        ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && {
            google: {
                clientId: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            },
        }),
        // Microsoft (Azure AD) - Para clientes empresariales B2B (solo si está configurado)
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
                input: false, // don't allow setting via signup
            },
        },
    },

    // Trusted origins (for CORS / cookies)
    trustedOrigins: [
        "http://localhost:4321",
        "http://localhost:5173",
        process.env.ADMIN_URL || "http://localhost:5173",
        process.env.WEB_URL || "http://localhost:4321",
    ],

    // plugins: [
    //     {
    //         id: "gremius-hooks",
    //         hooks: {
    //             after: {
    //                 signUp: async (ctx) => {
    //                     if (ctx.response && (ctx.response as any).user) {
    //                         const { hooks } = await import("./events");
    //                         hooks.emit("auth:register", (ctx.response as any).user);
    //                     }
    //                 }
    //             }
    //         }
    //     }
    // ]
});

export type Session = typeof auth.$Infer.Session;
