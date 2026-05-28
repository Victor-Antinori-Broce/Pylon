/**
 * GremiusCMS — Grimoire API (Contratos para Grimoires Autocontenidos)
 *
 * Este módulo define las abstracciones que permiten a los grimoires
 * ser completamente independientes del core de la aplicación.
 *
 * Los grimoires reciben un contexto inyectado en lugar de importar
 * dependencias directamente desde apps/api/src/
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FLUJO DE INYECCIÓN:
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   1. Module Loader (apps/api/src/lib/module-loader.ts)
 *      ↓ Crea contexto con todas las dependencias
 *   2. GrimoireContext (interface)
 *      ↓ Inyectado a cada grimoire
 *   3. createGrimoireRouter() (factory)
 *      ↓ Retorna router Hono configurado
 *   4. Montado en /api/{grimoire-id}
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EJEMPLO DE USO:
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   // En un grimoire:
 *   export const grimoire = {
 *     id: "blog",
 *     createRouter: (ctx: GrimoireContext) => {
 *       const router = new Hono();
 *       
 *       router.get("/", async (c) => {
 *         const posts = await ctx.db.select().from(blogPosts);
 *         return c.json(posts);
 *       });
 *       
 *       return router;
 *     }
 *   };
 */

import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { ZodTypeAny } from "zod";

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS DE DEPENDENCIAS (Abstracciones)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Abstracción de caché para grimoires
 */
export interface GrimoireCache {
  /** Obtener valor del caché */
  get<T = any>(key: string): Promise<T | null>;
  /** Guardar valor en caché con TTL opcional (segundos) */
  set<T = any>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  /** Invalidar caché por patrón (ej: "blog:*") */
  invalidate(pattern: string): Promise<void>;
}

/**
 * Abstracción de eventos para grimoires
 */
export interface GrimoireEvents {
  /** Emitir evento para workers/webhooks */
  emit(event: string, data: unknown): void;
  /** Escuchar evento (para procesamiento interno) */
  on(event: string, handler: (data: unknown) => void): void;
}

/**
 * Abstracción de realtime para grimoires
 */
export interface GrimoireRealtime {
  /** Broadcast mensaje a todos los clientes conectados */
  broadcast(channel: string, message: unknown): void;
  /** Enviar a usuario específico */
  sendToUser(userId: string, message: unknown): void;
}

/**
 * Abstracción de autenticación para grimoires
 */
export interface GrimoireAuth {
  /** Middleware que requiere autenticación */
  requireAuth: MiddlewareHandler;
  /** Middleware que requiere roles específicos */
  requireRole: (roles: string[]) => MiddlewareHandler;
  /** Middleware opcional (setea usuario si existe) */
  optionalAuth: MiddlewareHandler;
  /** Obtener sesión actual del request */
  getSession(headers: Headers): Promise<{ user: any; session: any } | null>;
}

/**
 * Abstracción de almacenamiento (S3/MinIO) para grimoires
 */
export interface GrimoireStorage {
  /** Generar URL firmada para subida */
  getSignedUploadUrl(key: string, contentType: string, expiresIn?: number): Promise<string>;
  /** Generar URL pública/firmada para descarga */
  getSignedDownloadUrl(key: string, expiresIn?: number): Promise<string>;
  /** Eliminar objeto */
  delete(key: string): Promise<void>;
}

/**
 * Abstracción de base de datos para grimoires
 * 
 * NOTA: En lugar de abstraer todo Drizzle, proporcionamos
 * la instancia directa ya que los grimoires definen sus propios schemas.
 */
export interface GrimoireDatabase {
  /** Instancia de Drizzle */
  instance: any;
  /** Helper para ejecutar SQL crudo */
  execute(sql: string): Promise<any>;
  /** Verificar si tabla existe */
  tableExists(tableName: string): Promise<boolean>;
}

/**
 * Abstracción de Content Publishing para grimoires
 * 
 * Permite promover datos de cualquier fuente a Content Targets
 * (Blog, Documentation, Shop, etc.) que son provistos por grimoires primarios.
 */

/** Fuente de datos para promoción de contenido */
export type PromotionSource = {
  type: "dataset" | "grimoire";
  grimoireId?: string;
  table?: string;
  recordId: string;
  data: Record<string, any>;
};

/** Opciones de promoción de contenido */
export interface PromotionOptions {
  title?: string;
  slug?: string;
  autoPublish?: boolean;
  scheduledAt?: Date;
  authorId?: string;
  targetConfig?: Record<string, any>;
}

