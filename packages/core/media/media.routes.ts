/**
 * Media Library — sus operaciones (SDK de kons)
 *
 * Subidas y gestión de la mediateca. Cada ruta es una operación DECLARADA
 * (`defineOperacion`): de ella salen la ruta REST, su OpenAPI y su herramienta
 * MCP (docs/kons/README.md); los esquemas están en `media.esquemas.ts`. El
 * permiso de cada una (la política `media`) se declara en `permiso` en vez
 * de montarse con `exigirMedia`.
 *
 * ⚠️ CRITICAL: Route order matters in Hono!
 * Specific routes must be registered BEFORE parameterized routes.
 * Example: `/folders` must come before `/:id`
 */

import { randomBytes } from "node:crypto";

import {
  can,
  conSavepoint,
  defineOperacion,
  esUuid,
  messageOf,
  routerDeOperaciones,
  type AuthzUser,
  type OperacionCualquiera,
} from "@kitsuden/engine";
import type { KonContext } from "@kitsuden/shared";
import { eq, and, desc, ilike, like, sql } from "drizzle-orm";
import type { Context, Hono, Next } from "hono";
import { bodyLimit } from "hono/body-limit";

import type { StorageConfig } from "./config.schema";
import { MediaKonConfig, defaultMediaConfig, validateMediaConfig } from "./config.schema";
import { medirImagen } from "./image-metadata";
import {
  Carpeta,
  CarpetaEntrada,
  ConfigEntrada,
  Configuracion,
  ConfiguracionGuardada,
  Exito,
  ListaDeCarpetas,
  ListaDeMedios,
  Medio,
  MedioCambios,
  MedioConUrl,
  ParamId,
  PruebaDeAlmacen,
  QueryLista,
  QuerySubida,
  ResultadoDePrueba,
  ResultadoDeSubida,
  Subida,
} from "./media.esquemas";
import "./media.policy";
import { media, mediaFolders } from "./media.schema";
import { testStorageConnection } from "./storage.adapter";
import { detectarTipoReal, nombreSeguro } from "./tipo-real";

/** Tamaño máximo de UN fichero. */
export const MAX_BYTES_POR_FICHERO = 10 * 1024 * 1024;
/** Ficheros por petición de subida. */
export const MAX_FICHEROS_POR_SUBIDA = 20;

const usuarioDe = (c: Context): AuthzUser | null =>
  ((c as unknown as { get(k: string): unknown }).get("user") ?? null) as AuthzUser | null;

/**
 * Middleware: exige la acción `accion` de la policy "media".
 *
 * El kon se autoriza a sí mismo. Antes solo pedía sesión (`requireAuth`), y
 * el alta es pública: lo único que paraba a cualquier cuenta era la regla por
 * prefijo de `auth-guard.ts`, y las LECTURAS (listado, ficha, carpetas,
 * configuración con credenciales) no las paraba nadie.
 */
export function exigirMedia(accion: "view" | "create" | "update" | "delete" | "configure") {
  return async (c: Context, next: Next) => {
    const user = usuarioDe(c);
    if (await can(user, accion, {}, "media")) return next();
    return user ? c.json({ error: "Forbidden" }, 403) : c.json({ error: "Unauthorized" }, 401);
  };
}

/** El id del kon: es parte del scope fino de cada operación (`kon:media:<op>`). */
export const KON_ID = "kon-media";

/**
 * Las operaciones de la mediateca, con el contexto del kon inyectado.
 */
