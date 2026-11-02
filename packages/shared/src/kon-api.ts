/**
 * Kitsuden — Kon API (Contratos para Kons Autocontenidos)
 *
 * Este módulo define las abstracciones que permiten a los kons
 * ser completamente independientes del core de la aplicación.
 *
 * Los kons reciben un contexto inyectado en lugar de importar
 * dependencias directamente desde apps/api/src/
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FLUJO DE INYECCIÓN:
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   1. Module Loader (apps/api/src/lib/module-loader.ts)
 *      ↓ Crea contexto con todas las dependencias
 *   2. KonContext (interface)
 *      ↓ Inyectado a cada kon
 *   3. createKonRouter() (factory)
 *      ↓ Retorna router Hono configurado
 *   4. Montado en /api/{kon-id}
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EJEMPLO DE USO:
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   // En un kon:
 *   export const kon = {
 *     id: "blog",
 *     createRouter: (ctx: KonContext) => {
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

import type { OperacionDeKon } from "./operaciones";

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS DE DEPENDENCIAS (Abstracciones)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Abstracción de caché para kons
 */
export interface KonCache {
  /** Obtener valor del caché */
  get<T = any>(key: string): Promise<T | null>;
  /** Guardar valor en caché con TTL opcional (segundos) */
  set<T = any>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  /** Invalidar caché por patrón (ej: "blog:*") */
  invalidate(pattern: string): Promise<void>;
}

/**
 * Abstracción de eventos para kons
 */
export interface KonEvents {
  /** Emitir evento para workers/webhooks */
  emit(event: string, data: unknown): void;
  /** Escuchar evento (para procesamiento interno) */
  on(event: string, handler: (data: unknown) => void): void;
}

/**
 * Abstracción de realtime para kons
 */
export interface KonRealtime {
  /** Broadcast mensaje a todos los clientes conectados */
  broadcast(channel: string, message: unknown): void;
  /** Enviar a usuario específico */
  sendToUser(userId: string, message: unknown): void;
}

/**
 * Abstracción de autenticación para kons
 */
export interface KonAuth {
  /** Middleware que requiere autenticación */
  requireAuth: MiddlewareHandler;
  /** Middleware que requiere roles específicos */
  requireRole: (roles: string[]) => MiddlewareHandler;
  /** Middleware opcional (setea usuario si existe) */
  optionalAuth: MiddlewareHandler;
  /** Obtener sesión actual del request */
  getSession(headers: Headers): Promise<{ user: any; session: any } | null>;
  /**
   * Quiénes son esas cuentas: lo PÚBLICO de cada una, nada más.
   *
   * Un kon no puede leer `auth_users`: es del anfitrión, y la regla de
   * aislamiento está para que un kon no dependa de tablas que no son suyas.
   * Pero el blog necesita firmar lo que publica, y guardaba solo el id: la
   * entrada salía sin autor en toda la web.
   *
   * Por eso lo pregunta en vez de leerlo. Devuelve `name` e `image` y NUNCA el
   * correo ni el rol: una firma no necesita más, y lo que no se devuelve no se
   * puede filtrar por una respuesta pública.
   *
   * Los ids que no existen simplemente no salen en el mapa.
   */
  usuariosPorId(
    ids: string[]
  ): Promise<Map<string, { id: string; name: string; image: string | null }>>;
}

/**
 * Abstracción de almacenamiento (S3/MinIO) para kons
 */
