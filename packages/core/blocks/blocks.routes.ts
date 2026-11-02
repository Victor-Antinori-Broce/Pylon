/**
 * Kitsuden CMS — Page Builder: sus operaciones (SDK de kons)
 *
 * Páginas, bloques y plantillas de `/api/page-builder`. Cada ruta es una
 * operación DECLARADA (`defineOperacion`): de la declaración salen la ruta
 * REST, su OpenAPI y su herramienta MCP (docs/kons/README.md). Los esquemas
 * están en `blocks.esquemas.ts`.
 *
 * El contrato HTTP es el de siempre (contrato `page-builder` v1, que fija
 * `tests/unit/contrato-inti.test.ts`): la autorización de cada escritura se
 * declara en `permiso` (la política `page`) en vez de llamarse a mano al
 * principio del handler, con las mismas respuestas 401/403.
 */

import {
  can,
  defineOperacion,
  eqEnum,
  routerDeOperaciones,
  type AuthzUser,
  type OperacionCualquiera,
} from "@kitsuden/engine";
import type { KonContext } from "@kitsuden/shared";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";

import {
  Bloque,
  BloqueCambios,
  BloqueEntrada,
  Clonar,
  Exito,
  ListaDePaginas,
  ListaDePlantillas,
  Pagina,
  PaginaConBloques,
  PaginaDesdeBloque,
  PaginaDesdeBloqueSalida,
  PaginaEntrada,
  PaginaRenderizada,
  ParamId,
  ParamPagina,
  ParamSlug,
  Plantilla,
  PlantillaEntrada,
  QueryListaDePaginas,
  QueryPagina,
  QueryPlantillas,
  Reordenar,
  TiposDeBloque,
} from "./blocks.esquemas";
import { editaContenido, registerBlocksPolicy } from "./blocks.policy";
import { cssInvalido, estiloInvalido, sanearContenidoDeBloque } from "./blocks.saneado";
import { pages, blocks, blockTemplates, TIPOS_DE_BLOQUE } from "./blocks.schema";

/** El id del kon: es parte del scope fino de cada operación (`kon:blocks:<op>`). */
export const KON_ID = "kon-blocks";

/** Los estados que la columna admite. Lo demás es un 400 (o «publicadas» para el público). */
const ESTADOS_DE_PAGINA = ["draft", "published", "archived"] as const;
const RE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_BLOQUES_POR_PETICION = 500;

function usuarioDe(c: unknown): AuthzUser | null {
  return ((c as { get(k: string): unknown }).get("user") as AuthzUser | undefined) ?? null;
}

/**
 * La autorización de cada escritura, DENTRO del kon (antes: `requireAuth`,
 * es decir, cualquier cuenta). Devuelve el rechazo o `null`.
 */
async function rechazo(c: unknown, accion: string): Promise<Response | null> {
  const u = usuarioDe(c);
  if (await can(u, accion, {}, "page")) return null;
  const json = (c as { json: (cuerpo: unknown, estado: number) => Response }).json.bind(c);
  return u
    ? json({ error: "Forbidden", message: `No autorizado para '${accion}' sobre page` }, 403)
    : json({ error: "Unauthorized", message: "Session required" }, 401);
}

/**
 * ¿Puede este visitante ver esta página? Publicada, y si pide sesión, con
 * sesión. El equipo (y el agente de contenido) lo ve todo.
 */
function paginaVisible(
  c: unknown,
  pagina: { status?: string | null; requireAuth?: boolean | null }
): boolean {
  const u = usuarioDe(c);
  if (editaContenido(u)) return true;
  if (pagina.status !== "published") return false;
  if (pagina.requireAuth && !u) return false;
  return true;
}

/** Un bloque tal como se sirve: contenido saneado (lo guardado antes de esto también). */
function bloqueParaServir<T extends { type?: unknown; content?: unknown }>(bloque: T): T {
  return { ...bloque, content: sanearContenidoDeBloque(bloque.type, bloque.content) };
}

/** `customCss` solo se sirve si es CSS limpio (lo guardado antes de validarlo, también). */
function cssParaServir(css: unknown): string | null {
  return typeof css === "string" && !cssInvalido(css) ? css : null;
}

function tipoValido(tipo: unknown): boolean {
  return typeof tipo === "string" && (TIPOS_DE_BLOQUE as readonly string[]).includes(tipo);
}

/** Un `:id` de página puede ser uuid o slug; solo el uuid se compara con `pages.id` */
const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Las operaciones del page builder, con el contexto del kon inyectado.
 */