export function operacionesDeMedia(ctx: KonContext): OperacionCualquiera[] {
  const ops: OperacionCualquiera[] = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST & BROWSE (specific routes first)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET / - List all media files
   */
  ops.push(
    defineOperacion({
      id: "listar-medios",
      metodo: "GET",
      ruta: "/",
      resumen: "List media files",
      descripcion:
        "The media library (staff only): newest first, filterable by folder, MIME prefix and file name. Each item carries its public URL.",
      acceso: "publico",
      permiso: { politica: { recurso: "media", accion: "view" } },
      entrada: { query: QueryLista },
      salida: { esquema: ListaDeMedios },
      manejar: async (_entrada, { c }) => {
        const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
        const offset = Math.max(Number(c.req.query("offset")) || 0, 0);
        const folderId = c.req.query("folderId");
        const search = c.req.query("search");
        const type = c.req.query("type"); // image, video, document

        // Las tres condiciones se acumulan y `.where()` se llama UNA vez.
        //
        // Antes eran tres `.where()` encadenados sobre el mismo builder, y en
        // Drizzle eso no suma: cada uno sustituye al anterior. Con
        // `?folderId=X&type=image` se ignoraba la carpeta y la biblioteca devolvía
        // imágenes de TODAS — el filtro que se perdía era el que organiza.
        const condiciones = [];
        if (folderId) condiciones.push(eq(media.folderId, folderId));
        if (type) condiciones.push(like(media.mimeType, `${type}/%`));
        // `ilike` y no `like`: en Postgres `like` DISTINGUE mayusculas, asi que
        // buscar «Logo» no encontraba `logo.png` y buscar «PNG» no encontraba
        // `.png`. La busqueda parecia rota justo al escribirla como la escribe
        // cualquiera. El filtro de `type` si puede seguir con `like`: lo compone
        // el servidor, no una persona.
        if (search) condiciones.push(ilike(media.filename, `%${search.slice(0, 200)}%`));

        const docs = await ctx.db.instance
          .select()
          .from(media)
          .where(condiciones.length > 0 ? and(...condiciones) : undefined)
          .orderBy(desc(media.createdAt))
          .limit(limit)
          .offset(offset);

        // Generate signed URLs for private files
        const docsWithUrls = await Promise.all(
          docs.map(async (doc: any) => {
            let url = doc.publicUrl;

            // If no public URL, generate signed URL
            if (!url) {
              try {
                url = await ctx.storage.getSignedDownloadUrl(doc.key, 3600);
              } catch {
                url = null;
              }
            }

            return {
              ...doc,
              url,
            };
          })
        );

        return c.json({ docs: docsWithUrls, totalDocs: docs.length });
      },
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // UPLOAD (specific route before /:id)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /upload - Upload file(s)
   */
  ops.push(
    defineOperacion({
      id: "subir-medios",
      metodo: "POST",
      ruta: "/upload",
      resumen: "Upload files",
      descripcion:
        "Uploads up to 20 files (10 MB each) in the multipart field `files`. The type is detected from the bytes (JPEG, PNG, GIF, WebP, AVIF, MP4, WebM or PDF); anything else is refused per file. 201 when all were stored, 207 when some failed.",
      acceso: "sesion",
      permiso: { politica: { recurso: "media", accion: "create" } },
      // El cuerpo entero se lee en memoria al parsear: se corta ANTES de leerlo
      // (Bun acepta 128 MB por petición por defecto).
      antes: [
        bodyLimit({
          maxSize: MAX_FICHEROS_POR_SUBIDA * MAX_BYTES_POR_FICHERO + 1024 * 1024,
          onError: (c) => c.json({ error: "Subida demasiado grande" }, 413),
        }),
      ],
      entrada: { query: QuerySubida, cuerpo: Subida, formato: "multipart" },
      salida: { estado: 201, esquema: ResultadoDeSubida },
      errores: ["KITSUDEN_E_PAYLOAD_TOO_LARGE"],
      mcp: { excluir: "multipart file upload: MCP tool arguments are JSON, not file streams" },
      manejar: async (_entrada, { c }) => {
        const folderId = c.req.query("folderId");
        const generateThumbnails = c.req.query("thumbnails") !== "false";
        if (folderId && !esUuid(folderId)) return c.json({ error: "folderId no válido" }, 400);

        try {
          const body = await c.req.parseBody({ all: true });
          const files = body.files;

          if (!files) {
            return c.json({ error: "No files provided" }, 400);
          }

          const uploadedFiles = Array.isArray(files) ? files : [files];
          if (uploadedFiles.length > MAX_FICHEROS_POR_SUBIDA) {
            return c.json(
              { error: `Como mucho ${MAX_FICHEROS_POR_SUBIDA} ficheros por subida` },
              400
            );
          }
          const user = usuarioDe(c);
          /**
           * Quién la subió. `created_by_id` apunta a `auth_users`, y un AGENTE
           * no es una cuenta: guardar su id rompía el INSERT (clave ajena) y
           * ninguna subida de un agente llegaba a la mediateca (lo destapó la
           * aprobación de imágenes, 2026-10-26). Para un agente: su FIRMANTE
           * humano si lo tiene y vale (docs/agents/approvals.md, «Human
           * signer»), si no nadie; y el agente queda en `metadata.agentId`.
           */
          const esAgente = (user as { role?: unknown } | null)?.role === "agent";
          const firmante = (user as { sponsor?: { userId?: unknown; valido?: unknown } | null } | null)?.sponsor;
          const autorDeLaSubida = esAgente
            ? firmante?.valido === true && typeof firmante.userId === "string"
              ? firmante.userId
              : null
            : user?.id
              ? String(user.id)
              : null;

          /**
           * ── DOS FASES: primero el almacén, después la base ─────────────────
           *
           * Subir a S3 y medir la imagen son llamadas largas que no necesitan la
           * base, y la petición va en UNA transacción (RLS): hacerlas entre un
           * insert y el siguiente tenía la conexión ocupada esperando a la red.
           * Ahora se guardan todos los ficheros y DESPUÉS se insertan las filas
           * (regla 3 del SDK de kons: lo externo, fuera de la transacción).
           *
           * Y cada insert va en su SAVEPOINT (`conSavepoint`): antes el
           * `catch` de un insert fallido se tragaba el error de SQL con la
           * transacción ya abortada, y TODOS los inserts siguientes fallaban
           * también (regla 2: no tragarse un error de SQL en la transacción).
           */
          type Resultado = Record<string, unknown> & { filename: string; success: boolean };
          const results: Resultado[] = [];
          const pendientes: {
            indice: number;
            nombre: string;
            safeName: string;
            tipo: string;
            guardado: { clave: string; url: string; bytes: number };
            width?: number;
            height?: number;
          }[] = [];

          for (const file of uploadedFiles) {
            if (!(file instanceof File)) continue;

            // Validate file size (10MB limit)
            if (file.size > MAX_BYTES_POR_FICHERO) {
              results.push({
                filename: file.name,
                success: false,
                error: "File too large (max 10MB)",
              });
              continue;
            }

            try {
              const contenido = Buffer.from(await file.arrayBuffer());

              // El tipo sale del CONTENIDO, no del `Content-Type` ni del nombre que
              // manda el cliente (ver tipo-real.ts). SVG, HTML y demás: fuera.
              const tipo = detectarTipoReal(contenido);
              if (!tipo) {
                results.push({
                  filename: file.name,
                  success: false,
                  error:
                    "Tipo de fichero no permitido (JPEG, PNG, GIF, WebP, AVIF, MP4, WebM o PDF)",
                });
                continue;
              }

              // Clave única: la hora sola dejaba que dos subidas del mismo nombre
              // en el mismo milisegundo se pisaran. El prefijo `uploads/<ms>_` se
              // conserva (lo usa `cacheDeMedio` para marcarlo inmutable).
              const safeName = nombreSeguro(file.name, tipo);
              const key = `uploads/${Date.now()}_${randomBytes(6).toString("hex")}_${safeName}`;

              // Guardar directamente con `put` (igual en disco local que en S3).
              // El buffer se reutiliza para medir: `file.arrayBuffer()` leería el
              // fichero entero otra vez.
              const guardado = await ctx.storage.put(key, contenido, tipo.mime);

              /**
               * Dimensiones. Se miden DESPUES de guardar, a proposito: guardar
               * es lo que no se puede perder; medir es una mejora.
               */
              const medidas = await medirImagen(contenido, tipo.mime);

              results.push({ filename: file.name, success: false });
              pendientes.push({
                indice: results.length - 1,
                nombre: file.name,
                safeName,
                tipo: tipo.mime,
                guardado,
                width: medidas?.width,
                height: medidas?.height,
              });
            } catch (err: unknown) {
              results.push({
                filename: file.name,
                success: false,
                error: messageOf(err),
              });
            }
          }

          for (const p of pendientes) {
            try {
              const [doc]: (typeof media.$inferSelect)[] = await conSavepoint(async () =>
                ctx.db.instance
                  .insert(media)
                  .values({
                    filename: p.safeName,
                    originalName: String(p.nombre).normalize("NFKC").slice(0, 500),
                    mimeType: p.tipo,
                    size: p.guardado.bytes,
                    key: p.guardado.clave,
                    // `public_url` es NOT NULL: se guarda al insertar.
                    publicUrl: p.guardado.url,
                    bucket: ctx.config.siteName || "kitsuden",
                    folderId: folderId || null,
                    width: p.width,
                    height: p.height,
                    status: "active",
                    createdById: autorDeLaSubida,
                    ...(esAgente && user?.id ? { metadata: { agentId: String(user.id) } } : {}),
                  })
                  .returning()
              );

              // Generate thumbnails for images (async)
              if (generateThumbnails && p.tipo.startsWith("image/")) {
                // This would trigger a background job in production
                ctx.logger.info(`Thumbnail generation queued for ${doc.id}`);
              }

              results[p.indice] = {
                id: doc.id,
                filename: doc.filename,
                mimeType: doc.mimeType,
                size: doc.size,
                // La URL pública y las medidas, en la respuesta (aditivo: el
                // editor del blog y el formulario de datasets las usan).
                url: doc.publicUrl,
                width: doc.width ?? undefined,
                height: doc.height ?? undefined,
                success: true,
              };
            } catch (err: unknown) {
              results[p.indice] = { filename: p.nombre, success: false, error: messageOf(err) };
            }
          }

          const allSuccess = results.every((r) => r.success);

          return c.json(
            {
              success: allSuccess,
              files: results,
            },
            allSuccess ? 201 : 207 // 207 Multi-Status if partial failures
          );
        } catch (err: unknown) {
          ctx.logger.error("Upload failed:", { error: messageOf(err) });
          return c.json({ error: messageOf(err) }, 500);
        }
      },
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // FOLDERS (specific routes before /:id)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /folders - List folders
   */
  ops.push(
    defineOperacion({
      id: "listar-carpetas",
      metodo: "GET",
      ruta: "/folders",
      resumen: "List media folders",
      descripcion: "All media folders ordered by path (staff only).",
      acceso: "publico",
      permiso: { politica: { recurso: "media", accion: "view" } },
      salida: { esquema: ListaDeCarpetas },
      manejar: async (_entrada, { c }) => {
        const docs = await ctx.db.instance.select().from(mediaFolders).orderBy(mediaFolders.path);

        return c.json({ docs });
      },
    })
  );

  /**
   * POST /folders - Create folder
   */
  ops.push(
    defineOperacion({
      id: "crear-carpeta",
      metodo: "POST",
      ruta: "/folders",
      resumen: "Create a media folder",
      descripcion:
        "Creates a folder, optionally inside another one (its path is taken from the parent, not from the request).",
      acceso: "sesion",
      permiso: { politica: { recurso: "media", accion: "create" } },
      entrada: { cuerpo: CarpetaEntrada },
      salida: { estado: 201, esquema: Carpeta },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (entrada, { c }) => {
        const body = entrada.cuerpo ?? {};

        if (!body.name || typeof body.name !== "string" || body.name.length > 200) {
          return c.json({ error: "Name is required" }, 400);
        }
        if (body.parentId && !esUuid(String(body.parentId))) {
          return c.json({ error: "parentId no válido" }, 400);
        }

        const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        // La ruta del padre sale de la BASE, no del cuerpo: `parentPath` lo
        // mandaba el cliente y podía no tener nada que ver con `parentId`.
        let path = `/${slug}`;
        if (body.parentId) {
          const [padre] = await ctx.db.instance
            .select({ path: mediaFolders.path })
            .from(mediaFolders)
            .where(eq(mediaFolders.id, body.parentId))
            .limit(1);
          if (!padre) return c.json({ error: "Carpeta padre no encontrada" }, 404);
          path = `${padre.path}/${slug}`;
        }

        const [doc] = await ctx.db.instance
          .insert(mediaFolders)
          .values({
            name: body.name,
            slug,
            parentId: body.parentId || null,
            path,
            description:
              typeof body.description === "string" ? body.description.slice(0, 2000) : null,
          })
          .returning();

        return c.json(doc, 201);
      },
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION (specific routes before /:id)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /config - Get kon configuration
   */
  ops.push(
    defineOperacion({
      id: "leer-configuracion",
      metodo: "GET",
      ruta: "/config",
      resumen: "Read the media configuration",
      descripcion:
        "The media kon configuration (storage provider and its settings, features, limits). Admin only: it can hold storage credentials.",
      acceso: "sesion",
      permiso: { politica: { recurso: "media", accion: "configure" } },
      salida: { esquema: Configuracion },
      mcp: { excluir: "returns storage credentials; not for agents" },
      manejar: async (_entrada, { c }) => {
        try {
          // Load from database or return default
          const config = (await loadConfig(ctx)) || defaultMediaConfig;
          return c.json({ config });
        } catch (err: unknown) {
          ctx.logger.error("Failed to load config:", { error: messageOf(err) });
          return c.json({ config: defaultMediaConfig });
        }
      },
    })
  );

  /**
   * POST /config - Save kon configuration
   */
  ops.push(
    defineOperacion({
      id: "guardar-configuracion",
      metodo: "POST",
      ruta: "/config",
      resumen: "Save the media configuration",
      descripcion: "Validates and stores the media kon configuration (admin only).",
      acceso: "sesion",
      permiso: { politica: { recurso: "media", accion: "configure" } },
      sensible: true,
      idempotente: true,
      entrada: { cuerpo: ConfigEntrada },
      salida: { esquema: ConfiguracionGuardada },
      mcp: { excluir: "carries storage credentials; configuration stays a human task" },
      manejar: async (entrada, { c }) => {
        try {
          const body = entrada.cuerpo ?? { config: undefined };
          const config = body.config as MediaKonConfig;

          // Validate config
          const validation = validateMediaConfig(config);
          if (!validation.valid) {
            return c.json({ error: validation.error }, 400);
          }

          // Save to database
          await saveConfig(ctx, config);

          ctx.logger.info("[Media] Configuration updated");
          return c.json({ success: true, config });
        } catch (err: unknown) {
          ctx.logger.error("Failed to save config:", { error: messageOf(err) });
          return c.json({ error: messageOf(err) }, 500);
        }
      },
    })
  );

  /**
   * POST /config/test-storage - Test storage connection
   */
  ops.push(
    defineOperacion({
      id: "probar-almacenamiento",
      metodo: "POST",
      ruta: "/config/test-storage",
      resumen: "Test a storage configuration",
      descripcion:
        "Tries to connect with the given storage settings (writes a probe on disk or calls the endpoint). Admin only.",
      acceso: "sesion",
      permiso: { politica: { recurso: "media", accion: "configure" } },
      idempotente: true,
      entrada: { cuerpo: PruebaDeAlmacen },
      salida: { esquema: ResultadoDePrueba },
      errores: ["KITSUDEN_E_BAD_GATEWAY"],
      mcp: { excluir: "takes storage credentials and reaches arbitrary endpoints" },
      manejar: async (entrada, { c }) => {
        try {
          const body = entrada.cuerpo ?? { storage: undefined };
          const storage = body.storage as StorageConfig;

          const result = await testStorageConnection(storage);

          return c.json(result);
        } catch (err: unknown) {
          ctx.logger.error("Storage test failed:", { error: messageOf(err) });
          return c.json(
            {
              success: false,
              message: messageOf(err) || "Connection test failed",
            },
            500
          );
        }
      },
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PARAMETERIZED ROUTES (must come AFTER all specific routes)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /:id - Get single media file
   */
  ops.push(
    defineOperacion({
      id: "obtener-medio",
      metodo: "GET",
      ruta: "/:id",
      resumen: "Get a media file",
      descripcion: "One media record (staff only) with its URL and thumbnail URLs.",
      acceso: "publico",
      permiso: { politica: { recurso: "media", accion: "view" } },
      entrada: { params: ParamId },
      salida: { esquema: MedioConUrl },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (_entrada, { c }) => {
        const id = c.req.param("id") as string;

        // Un id que no es UUID no puede existir, y pasarlo a la consulta hace que
        // Postgres lance `invalid input syntax for type uuid` — que sale como 500.
        // `GET /api/media/upload` encajaba aqui con id="upload" y devolvia error de
        // servidor por una URL mal escrita. 404 es lo correcto: no existe.
        if (!esUuid(id)) return c.json({ error: "Media not found" }, 404);

        const [doc] = await ctx.db.instance.select().from(media).where(eq(media.id, id)).limit(1);

        if (!doc) {
          return c.json({ error: "Media not found" }, 404);
        }

        // Generate signed URL
        let url = doc.publicUrl;
        if (!url) {
          try {
            url = await ctx.storage.getSignedDownloadUrl(doc.key, 3600);
          } catch {
            url = null;
          }
        }

        // Generate thumbnail URLs
        const thumbnails: Record<string, string> = {};
        if (doc.thumbnails) {
          for (const [size, info] of Object.entries(
            doc.thumbnails as Record<string, { key: string }>
          )) {
            try {
              thumbnails[size] = await ctx.storage.getSignedDownloadUrl(info.key, 3600);
            } catch {
              // Thumbnail not available
            }
          }
        }

        return c.json({
          ...doc,
          url,
          thumbnails,
        });
      },
    })
  );

  /**
   * PATCH /:id - Update media metadata
   */
  ops.push(
    defineOperacion({
      id: "editar-medio",
      metodo: "PATCH",
      ruta: "/:id",
      resumen: "Update media metadata",
      descripcion:
        "Changes the editable fields only: altText, caption, filename and folderId (never the storage key or URL).",
      acceso: "sesion",
      permiso: { politica: { recurso: "media", accion: "update" } },
      entrada: { params: ParamId, cuerpo: MedioCambios },
      salida: { esquema: Medio },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (entrada, { c }) => {
        const id = c.req.param("id") as string;

        // Un id que no es UUID no puede existir, y pasarlo a la consulta hace que
        // Postgres lance `invalid input syntax for type uuid` — que sale como 500.
        // `GET /api/media/upload` encajaba aqui con id="upload" y devolvia error de
        // servidor por una URL mal escrita. 404 es lo correcto: no existe.
        if (!esUuid(id)) return c.json({ error: "Media not found" }, 404);
        const body = entrada.cuerpo ?? {};

        const [existing] = await ctx.db.instance
          .select()
          .from(media)
          .where(eq(media.id, id))
          .limit(1);

        if (!existing) {
          return c.json({ error: "Media not found" }, 404);
        }

        // Solo lo editable. Hacía `set({...body})`: se podía cambiar la `key`
        // (y un DELETE posterior borraba ESE otro fichero del almacén), la URL
        // pública, el tipo o el autor.
        const cambios: Record<string, unknown> = {};
        const texto = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);
        if (body.altText !== undefined) cambios.altText = texto(body.altText, 2000);
        if (body.caption !== undefined) cambios.caption = texto(body.caption, 2000);
        if (body.filename !== undefined) {
          const nombre = texto(body.filename, 500);
          if (!nombre) return c.json({ error: "filename no válido" }, 400);
          cambios.filename = nombre.normalize("NFKC").replace(/[\\/]/g, "_");
        }
        if (body.folderId !== undefined) {
          if (body.folderId !== null && !esUuid(String(body.folderId))) {
            return c.json({ error: "folderId no válido" }, 400);
          }
          cambios.folderId = body.folderId;
        }

        const [updated] = await ctx.db.instance
          .update(media)
          .set({
            ...cambios,
            updatedAt: new Date(),
          })
          .where(eq(media.id, id))
          .returning();

        return c.json(updated);
      },
    })
  );

  /**
   * DELETE /:id - Delete media file
   */
  ops.push(
    defineOperacion({
      id: "borrar-medio",
      metodo: "DELETE",
      ruta: "/:id",
      resumen: "Delete a media file",
      descripcion:
        "Deletes the record and its stored file and thumbnails. Cannot be undone; pages that use it will show a broken image.",
      acceso: "sesion",
      permiso: { politica: { recurso: "media", accion: "delete" } },
      entrada: { params: ParamId },
      salida: { esquema: Exito },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (_entrada, { c }) => {
        const id = c.req.param("id") as string;

        // Un id que no es UUID no puede existir, y pasarlo a la consulta hace que
        // Postgres lance `invalid input syntax for type uuid` — que sale como 500.
        // `GET /api/media/upload` encajaba aqui con id="upload" y devolvia error de
        // servidor por una URL mal escrita. 404 es lo correcto: no existe.
        if (!esUuid(id)) return c.json({ error: "Media not found" }, 404);

        const [existing] = await ctx.db.instance
          .select()
          .from(media)
          .where(eq(media.id, id))
          .limit(1);

        if (!existing) {
          return c.json({ error: "Media not found" }, 404);
        }

        // Delete from storage
        try {
          await ctx.storage.delete(existing.key);

          // Delete thumbnails
          if (existing.thumbnails) {
            for (const [_size, info] of Object.entries(
              existing.thumbnails as Record<string, { key: string }>
            )) {
              try {
                await ctx.storage.delete(info.key);
              } catch {
                // Thumbnail might not exist
              }
            }
          }
        } catch (err: unknown) {
          ctx.logger.error("Failed to delete from storage:", { error: messageOf(err) });
          // Continue to delete from DB anyway
        }

        // Delete from database
        await ctx.db.instance.delete(media).where(eq(media.id, id));

        return c.json({ success: true });
      },
    })
  );

  return ops;
}

/** El router REST de la mediateca, generado de sus operaciones. */
export function createMediaRouter(ctx: KonContext): Hono {
  return routerDeOperaciones(KON_ID, operacionesDeMedia(ctx), ctx);
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG PERSISTENCE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Configuración del kon: se guarda en `modules.settings`, como la de todos
 * ============================================================================
 *
 * ── POR QUÉ SE MOVIÓ DE SITIO ──────────────────────────────────────────────
 *
 * Esto usaba una tabla propia, `kitsuden_config`, que era un SEGUNDO almacén de
 * ajustes de kon en paralelo al que ya existía: la columna `settings` de
 * `modules`, que es donde el panel escribe y desde donde lee
 * `PATCH /api/modules/:key`.
 *
 * Dos almacenes para lo mismo se separan en cuanto alguien edite uno. Aquí el
 * riesgo era concreto: el panel podía guardar ajustes de kon-media en
 * `modules.settings` y este código no verlos nunca, porque miraba otra tabla.
 *
 * Que la tabla vieja jamás llegara a funcionar en un servidor —la creaba en
 * caliente con un rol sin privilegio CREATE— hizo la unificación gratis: no
 * había datos que migrar. `kitsuden_config` se elimina en la migración 0040.
 *
 * ── POR QUÉ EL UPSERT SOLO ESCRIBE `settings` ──────────────────────────────
 *
 * Porque guardar ajustes no puede activar un kon de rebote. Si la fila no
 * existe se crea con el kon ACTIVO —kon-media es del núcleo y siempre lo
 * está—, pero si ya existe solo se escribe `settings`.
 *
 * Y NO se toca `updated_at`: `modules` no tiene esa columna. La primera versión
 * de este upsert la incluía por costumbre y habría fallado en el primer
 * guardado.
 */
async function loadConfig(ctx: KonContext): Promise<MediaKonConfig | null> {
  try {
    // En un SAVEPOINT: el `catch` de abajo se traga el error (por diseño:
    // sin configuración se usan los valores por defecto), y sin savepoint un
    // error de SQL dejaría abortada la transacción de la petición entera.
    const result: { rows?: unknown[] } = await conSavepoint(async () =>
      ctx.db.instance.execute(sql`
        SELECT settings FROM modules
        WHERE key = 'kon-media'
        LIMIT 1
      `)
    );

    const fila = result.rows?.[0] as { settings?: unknown } | undefined;
    const settings = fila?.settings;
    if (!settings) return null;

    // `settings` es jsonb: el driver ya lo entrega como objeto. Se acepta texto
    // por si alguna fila antigua guardó una cadena.
    const objeto = typeof settings === "string" ? JSON.parse(settings) : settings;

    // Un `settings` vacío es «no hay nada guardado», no una configuración vacía:
    // devolver `{}` haría que el kon arrancara sin extensiones permitidas ni
    // límite de tamaño, en vez de con sus valores por defecto.
    return objeto && Object.keys(objeto).length > 0 ? (objeto as MediaKonConfig) : null;
  } catch (err) {
    // Antes decia «Table might not exist yet» y se tragaba CUALQUIER error, asi
    // que un problema de permisos o de conexion se veia igual que «no hay nada
    // guardado»: el panel enseñaba los valores por defecto y no habia forma de
    // notar que la configuracion guardada no se estaba leyendo.
    ctx.logger.warn("[Media] No se pudo leer la configuracion guardada", {
      error: messageOf(err),
    });
  }
  return null;
}

async function saveConfig(ctx: KonContext, config: MediaKonConfig): Promise<void> {
  await ctx.db.instance.execute(sql`
    INSERT INTO modules (key, name, category, enabled, settings)
    VALUES ('kon-media', 'Media Library', 'core', true, ${JSON.stringify(config)}::jsonb)
    ON CONFLICT (key)
    DO UPDATE SET settings = EXCLUDED.settings;
  `);
}