export interface KonStorage {
  /**
   * Guardar un objeto. Es la operación normal de subida.
   *
   * Antes solo existían las de URL firmada, que sirven para que el NAVEGADOR
   * suba directo al bucket. Cuando el fichero ya está en el servidor —el caso
   * de `POST /api/media/upload`— pedirse una URL a sí mismo para reenviárselo
   * es una vuelta de más, y con almacenamiento en disco local no hay a quién
   * firmarle nada: esa era la causa de que ninguna subida funcionara.
   */
  put(
    key: string,
    contenido: Buffer,
    contentType: string
  ): Promise<{ clave: string; url: string; bytes: number }>;
  /** URL pública de un objeto ya guardado. Síncrona: no consulta nada. */
  publicUrl(key: string): string;
  /**
   * URL firmada para que el cliente suba directamente al bucket.
   *
   * Solo tiene sentido con S3/MinIO. Con almacenamiento local lanza, en vez de
   * devolver una cadena vacía que reventaría más tarde y más lejos.
   */
  getSignedUploadUrl(key: string, contentType: string, expiresIn?: number): Promise<string>;
  /** Generar URL pública/firmada para descarga */
  getSignedDownloadUrl(key: string, expiresIn?: number): Promise<string>;
  /** Eliminar objeto. Que no exista no es un error. */
  delete(key: string): Promise<void>;
  /**
   * Leer un objeto entero; `null` si no existe. Funciona igual con disco local
   * y con S3 (en local, `getSignedDownloadUrl` es una ruta relativa que el
   * servidor no puede pedir ni dice si el fichero existe).
   */
  get(key: string): Promise<Buffer | null>;
  /**
   * Claves de todos los objetos que empiezan por `prefijo` (vacío si no hay
   * ninguno). Lo usa `DELETE /api/media/cache/:id` para borrar las
   * transformaciones guardadas de una imagen: antes llamaba a un `list` que
   * ningún almacén implementaba y respondía 500 siempre.
   */
  list(prefijo: string): Promise<string[]>;
}

/**
 * Abstracción de base de datos para kons
 *
 * NOTA: En lugar de abstraer todo Drizzle, proporcionamos
 * la instancia directa ya que los kons definen sus propios schemas.
 */
/**
 * El cliente Drizzle que recibe un kon.
 *
 * POR QUÉ ES GENÉRICO
 *
 * `instance: any` es el `any` de mayor alcance del proyecto: TODOS los kons
 * lo heredan y a partir de ahí el tipado se apaga en cascada — cada
 * `db.select()` devuelve `any` y ese `any` se propaga a los resultados.
 *
 * No se puede importar el tipo real de Drizzle aquí: `@kitsuden/shared` es un
 * paquete publicable y no debe arrastrar el ORM, y además pnpm puede resolver
 * drizzle-orm en instancias distintas, con lo que el tipo importado no sería
 * el mismo que el del host.
 *
 * La salida es un parámetro genérico con default permisivo. El default
 * mantiene funcionando a los kons existentes, y el que quiera tipado real
 * lo recupera ENTERO declarando su propio tipo, como hacen kon-conta y
 * kon-newsletter:
 *
 * ```ts
 * import type { PgDatabase } from "drizzle-orm/pg-core";
 * import * as schema from "./mi.schema";
 * type MiDb = PgDatabase<any, typeof schema, any>;
 *
 * export function createRouter(ctx: KonContext<MiDb>) {
 *   const db = ctx.db.instance;      // ← tipado completo, sin casts
 * }
 * ```
 *
 * Migrar un kon es un cambio local: no toca al host ni a los demás kons.
 */
export interface KonDatabase<TInstance = any> {
  /**
   * Instancia de Drizzle DE LA PETICIÓN.
   *
   * Dentro de una ruta del kon es la transacción RLS que el anfitrión abre
   * para cada petición (`app.current_user_id` / `app.current_user_role`
   * fijados con `set_config(..., true)`): Postgres aplica las políticas a todo
   * lo que se lea o escriba con ella. Fuera de una petición (arranque,
   * `onStartup`, tareas de fondo) es la conexión del sistema.
   *
   * `instance.transaction(fn)` dentro de una ruta abre un SAVEPOINT de esa
   * misma transacción: mismo usuario, misma conexión.
   */
  instance: TInstance;
  /**
   * Ejecuta `fn` como el SISTEMA (sin usuario ni rol) dentro de la
   * transacción de la petición, y restaura el contexto al acabar.
   *
   * Para lo que una ruta hace en nombre de otros y la RLS de quien pregunta
   * no deja —recontar votos ajenos, apuntar a un anónimo, procesar un
   * webhook—, y SOLO después de haber autorizado la acción en la aplicación.
   * Fuera de una petición ejecuta `fn` tal cual (ya es el sistema).
   *
   * Opcional en el tipo para no romper anfitriones o dobles de prueba que no
   * lo den; el anfitrión de Kitsuden siempre lo da.
   */
  comoSistema?<T>(fn: () => Promise<T>): Promise<T>;
  /**
   * Ejecuta `fn` FUERA de la transacción de la petición, con la conexión del
   * sistema. Para el trabajo que sobrevive a la respuesta: un `void tarea()`
   * que se lanza y no se espera, un temporizador, una sesión en vivo.
   *
   * Hace falta porque la transacción de la petición se confirma al responder:
   * una consulta lanzada dentro de ella y ejecutada después iría a una
   * conexión que ya se devolvió al pool (y que puede estar sirviendo a otra
   * persona). Dentro de `fn`, `instance` resuelve siempre al `db` global.
   */
  segundoPlano?<T>(fn: () => T): T;
  /** Helper para ejecutar SQL crudo */
  execute(sql: string): Promise<unknown>;
  /** Verificar si tabla existe */
  tableExists(tableName: string): Promise<boolean>;
}

