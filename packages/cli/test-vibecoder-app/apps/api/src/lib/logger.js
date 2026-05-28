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
import pino from "pino";
const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const NODE_ENV = process.env.NODE_ENV || "development";
const isDev = NODE_ENV === "development";
// Base logger instance
// In production: structured JSON (machine-readable for Loki/Grafana)
// In development: still JSON but with timestamp and readable level
export const logger = pino({
    level: LOG_LEVEL,
    base: {
        service: "gremius-api",
        version: "0.7.0-beta",
        env: NODE_ENV,
    },
    // Human-readable timestamps in dev, ISO in prod
    timestamp: isDev
        ? () => `,"time":"${new Date().toLocaleTimeString()}"`
        : pino.stdTimeFunctions.isoTime,
    // In dev, use a simpler serializer for readability
    formatters: {
        level(label) {
            return { level: label };
        },
    },
});
// Create child logger with request context
export function createRequestLogger(requestId, userId) {
    return logger.child({
        requestId,
        userId: userId || "anonymous",
        type: "request",
    });
}
// Performance logger
export function createPerformanceLogger(operation) {
    const startTime = Date.now();
    return {
        finish: (metadata) => {
            const duration = Date.now() - startTime;
            logger.info({
                operation,
                duration,
                type: "performance",
                ...metadata,
            }, `${operation} completed in ${duration}ms`);
        },
        error: (error, metadata) => {
            const duration = Date.now() - startTime;
            logger.error({
                operation,
                duration,
                error: error.message,
                type: "performance-error",
                ...metadata,
            }, `${operation} failed after ${duration}ms`);
        },
    };
}
// Database query logger
export function logQuery(sql, params, duration, error) {
    const logData = {
        type: "query",
        sql: sql.substring(0, 200),
        paramsCount: params.length,
        duration,
        slow: duration > 1000,
    };
    if (error) {
        logger.error({ ...logData, error: error.message }, "Query failed");
    }
    else if (duration > 1000) {
        logger.warn(logData, "Slow query detected");
    }
    else {
        logger.debug(logData, "Query executed");
    }
}
// Security event logger
export function logSecurity(event, details) {
    logger.warn({
        type: "security",
        event,
        ...details,
    }, `Security: ${event}`);
}
export default logger;
//# sourceMappingURL=logger.js.map