/** Datos para promover contenido a un target */
export interface PromotionData {
  source: PromotionSource;
  options: PromotionOptions;
}

/** Resultado de publicación de contenido */
export interface PublishResult {
  contentId: string;
  targetId: string;
  slug: string;
  url: string;
  status: string;
  createdAt: Date;
}

export interface ContentTargetInfo {
  id: string;
  name: string;
  grimoireId: string;
  capabilities: {
    supportsSeo: boolean;
    supportsScheduling: boolean;
    supportsEditorial: boolean;
    supportsTaxonomy: boolean;
    supportsMedia: boolean;
  };
}

export interface ContentTarget {
  id: string;
  name: string;
  grimoireId: string;
  capabilities: ContentTargetInfo["capabilities"];
  publish(data: PromotionData, ctx: GrimoireContext): Promise<PublishResult>;
  getPublishedUrl(result: PublishResult): string;
  unpublish?(contentId: string, ctx: GrimoireContext): Promise<void>;
}

export interface GrimoireContentPublishing {
  /** Obtener todos los targets disponibles */
  getAvailableTargets(): ContentTargetInfo[];

  /** Verificar si un target está disponible */
  hasTarget(targetId: string): boolean;

  /**
   * Registrar un Content Target (usado por grimoires primarios)
   */
  register(target: ContentTarget): void;

  /**
   * Desregistrar un Content Target (usado por grimoires primarios)
   */
  unregister(targetId: string): void;

  /**
   * Promover contenido a un target
   * @throws Error si el target no existe
   */
  promote(targetId: string, data: PromotionData): Promise<PublishResult>;

  /** Despublicar contenido */
  unpublish(targetId: string, contentId: string): Promise<void>;

  /** Obtener URL pública de contenido promovido */
  getPublishedUrl(targetId: string, result: PublishResult): string;
}

/**
 * Contexto completo inyectado a cada grimoire
 */