/**
 * Abstracción de Content Publishing para kons
 *
 * Permite promover datos de cualquier fuente a Content Targets
 * (Blog, Documentation, Shop, etc.) que son provistos por kons primarios.
 */

/** Fuente de datos para promoción de contenido */
export type PromotionSource = {
  type: "dataset" | "kon";
  konId?: string;
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
  konId: string;
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
  konId: string;
  capabilities: ContentTargetInfo["capabilities"];
  publish(data: PromotionData, ctx: KonContext): Promise<PublishResult>;
  getPublishedUrl(result: PublishResult): string;
  unpublish?(contentId: string, ctx: KonContext): Promise<void>;
  update?(contentId: string, data: Partial<PromotionData>, ctx: KonContext): Promise<PublishResult>;
  getStatus?(contentId: string, ctx: KonContext): Promise<string>;
}

export interface KonContentPublishing {
  /** Obtener todos los targets disponibles */
  getAvailableTargets(): ContentTargetInfo[];

  /** Verificar si un target está disponible */
  hasTarget(targetId: string): boolean;

  /**
   * Registrar un Content Target (usado por kons primarios)
   */
  register(target: ContentTarget): void;

  /**
   * Desregistrar un Content Target (usado por kons primarios)
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
 * Contexto completo inyectado a cada kon
 */
export interface KonContext<TDb = any> {
  /** Base de datos (Drizzle). Parametrizable: `KonContext<MiDb>` da tipado real. */
  db: KonDatabase<TDb>;
  /** Caché (Valkey/Redis) */
  cache: KonCache;
  /** Sistema de eventos */
  events: KonEvents;
  /** Realtime/WebSockets */
  realtime: KonRealtime;
  /** Autenticación */
  auth: KonAuth;
  /** Almacenamiento de archivos */
  storage: KonStorage;
  /** Content Publishing API */
  contentPublishing: KonContentPublishing;
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

  /**
   * Ajustes que el grimoire activo declara para cada kon (`konConfig` de
   * `grimoire.json`), indexados por id de kon.
   *
   * Es lo que permite que un grimoire tenga OPINIÓN sin bifurcar el kon: el
   * mismo `kon-broadcast` arranca configurado para lucha en un grimoire de
   * FGC y para otra cosa en otro. Sin esto, `konConfig` solo se veía en el
   * panel de admin y no cambiaba el comportamiento de nadie.
   *
   * Opcional a propósito: sin grimoire activo, cada kon usa sus defaults.
   * Un kon NUNCA debe exigir que exista una entrada aquí.
   */
  konConfig?: Record<string, Record<string, unknown>>;

