/**
 * GremiusCMS - Centralized Configuration
 *
 * Type-safe configuration management with validation
 * and environment-based defaults.
 */
export declare const config: {
    DATABASE_URL: string;
    NODE_ENV: "production" | "development" | "test";
    PORT: number;
    REDIS_URL: string;
    S3_ENDPOINT: string;
    S3_BUCKET: string;
    S3_ACCESS_KEY: string;
    S3_SECRET_KEY: string;
    S3_PUBLIC_URL: string;
    S3_REGION: string;
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;
    ADMIN_URL: string;
    WEB_URL: string;
    ALLOWED_ORIGINS: string[];
    RATE_LIMIT_ENABLED: boolean;
    RATE_LIMIT_WINDOW_MS: number;
    RATE_LIMIT_MAX_REQUESTS: number;
    RATE_LIMIT_AUTH_MAX: number;
    LOG_LEVEL: "debug" | "info" | "warn" | "error";
    ENABLE_SWAGGER: boolean;
    ENABLE_MCP: boolean;
};
export declare const features: {
    isDevelopment: boolean;
    isProduction: boolean;
    isTest: boolean;
    swaggerEnabled: boolean;
    mcpEnabled: boolean;
    rateLimitEnabled: boolean;
    pgvector: boolean;
};
export declare const rateLimitConfig: {
    enabled: boolean;
    windowMs: number;
    maxRequests: number;
    authMax: number;
    skipPaths: string[];
};
export declare const corsConfig: {
    origins: string[];
    methods: string[];
    headers: string[];
    credentials: boolean;
};
export default config;
//# sourceMappingURL=config.d.ts.map