export interface GrimoireContext {
  /** Base de datos (Drizzle) */
  db: GrimoireDatabase;
  /** Caché (Valkey/Redis) */
  cache: GrimoireCache;
  /** Sistema de eventos */
  events: GrimoireEvents;
  /** Realtime/WebSockets */
  realtime: GrimoireRealtime;
  /** Autenticación */
  auth: GrimoireAuth;
  /** Almacenamiento de archivos */
  storage: GrimoireStorage;
  /** Content Publishing API */
  contentPublishing: GrimoireContentPublishing;
  /** Logger estructurado */
  logger: {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
    debug(message: string, meta?: Record<string, unknown>): void;
  };
  /** Configuración del sitio */
  config: {
    siteName: string;
    siteUrl: string;
    environment: "development" | "production" | "test";
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORIES Y HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tipo para función creadora de routers
 */
export type GrimoireRouterFactory = (ctx: GrimoireContext) => Hono;

/**
 * Interface completa de un Grimoire autocontenido
 */
export interface GrimoireDefinition {
  /** ID único del grimoire */
  id: string;
  /** Nombre para mostrar */
  name: string;
  /** Versión semver */
  version: string;
  /** Descripción */
  description?: string;
  /** Icono (nombre de Lucide) */
  icon?: string;
  
  /** 
   * Es un grimoire primario que provee capacidades al framework.
   * Ejemplos: Blog (provee Content Target), Auth (provee autenticación)
   */
  primary?: boolean;
  
  /**
   * Puede ser desactivado por el usuario.
   * Los grimoires primarios típicamente son opcionales.
   */
  optional?: boolean;
  
  /** Factory que crea el router con contexto inyectado */
  createRouter: GrimoireRouterFactory;
  
  /** Tablas que administra (para introspección) */
  tables?: string[];
  
  /** Hooks de ciclo de vida */
  hooks?: {
    /** Llamado cuando el grimoire se habilita */
    onEnable?: (ctx: GrimoireContext) => Promise<void>;
    /** Llamado cuando el grimoire se deshabilita */
    onDisable?: (ctx: GrimoireContext) => Promise<void>;
    /** Llamado en cada startup (para migraciones) */
    onStartup?: (ctx: GrimoireContext) => Promise<void>;
  };
  
  /** Configuración de admin UI */
  admin?: {
    /** Categoría en el sidebar */
    category?: "core" | "content" | "data" | "system" | "esports";
    /** Vistas disponibles */
    views?: Array<{
      id: string;
      type: "grid" | "kanban" | "calendar" | "custom";
      title: string;
      table?: string;
    }>;
  };
  
  /** Dependencias */
  dependencies?: {
    /** IDs de grimoires requeridos */
    grimoires?: string[];
    /** Feature flags de core requeridos */
    core?: string[];
  };
  
  /** Mount point (default: /api/{id}) */
  mountPath?: string;
  
  /**
   * OpenAPI specification for auto-generated documentation.
   * When provided, endpoints will be documented at /api/docs/openapi.json
   */
  openApi?: GrimoireOpenApiSpec;
}

// ═══════════════════════════════════════════════════════════════════════════
// OPENAPI SUPPORT FOR GRIMOIRES
// ═══════════════════════════════════════════════════════════════════════════

/** HTTP methods supported in OpenAPI paths */
export type OpenApiMethod = "get" | "post" | "put" | "patch" | "delete" | "head" | "options";

/** OpenAPI path definition for a single endpoint */
export interface GrimoireOpenApiPath {
  /** HTTP method */
  method: OpenApiMethod;
  /** Path relative to grimoire mount (e.g., "/posts" or "/posts/:id") */
  path: string;
  /** Short summary (e.g., "List all posts") */
  summary: string;
  /** Detailed description (supports Markdown) */
  description?: string;
  /** Operation ID for code generation (auto-generated if not provided) */
  operationId?: string;
  /** Tags for grouping in documentation */
  tags?: string[];
  /** Path parameters schema */
  params?: ZodTypeAny;
  /** Query parameters schema */
  query?: ZodTypeAny;
  /** Request body schema */
  body?: ZodTypeAny;
  /** Response schemas by status code */
  responses: Record<number, {
    description: string;
    schema: ZodTypeAny;
  }>;
  /** Whether authentication is required */
  requireAuth?: boolean;
  /** Rate limiting configuration */
  rateLimit?: {
    requests: number;
    window: string; // e.g., "1m", "15m", "1h"
  };
}

/** OpenAPI tag definition */
export interface GrimoireOpenApiTag {
  /** Tag name */
  name: string;
  /** Tag description */
  description: string;
  /** External documentation URL */
  externalDocs?: {
    description?: string;
    url: string;
  };
}

/** Complete OpenAPI specification for a grimoire */
export interface GrimoireOpenApiSpec {
  /** Tags used by this grimoire's endpoints */
  tags?: GrimoireOpenApiTag[];
  /** Reusable schemas (registered as {grimoireId}_{schemaName}) */
  schemas?: Record<string, ZodTypeAny>;
  /** Endpoint definitions */
  paths: GrimoireOpenApiPath[];
  /** Webhook definitions */
  webhooks?: Record<string, {
    post: {
      summary: string;
      description?: string;
      requestBody: {
        content: {
          "application/json": {
            schema: ZodTypeAny;
          };
        };
      };
    };
  }>;
}

/**
 * Helper para crear un grimoire con type safety
 */
export function defineGrimoire(def: GrimoireDefinition): GrimoireDefinition {
  return def;
}

/**
 * Helper para crear router con type inference del contexto
 */
export function createGrimoireRouter(
  setup: (router: Hono, ctx: GrimoireContext) => void
): GrimoireRouterFactory {
  return (ctx: GrimoireContext) => {
    const router = new Hono();
    setup(router, ctx);
    return router;
  };
}

// PaginatedResponse y createPaginatedResponse se exportan desde ./utils

// ═══════════════════════════════════════════════════════════════════════════
// ERRORES ESTÁNDAR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Error estándar para grimoires
 */
export class GrimoireError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "GrimoireError";
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      ...(this.details && { details: this.details }),
    };
  }
}

/**
 * Errores comunes predefinidos
 */
export const GrimoireErrors = {
  notFound: (resource: string, id?: string) =>
    new GrimoireError(
      `${resource} not found${id ? `: ${id}` : ""}`,
      "NOT_FOUND",
      404
    ),
  
  unauthorized: (message = "Unauthorized") =>
    new GrimoireError(message, "UNAUTHORIZED", 401),
  
  forbidden: (message = "Forbidden") =>
    new GrimoireError(message, "FORBIDDEN", 403),
  
  validation: (message: string, details?: Record<string, unknown>) =>
    new GrimoireError(message, "VALIDATION_ERROR", 400, details),
  
  conflict: (message: string) =>
    new GrimoireError(message, "CONFLICT", 409),
} as const;
