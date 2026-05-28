/**
 * GremiusCMS - Structured Logging
 *
 * Pino-based logger with context support for tracing requests
 * and structured log output for production monitoring.
 *
 * NOTE: pino-pretty is NOT used via transport (incompatible with Bun bundler).
 * In development, we use pino's built-in formatters for readable output.
 * In production, structured JSON logs are emitted for Grafana/Loki/etc.
 */
export declare const logger: any;
export declare function createRequestLogger(requestId: string, userId?: string): any;
export declare function createPerformanceLogger(operation: string): {
    finish: (metadata?: Record<string, unknown>) => void;
    error: (error: Error, metadata?: Record<string, unknown>) => void;
};
export declare function logQuery(sql: string, params: unknown[], duration: number, error?: Error): void;
export declare function logSecurity(event: string, details: {
    userId?: string;
    ip?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
}): void;
export default logger;
//# sourceMappingURL=logger.d.ts.map