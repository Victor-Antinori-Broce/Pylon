/**
 * GremiusCMS - Centralized Configuration
 *
 * Type-safe configuration management with validation
 * and environment-based defaults.
 */
import { z } from "zod";
// Detect environment early for conditional validation
const isProduction = process.env.NODE_ENV === "production";
// Environment schema validation
const envSchema = z.object({
    // Server
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.string().transform(Number).default("3001"),
    // Database
    DATABASE_URL: z.string().min(1),
    // Redis/Valkey
    REDIS_URL: z.string().default("redis://localhost:6379"),
    // Storage (S3/MinIO)
    S3_ENDPOINT: z.string().default("http://localhost:9000"),
    S3_BUCKET: z.string().default("gremius-media"),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_PUBLIC_URL: z.string().default("http://localhost:9000"),
    S3_REGION: z.string().default("us-east-1"),
    // Auth — In production: NO default (must be explicitly set)
    //        In development: allows a known dev secret for convenience
    BETTER_AUTH_SECRET: isProduction
        ? z.string().min(32)
        : z.string().min(32).default("dev-better-auth-secret-gremiuscms-change-in-production-32"),
    BETTER_AUTH_URL: z.string().default("http://localhost:3001"),
    // URLs
    ADMIN_URL: z.string().default("http://localhost:5173"),
    WEB_URL: z.string().default("http://localhost:4321"),
    // Security
    ALLOWED_ORIGINS: z.string().transform((s) => s.split(",")).default("http://localhost:3001,http://localhost:5173"),
    // Rate Limiting
    RATE_LIMIT_ENABLED: z.string().transform((s) => s === "true").default("true"),
    RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default("900000"), // 15 minutes
    RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default("100"),
    RATE_LIMIT_AUTH_MAX: z.string().transform(Number).default("20"),
    // Logging
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    // Features
    ENABLE_SWAGGER: z.string().transform((s) => s === "true").default("true"),
    ENABLE_MCP: z.string().transform((s) => s === "true").default("true"),
});
// Parse and validate environment
function loadConfig() {
    try {
        return envSchema.parse(process.env);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            const issues = error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
            console.error(`\nConfiguration validation failed (NODE_ENV=${process.env.NODE_ENV || "undefined"}):\n${issues}\n`);
            if (isProduction) {
                console.error("HINT: In production, BETTER_AUTH_SECRET must be explicitly set (min 32 chars).\n" +
                    "Generate one with: openssl rand -base64 48\n");
            }
            process.exit(1);
        }
        throw error;
    }
}
export const config = loadConfig();
// Feature flags based on config
export const features = {
    isDevelopment: config.NODE_ENV === "development",
    isProduction: config.NODE_ENV === "production",
    isTest: config.NODE_ENV === "test",
    swaggerEnabled: config.ENABLE_SWAGGER,
    mcpEnabled: config.ENABLE_MCP,
    rateLimitEnabled: config.RATE_LIMIT_ENABLED,
    // Database has pgvector (detected at runtime)
    pgvector: false, // Set at startup
};
// Rate limiting configuration
export const rateLimitConfig = {
    enabled: config.RATE_LIMIT_ENABLED,
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    maxRequests: config.RATE_LIMIT_MAX_REQUESTS,
    authMax: config.RATE_LIMIT_AUTH_MAX,
    // Skip rate limiting for health checks
    skipPaths: ["/api/health", "/api/health/pgvector", "/api/system/init-check"],
};
// CORS configuration
export const corsConfig = {
    origins: config.ALLOWED_ORIGINS,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    headers: ["Content-Type", "Authorization"],
    credentials: true,
};
export default config;
//# sourceMappingURL=config.js.map