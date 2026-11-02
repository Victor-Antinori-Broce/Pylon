/**
 * Kitsuden - Structured Logging
 *
 * Pino-based logger with context support for tracing requests
 * and structured log output for production monitoring.
 *
 * NOTE: pino-pretty is NOT used via transport (incompatible with Bun bundler).
 * In development, we use pino's built-in formatters for readable output.
 * In production, structured JSON logs are emitted for Grafana/Loki/etc.
 */

import pino from "pino";

import { getTraceLogFields } from "./tracing";
import { nodeEnvCrudo } from "./entorno";

const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const NODE_ENV = nodeEnvCrudo() || "development";
const isDev = NODE_ENV === "development";

// Base logger instance
// In production: structured JSON (machine-readable for Loki/Grafana)
// In development: still JSON but with timestamp and readable level
//
// Práctica #1 (Structured Logging) + #5 (Log-Trace Correlation): cada log lleva
// campos estándar (timestamp ISO, level, service_name, message) y, vía el mixin,
// el trace_id/span_id del request activo (AsyncLocalStorage) SIN pasarlos a mano.
export const logger = pino({
  level: LOG_LEVEL,
  base: {
    service_name: "kitsuden-api",
    service: "kitsuden-api", // compat con logs previos
    version: "0.9.0-beta",
    env: NODE_ENV,
  },
  // ISO 8601 con zona (UTC) tanto en dev como prod para consultas/agregación.
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label: string) {
      return { level: label.toUpperCase() };
    },
  },
  // Inyecta trace_id/span_id/requestId del contexto activo en cada línea.
  mixin() {
    return getTraceLogFields();
  },
  // Red por si alguien loguea una petición o un objeto con credenciales: hoy
  // ningún log las lleva, pero nada lo impedía (auditoría 2026-10-25).
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "headers.authorization",
      "headers.cookie",
      "*.password",
      "*.token",
      "*.apiKey",
      "*.secret",
      "*.plainApiKey",
      "password",
      "token",
      "plainApiKey",
    ],
    censor: "[redacted]",
  },
});

// Create child logger with request context
export function createRequestLogger(requestId: string, userId?: string) {
  return logger.child({
    requestId,
    userId: userId || "anonymous",
    type: "request",
  });
}

// Performance logger
export function createPerformanceLogger(operation: string) {
  const startTime = Date.now();

  return {
    finish: (metadata?: Record<string, unknown>) => {
      const duration = Date.now() - startTime;
      logger.info(
        {
          operation,
          duration,
          type: "performance",
          ...metadata,
        },
        `${operation} completed in ${duration}ms`
      );
    },
    error: (error: Error, metadata?: Record<string, unknown>) => {
      const duration = Date.now() - startTime;
      logger.error(
        {
          operation,
          duration,
          error: error.message,
          type: "performance-error",
          ...metadata,
        },
        `${operation} failed after ${duration}ms`
      );
    },
  };
}

// Database query logger
export function logQuery(sql: string, params: unknown[], duration: number, error?: Error) {
  const logData = {
    type: "query",
    sql: sql.substring(0, 200),
    paramsCount: params.length,
    duration,
    slow: duration > 1000,
  };

  if (error) {
    logger.error({ ...logData, error: error.message }, "Query failed");
  } else if (duration > 1000) {
    logger.warn(logData, "Slow query detected");
  } else {
    logger.debug(logData, "Query executed");
  }
}

// Security event logger
export function logSecurity(
  event: string,
  details: {
    userId?: string;
    ip?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }
) {
  logger.warn(
    {
      type: "security",
      event,
      ...details,
    },
    `Security: ${event}`
  );
}

export default logger;