  /**
   * El sitio PÚBLICO tal como se configura en el panel (Configuración general
   * → Site URL), leído en vivo.
   *
   * NO es `config.siteUrl`: ese lo usan kon-newsletter y kon-broadcast como
   * origen de la API (`…/api/newsletter/portal.js`, el `--url` del agente), y
   * apuntarlo al frontend los rompería. Esto es la dirección que ve el
   * visitante — de la que cuelgan, por ejemplo, los subdominios de las wikis.
   *
   * Opcional: un contexto sin él (tests, herramientas) debe caer a `SITE_URL`.
   */
  sitio?: {
    urlPublica(): Promise<string>;
  };
}

/**
 * Lee un ajuste que el grimoire activo declara para un kon.
 *
 * Devuelve `undefined` si no hay grimoire, si no configura ese kon o si el
 * valor no es del tipo esperado — los tres casos significan lo mismo para quien
 * llama ("usa tu default") y distinguirlos solo invitaría a tratar una
 * configuración ausente como un error.
 *
 * El manifiesto es un JSON que puede editar quien empaqueta el grimoire, así
 * que el tipo se comprueba en runtime: un `gameProfile: 42` no puede colarse
 * hasta el punto donde se espera un id.
 */
export function konSetting<T extends string | number | boolean>(
  ctx: Pick<KonContext, "konConfig">,
  konId: string,
  key: string,
  kind: "string" | "number" | "boolean" = "string"
): T | undefined {
  const value = ctx.konConfig?.[konId]?.[key];
  return typeof value === kind ? (value as T) : undefined;
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORIES Y HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tipo para función creadora de routers.
 *
 * El `Env` va abierto a propósito, y es el único `any` justificado de este
 * contrato. Un kon puede tipar sus propias `Variables` —`new Hono<KonEnv>()`,
 * para que `c.get("user")` tenga tipo en vez de castearse— y el host solo
 * necesita saber que lo que recibe es un router de Hono para montarlo.
 *
 * Cerrarlo a `Hono` sin parámetros obligaría a cada kon a castear su router al
 * devolverlo, que es mover el `any` de un sitio bien tipado a otro peor.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- frontera de varianza: ver arriba
export type KonRouterFactory = (ctx: KonContext) => Hono<any>;

/**
 * Límite de peticiones declarado por un kon para una de sus rutas.
 *
 * La ruta es RELATIVA al `mountPath`: un kon no debe saber dónde acaba
 * montado, y así el límite sigue al kon aunque se remonte en otro sitio.
 */
export interface KonRateLimit {
  /** Sub-ruta relativa al mountPath. Admite comodines de Hono: "/webhook/*". */
  path: string;
  /** Peticiones permitidas por ventana. */
  limit: number;
  /** Ventana en segundos. */
  window: number;
  /** Mensaje al superarlo. */
  message?: string;
  /**
   * Denegar si el contador no está disponible (Valkey caído).
   *
   * Para una ruta que manda correo o mueve dinero, quedarse sin freno es peor
   * que rechazar la petición. Por defecto `false`.
   */
  failClosed?: boolean;
}

/**
 * Interface completa de un Kon autocontenido
 */
export interface KonDefinition {
  /** ID único del kon */
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
   * Es un kon primario que provee capacidades al framework.
   * Ejemplos: Blog (provee Content Target), Auth (provee autenticación)
   */
  primary?: boolean;

  /**
   * Puede ser desactivado por el usuario.
   * Los kons primarios típicamente son opcionales.
   */
  optional?: boolean;

  /** Factory que crea el router con contexto inyectado */
  createRouter: KonRouterFactory;

  /** Tablas que administra (para introspección) */
  tables?: string[];

  /**
   * Límites de peticiones para rutas concretas de este kon.
   *
   * El host aplica un límite global generoso (pensado para lectura), pero solo
   * el kon sabe cuáles de sus rutas son CARAS: las que mandan un correo,
   * cobran, o disparan un trabajo pesado. Antes eso obligaba a tocar el mapa
   * de rutas del host, lo que rompe el aislamiento — un kon no debe aparecer
   * en el código de `apps/api`.
   *
   * Se declaran aquí y el module-loader los monta al enganchar el router.
   */
  rateLimits?: KonRateLimit[];

  /** Hooks de ciclo de vida */
  hooks?: {
    /** Llamado cuando el kon se habilita */
    onEnable?: (ctx: KonContext) => Promise<void>;
    /** Llamado cuando el kon se deshabilita */
    onDisable?: (ctx: KonContext) => Promise<void>;
    /** Llamado en cada startup (para migraciones) */
    onStartup?: (ctx: KonContext) => Promise<void>;
  };

  /** Configuración de admin UI */
  admin?: {
    /**
     * Categoría en el sidebar.
     *
     * Esta es la DECLARACIÓN del kon, no el formato de cable: el registry la
     * normaliza con `mapCategory` antes de servirla, y `ADMIN_REGISTRY_VERSION`
     * sigue exponiendo su enum de siempre. Por eso se pueden añadir valores
     * aquí sin subir la versión del contrato — `"tools"` viaja como `"data"`
     * hasta que el panel aprenda a pintar su propia sección.
     */
    category?: "core" | "content" | "data" | "system" | "esports" | "tools";
    /** Vistas disponibles */
    views?: Array<{
      id: string;
      /**
       * `element` es la forma recomendada para vistas a medida: un Web
       * Component agnóstico al framework, cargado en runtime desde el artefacto
       * del kon. `custom` queda para el legacy de Svelte, que acopla la
       * extensión al framework interno del admin.
       */
      type: "grid" | "kanban" | "calendar" | "custom" | "element";
      title: string;
      table?: string;
      /** Solo `element`: nombre del custom element. Debe llevar guion. */
      element?: string;
      /** Solo `element`: bundle ESM, relativo a la raíz del paquete del kon. */
      src?: string;
    }>;
  };

  /** Dependencias */
  dependencies?: {
    /** IDs de kons requeridos */
    kons?: string[];
    /** Feature flags de core requeridos */
    core?: string[];
  };

  /** Mount point (default: /api/{id}) */
  mountPath?: string;

  /**
   * OpenAPI specification for auto-generated documentation.
   * When provided, endpoints will be documented at /api/docs/openapi.json
   */
  openApi?: KonOpenApiSpec;

  /**
   * SDK de kons (ver `operaciones.ts` y docs/kons/README.md): las operaciones
   * declaradas. De ellas salen la ruta REST, el OpenAPI y la herramienta MCP.
   * Una lista fija o una fábrica que recibe el contexto del kon.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- frontera de varianza: cada operación tiene sus propios esquemas
  operaciones?: OperacionDeKon<any, any, any>[] | ((ctx: KonContext) => OperacionDeKon<any, any, any>[]);

  /** Versión del contrato del SDK que usa el kon (`VERSION_SDK_DE_KONS`). */
  sdk?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// OPENAPI SUPPORT FOR KONS
// ═══════════════════════════════════════════════════════════════════════════

/** HTTP methods supported in OpenAPI paths */
export type OpenApiMethod = "get" | "post" | "put" | "patch" | "delete" | "head" | "options";

/** OpenAPI path definition for a single endpoint */
export interface KonOpenApiPath {
  /** HTTP method */
  method: OpenApiMethod;
  /** Path relative to kon mount (e.g., "/posts" or "/posts/:id") */
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
  responses: Record<
    number,
    {
      description: string;
      schema: ZodTypeAny;
    }
  >;
  /** Whether authentication is required */
  requireAuth?: boolean;
  /** Rate limiting configuration */
  rateLimit?: {
    requests: number;
    window: string; // e.g., "1m", "15m", "1h"
  };
}

/** OpenAPI tag definition */
export interface KonOpenApiTag {
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

/** Complete OpenAPI specification for a kon */
export interface KonOpenApiSpec {
  /** Tags used by this kon's endpoints */
  tags?: KonOpenApiTag[];
  /** Reusable schemas (registered as {konId}_{schemaName}) */
  schemas?: Record<string, ZodTypeAny>;
  /** Endpoint definitions */
  paths: KonOpenApiPath[];
  /** Webhook definitions */
  webhooks?: Record<
    string,
    {
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
    }
  >;
}

/**
 * Helper para crear un kon con type safety
 */
export function defineKon(def: KonDefinition): KonDefinition {
  return def;
}

/**
 * Helper para crear router con type inference del contexto
 */
export function createKonRouter(setup: (router: Hono, ctx: KonContext) => void): KonRouterFactory {
  return (ctx: KonContext) => {
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
 * Error estándar para kons
 */
export class KonError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "KonError";
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
export const KonErrors = {
  notFound: (resource: string, id?: string) =>
    new KonError(`${resource} not found${id ? `: ${id}` : ""}`, "NOT_FOUND", 404),

  unauthorized: (message = "Unauthorized") => new KonError(message, "UNAUTHORIZED", 401),

  forbidden: (message = "Forbidden") => new KonError(message, "FORBIDDEN", 403),

  validation: (message: string, details?: Record<string, unknown>) =>
    new KonError(message, "VALIDATION_ERROR", 400, details),

  conflict: (message: string) => new KonError(message, "CONFLICT", 409),
} as const;