export function operacionesDeBloques(ctx: KonContext): OperacionCualquiera[] {
  // El registro de políticas es global y `resetAuthz()` lo vacía (tests).
  registerBlocksPolicy();
  const ops: OperacionCualquiera[] = [];
  const { db, cache, auth } = ctx;

  // Helper to get db instance
  const dbInstance = db.instance;

  // Helper for auth
  const requireAuth = auth.requireAuth;

  // Helper for cached query (adapt to KonContext cache API)
  const cachedQuery = async <T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> => {
    const cached = await cache.get(key);
    if (cached) return cached as T;
    const result = await fn();
    await cache.set(key, result, ttl);
    return result;
  };

  // Helper for cache invalidation
  const invalidateCache = async (pattern: string) => {
    await cache.invalidate(pattern);
  };

  /**
   * Build transform URL for media using kon-media presets
   *
   * Presets: thumbnail (150x150), small (400x300), medium (800x600),
   *          large (1200x800), hero (1920x1080)
   */
  const buildTransformUrl = (
    mediaId: string,
    preset: "thumbnail" | "small" | "medium" | "large" | "hero",
    focalPoint?: { x: number; y: number }
  ): string => {
    // Use preset endpoint for cleaner URLs
    let url = `/api/media/preset/${mediaId}/${preset}`;

    // Add focal point if provided (for smart cropping)
    if (focalPoint) {
      url += `?fp=${focalPoint.x.toFixed(2)},${focalPoint.y.toFixed(2)}`;
    }

    return url;
  };

  // Authentication applied inline to mutation routes only

  /** Lo que una página puede traer y no debe (estado inventado, CSS que no es CSS…). */
  function validarCamposDePagina(body: Record<string, unknown>): string | null {
    if (
      body.status !== undefined &&
      !(ESTADOS_DE_PAGINA as readonly string[]).includes(String(body.status))
    ) {
      return `Estado no válido: "${String(body.status)}"`;
    }
    for (const campo of ["requireAuth", "isHomepage"]) {
      if (body[campo] !== undefined && typeof body[campo] !== "boolean")
        return `\`${campo}\` es sí o no`;
    }
    return cssInvalido(body.customCss) ?? estiloInvalido(body);
  }

  /** Los bloques que llegan para guardar: tipo conocido, estilo limpio, y no infinitos. */
  function validarBloques(lista: unknown[]): string | null {
    if (lista.length > MAX_BLOQUES_POR_PETICION) return "Demasiados bloques en una petición";
    for (const b of lista) {
      if (!b || typeof b !== "object") return "Bloque no válido";
      const bloque = b as Record<string, unknown>;
      if (!tipoValido(bloque.type))
        return `Tipo de bloque desconocido: "${String(bloque.type ?? "")}"`;
      const e = estiloInvalido(bloque);
      if (e) return e;
    }
    return null;
  }

  /** Tras tocar un bloque: la página por id y por slug, la lista y el render. */
  async function invalidarPagina(pageId: string): Promise<void> {
    await invalidateCache(`page:${pageId}:*`);
    const [pagina] = await dbInstance
      .select({ slug: pages.slug })
      .from(pages)
      .where(eq(pages.id, pageId))
      .limit(1);
    if (pagina?.slug) {
      await invalidateCache(`page:${pagina.slug}:*`);
      await invalidateCache(`render:${pagina.slug}`);
    }
  }

  // ═══════════════════════════════════════════════
  // PAGES CRUD
  // ═══════════════════════════════════════════════

  // List all pages
  ops.push(
    defineOperacion({
      id: "listar-paginas",
      metodo: "GET",
      ruta: "/pages",
      resumen: "List pages",
      descripcion:
        "Paginated list of page-builder pages, newest update first. The public (and any caller without the content role) only sees published pages that do not require a session; staff and agents with contenido:editar can filter by any status.",
      acceso: "publico",
      entrada: { query: QueryListaDePaginas },
      salida: { esquema: ListaDePaginas },
      errores: ["KITSUDEN_E_BAD_REQUEST"],
      manejar: async (_entrada, { c }) => {
        const query = c.req.query();

        /**
         * ── EL ESTADO SE NEGOCIA CON QUIEN PREGUNTA ──────────────────────────────
         *
         * `?status=draft` sin sesión listaba los borradores, y un estado que no
         * existe (`?status=x`) era PEOR: `eqEnum` devuelve `undefined`, la
         * condición desaparecía y salían TODAS las páginas. Para quien no edita
         * contenido el estado es siempre `published`; para el equipo, uno válido o
         * un 400. Y la caché lleva el privilegio en la clave, o la primera lista
         * de un editor se serviría luego al público.
         */
        const priv = editaContenido(usuarioDe(c));
        const pedido = query.status || "published";
        if (priv && !(ESTADOS_DE_PAGINA as readonly string[]).includes(pedido)) {
          return c.json({ error: `Estado no válido: "${pedido}"` }, 400);
        }
        const status = priv ? pedido : "published";
        const limit = Math.min(Math.max(parseInt(query.limit || "50") || 50, 1), 100);
        const offset = Math.max(parseInt(query.offset || "0") || 0, 0);
        const layout = typeof query.layout === "string" ? query.layout : "";
        const search = typeof query.search === "string" ? query.search.slice(0, 200) : "";

        const clave = `pages:list:${status}:${limit}:${offset}:${layout}:${search}:${priv ? "priv" : "pub"}`;
        const result = await cachedQuery(clave, 60, async () => {
          const whereConditions = [eqEnum(pages.status, status)!];
          if (!priv) whereConditions.push(eq(pages.requireAuth, false));

          // Filter by layout if provided
          if (layout) {
            whereConditions.push(eq(pages.layout, layout));
          }

          // Search by title
          if (search) {
            whereConditions.push(sql`${pages.title} ILIKE ${`%${search}%`}`);
          }

          const pageList = await dbInstance
            .select({
              id: pages.id,
              title: pages.title,
              slug: pages.slug,
              description: pages.description,
              status: pages.status,
              layout: pages.layout,
              isHomepage: pages.isHomepage,
              publishedAt: pages.publishedAt,
              updatedAt: pages.updatedAt,
            })
            .from(pages)
            .where(and(...whereConditions))
            .orderBy(desc(pages.updatedAt))
            .limit(limit)
            .offset(offset);

          const [{ count }] = await dbInstance
            .select({ count: sql<number>`count(*)::int` })
            .from(pages)
            .where(and(...whereConditions));

          return { docs: pageList, totalDocs: count, limit, offset };
        });

        return c.json(result);
      },
    })
  );

  // Get single page with blocks
  ops.push(
    defineOperacion({
      id: "obtener-pagina",
      metodo: "GET",
      ruta: "/pages/:id",
      resumen: "Get a page with its blocks",
      descripcion:
        "One page by uuid or slug, with its visible blocks in order (block content sanitized). Drafts and session-only pages are a 404 for whoever cannot see them.",
      acceso: "publico",
      entrada: { params: ParamId, query: QueryPagina },
      salida: { esquema: PaginaConBloques },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (_entrada, { c }) => {
        const { id } = c.req.param();
        const includeBlocks = c.req.query("include_blocks") !== "false";

        const pageData = await cachedQuery(`page:${id}:${includeBlocks}`, 120, async () => {
          // Get page
          const [page] = await dbInstance
            .select()
            .from(pages)
            // `id` es uuid: compararlo con un slug («home») hacía fallar el cast en
            // Postgres y la ruta respondía 500 en vez de buscar por slug.
            .where(
              ES_UUID.test(id)
                ? sql`${pages.id} = ${id} OR ${pages.slug} = ${id}`
                : sql`${pages.slug} = ${id}`
            )
            .limit(1);

          if (!page) return null;

          // Get blocks if requested
          let pageBlocks: any[] = [];
          if (includeBlocks) {
            pageBlocks = await dbInstance
              .select()
              .from(blocks)
              .where(eq(blocks.pageId, page.id))
              .orderBy(asc(blocks.sortOrder));

            // Filter out invisible blocks based on visibility settings
            const now = new Date();
            pageBlocks = pageBlocks.filter((block) => {
              if (!block.isVisible) return false;
              if (block.visibleFrom && new Date(block.visibleFrom) > now) return false;
              if (block.visibleUntil && new Date(block.visibleUntil) < now) return false;
              return true;
            });
          }

          return { ...page, blocks: pageBlocks };
        });

        // Lo cacheado es la página tal cual; quién puede verla se decide aquí,
        // en cada petición. Un borrador o una página con sesión no existen para
        // quien no puede verlos (404, no 403: no se confirma que exista).
        if (!pageData || !paginaVisible(c, pageData)) {
          return c.json({ error: "Page not found" }, 404);
        }

        return c.json({
          ...pageData,
          customCss: cssParaServir(pageData.customCss),
          blocks: (pageData.blocks ?? []).map(bloqueParaServir),
        });
      },
    })
  );

  // Create page
  ops.push(
    defineOperacion({
      id: "crear-pagina",
      metodo: "POST",
      ruta: "/pages",
      resumen: "Create a page",
      descripcion:
        "Creates a page (draft by default) and, optionally, its blocks. The slug is derived from the title when missing. Making it the homepage needs a staff account.",
      acceso: "sesion",
      permiso: { politica: { recurso: "page", accion: "create" } },
      entrada: { cuerpo: PaginaEntrada.optional() },
      salida: { estado: 201, esquema: Pagina },
      errores: ["KITSUDEN_E_CONFLICT"],
      manejar: async (entrada, { c }) => {
        const body = entrada.cuerpo;

        // Sin título no hay página (ni slug que derivar): era un 500 por `undefined.toLowerCase()`
        if (
          !body ||
          typeof body !== "object" ||
          typeof body.title !== "string" ||
          !body.title.trim()
        ) {
          return c.json({ error: "Falta `title`" }, 400);
        }
        if (
          body.slug !== undefined &&
          (typeof body.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug))
        ) {
          return c.json({ error: "`slug` solo admite minúsculas, cifras y guiones" }, 400);
        }

        // Generate slug if not provided
        const slug =
          body.slug ||
          body.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
        if (!RE_SLUG.test(slug))
          return c.json({ error: "No se pudo derivar una URL del título" }, 400);

        const errorDeCampos = validarCamposDePagina(body);
        if (errorDeCampos) return c.json({ error: errorDeCampos }, 400);
        if (body.isHomepage) {
          const noPortada = await rechazo(c, "setHomepage");
          if (noPortada) return noPortada;
        }
        const bloquesNuevos = Array.isArray(body.blocks) ? body.blocks : [];
        const errorDeBloques = validarBloques(bloquesNuevos);
        if (errorDeBloques) return c.json({ error: errorDeBloques }, 400);

        // Check for duplicate slug
        const [existing] = await dbInstance
          .select({ id: pages.id })
          .from(pages)
          .where(eq(pages.slug, slug))
          .limit(1);

        if (existing) {
          return c.json({ error: "A page with this slug already exists" }, 409);
        }

        // If setting as homepage, unset other homepages
        if (body.isHomepage) {
          await dbInstance
            .update(pages)
            .set({ isHomepage: false })
            .where(eq(pages.isHomepage, true));
        }

        const [page] = await dbInstance
          .insert(pages)
          .values({
            title: body.title,
            slug,
            description: body.description,
            status: body.status || "draft",
            layout: body.layout || "default",
            metaTitle: body.metaTitle,
            metaDescription: body.metaDescription,
            ogImageId: body.ogImageId,
            cssClass: body.cssClass,
            customCss: body.customCss,
            publishedAt: body.status === "published" ? new Date() : null,
            // `authorId` ya no se toma del cuerpo: era texto libre que firmaba la
            // página a nombre de cualquiera (y la columna es uuid, mientras que los
            // ids de cuenta no lo son: no se puede guardar el de quien crea).
            isHomepage: body.isHomepage === true,
            requireAuth: body.requireAuth === true,
          })
          .returning();

        // Create blocks if provided
        if (bloquesNuevos.length) {
          const blockValues = bloquesNuevos.map((block: any, index: number) => ({
            pageId: page.id,
            type: block.type,
            name: block.name,
            sortOrder: block.sortOrder ?? index,
            columnSpan: block.columnSpan ?? 12,
            content: sanearContenidoDeBloque(block.type, block.content ?? {}),
            cssClass: block.cssClass,
            backgroundColor: block.backgroundColor,
            textColor: block.textColor,
            padding: block.padding,
            isVisible: block.isVisible ?? true,
          }));

          await dbInstance.insert(blocks).values(blockValues);
        }

        await invalidateCache("pages:*");
        await invalidateCache("render:*");
        return c.json(page, 201);
      },
    })
  );

  // Update page
  /**
   * Publicar un bloque como su propia página.
   * ==========================================================================
   *
   * ── QUE PROBLEMA RESUELVE ────────────────────────────────────────────────
   *
   * Para que una tier list fuera una URL había que: crearla en su kon, crear
   * una página, arrastrar el bloque, configurarlo y publicar. Cinco pasos para
   * algo que el lector vive como «una página con una tier list».
   *
   * ── POR QUE ESTA RUTA VIVE AQUI Y ES GENERICA ────────────────────────────
   *
   * La alternativa era que `kon-tierlist` escribiera en `block_pages`. Eso lo
   * ataría a `kon-blocks`, que es exactamente el acoplamiento que se evita
   * teniendo los kons separados — y habría que repetirlo en cada kon que
   * quiera publicar algo.
   *
   * Aquí es al revés: el dueño de las páginas ofrece «hazme una página con
   * ESTE bloque dentro», y cualquier kon puede llamarla sin que nadie importe
   * a nadie. El tipo de bloque se valida contra el enum, que es lo que la
   * tabla puede guardar de verdad.
   *
   * ── IDEMPOTENTE POR SLUG ─────────────────────────────────────────────────
   *
   * Volver a publicar la misma tier list ACTUALIZA su página en vez de fallar
   * con «ese slug ya existe» o crear una segunda. Republicar cada parche es la
   * operación normal aquí, no la excepción.
   */
  ops.push(
    defineOperacion({
      id: "publicar-bloque-como-pagina",
      metodo: "POST",
      ruta: "/pages/from-block",
      resumen: "Publish one block as its own page",
      descripcion:
        "Creates (201) or updates (200, same slug) a page that holds exactly one block. Republishing replaces the previous block instead of duplicating it, so it is safe to call again with the same slug.",
      acceso: "sesion",
      permiso: { politica: { recurso: "page", accion: "create" } },
      idempotente: true,
      entrada: { cuerpo: PaginaDesdeBloque.optional() },
      salida: { estado: 201, esquema: PaginaDesdeBloqueSalida },
      manejar: async (entrada, { c }) => {
        const body = (entrada.cuerpo ?? {}) as {
          blockType?: string;
          content?: Record<string, unknown>;
          title?: string;
          slug?: string;
          status?: string;
        };

        const titulo = (body.title ?? "").trim();
        if (!titulo) return c.json({ error: "Hace falta un título" }, 422);

        const slug =
          (body.slug ?? "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") ||
          titulo
            .toLowerCase()
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");

        if (!slug) return c.json({ error: "No se pudo derivar una URL del título" }, 422);

        /**
         * El tipo se valida contra la lista del esquema, no contra una escrita
         * aquí: una lista paralela es como se llegó a tener tres vocabularios de
         * bloques que no coincidían.
         *
         * Desde que la columna dejó de ser un enum de Postgres, esta comprobación
         * es lo ÚNICO que separa al editor de la tabla: la base ya no rechaza un
         * tipo que no existe. Por eso no puede relajarse.
         */
        const tiposValidos = TIPOS_DE_BLOQUE as readonly string[];
        if (!body.blockType || !tiposValidos.includes(body.blockType)) {
          return c.json(
            {
              error: "Tipo de bloque desconocido",
              message: `«${body.blockType ?? ""}» no se puede guardar en una página.`,
              validos: tiposValidos,
            },
            422
          );
        }

        const estado = body.status === "published" ? "published" : "draft";

        const [existente] = await dbInstance
          .select({ id: pages.id })
          .from(pages)
          .where(eq(pages.slug, slug))
          .limit(1);

        let pageId: string;

        if (existente) {
          pageId = existente.id;
          await dbInstance
            .update(pages)
            .set({ title: titulo, status: estado as never, updatedAt: new Date() })
            .where(eq(pages.id, pageId));

          /**
           * Se borran los bloques anteriores de ESTA página antes de escribir el
           * nuevo. La página es un envoltorio de un solo bloque; dejar los viejos
           * la iría llenando de copias a cada republicación.
           */
          await dbInstance.delete(blocks).where(eq(blocks.pageId, pageId));
        } else {
          const [creada] = await dbInstance
            .insert(pages)
            .values({ title: titulo, slug, status: estado as never })
            .returning({ id: pages.id });
          pageId = creada.id;
        }

        await dbInstance.insert(blocks).values({
          pageId,
          type: body.blockType as never,
          sortOrder: 0,
          columnSpan: 12,
          content: sanearContenidoDeBloque(body.blockType, body.content ?? {}) as never,
        });

        await invalidateCache("pages:*");
        await invalidateCache(`page:${pageId}:*`);
        await invalidateCache(`page:${slug}:*`);
        await invalidateCache(`render:${slug}`);

        return c.json(
          {
            data: { id: pageId, slug, title: titulo, status: estado },
            creada: !existente,
          },
          existente ? 200 : 201
        );
      },
    })
  );

  ops.push(
    defineOperacion({
      id: "editar-pagina",
      metodo: "PATCH",
      ruta: "/pages/:id",
      resumen: "Update a page",
      descripcion:
        "Changes the given page fields. Publishing sets publishedAt when it was empty; changing the slug checks it is free; isHomepage needs a staff account.",
      acceso: "sesion",
      permiso: { politica: { recurso: "page", accion: "update" } },
      entrada: { params: ParamId, cuerpo: PaginaEntrada.optional() },
      salida: { esquema: Pagina },
      errores: ["KITSUDEN_E_NOT_FOUND", "KITSUDEN_E_CONFLICT"],
      manejar: async (entrada, { c }) => {
        const { id } = c.req.param();
        if (!ES_UUID.test(id)) return c.json({ error: "Page not found" }, 404);
        const body = entrada.cuerpo;
        if (!body || typeof body !== "object") return c.json({ error: "Cuerpo no válido" }, 400);

        const errorDeCampos = validarCamposDePagina(body);
        if (errorDeCampos) return c.json({ error: errorDeCampos }, 400);
        if (
          body.slug !== undefined &&
          (typeof body.slug !== "string" || !RE_SLUG.test(body.slug))
        ) {
          return c.json({ error: "`slug` solo admite minúsculas, cifras y guiones" }, 400);
        }
        if (body.isHomepage !== undefined) {
          const noPortada = await rechazo(c, "setHomepage");
          if (noPortada) return noPortada;
        }

        const updates: Record<string, unknown> = { updatedAt: new Date() };

        if (body.title !== undefined) updates.title = body.title;
        if (body.description !== undefined) updates.description = body.description;
        if (body.status !== undefined) {
          updates.status = body.status;
          if (body.status === "published" && !body.publishedAt) {
            updates.publishedAt = new Date();
          }
        }
        if (body.layout !== undefined) updates.layout = body.layout;
        if (body.metaTitle !== undefined) updates.metaTitle = body.metaTitle;
        if (body.metaDescription !== undefined) updates.metaDescription = body.metaDescription;
        if (body.ogImageId !== undefined) updates.ogImageId = body.ogImageId;
        if (body.cssClass !== undefined) updates.cssClass = body.cssClass;
        if (body.customCss !== undefined) updates.customCss = body.customCss;
        if (body.requireAuth !== undefined) updates.requireAuth = body.requireAuth === true;

        // Handle slug update with duplicate check
        if (body.slug !== undefined) {
          const [existing] = await dbInstance
            .select({ id: pages.id })
            .from(pages)
            .where(and(eq(pages.slug, body.slug), sql`${pages.id} != ${id}`))
            .limit(1);

          if (existing) {
            return c.json({ error: "A page with this slug already exists" }, 409);
          }
          updates.slug = body.slug;
        }

        // Handle homepage flag
        if (body.isHomepage === true) {
          await dbInstance
            .update(pages)
            .set({ isHomepage: false })
            .where(and(eq(pages.isHomepage, true), sql`${pages.id} != ${id}`));
          updates.isHomepage = true;
        } else if (body.isHomepage === false) {
          updates.isHomepage = false;
        }

        const [updated] = await dbInstance
          .update(pages)
          .set(updates)
          .where(eq(pages.id, id))
          .returning();

        if (!updated) {
          return c.json({ error: "Page not found" }, 404);
        }

        await invalidateCache(`page:${id}:*`);
        await invalidateCache(`page:${updated.slug}:*`);
        await invalidateCache("pages:*");
        await invalidateCache("render:*");
        return c.json(updated);
      },
    })
  );

  // Delete page
  ops.push(
    defineOperacion({
      id: "borrar-pagina",
      metodo: "DELETE",
      ruta: "/pages/:id",
      resumen: "Delete a page",
      descripcion: "Deletes a page and all its blocks. Cannot be undone.",
      acceso: "sesion",
      permiso: { politica: { recurso: "page", accion: "delete" } },
      entrada: { params: ParamId },
      salida: { esquema: Exito.extend({ id: z.guid() }) },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (_entrada, { c }) => {
        const { id } = c.req.param();
        if (!ES_UUID.test(id)) return c.json({ error: "Page not found" }, 404);

        const [deleted] = await dbInstance.delete(pages).where(eq(pages.id, id)).returning();

        if (!deleted) {
          return c.json({ error: "Page not found" }, 404);
        }

        await invalidateCache(`page:${id}:*`);
        await invalidateCache(`page:${deleted.slug}:*`);
        await invalidateCache("pages:*");
        await invalidateCache("render:*");
        return c.json({ success: true, id: deleted.id });
      },
    })
  );

  // ═══════════════════════════════════════════════
  // BLOCKS CRUD
  // ═══════════════════════════════════════════════

  // Add block to page
  ops.push(
    defineOperacion({
      id: "crear-bloque",
      metodo: "POST",
      ruta: "/pages/:pageId/blocks",
      resumen: "Add a block to a page",
      descripcion:
        "Appends a block (after the last one unless sortOrder is given). The content is sanitized for its type before it is stored.",
      acceso: "sesion",
      permiso: { politica: { recurso: "page", accion: "update" } },
      entrada: { params: ParamPagina, cuerpo: BloqueEntrada.optional() },
      salida: { estado: 201, esquema: Bloque },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (entrada, { c }) => {
        const { pageId } = c.req.param();
        if (!ES_UUID.test(pageId)) return c.json({ error: "Page not found" }, 404);
        const body = entrada.cuerpo;
        const errorDeBloque = validarBloques([body]);
        if (errorDeBloque) return c.json({ error: errorDeBloque }, 400);
        if (!body) return c.json({ error: "Bloque no válido" }, 400);

        // Verify page exists
        const [page] = await dbInstance
          .select({ id: pages.id })
          .from(pages)
          .where(eq(pages.id, pageId))
          .limit(1);
        if (!page) {
          return c.json({ error: "Page not found" }, 404);
        }

        // Get current max sort order
        const [{ maxOrder }] = await dbInstance
          .select({ maxOrder: sql<number>`COALESCE(MAX(${blocks.sortOrder}), -1)` })
          .from(blocks)
          .where(eq(blocks.pageId, pageId));

        const [block] = await dbInstance
          .insert(blocks)
          .values({
            pageId,
            type: body.type,
            name: body.name,
            sortOrder: body.sortOrder ?? maxOrder + 1,
            columnSpan: body.columnSpan ?? 12,
            content: sanearContenidoDeBloque(body.type, body.content ?? {}),
            cssClass: body.cssClass,
            backgroundColor: body.backgroundColor,
            textColor: body.textColor,
            padding: body.padding,
            isVisible: body.isVisible ?? true,
            visibleFrom: body.visibleFrom,
            visibleUntil: body.visibleUntil,
          })
          .returning();

        await invalidarPagina(pageId);
        return c.json(block, 201);
      },
    })
  );

  // Update block
  ops.push(
    defineOperacion({
      id: "editar-bloque",
      metodo: "PATCH",
      ruta: "/blocks/:id",
      resumen: "Update a block",
      descripcion: "Changes the given block fields; new content is sanitized for the block type.",
      acceso: "sesion",
      permiso: { politica: { recurso: "page", accion: "update" } },
      entrada: { params: ParamId, cuerpo: BloqueCambios.optional() },
      salida: { esquema: Bloque },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (entrada, { c }) => {
        const { id } = c.req.param();
        if (!ES_UUID.test(id)) return c.json({ error: "Block not found" }, 404);
        const body = entrada.cuerpo;
        if (!body || typeof body !== "object") return c.json({ error: "Cuerpo no válido" }, 400);
        const errorDeEstilo = estiloInvalido(body);
        if (errorDeEstilo) return c.json({ error: errorDeEstilo }, 400);

        const updates: Record<string, unknown> = { updatedAt: new Date() };

        if (body.name !== undefined) updates.name = body.name;
        if (body.content !== undefined) {
          // El tipo hace falta para sanear según él (`embed`, `text`…).
          const [actual] = await dbInstance
            .select({ type: blocks.type })
            .from(blocks)
            .where(eq(blocks.id, id))
            .limit(1);
          if (!actual) return c.json({ error: "Block not found" }, 404);
          updates.content = sanearContenidoDeBloque(actual.type, body.content);
        }
        if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;
        if (body.columnSpan !== undefined) updates.columnSpan = body.columnSpan;
        if (body.cssClass !== undefined) updates.cssClass = body.cssClass;
        if (body.backgroundColor !== undefined) updates.backgroundColor = body.backgroundColor;
        if (body.textColor !== undefined) updates.textColor = body.textColor;
        if (body.padding !== undefined) updates.padding = body.padding;
        if (body.isVisible !== undefined) updates.isVisible = body.isVisible;
        if (body.visibleFrom !== undefined) updates.visibleFrom = body.visibleFrom;
        if (body.visibleUntil !== undefined) updates.visibleUntil = body.visibleUntil;

        const [updated] = await dbInstance
          .update(blocks)
          .set(updates)
          .where(eq(blocks.id, id))
          .returning();

        if (!updated) {
          return c.json({ error: "Block not found" }, 404);
        }

        await invalidarPagina(updated.pageId);
        return c.json(updated);
      },
    })
  );

  // Delete block
  ops.push(
    defineOperacion({
      id: "borrar-bloque",
      metodo: "DELETE",
      ruta: "/blocks/:id",
      resumen: "Delete a block",
      descripcion: "Removes one block from its page.",
      acceso: "sesion",
      permiso: { politica: { recurso: "page", accion: "update" } },
      entrada: { params: ParamId },
      salida: { esquema: Exito },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (_entrada, { c }) => {
        const { id } = c.req.param();
        if (!ES_UUID.test(id)) return c.json({ error: "Block not found" }, 404);

        const [block] = await dbInstance
          .select({ pageId: blocks.pageId })
          .from(blocks)
          .where(eq(blocks.id, id))
          .limit(1);
        if (!block) {
          return c.json({ error: "Block not found" }, 404);
        }

        await dbInstance.delete(blocks).where(eq(blocks.id, id));

        await invalidarPagina(block.pageId);
        return c.json({ success: true });
      },
    })
  );

  // Reorder blocks
  ops.push(
    defineOperacion({
      id: "reordenar-bloques",
      metodo: "POST",
      ruta: "/pages/:pageId/blocks/reorder",
      resumen: "Reorder the blocks of a page",
      descripcion:
        "Sets sortOrder for up to 500 blocks of the page in one go. Blocks of other pages are ignored. Sending the same order twice leaves the same state.",
      acceso: "sesion",
      permiso: { politica: { recurso: "page", accion: "update" } },
      idempotente: true,
      entrada: { params: ParamPagina, cuerpo: Reordenar.optional() },
      salida: { esquema: Exito },
      manejar: async (entrada, { c }) => {
        const { pageId } = c.req.param();
        const { blockOrders } = (entrada.cuerpo ?? {}) as {
          blockOrders?: unknown;
        };

        if (!Array.isArray(blockOrders)) {
          return c.json({ error: "blockOrders must be an array" }, 400);
        }
        // Una transacción con una sentencia por elemento: sin tope, un array de
        // un millón de entradas tiene la base ocupada lo que haga falta.
        if (
          blockOrders.length > MAX_BLOQUES_POR_PETICION ||
          !blockOrders.every(
            (b: any) =>
              b && typeof b.id === "string" && ES_UUID.test(b.id) && Number.isInteger(b.sortOrder)
          )
        ) {
          return c.json(
            { error: "blockOrders: hasta 500 elementos { id: uuid, sortOrder: entero }" },
            400
          );
        }

        // Update all blocks in a transaction
        await dbInstance.transaction(async (trx: any) => {
          for (const { id, sortOrder } of blockOrders) {
            await trx
              .update(blocks)
              .set({ sortOrder, updatedAt: new Date() })
              .where(and(eq(blocks.id, id), eq(blocks.pageId, pageId)));
          }
        });

        await invalidarPagina(pageId);
        return c.json({ success: true });
      },
    })
  );

  // Duplicate block
  ops.push(
    defineOperacion({
      id: "duplicar-bloque",
      metodo: "POST",
      ruta: "/blocks/:id/duplicate",
      resumen: "Duplicate a block",
      descripcion: "Copies a block to the end of the same page (name gets a '(Copy)' suffix).",
      acceso: "sesion",
      permiso: { politica: { recurso: "page", accion: "update" } },
      entrada: { params: ParamId },
      salida: { estado: 201, esquema: Bloque },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (_entrada, { c }) => {
        const { id } = c.req.param();
        if (!ES_UUID.test(id)) return c.json({ error: "Block not found" }, 404);

        const [original] = await dbInstance.select().from(blocks).where(eq(blocks.id, id)).limit(1);
        if (!original) {
          return c.json({ error: "Block not found" }, 404);
        }

        // Get max sort order for the page
        const [{ maxOrder }] = await dbInstance
          .select({ maxOrder: sql<number>`COALESCE(MAX(${blocks.sortOrder}), -1)` })
          .from(blocks)
          .where(eq(blocks.pageId, original.pageId));

        const [duplicated] = await dbInstance
          .insert(blocks)
          .values({
            pageId: original.pageId,
            type: original.type,
            name: `${original.name || original.type} (Copy)`,
            sortOrder: maxOrder + 1,
            columnSpan: original.columnSpan,
            content: original.content,
            cssClass: original.cssClass,
            backgroundColor: original.backgroundColor,
            textColor: original.textColor,
            padding: original.padding,
            isVisible: original.isVisible,
          })
          .returning();

        await invalidarPagina(original.pageId);
        return c.json(duplicated, 201);
      },
    })
  );

  // ═══════════════════════════════════════════════
  // RENDER ENDPOINT (Public)
  // ═══════════════════════════════════════════════

  // Render page for public consumption
  ops.push(
    defineOperacion({
      id: "renderizar-pagina",
      metodo: "GET",
      ruta: "/render/:slug",
      resumen: "Render a published page",
      descripcion:
        "A published page ready to paint: page metadata plus visible blocks (scheduled visibility applied) with transform URLs for their media. Session-only pages need a session.",
      acceso: "publico",
      entrada: { params: ParamSlug },
      salida: { esquema: PaginaRenderizada },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (_entrada, { c }) => {
        const { slug } = c.req.param();

        const rendered = await cachedQuery(`render:${slug}`, 300, async () => {
          // Get published page
          const [page] = await dbInstance
            .select()
            .from(pages)
            .where(and(eq(pages.slug, slug), eq(pages.status, "published")))
            .limit(1);

          if (!page) return null;

          // Get visible blocks
          const now = new Date();
          const pageBlocks = await dbInstance
            .select()
            .from(blocks)
            .where(and(eq(blocks.pageId, page.id), eq(blocks.isVisible, true)))
            .orderBy(asc(blocks.sortOrder));

          // Filter by visibility dates
          const visibleBlocks = pageBlocks.filter((block: any) => {
            if (block.visibleFrom && new Date(block.visibleFrom) > now) return false;
            if (block.visibleUntil && new Date(block.visibleUntil) < now) return false;
            return true;
          });

          // Process blocks to add transform URLs for media
          const processedBlocks = visibleBlocks.map((block: any) => {
            const content = block.content as Record<string, unknown>;
            const mediaUrls: Record<string, unknown> = {};

            /**
             * El id de medio se COMPRUEBA, no se fuerza.
             *
             * `content` es `Record<string, unknown>`: lo que hay en `content.mediaId`
             * es lo que alguien guardó en el bloque, y puede ser cualquier cosa.
             * Pasarlo a `buildTransformUrl` con un cast compilaba y construía una
             * URL con `[object Object]` dentro — una imagen rota en la página
             * publicada, no un error en el log.
             */
            const idDeMedio = (v: unknown): string | null =>
              typeof v === "string" && v.trim() ? v : null;

            // Generate transform URLs based on block type
            const heroId = idDeMedio(content?.mediaId);
            if (block.type === "hero" && heroId) {
              // Hero uses hero preset (1920x1080 cover) with optional focal point
              const focalPoint = content.focalPoint as never;
              mediaUrls.hero = buildTransformUrl(heroId, "hero", focalPoint);
              mediaUrls.large = buildTransformUrl(heroId, "large", focalPoint);
              mediaUrls.medium = buildTransformUrl(heroId, "medium", focalPoint);
              mediaUrls.small = buildTransformUrl(heroId, "small", focalPoint);
            }

            if (block.type === "image" && heroId) {
              // Image block uses multiple presets for responsive images
              mediaUrls.thumbnail = buildTransformUrl(heroId, "thumbnail");
              mediaUrls.small = buildTransformUrl(heroId, "small");
              mediaUrls.medium = buildTransformUrl(heroId, "medium");
              mediaUrls.large = buildTransformUrl(heroId, "large");
            }

            if (block.type === "cards" && content?.cards) {
              // Cards may have images - generate thumbnail and small
              //
              // `content.cards` es `unknown`: un bloque guardado con `cards` como
              // objeto —o como cadena— hacía reventar el `.map` en producción.
              const cards = Array.isArray(content.cards) ? content.cards : [];
              mediaUrls.cards = cards
                .map((card: { id?: string; mediaId?: unknown }) => {
                  const cardId = idDeMedio(card?.mediaId);
                  if (!cardId) return null;
                  return {
                    cardId: card.id,
                    thumbnail: buildTransformUrl(cardId, "thumbnail"),
                    small: buildTransformUrl(cardId, "small"),
                    medium: buildTransformUrl(cardId, "medium"),
                  };
                })
                .filter(Boolean);
            }

            const autorId = idDeMedio(content?.authorImageId);
            if (block.type === "quote" && autorId) {
              // Quote author image uses thumbnail
              mediaUrls.authorImage = buildTransformUrl(autorId, "thumbnail");
            }

            return {
              id: block.id,
              type: block.type,
              content: sanearContenidoDeBloque(block.type, block.content),
              columnSpan: block.columnSpan,
              cssClass: block.cssClass,
              backgroundColor: block.backgroundColor,
              textColor: block.textColor,
              padding: block.padding,
              mediaUrls: Object.keys(mediaUrls).length > 0 ? mediaUrls : undefined,
            };
          });

          return {
            page: {
              id: page.id,
              title: page.title,
              slug: page.slug,
              description: page.description,
              metaTitle: page.metaTitle || page.title,
              metaDescription: page.metaDescription,
              layout: page.layout,
              cssClass: page.cssClass,
              customCss: cssParaServir(page.customCss),
              publishedAt: page.publishedAt,
            },
            blocks: processedBlocks,
            // Va en la caché para decidir abajo; no sale en la respuesta.
            requireAuth: page.requireAuth === true,
          };
        });

        /**
         * `requireAuth` se guardaba y NADIE lo miraba: una página marcada «solo
         * con sesión» se servía entera a cualquiera desde aquí.
         */
        if (!rendered || (rendered.requireAuth && !usuarioDe(c))) {
          return c.json({ error: "Page not found" }, 404);
        }

        const { requireAuth: _requireAuth, ...publico } = rendered;
        return c.json(publico);
      },
    })
  );

  // ═══════════════════════════════════════════════
  // BLOCK TEMPLATES
  // ═══════════════════════════════════════════════

  // List templates
  ops.push(
    defineOperacion({
      id: "listar-plantillas",
      metodo: "GET",
      ruta: "/templates",
      resumen: "List block templates",
      descripcion:
        "Active block templates, most used first, optionally filtered by category or block type.",
      acceso: "publico",
      entrada: { query: QueryPlantillas },
      salida: { esquema: ListaDePlantillas },
      errores: ["KITSUDEN_E_BAD_REQUEST"],
      manejar: async (entrada, { c }) => {
        const query = c.req.query();
        const category = query.category;
        const type = query.type;

        /**
         * El filtro de tipo se valida ANTES de entrar en la caché.
         *
         * `eqEnum` devuelve `undefined` cuando el valor no pertenece al enum — es su
         * forma de evitar el 500 que da Postgres al comparar una columna enum con
         * basura. Pero empujarlo tal cual al array metía `undefined` entre las
         * condiciones, y el efecto era el CONTRARIO del pedido: filtrar por un tipo
         * inválido devolvía **todas** las plantillas. Un cliente con una errata
         * recibía la lista entera creyendo que había filtrado.
         *
         * Se comprueba aquí y no dentro del callback por dos razones: ahí no hay
         * `c` para responder, y una petición inválida no debe llegar a ocupar una
         * entrada de caché durante cinco minutos.
         */
        const filtroTipo = type ? eqEnum(blockTemplates.type, type) : undefined;
        if (type && !filtroTipo) {
          return c.json({ error: `Tipo de bloque no válido: "${type}"` }, 400);
        }

        const result = await cachedQuery(
          `templates:list:${category || "all"}:${type || "all"}`,
          300,
          async () => {
            const conditions = [eq(blockTemplates.isActive, true)];

            if (category) {
              conditions.push(eq(blockTemplates.category, category));
            }
            if (filtroTipo) {
              conditions.push(filtroTipo);
            }

            const list = await dbInstance
              .select({
                id: blockTemplates.id,
                name: blockTemplates.name,
                description: blockTemplates.description,
                category: blockTemplates.category,
                type: blockTemplates.type,
                content: blockTemplates.content,
                cssClass: blockTemplates.cssClass,
                backgroundColor: blockTemplates.backgroundColor,
                textColor: blockTemplates.textColor,
                padding: blockTemplates.padding,
                usageCount: blockTemplates.usageCount,
              })
              .from(blockTemplates)
              .where(and(...conditions))
              .orderBy(desc(blockTemplates.usageCount));

            return {
              docs: list.map((t: { type: unknown; content: unknown }) => ({
                ...t,
                content: sanearContenidoDeBloque(t.type, t.content),
              })),
            };
          }
        );

        return c.json(result);
      },
    })
  );

  // Create template
  ops.push(
    defineOperacion({
      id: "crear-plantilla",
      metodo: "POST",
      ruta: "/templates",
      resumen: "Create a block template",
      descripcion: "Saves a reusable block (name, block type and content).",
      acceso: "sesion",
      permiso: { politica: { recurso: "page", accion: "create" } },
      entrada: { cuerpo: PlantillaEntrada.optional() },
      salida: { estado: 201, esquema: Plantilla },
      manejar: async (entrada, { c }) => {
        const body = entrada.cuerpo;
        if (
          !body ||
          typeof body !== "object" ||
          typeof body.name !== "string" ||
          !tipoValido(body.type)
        ) {
          return c.json({ error: "Hacen falta `name` y un `type` de bloque válido" }, 400);
        }
        const errorDeEstilo = estiloInvalido(body);
        if (errorDeEstilo) return c.json({ error: errorDeEstilo }, 400);

        const [template] = await dbInstance
          .insert(blockTemplates)
          .values({
            name: body.name,
            description: body.description,
            category: body.category,
            type: body.type,
            content: sanearContenidoDeBloque(body.type, body.content ?? {}),
            cssClass: body.cssClass,
            backgroundColor: body.backgroundColor,
            textColor: body.textColor,
            padding: body.padding,
          })
          .returning();

        await invalidateCache("templates:*");
        return c.json(template, 201);
      },
    })
  );

  // Update template usage count (called when used)
  ops.push(
    defineOperacion({
      id: "usar-plantilla",
      metodo: "POST",
      ruta: "/templates/:id/use",
      resumen: "Count one use of a template",
      descripcion: "Increments the usage counter of a template (it orders the template list).",
      acceso: "sesion",
      permiso: { politica: { recurso: "page", accion: "update" } },
      entrada: { params: ParamId },
      salida: { esquema: Plantilla },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (_entrada, { c }) => {
        const { id } = c.req.param();
        if (!ES_UUID.test(id)) return c.json({ error: "Template not found" }, 404);

        const [updated] = await dbInstance
          .update(blockTemplates)
          .set({
            usageCount: sql`${blockTemplates.usageCount} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(blockTemplates.id, id))
          .returning();

        if (!updated) {
          return c.json({ error: "Template not found" }, 404);
        }

        return c.json(updated);
      },
    })
  );

  // ═══════════════════════════════════════════════
  // BLOCK TYPES REGISTRY
  // ═══════════════════════════════════════════════

  // Get available block types and their schemas
  ops.push(
    defineOperacion({
      id: "tipos-de-bloque",
      metodo: "GET",
      ruta: "/block-types",
      resumen: "List block types",
      descripcion:
        "The block types a page can hold, each with the descriptor of its content fields.",
      acceso: "publico",
      salida: { esquema: TiposDeBloque },
      manejar: async (_entrada, { c }) => {
        const blockTypes = [
          {
            type: "hero",
            name: "Hero Section",
            category: "layout",
            icon: "layout",
            description: "Large banner with headline, description, and call-to-action",
            schema: {
              headline: { type: "string", required: true },
              subheadline: { type: "string" },
              description: { type: "string" },
              mediaId: { type: "string", description: "Background image/video" },
              mediaType: { type: "enum", options: ["image", "video"], default: "image" },
              alignment: { type: "enum", options: ["left", "center", "right"], default: "center" },
              minHeight: { type: "enum", options: ["sm", "md", "lg", "xl"], default: "md" },
              focalPoint: {
                type: "object",
                description: "Smart crop focal point (0-1)",
                properties: {
                  x: { type: "number", min: 0, max: 1, default: 0.5 },
                  y: { type: "number", min: 0, max: 1, default: 0.5 },
                },
              },
              primaryButton: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  url: { type: "string" },
                  variant: { type: "enum", options: ["primary", "secondary", "outline"] },
                },
              },
              secondaryButton: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  url: { type: "string" },
                },
              },
            },
          },
          {
            type: "text",
            name: "Text",
            category: "content",
            icon: "type",
            description: "Rich text content block",
            schema: {
              text: { type: "string", required: true },
              format: { type: "enum", options: ["html", "markdown", "plain"], default: "html" },
              alignment: {
                type: "enum",
                options: ["left", "center", "right", "justify"],
                default: "left",
              },
              textSize: { type: "enum", options: ["sm", "md", "lg", "xl"], default: "md" },
            },
          },
          {
            type: "image",
            name: "Image",
            category: "media",
            icon: "image",
            description: "Single image with optional caption and link",
            schema: {
              mediaId: { type: "string", required: true },
              altText: { type: "string" },
              caption: { type: "string" },
              alignment: {
                type: "enum",
                options: ["left", "center", "right", "full"],
                default: "center",
              },
              linkUrl: { type: "string" },
              openInNewTab: { type: "boolean", default: false },
            },
          },
          {
            type: "video",
            name: "Video",
            category: "media",
            icon: "video",
            description: "Self-hosted or embedded video",
            schema: {
              mediaId: { type: "string", description: "For self-hosted videos" },
              embedUrl: { type: "string", description: "YouTube/Vimeo URL" },
              provider: { type: "enum", options: ["youtube", "vimeo", "self"], default: "self" },
              autoplay: { type: "boolean", default: false },
              loop: { type: "boolean", default: false },
              muted: { type: "boolean", default: true },
              controls: { type: "boolean", default: true },
            },
          },
          {
            type: "grid",
            name: "Grid Layout",
            category: "layout",
            icon: "grid",
            description: "Multi-column grid for organizing content",
            schema: {
              columns: { type: "number", min: 1, max: 4, default: 2 },
              gap: { type: "enum", options: ["sm", "md", "lg"], default: "md" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    columnSpan: { type: "number", min: 1, max: 12 },
                    content: { type: "object" },
                  },
                },
              },
            },
          },
          {
            type: "cards",
            name: "Cards",
            category: "content",
            icon: "square-stack",
            description: "Card grid with images, titles, and descriptions",
            schema: {
              cards: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    title: { type: "string", required: true },
                    description: { type: "string" },
                    mediaId: { type: "string" },
                    linkUrl: { type: "string" },
                    tags: { type: "array", items: { type: "string" } },
                  },
                },
              },
              columns: { type: "enum", options: [1, 2, 3, 4], default: 3 },
              variant: {
                type: "enum",
                options: ["default", "horizontal", "compact"],
                default: "default",
              },
            },
          },
          {
            type: "quote",
            name: "Quote",
            category: "content",
            icon: "quote",
            description: "Testimonial or quote with attribution",
            schema: {
              quote: { type: "string", required: true },
              author: { type: "string" },
              authorTitle: { type: "string" },
              authorImageId: { type: "string" },
              style: { type: "enum", options: ["default", "large", "minimal"], default: "default" },
            },
          },
          {
            type: "cta",
            name: "Call to Action",
            category: "marketing",
            icon: "megaphone",
            description: "Promotional section with button",
            schema: {
              title: { type: "string", required: true },
              description: { type: "string" },
              buttonLabel: { type: "string", required: true },
              buttonUrl: { type: "string", required: true },
              buttonVariant: {
                type: "enum",
                options: ["primary", "secondary", "outline"],
                default: "primary",
              },
              alignment: { type: "enum", options: ["left", "center", "right"], default: "center" },
            },
          },
          {
            type: "embed",
            name: "Embed",
            category: "media",
            icon: "code",
            description: "HTML embed code (iframes, widgets, etc.)",
            schema: {
              code: { type: "string", required: true, description: "HTML embed code" },
              caption: { type: "string" },
            },
          },
          {
            type: "divider",
            name: "Divider",
            category: "layout",
            icon: "minus",
            description: "Horizontal line separator",
            schema: {
              style: { type: "enum", options: ["solid", "dashed", "dotted"], default: "solid" },
              width: { type: "enum", options: ["full", "partial"], default: "full" },
              color: { type: "string", description: "CSS color value" },
            },
          },
          {
            type: "spacer",
            name: "Spacer",
            category: "layout",
            icon: "arrows-out-vertical",
            description: "Vertical spacing block",
            schema: {
              height: { type: "enum", options: ["sm", "md", "lg", "xl", "2xl"], default: "md" },
            },
          },
          {
            type: "custom",
            name: "Custom Component",
            category: "advanced",
            icon: "puzzle-piece",
            description: "Custom React/Vue/Svelte component",
            schema: {
              component: { type: "string", required: true, description: "Component identifier" },
              props: { type: "object", description: "Component props" },
            },
          },
        ];

        return c.json({ blockTypes });
      },
    })
  );

  // ═══════════════════════════════════════════════
  // CLONE PAGE
  // ═══════════════════════════════════════════════

  ops.push(
    defineOperacion({
      id: "clonar-pagina",
      metodo: "POST",
      ruta: "/pages/:id/clone",
      resumen: "Clone a page",
      descripcion:
        "Copies a page and its blocks as a new draft (never as homepage). Slug and title default to '<slug>-copy' and '<title> (Copy)'.",
      acceso: "sesion",
      permiso: { politica: { recurso: "page", accion: "create" } },
      entrada: { params: ParamId, cuerpo: Clonar },
      salida: { estado: 201, esquema: Pagina },
      errores: ["KITSUDEN_E_NOT_FOUND", "KITSUDEN_E_CONFLICT"],
      manejar: async (entrada, { c }) => {
        const { id } = c.req.param();
        if (!ES_UUID.test(id)) return c.json({ error: "Page not found" }, 404);
        const body = (entrada.cuerpo ?? {}) as {
          slug?: unknown;
          title?: unknown;
        };

        // Get original page with blocks
        const [original] = await dbInstance.select().from(pages).where(eq(pages.id, id)).limit(1);
        if (!original) {
          return c.json({ error: "Page not found" }, 404);
        }

        const originalBlocks = await dbInstance
          .select()
          .from(blocks)
          .where(eq(blocks.pageId, id))
          .orderBy(asc(blocks.sortOrder));

        // Generate new slug
        const newSlug =
          typeof body.slug === "string" && body.slug ? body.slug : `${original.slug}-copy`;
        const newTitle =
          typeof body.title === "string" && body.title.trim()
            ? body.title
            : `${original.title} (Copy)`;
        if (!RE_SLUG.test(newSlug))
          return c.json({ error: "`slug` solo admite minúsculas, cifras y guiones" }, 400);

        // Check for slug conflict
        const [existing] = await dbInstance
          .select({ id: pages.id })
          .from(pages)
          .where(eq(pages.slug, newSlug))
          .limit(1);
        if (existing) {
          return c.json({ error: "A page with this slug already exists" }, 409);
        }

        // Create cloned page
        const [cloned] = await dbInstance
          .insert(pages)
          .values({
            title: newTitle,
            slug: newSlug,
            description: original.description,
            status: "draft", // Always start as draft
            layout: original.layout,
            metaTitle: original.metaTitle,
            metaDescription: original.metaDescription,
            ogImageId: original.ogImageId,
            cssClass: original.cssClass,
            customCss: cssParaServir(original.customCss),
            isHomepage: false, // Never clone as homepage
            requireAuth: original.requireAuth,
          })
          .returning();

        // Clone blocks
        if (originalBlocks.length > 0) {
          await dbInstance.insert(blocks).values(
            originalBlocks.map((block: any) => ({
              pageId: cloned.id,
              type: block.type,
              name: block.name,
              sortOrder: block.sortOrder,
              columnSpan: block.columnSpan,
              content: sanearContenidoDeBloque(block.type, block.content),
              cssClass: block.cssClass,
              backgroundColor: block.backgroundColor,
              textColor: block.textColor,
              padding: block.padding,
              isVisible: block.isVisible,
            }))
          );
        }

        await invalidateCache("pages:*");
        return c.json(cloned, 201);
      },
    })
  );

  return ops;
}

/** El router REST, generado de las operaciones (lo monta el cargador de kons). */
export function createBlocksRouter(ctx: KonContext): Hono {
  return routerDeOperaciones(KON_ID, operacionesDeBloques(ctx), ctx);
}

// Legacy exports maintained for compatibility
// Use createBlocksRouter(ctx) instead
export const blocksRoutes = createBlocksRouter;
