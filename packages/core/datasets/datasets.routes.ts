/**
 * DataSets — sus operaciones (SDK de kons)
 *
 * Colecciones dinámicas: definición, entradas, importación/exportación,
 * snapshots, búsqueda e índices. Cada ruta es una operación DECLARADA
 * (`defineOperacion`): de ella salen la ruta REST, su OpenAPI y su
 * herramienta MCP (docs/kons/README.md); los esquemas están en
 * `datasets.esquemas.ts`.
 *
 * La autorización de casi todo depende del DATASET (su `policyJson`) o de la
 * entrada (su dueño): se declara `permiso.politica.enHandler` y el handler la
 * comprueba con `autorizar(recurso)` tras cargarlos, con las mismas
 * respuestas que antes (404 si no lo ve, 401/403 si no puede escribir).
 */

import {
  can,
  defineOperacion,
  errorDeEntradaDePostgres,
  esUuid,
  messageOf,
  routerDeOperaciones,
  type AuthzUser,
  type OperacionCualquiera,
} from "@kitsuden/engine";
import {
  buildDatasetWhere,
  firmaDeAgente,
  publishedOrOwn,
  type KonContext,
  type AccionDeDataset,
  type PolicyJson,
  type RLSUser,
} from "@kitsuden/shared";
import { eq, and, asc, inArray, type SQL } from "drizzle-orm";
import type { Context, Hono } from "hono";
import { z } from "zod";

import {
  evaluateCalculatedField,
  formatCalculatedValue,
  type EvaluationContext,
} from "./datasets.calculated";
import { operacionesDeCamposCalculados } from "./datasets.calculated.routes";
import { dataSetCalculatedFields } from "./datasets.calculated.schema";
import {
  AplicarIndices,
  Busqueda,
  Comparacion,
  CompararEntradas,
  CompararSnapshots,
  Dataset,
  DatasetEntrada,
  Entrada,
  EntradaEntrada,
  EntradaOEntradas,
  EntradasEntrada,
  Exito,
  Exportar,
  Generico,
  Importar,
  ImportarPaquete,
  IndicesAuto,
  ListaDeDatasets,
  ListaDeEntradas,
  ParamEntrada,
  ParamId,
  ParamSlug,
  QueryBusqueda,
  QueryEntrada,
  QueryEntradas,
  QueryLimite,
  Restaurar,
  SnapshotManual,
} from "./datasets.esquemas";
import {
  exportDatasets,
  importToDataset,
  importPackage,
  exportConfigSchema,
  importConfigSchema,
  type ExportConfig,
  type ImportConfig,
} from "./datasets.import-export";
import {
  suggestIndexesForDataset,
  getIndexStats,
  applyAutoIndexes,
  generateIndexReport,
  applyIndexConfig,
  indexConfigSchema,
} from "./datasets.indexes";
import { esStaff, puedeVerDataset, scopeDeDatasetDe } from "./datasets.policy";
import { dataSets, dataEntries } from "./datasets.schema";
import {
  buscarEntradas,
  compararEntradas,
  leerFiltros,
  LIMITES_DE_BUSQUEDA,
  type FiltroCampo,
} from "./datasets.search";
import {
  getCurrentSnapshot,
  getSnapshotHistory,
  createManualSnapshot,
  restoreToSnapshot,
  compareSnapshots,
  detectSnapshotConfig,
} from "./datasets.snapshots";

/** El id del kon: es parte del scope fino de cada operación (`kon:datasets:<op>`). */
export const KON_ID = "kon-datasets";

/**
 * La respuesta de un `catch` de handler, por lo que de verdad pasó: un
 * esquema que no casa es 422, un dato que Postgres no admite (texto con U+0000,
 * un id que no es uuid, un duplicado) es 4xx, un «no existe» es 404. Antes todo
 * salía como 500 con el mensaje de Drizzle, consulta incluida (lo encontró
 * Schemathesis, 2026-10-26). Lo que sí es un fallo del servidor sigue en 500.
 */
export function respuestaDeFallo(
  c: Context,
  error: unknown,
  registrar: (mensaje: string, datos: Record<string, unknown>) => void,
  etiqueta: string
): Response {
  if (error instanceof z.ZodError) {
    return c.json(
      {
        error: "Validation failed",
        issues: error.issues.map((i) => ({ path: i.path, message: i.message })),
      },
      422
    );
  }
  const deEntrada = errorDeEntradaDePostgres(error);
  if (deEntrada) return c.json({ error: deEntrada.message }, deEntrada.status as 400 | 409 | 422);
  const mensaje = messageOf(error);
  if (/not found/i.test(mensaje)) return c.json({ error: mensaje }, 404);
  registrar(etiqueta, { error: mensaje });
  return c.json({ error: mensaje }, 500);
}

/**
 * Las operaciones de datasets, con el contexto del kon inyectado.
 */
export function operacionesDeDatasets(ctx: KonContext): OperacionCualquiera[] {
  const ops: OperacionCualquiera[] = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTORIZACIÓN (ver datasets.policy.ts)
  //
  // El kon autoriza cada operación por sí mismo con `can()`. Antes solo pedía
  // sesión, y el alta es pública: cualquier cuenta reescribía datos de juego,
  // cambiaba políticas ajenas y guardaba fórmulas que se ejecutaban.
  // ═══════════════════════════════════════════════════════════════════════════

  type Dataset = typeof dataSets.$inferSelect;
  type Entrada = typeof dataEntries.$inferSelect;

  const usuarioDe = (c: Context): AuthzUser | null =>
    ((c as unknown as { get(k: string): unknown }).get("user") ?? null) as AuthzUser | null;
  const comoRls = (user: AuthzUser | null): RLSUser =>
    user?.id ? { id: String(user.id), role: user.role } : null;

  /** 401 sin sesión, 403 con ella. */
  const denegar = (c: Context, user: AuthzUser | null) =>
    user ? c.json({ error: "Forbidden" }, 403) : c.json({ error: "Unauthorized" }, 401);

  async function datasetPorId(id: string): Promise<Dataset | null> {
    if (!esUuid(id)) return null;
    const [doc] = await ctx.db.instance.select().from(dataSets).where(eq(dataSets.id, id)).limit(1);
    return (doc as Dataset | undefined) ?? null;
  }

  /** El dataset si existe Y este usuario puede verlo; si no, `null` (→ 404). */
  async function datasetVisible(
    c: Context,
    id: string,
    paraAccion?: AccionDeDataset
  ): Promise<Dataset | null> {
    const ds = await datasetPorId(id);
    if (!ds) return null;
    return (await puedeVerDataset(usuarioDe(c), ds, paraAccion)) ? ds : null;
  }

  /**
   * El WHERE de entradas que este usuario puede ver en el dataset: el equipo
   * todas; los demás, filtradas por las `rlsRules` de la política.
   */
  function dondeVisible(ds: Dataset, user: AuthzUser | null): SQL {
    const reglas = esStaff(user) ? undefined : (ds.policyJson as PolicyJson | null)?.rlsRules;
    return buildDatasetWhere(ds.id, reglas, comoRls(user)).where as SQL;
  }

  /** Una entrada DE ESTE dataset (no de otro con el mismo id en la URL). */
  async function entradaDe(
    ds: Dataset,
    entryId: string,
    user?: AuthzUser | null
  ): Promise<Entrada | null> {
    if (!esUuid(entryId)) return null;
    // Con usuario y sin ser del equipo: publicadas o propias (auditoría 2026-10-25)
    const visible =
      user === undefined
        ? eq(dataEntries.dataSetId, ds.id)
        : esStaff(user)
          ? dondeVisible(ds, user)
          : and(dondeVisible(ds, user), publishedOrOwn((user as { id?: string } | null)?.id));
    const [doc] = await ctx.db.instance
      .select()
      .from(dataEntries)
      .where(and(visible, eq(dataEntries.id, entryId)))
      .limit(1);
    return (doc as Entrada | undefined) ?? null;
  }

  const SLUG_VALIDO = /^[a-z0-9][a-z0-9-]{0,198}$/;

  /**
   * Lo que se puede escribir de un dataset. `PATCH` hacía `set({...body})`: se
   * podía cambiar el `id`, las fechas o la `policyJson` de cualquiera.
   */
  function cambiosDeDataset(body: Record<string, unknown>, puedePolitica: boolean) {
    const cambios: Record<string, unknown> = {};
    const texto = (v: unknown, max: number) => typeof v === "string" && v.length <= max;
    if (body.name !== undefined) {
      if (!texto(body.name, 200) || !(body.name as string).trim())
        throw new Error("name no válido");
      cambios.name = body.name;
    }
    if (body.slug !== undefined) {
      if (typeof body.slug !== "string" || !SLUG_VALIDO.test(body.slug))
        throw new Error("slug no válido");
      cambios.slug = body.slug;
    }
    if (body.description !== undefined) cambios.description = body.description;
    if (body.icon !== undefined) {
      if (body.icon !== null && !texto(body.icon, 50)) throw new Error("icon no válido");
      cambios.icon = body.icon;
    }
    const schema = body.schema ?? body.fields;
    if (schema !== undefined) cambios.schema = schema;
    if (body.displayConfig !== undefined) cambios.displayConfig = body.displayConfig;
    if (body.workflowJson !== undefined) cambios.workflowJson = body.workflowJson;
    if (body.contentConfig !== undefined) cambios.contentConfig = body.contentConfig;
    if (body.gameId !== undefined) {
      if (body.gameId !== null && !esUuid(String(body.gameId))) throw new Error("gameId no válido");
      cambios.gameId = body.gameId;
    }
    for (const k of [
      "sourceName",
      "sourceUrl",
      "sourceLicense",
      "sourceVersion",
      "sourceCaveats",
    ] as const) {
      if (body[k] !== undefined) cambios[k] = body[k];
    }
    if (body.policyJson !== undefined) {
      if (!puedePolitica) throw new PermisoDePolitica();
      cambios.policyJson = body.policyJson;
    }
    return cambios;
  }
  class PermisoDePolitica extends Error {}

  /** Máximo de entradas por petición al crear en bloque. */
  const MAX_ENTRADAS_POR_PETICION = 1000;

  /**
   * Lo que se puede escribir de una entrada. El equipo, todo lo editorial;
   * los demás solo `title` y `data` (ni estado, ni orden, ni dueño, ni el
   * dataset al que pertenece: `PATCH` con `{dataSetId}` la movía de sitio).
   */
  function camposDeEntrada(e: Record<string, unknown>, staff: boolean) {
    const fila: Record<string, unknown> = {};
    if (e.title !== undefined)
      fila.title = typeof e.title === "string" ? e.title.slice(0, 500) : String(e.title);
    if (e.data !== undefined) {
      if (typeof e.data !== "object" || e.data === null || Array.isArray(e.data)) {
        throw new Error("data debe ser un objeto");
      }
      fila.data = e.data;
    }
    if (staff) {
      if (e.status !== undefined) fila.status = String(e.status).slice(0, 50);
      if (e.sortOrder !== undefined) fila.sortOrder = Number(e.sortOrder) || 0;
      if (e.thumbnailId !== undefined) {
        if (e.thumbnailId !== null && !esUuid(String(e.thumbnailId)))
          throw new Error("thumbnailId no válido");
        fila.thumbnailId = e.thumbnailId;
      }
      if (e.ownerId !== undefined) fila.ownerId = e.ownerId === null ? null : String(e.ownerId);
    }
    return fila;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATASETS CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET / - List all datasets
   */
  ops.push(
    defineOperacion({
      id: "listar-datasets",
      metodo: "GET",
      ruta: "/",
      resumen: "List datasets",
      descripcion:
        "The datasets this caller can read (each dataset's policyJson.readAccess decides; staff see all), ordered by name, with their field schema.",
      acceso: "publico",
      entrada: { query: QueryLimite },
      salida: { esquema: ListaDeDatasets },
      manejar: async (_entrada, { c }) => {
        const limit = Math.min(Number(c.req.query("limit")) || 50, 200);

        const user = usuarioDe(c);

        const filas = await ctx.db.instance
          .select()
          .from(dataSets)
          .orderBy(asc(dataSets.name))
          .limit(limit);

        // Solo los que este usuario puede ver: antes se listaban todos, con su
        // esquema y su política, también los de solo administración.
        const docs = [];
        for (const ds of filas) if (await puedeVerDataset(user, ds)) docs.push(ds);

        return c.json({ docs, totalDocs: docs.length });
      },
    })
  );

  /**
   * POST / - Create dataset
   */
  ops.push(
    defineOperacion({
      id: "crear-dataset",
      metodo: "POST",
      ruta: "/",
      resumen: "Create a dataset",
      descripcion:
        "Creates a dataset (a typed collection) with its field schema. New datasets are admin-only to read and write unless an admin sets policyJson.",
      acceso: "sesion",
      permiso: { politica: { recurso: "dataset", accion: "create" } },
      entrada: { cuerpo: DatasetEntrada },
      salida: { estado: 201, esquema: Dataset },
      errores: ["KITSUDEN_E_CONFLICT"],
      manejar: async (entrada, { c }) => {
        const user = usuarioDe(c);

        const body = entrada.cuerpo ?? {};

        // Validate required fields
        if (!body.name || typeof body.name !== "string") {
          return c.json({ error: "name is required" }, 400);
        }

        // Generate slug
        const slug =
          body.slug ||
          body.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");

        if (typeof slug !== "string" || !SLUG_VALIDO.test(slug)) {
          return c.json({ error: "slug no válido (a-z, 0-9 y guiones)" }, 400);
        }
        // La política decide quién lee y escribe: un editor crea con la de por
        // defecto (solo administración); fijarla es de `admin`.
        if (body.policyJson !== undefined && !(await can(user, "change-policy", {}, "dataset"))) {
          return c.json(
            { error: "Solo administración puede fijar la política de un dataset" },
            403
          );
        }

        // Check slug uniqueness
        const existing = await ctx.db.instance
          .select({ id: dataSets.id })
          .from(dataSets)
          .where(eq(dataSets.slug, slug))
          .limit(1);

        if (existing.length > 0) {
          return c.json({ error: "Slug already exists" }, 409);
        }

        const [doc] = await ctx.db.instance
          .insert(dataSets)
          .values({
            name: body.name,
            slug,
            description: body.description,
            icon: body.icon,
            /**
             * ── LAS COLUMNAS SE LLAMAN `schema` AQUÍ Y `fields` EN EL PANEL ────
             *
             * La columna de la base es `schema` y guarda un ARRAY de definiciones
             * de campo, que es lo que leen el cargador, el sitio público y la
             * pantalla de entradas. Pero `DatasetDefinition` de `@kitsuden/shared`
             * llama `fields` a ese mismo array, y el panel manda eso: al crear un
             * dataset desde el panel, `body.schema` era `undefined` y se guardaba
             * el valor por defecto. Resultado: **un dataset nuevo nacía sin
             * ninguna columna**, y encima como objeto donde todo lo demás espera
             * un array.
             *
             * Se aceptan los dos nombres y se guarda siempre un array.
             */
            schema: body.schema ?? body.fields ?? [],
            displayConfig: body.displayConfig,
            policyJson: body.policyJson || {
              readAccess: "admin",
              writeAccess: "admin",
              enableRLS: false,
            },
            workflowJson: body.workflowJson,
            gameId: body.gameId,
          })
          .returning();

        ctx.events.emit("dataset:created", doc);

        return c.json(doc, 201);
      },
    })
  );

  /**
   * GET /:id - Get dataset by ID
   */
  ops.push(
    defineOperacion({
      id: "obtener-dataset",
      metodo: "GET",
      ruta: "/:id",
      resumen: "Get a dataset",
      descripcion:
        "One dataset by uuid, if this caller can read it (otherwise 404: existence is not confirmed).",
      acceso: "publico",
      entrada: { params: ParamId },
      salida: { esquema: Dataset },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (entrada, { c }) => {
        const id = entrada.params.id;
        // Un id que no es UUID no puede existir: pasarlo a la consulta hace que
        // Postgres lance `invalid input syntax for type uuid`, que sale como 500.
        // Le paso al panel de inicio pidiendo `/api/datasets/count`, que encajaba
        // aqui con id="count".
        if (!esUuid(id)) return c.json({ error: "DataSet not found" }, 404);

        // 404 también sin permiso: no se confirma que exista.
        const doc = await datasetVisible(c, id);

        if (!doc) {
          return c.json({ error: "Dataset not found" }, 404);
        }

        return c.json(doc);
      },
    })
  );

  /**
   * GET /slug/:slug - Get dataset by slug
   */
  ops.push(
    defineOperacion({
      id: "obtener-dataset-por-slug",
      metodo: "GET",
      ruta: "/slug/:slug",
      resumen: "Get a dataset by slug",
      descripcion: "One dataset by slug, if this caller can read it (otherwise 404).",
      acceso: "publico",
      entrada: { params: ParamSlug },
      salida: { esquema: Dataset },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (entrada, { c }) => {
        const slug = entrada.params.slug;

        const [doc] = await ctx.db.instance
          .select()
          .from(dataSets)
          .where(eq(dataSets.slug, slug))
          .limit(1);

        if (!doc || !(await puedeVerDataset(usuarioDe(c), doc))) {
          return c.json({ error: "Dataset not found" }, 404);
        }

        return c.json(doc);
      },
    })
  );

  /**
   * PATCH /:id - Update dataset
   */
  ops.push(
    defineOperacion({
      id: "editar-dataset",
      metodo: "PATCH",
      ruta: "/:id",
      resumen: "Update a dataset",
      descripcion:
        "Changes the definition of a dataset (name, slug, schema, display, source…). Changing policyJson needs an admin.",
      acceso: "sesion",
      permiso: { politica: { recurso: "dataset", accion: "update", enHandler: true } },
      entrada: { params: ParamId, cuerpo: DatasetEntrada },
      salida: { esquema: Dataset },
      errores: ["KITSUDEN_E_NOT_FOUND", "KITSUDEN_E_CONFLICT"],
      manejar: async (entrada, { c, autorizar }) => {
        const id = entrada.params.id;
        // Un id que no es UUID no puede existir: pasarlo a la consulta hace que
        // Postgres lance `invalid input syntax for type uuid`, que sale como 500.
        // Le paso al panel de inicio pidiendo `/api/datasets/count`, que encajaba
        // aqui con id="count".
        if (!esUuid(id)) return c.json({ error: "DataSet not found" }, 404);
        const body = entrada.cuerpo ?? {};

        const [existing] = await ctx.db.instance
          .select()
          .from(dataSets)
          .where(eq(dataSets.id, id))
          .limit(1);

        const user = usuarioDe(c);
        if (!existing || !(await puedeVerDataset(user, existing))) {
          return c.json({ error: "Dataset not found" }, 404);
        }
        await autorizar(existing);

        let cambios: Record<string, unknown>;
        try {
          cambios = cambiosDeDataset(
            (body ?? {}) as Record<string, unknown>,
            await can(user, "change-policy", existing, "dataset")
          );
        } catch (err) {
          if (err instanceof PermisoDePolitica) {
            return c.json(
              { error: "Solo administración puede cambiar la política de un dataset" },
              403
            );
          }
          return c.json({ error: messageOf(err) }, 400);
        }

        // Check slug uniqueness if changing
        if (body.slug && body.slug !== existing.slug) {
          const conflict = await ctx.db.instance
            .select({ id: dataSets.id })
            .from(dataSets)
            .where(eq(dataSets.slug, body.slug))
            .limit(1);

          if (conflict.length > 0) {
            return c.json({ error: "Slug already exists" }, 409);
          }
        }

        const [updated] = await ctx.db.instance
          .update(dataSets)
          .set({
            ...cambios,
            updatedAt: new Date(),
          })
          .where(eq(dataSets.id, id))
          .returning();

        ctx.events.emit("dataset:updated", updated);

        return c.json(updated);
      },
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // CALCULATED FIELDS
  // ═══════════════════════════════════════════════════════════════════════════

  // Los campos calculados (/:id/calculated-fields), en el mismo sitio del
  // orden de registro que tenía su sub-router.
  ops.push(...operacionesDeCamposCalculados(ctx));

  /**
   * DELETE /:id - Delete dataset
   */
  ops.push(
    defineOperacion({
      id: "borrar-dataset",
      metodo: "DELETE",
      ruta: "/:id",
      resumen: "Delete a dataset",
      descripcion: "Deletes a dataset and all its entries. Admin only; cannot be undone.",
      acceso: "sesion",
      permiso: { roles: ["admin"] },
      entrada: { params: ParamId },
      salida: { esquema: Exito },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (entrada, { c }) => {
        const id = entrada.params.id;
        // Un id que no es UUID no puede existir: pasarlo a la consulta hace que
        // Postgres lance `invalid input syntax for type uuid`, que sale como 500.
        // Le paso al panel de inicio pidiendo `/api/datasets/count`, que encajaba
        // aqui con id="count".
        if (!esUuid(id)) return c.json({ error: "DataSet not found" }, 404);

        const [existing] = await ctx.db.instance
          .select({ id: dataSets.id })
          .from(dataSets)
          .where(eq(dataSets.id, id))
          .limit(1);

        if (!existing) {
          return c.json({ error: "Dataset not found" }, 404);
        }

        await ctx.db.instance.delete(dataSets).where(eq(dataSets.id, id));

        ctx.events.emit("dataset:deleted", { id });

        return c.json({ success: true });
      },
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ENTRIES CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /:id/entries - List entries
   *
   * Query params:
   *   - includeCalculated: "true" para incluir campos calculados
   *   - calculatedFields: lista de campos específicos (ej: "total,subtotal")
   *   - includeThumbnailUrl: "true" para incluir URL transformada de thumbnails
   */
  ops.push(
    defineOperacion({
      id: "listar-entradas",
      metodo: "GET",
      ruta: "/:id/entries",
      resumen: "List the entries of a dataset",
      descripcion:
        "Entries in sortOrder (up to 1000), filtered by the dataset's row rules for this caller. Optionally with calculated fields evaluated and thumbnail URLs.",
      acceso: "publico",
      entrada: { params: ParamId, query: QueryEntradas },
      salida: { esquema: ListaDeEntradas },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (entrada, { c }) => {
        const dataSetId = entrada.params.id;

        /**
         * Un id que no es UUID es un dataset que no existe, no un error del
         * servidor.
         *
         * Sin esta comprobacion, `eq(dataSets.id, dataSetId)` le entrega el texto a
         * Postgres, que responde `invalid input syntax for type uuid` y la peticion
         * termina en 500. Se veia con cualquier enlace viejo o mal escrito:
         * `GET /api/data-sets/no-existe/entries` devolvia un error de servidor donde
         * corresponde un 404.
         *
         * Lo detecto `scripts/humo-rutas.ts`, que pide todas las rutas registradas y
         * marca cualquier 5xx.
         */
        if (!esUuid(dataSetId)) {
          return c.json({ error: "Dataset not found" }, 404);
        }

        const limit = Math.min(Number(c.req.query("limit")) || 500, 1000);
        const status = c.req.query("status");
        const includeCalculated = c.req.query("includeCalculated") === "true";
        const includeThumbnailUrl = c.req.query("includeThumbnailUrl") === "true";
        const calculatedFieldsParam = c.req.query("calculatedFields");

        // SEGURIDAD (Nivel 1): la policy "dataset" decide si el usuario puede
        // leerlo (`readAccess`, o ser del equipo) y `dondeVisible` traduce sus
        // rlsRules a un WHERE (p.ej. ownerId = current_user). 404 en vez de 403
        // para no filtrar la existencia del dataset.
        const user = usuarioDe(c);
        const dataset = await datasetVisible(c, dataSetId);
        if (!dataset) {
          return c.json({ error: "Dataset not found" }, 404);
        }

        // Sin ser del equipo: solo lo publicado, o lo propio. Antes cualquier
        // lector veía los borradores (o los pedía con `?status=draft`)
        // (auditoría 2026-10-25).
        const rlsWhere = esStaff(user)
          ? dondeVisible(dataset, user)
          : and(dondeVisible(dataset, user), publishedOrOwn(user?.id));

        let query = ctx.db.instance.select().from(dataEntries).where(rlsWhere);

        if (status) {
          query = query.where(and(rlsWhere, eq(dataEntries.status, status)));
        }

        const docs = await query.orderBy(asc(dataEntries.sortOrder)).limit(limit);

        // Calcular campos calculados si se solicita
        let calculatedFields: any[] = [];
        let docsWithCalculated = docs;

        if (includeCalculated) {
          // Cargar campos calculados activos del dataset
          const cfQuery = ctx.db.instance
            .select()
            .from(dataSetCalculatedFields)
            .where(
              and(
                eq(dataSetCalculatedFields.dataSetId, dataSetId),
                eq(dataSetCalculatedFields.isActive, true)
              )
            );

          // Filtrar campos específicos si se proporcionan
          if (calculatedFieldsParam) {
            const fieldNames = calculatedFieldsParam.split(",");
            calculatedFields = await cfQuery;
            calculatedFields = calculatedFields.filter((f) => fieldNames.includes(f.name));
          } else {
            calculatedFields = await cfQuery;
          }

          // Evaluar campos calculados para cada entry
          docsWithCalculated = docs.map((doc: any) => {
            const calculated: Record<string, unknown> = {};

            // Merge data con el entry para evaluación
            const row = {
              ...doc.data,
              id: doc.id,
              title: doc.title,
              status: doc.status,
              createdAt: doc.createdAt,
              updatedAt: doc.updatedAt,
            };

            const evalContext: EvaluationContext = {
              row,
              now: new Date(),
            };

            for (const field of calculatedFields) {
              try {
                const value = evaluateCalculatedField(field, evalContext);
                calculated[field.name] = formatCalculatedValue(value, field.format || undefined);
              } catch (err) {
                ctx.logger.warn(`Error evaluating calculated field "${field.name}":`, err as any);
                calculated[field.name] = null;
              }
            }

            return {
              ...doc,
              _calculated: calculated,
            };
          });
        }

        // Agregar URLs de thumbnails si se solicitan
        let docsWithThumbnails = docsWithCalculated;
        if (includeThumbnailUrl) {
          docsWithThumbnails = docsWithCalculated.map((doc: any) => {
            if (doc.thumbnailId) {
              return {
                ...doc,
                thumbnailUrl: `/api/media/preset/${doc.thumbnailId}/thumbnail`,
              };
            }
            return doc;
          });
        }

        return c.json({
          docs: docsWithThumbnails,
          totalDocs: docs.length,
          calculatedFields: includeCalculated
            ? calculatedFields.map((f) => ({
                id: f.id,
                name: f.name,
                label: f.label,
                type: f.type,
                format: f.format,
              }))
            : undefined,
          dataset: {
            id: dataset.id,
            name: dataset.name,
            slug: dataset.slug,
          },
        });
      },
    })
  );

  /**
   * POST /:id/entries - Create entry
   */
  ops.push(
    defineOperacion({
      id: "crear-entrada",
      metodo: "POST",
      ruta: "/:id/entries",
      resumen: "Create entries",
      descripcion:
        "Creates one entry, or up to 1000 when the body is an array. The owner is the caller (staff can set ownerId); status, order and owner are staff-only fields.",
      acceso: "sesion",
      permiso: {
        politica: { recurso: "dataset-entry", accion: "create", enHandler: true },
        scopeDeRecurso: (_e, recurso) => scopeDeDatasetDe(recurso, "write"),
      },
      entrada: { params: ParamId, cuerpo: EntradasEntrada },
      salida: { estado: 201, esquema: EntradaOEntradas },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (entrada, { c, autorizar }) => {
        const dataSetId = entrada.params.id;

        // Mismo motivo que en el GET: un id que no es UUID revienta la consulta.
        if (!esUuid(dataSetId)) {
          return c.json({ error: "Dataset not found" }, 404);
        }

        const body = entrada.cuerpo ?? {};
        const user = usuarioDe(c);

        // Verify dataset exists (y que este usuario lo ve: 404 si no)
        const dataset = await datasetVisible(c, dataSetId, "write");

        if (!dataset) {
          return c.json({ error: "Dataset not found" }, 404);
        }
        // Antes bastaba la sesión: cualquier cuenta escribía en cualquier dataset.
        await autorizar({ dataset });

        // Support bulk creation
        const entries = Array.isArray(body) ? body : [body];
        if (entries.length === 0 || entries.length > MAX_ENTRADAS_POR_PETICION) {
          return c.json(
            { error: `Entre 1 y ${MAX_ENTRADAS_POR_PETICION} entradas por petición` },
            400
          );
        }

        const staff = esStaff(user);
        let valores: Record<string, unknown>[];
        try {
          // Fase F: el dueño de lo que crea un AGENTE es su firmante humano
          // (sin firmante, sin dueño, como antes). Ver @kitsuden/shared firmante.ts.
          const pedidoDeAgente = (e: unknown) =>
            (e as { ownerId?: unknown } | null)?.ownerId as string | undefined;
          valores = entries.map((e: unknown) => {
            if (user?.role === "agent") {
              const firma = firmaDeAgente(user as never, pedidoDeAgente(e), "nadie");
              if (!firma.ok) throw new FirmaRechazada(firma.code, firma.mensaje);
            }
            if (typeof e !== "object" || e === null)
              throw new Error("Cada entrada debe ser un objeto");
            const campos = camposDeEntrada(e as Record<string, unknown>, staff);
            return {
              title: (campos.title as string | undefined) || "Untitled",
              dataSetId,
              data: campos.data ?? {},
              // Sin ser del equipo, el estado no se elige: lo decide el flujo del
              // dataset (con `requireApproval`, borrador). Antes salía publicado
              // sin revisión (auditoría 2026-10-25).
              status:
                campos.status ??
                (!staff &&
                (dataset as { workflowJson?: { requireApproval?: boolean } | null }).workflowJson
                  ?.requireApproval
                  ? "draft"
                  : "published"),
              sortOrder: campos.sortOrder ?? 0,
              thumbnailId: campos.thumbnailId,
              // El dueño es quien escribe. Solo el equipo puede asignarlo a otro
              // (cargas editoriales); sin esto `rlsRules` por dueño no aislaba nada.
              // Un AGENTE no es una cuenta (`owner_id` apunta a auth_users): su fila
              // queda sin dueño y `createdById` dice quién la escribió (fase E).
              ownerId:
                staff && campos.ownerId !== undefined
                  ? campos.ownerId
                  : user?.role === "agent"
                    ? ((
                        firmaDeAgente(user as never, pedidoDeAgente(e), "nadie") as {
                          autor?: string | null;
                        }
                      ).autor ?? null)
                    : (user?.id ?? null),
              createdById: user?.id ?? null,
              updatedById: user?.id ?? null,
            };
          });
        } catch (err) {
          if (err instanceof FirmaRechazada) {
            return c.json({ error: "Forbidden", message: err.message, code: err.code }, 403);
          }
          return c.json({ error: messageOf(err) }, 400);
        }

        const rows = await ctx.db.instance
          .insert(dataEntries)
          .values(valores as never)
          .returning();

        ctx.events.emit("entry:created", { datasetId: dataSetId, entries: rows });

        return c.json(Array.isArray(body) ? rows : rows[0], 201);
      },
    })
  );

  /**
   * GET /:id/entries/:entryId - Get single entry
   *
   * Query params:
   *   - includeThumbnailUrl: "true" para incluir URL transformada del thumbnail
   *
   * Antes buscaba la entrada SOLO por su id: ni comprobaba que fuera de este
   * dataset ni aplicaba su política, así que cualquier entrada de un dataset
   * privado se leía por id desde la URL de uno público.
   */
  ops.push(
    defineOperacion({
      id: "obtener-entrada",
      metodo: "GET",
      ruta: "/:id/entries/:entryId",
      resumen: "Get an entry",
      descripcion:
        "One entry of THIS dataset, if the dataset and its row rules let this caller see it (otherwise 404).",
      acceso: "publico",
      entrada: { params: ParamEntrada, query: QueryEntrada },
      salida: { esquema: Entrada },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (entrada, { c }) => {
        const entryId = entrada.params.entryId;
        const includeThumbnailUrl = c.req.query("includeThumbnailUrl") === "true";

        const dataset = await datasetVisible(c, entrada.params.id);
        const doc = dataset ? await entradaDe(dataset, entryId, usuarioDe(c)) : null;

        if (!doc) {
          return c.json({ error: "Entry not found" }, 404);
        }

        // Agregar URL de thumbnail si se solicita
        if (includeThumbnailUrl && doc.thumbnailId) {
          return c.json({
            ...doc,
            thumbnailUrl: `/api/media/preset/${doc.thumbnailId}/thumbnail`,
          });
        }

        return c.json(doc);
      },
    })
  );

  /**
   * PATCH /:id/entries/:entryId - Update entry
   *
   * Hacía `set({...body})` sobre la entrada con ese id, de CUALQUIER dataset y
   * de cualquier dueño: se podía reescribir, mover de dataset o cambiar de
   * dueño la entrada de otro.
   */
  ops.push(
    defineOperacion({
      id: "editar-entrada",
      metodo: "PATCH",
      ruta: "/:id/entries/:entryId",
      resumen: "Update an entry",
      descripcion:
        "Changes title/data (and, for staff, the editorial fields). Outside the staff, only the owner can edit, and only where the dataset policy lets them write.",
      acceso: "sesion",
      permiso: {
        politica: { recurso: "dataset-entry", accion: "update", enHandler: true },
        scopeDeRecurso: (_e, recurso) => scopeDeDatasetDe(recurso, "write"),
      },
      entrada: { params: ParamEntrada, cuerpo: EntradaEntrada.optional() },
      salida: { esquema: Entrada },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (entrada, { c, autorizar }) => {
        const entryId = entrada.params.entryId;
        const body = entrada.cuerpo ?? {};
        const user = usuarioDe(c);

        const dataset = await datasetVisible(c, entrada.params.id, "write");
        const existing = dataset ? await entradaDe(dataset, entryId, user) : null;

        if (!dataset || !existing) {
          return c.json({ error: "Entry not found" }, 404);
        }
        await autorizar({ dataset, entry: existing });

        let cambios: Record<string, unknown>;
        try {
          if (typeof body !== "object" || body === null || Array.isArray(body))
            throw new Error("Cuerpo no válido");
          cambios = camposDeEntrada(body as Record<string, unknown>, esStaff(user));
        } catch (err) {
          return c.json({ error: messageOf(err) }, 400);
        }

        const [updated] = await ctx.db.instance
          .update(dataEntries)
          .set({
            ...cambios,
            updatedById: user?.id ?? null,
            updatedAt: new Date(),
          })
          .where(and(eq(dataEntries.id, entryId), eq(dataEntries.dataSetId, dataset.id)))
          .returning();

        ctx.events.emit("entry:updated", updated);

        return c.json(updated);
      },
    })
  );

  /**
   * DELETE /:id/entries/:entryId - Delete entry
   */
  ops.push(
    defineOperacion({
      id: "borrar-entrada",
      metodo: "DELETE",
      ruta: "/:id/entries/:entryId",
      resumen: "Delete an entry",
      descripcion:
        "Deletes one entry of this dataset. Outside the staff, only the owner can, where the policy allows writing.",
      acceso: "sesion",
      permiso: {
        politica: { recurso: "dataset-entry", accion: "delete", enHandler: true },
        scopeDeRecurso: (_e, recurso) => scopeDeDatasetDe(recurso, "delete"),
      },
      entrada: { params: ParamEntrada },
      salida: { esquema: Exito },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (entrada, { c, autorizar }) => {
        const entryId = entrada.params.entryId;
        const user = usuarioDe(c);

        const dataset = await datasetVisible(c, entrada.params.id, "delete");
        const existing = dataset ? await entradaDe(dataset, entryId, user) : null;

        if (!dataset || !existing) {
          return c.json({ error: "Entry not found" }, 404);
        }
        await autorizar({ dataset, entry: existing });

        await ctx.db.instance
          .delete(dataEntries)
          .where(and(eq(dataEntries.id, entryId), eq(dataEntries.dataSetId, dataset.id)));

        ctx.events.emit("entry:deleted", { id: entryId });

        return c.json({ success: true });
      },
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // IMPORT / EXPORT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /export - Export datasets
   */
  ops.push(
    defineOperacion({
      id: "exportar-datasets",
      metodo: "POST",
      ruta: "/export",
      resumen: "Export datasets",
      descripcion:
        "Exports whole datasets (schema, entries, optionally calculated fields) ignoring their read policy: staff only.",
      acceso: "sesion",
      permiso: { politica: { recurso: "dataset", accion: "export" } },
      idempotente: true,
      entrada: { cuerpo: Exportar },
      salida: { esquema: Generico },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (entrada, { c }) => {
        // Exportar es sacar datasets ENTEROS, sin mirar su política de lectura:
        // del equipo. Antes bastaba cualquier sesión (y el alta es pública), así
        // que la guardia de `/data` del sitio no protegía nada.
        try {
          const body = entrada.cuerpo ?? {};
          const config = exportConfigSchema.parse(body) as ExportConfig;

          const exportPackage = await exportDatasets(ctx, config);

          return c.json(exportPackage);
        } catch (error: unknown) {
          return respuestaDeFallo(c, error, (m, d) => ctx.logger.error(m, d), "Export failed:");
        }
      },
    })
  );

  /**
   * POST /import - Import data to datasets
   */
  ops.push(
    defineOperacion({
      id: "importar-a-dataset",
      metodo: "POST",
      ruta: "/import",
      resumen: "Import entries into a dataset",
      descripcion:
        "Imports rows into one dataset with a strategy (upsert, replace, merge, insert). Admin only.",
      acceso: "sesion",
      permiso: { roles: ["admin"] },
      sensible: true,
      entrada: { cuerpo: Importar },
      salida: { esquema: Generico },
      manejar: async (entrada, { c }) => {
        try {
          const body = entrada.cuerpo ?? {};
          const { datasetId, data, config: importConfig } = body;

          if (!datasetId || !Array.isArray(data)) {
            return c.json({ error: "datasetId and data array are required" }, 400);
          }

          const config = importConfigSchema.parse(importConfig || {}) as ImportConfig;
          const result = await importToDataset(ctx, datasetId, data, config);

          return c.json(result);
        } catch (error: unknown) {
          return respuestaDeFallo(c, error, (m, d) => ctx.logger.error(m, d), "Import failed:");
        }
      },
    })
  );

  /**
   * POST /import/package - Import complete package
   */
  ops.push(
    defineOperacion({
      id: "importar-paquete",
      metodo: "POST",
      ruta: "/import/package",
      resumen: "Import an export package",
      descripcion:
        "Imports a full package produced by the export (datasets and their entries). Admin only.",
      acceso: "sesion",
      permiso: { roles: ["admin"] },
      sensible: true,
      entrada: { cuerpo: ImportarPaquete },
      salida: { esquema: Generico },
      manejar: async (entrada, { c }) => {
        try {
          const body = entrada.cuerpo ?? {};
          const { package: packageData, config } = body;

          if (!packageData || !packageData.datasets) {
            return c.json({ error: "Valid package is required" }, 400);
          }

          const result = await importPackage(
            ctx,
            // El paquete lo comprueba `importPackage` (lo produjo el export)
            packageData as unknown as Parameters<typeof importPackage>[1],
            (config ?? { strategy: "upsert" }) as unknown as Parameters<typeof importPackage>[2]
          );

          return c.json(result);
        } catch (error: unknown) {
          return respuestaDeFallo(
            c,
            error,
            (m, d) => ctx.logger.error(m, d),
            "Package import failed:"
          );
        }
      },
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // SNAPSHOTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /:id/entries/:entryId/snapshot - Get current snapshot
   */
  ops.push(
    defineOperacion({
      id: "leer-snapshot",
      metodo: "GET",
      ruta: "/:id/entries/:entryId/snapshot",
      resumen: "Current snapshot of an entry",
      descripcion: "The latest stored snapshot of an entry (same visibility as reading the entry).",
      acceso: "publico",
      entrada: { params: ParamEntrada },
      salida: { esquema: Generico },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (entrada, { c }) => {
        const entryId = entrada.params.entryId;
        // Un snapshot es una copia de la entrada: misma política que leerla.
        const dataset = await datasetVisible(c, entrada.params.id);
        if (!dataset || !(await entradaDe(dataset, entryId, usuarioDe(c)))) {
          return c.json({ error: "No snapshot found" }, 404);
        }

        const snapshot = await getCurrentSnapshot(ctx, entryId);

        if (!snapshot) {
          return c.json({ error: "No snapshot found" }, 404);
        }

        return c.json(snapshot);
      },
    })
  );

  /**
   * GET /:id/entries/:entryId/snapshots - Get snapshot history
   */
  ops.push(
    defineOperacion({
      id: "historial-de-snapshots",
      metodo: "GET",
      ruta: "/:id/entries/:entryId/snapshots",
      resumen: "Snapshot history of an entry",
      descripcion: "Every stored snapshot of an entry, newest first.",
      acceso: "publico",
      entrada: { params: ParamEntrada },
      salida: { esquema: z.object({ snapshots: z.array(Generico), total: z.number().int() }) },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (entrada, { c }) => {
        const entryId = entrada.params.entryId;
        const dataset = await datasetVisible(c, entrada.params.id);
        if (!dataset || !(await entradaDe(dataset, entryId, usuarioDe(c)))) {
          return c.json({ error: "Entry not found" }, 404);
        }

        const history = await getSnapshotHistory(ctx, entryId);

        return c.json({ snapshots: history, total: history.length });
      },
    })
  );

  /**
   * POST /:id/entries/:entryId/snapshots - Create manual snapshot
   */
  ops.push(
    defineOperacion({
      id: "crear-snapshot",
      metodo: "POST",
      ruta: "/:id/entries/:entryId/snapshots",
      resumen: "Take a manual snapshot of an entry",
      descripcion:
        "Stores the current state of an entry (with optional reason and calculated values). Staff only.",
      acceso: "sesion",
      permiso: { politica: { recurso: "dataset", accion: "update", enHandler: true } },
      entrada: { params: ParamEntrada, cuerpo: SnapshotManual },
      salida: { estado: 201, esquema: Generico },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (entrada, { c, autorizar }) => {
        const entryId = entrada.params.entryId;
        const dataSetId = entrada.params.id;
        const body = entrada.cuerpo ?? {};
        const user = usuarioDe(c);

        try {
          // Get dataset config
          const dataset = await datasetVisible(c, dataSetId);

          if (!dataset || !(await entradaDe(dataset, entryId))) {
            return c.json({ error: "Dataset not found" }, 404);
          }
          // Un snapshot manual lleva `calculatedValues` del cuerpo: es del equipo.
          await autorizar(dataset);

          const config = detectSnapshotConfig(dataset) || {
            enabled: true,
            on: ["manual"],
            fields: [],
          };

          const snapshot = await createManualSnapshot(ctx, entryId, config, {
            reason: body.reason,
            calculatedValues: body.calculatedValues,
          });

          return c.json(snapshot, 201);
        } catch (error: unknown) {
          return respuestaDeFallo(
            c,
            error,
            (m, d) => ctx.logger.error(m, d),
            "Snapshot creation failed:"
          );
        }
      },
    })
  );

  /**
   * POST /:id/entries/:entryId/restore - Restore to snapshot
   */
  ops.push(
    defineOperacion({
      id: "restaurar-snapshot",
      metodo: "POST",
      ruta: "/:id/entries/:entryId/restore",
      resumen: "Restore an entry to a snapshot",
      descripcion: "Rewrites the entry with the snapshot taken at `timestamp`. Staff only.",
      acceso: "sesion",
      permiso: { politica: { recurso: "dataset", accion: "update", enHandler: true } },
      sensible: true,
      idempotente: true,
      entrada: { params: ParamEntrada, cuerpo: Restaurar },
      salida: { esquema: z.object({ success: z.literal(true), restored: z.literal(true) }) },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (entrada, { c, autorizar }) => {
        const entryId = entrada.params.entryId;
        const body = entrada.cuerpo ?? {};
        const user = usuarioDe(c);

        // Restaurar REESCRIBE la entrada con un snapshot: del equipo, y solo
        // entradas de ESTE dataset.
        const dataset = await datasetVisible(c, entrada.params.id);
        if (!dataset || !(await entradaDe(dataset, entryId))) {
          return c.json({ error: "Entry not found" }, 404);
        }
        await autorizar(dataset);

        if (!body.timestamp) {
          return c.json({ error: "timestamp is required" }, 400);
        }

        try {
          await restoreToSnapshot(ctx, entryId, body.timestamp);

          return c.json({ success: true, restored: true });
        } catch (error: unknown) {
          return respuestaDeFallo(c, error, (m, d) => ctx.logger.error(m, d), "Restore failed:");
        }
      },
    })
  );

  /**
   * POST /:id/entries/:entryId/compare - Compare snapshots
   */
  ops.push(
    defineOperacion({
      id: "comparar-snapshots",
      metodo: "POST",
      ruta: "/:id/entries/:entryId/compare",
      resumen: "Compare two snapshots",
      descripcion:
        "Field-by-field difference between two snapshot objects sent in the body. Pure computation: reads nothing.",
      acceso: "publico",
      idempotente: true,
      soloLectura: true,
      entrada: { params: ParamEntrada, cuerpo: CompararSnapshots },
      salida: { esquema: z.object({ comparison: z.unknown() }) },
      manejar: async (entrada, { c }) => {
        const body = entrada.cuerpo ?? {};

        if (!body.snapshot1 || !body.snapshot2) {
          return c.json({ error: "Both snapshot1 and snapshot2 are required" }, 400);
        }

        const comparison = compareSnapshots(
          body.snapshot1 as Parameters<typeof compareSnapshots>[0],
          body.snapshot2 as Parameters<typeof compareSnapshots>[1]
        );

        return c.json({ comparison });
      },
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // INDEXES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /:id/indexes/suggest - Get index suggestions
   */
  // ═══════════════════════════════════════════════════════════════════════════
  // BUSQUEDA, FACETAS Y COMPARACION
  //
  // Lo que faltaba para que un dataset se pueda CONSULTAR y no solo listar:
  // `/:id/entries` filtra por `status` y `limit`, asi que para encontrar algo
  // habia que traerse las mil entradas y buscarlas en el cliente.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Busca en las entradas de un dataset, con facetas.
   *
   *   /api/datasets/:id/search?q=espada&filtros=rarity:legendary,damage:100..
   *     &facetas=rarity,slot
   *
   * Las facetas se cuentan en la base de datos, no en JS: contar cincuenta mil
   * filas en memoria funciona en desarrollo y se cae con un catalogo real.
   */
  ops.push(
    defineOperacion({
      id: "buscar-entradas",
      metodo: "GET",
      ruta: "/:id/search",
      resumen: "Search the entries of a dataset",
      descripcion:
        "Full-text search with field filters and facet counts (computed in the database), within what this caller can see. Carries the data provenance (source, licence, version).",
      acceso: "publico",
      entrada: { params: ParamId, query: QueryBusqueda },
      salida: { esquema: Busqueda },
      errores: ["KITSUDEN_E_NOT_FOUND", "KITSUDEN_E_BAD_REQUEST"],
      manejar: async (entrada, { c }) => {
        const dataSetId = entrada.params.id;

        // Antes no aplicaba NINGUNA política: se buscaba en datasets privados.
        const dataset = await datasetVisible(c, dataSetId);
        if (!dataset) return c.json({ error: "Dataset not found" }, 404);

        let filtros: FiltroCampo[];
        try {
          filtros = leerFiltros(c.req.query("filtros"));
        } catch (error) {
          // Un filtro mal escrito NO se ignora: ignorarlo devuelve mas resultados
          // de los pedidos y quien lo lee cree que ha filtrado.
          return c.json({ error: messageOf(error) }, 400);
        }
        if (filtros.length > LIMITES_DE_BUSQUEDA.filtros) {
          return c.json({ error: `Como mucho ${LIMITES_DE_BUSQUEDA.filtros} filtros` }, 400);
        }

        try {
          const resultado = await buscarEntradas(ctx.db.instance as never, {
            dataSetId,
            // Outside the team: the published or their own, also through
            // `?status=draft` (it narrows this filter, it does not replace it).
            rls: esStaff(usuarioDe(c))
              ? undefined
              : and(
                  dondeVisible(dataset, usuarioDe(c)),
                  publishedOrOwn((usuarioDe(c) as { id?: string } | null)?.id)
                ),
            q: c.req.query("q"),
            filtros,
            facetas: (c.req.query("facetas") ?? "")
              .split(",")
              .map((f) => f.trim())
              .filter(Boolean)
              .slice(0, 8),
            status: c.req.query("status"),
            limit: Number(c.req.query("limit")) || 50,
            offset: Number(c.req.query("offset")) || 0,
          });

          return c.json({
            ...resultado,
            // La procedencia viaja CON el resultado: quien mira una busqueda puede
            // saber de que parche y de que fuente salio sin ir a otra pantalla.
            procedencia: dataset.sourceName
              ? {
                  sourceName: dataset.sourceName,
                  sourceUrl: dataset.sourceUrl,
                  sourceLicense: dataset.sourceLicense,
                  sourceVersion: dataset.sourceVersion,
                  fetchedAt: dataset.fetchedAt,
                  caveats: dataset.sourceCaveats,
                }
              : null,
          });
        } catch (error) {
          return c.json({ error: messageOf(error) }, 500);
        }
      },
    })
  );

  /**
   * Compara varias entradas DISTINTAS campo a campo.
   *
   * No confundir con `/entries/:entryId/compare`, que compara dos versiones de
   * LA MISMA entrada. Esto es el comparador de producto: "en que se diferencian
   * estas tres espadas".
   */
  ops.push(
    defineOperacion({
      id: "comparar-entradas",
      metodo: "POST",
      ruta: "/:id/compare",
      resumen: "Compare entries of a dataset",
      descripcion:
        "Field-by-field comparison of 2-8 different entries (how do these three swords differ). Read-only.",
      acceso: "publico",
      idempotente: true,
      soloLectura: true,
      entrada: { params: ParamId, cuerpo: CompararEntradas },
      salida: { esquema: Comparacion },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (entrada, { c }) => {
        const dataSetId = entrada.params.id;
        const body = (entrada.cuerpo ?? {}) as { entryIds?: unknown };
        const ids = Array.isArray(body.entryIds)
          ? body.entryIds.filter((x): x is string => typeof x === "string" && esUuid(x))
          : [];

        const dataset = await datasetVisible(c, dataSetId);
        if (!dataset) return c.json({ error: "Dataset not found" }, 404);

        if (ids.length < 2 || ids.length > 8) {
          return c.json({ error: "Manda entre 2 y 8 entryIds" }, 400);
        }

        /**
         * El tipo se anota a mano porque `ctx.db.instance` no lo propaga.
         *
         * Sin la anotación, `filas` es `any[]` y los `.map((f) => f.id)` de abajo
         * pasan el typecheck diciendo nada. Un `any` aquí no se ve en producción:
         * se ve el día que alguien renombra una columna y nada avisa.
         */
        const filas: (typeof dataEntries.$inferSelect)[] = await ctx.db.instance
          .select()
          .from(dataEntries)
          .where(
            and(
              dondeVisible(dataset, usuarioDe(c)),
              esStaff(usuarioDe(c))
                ? undefined
                : publishedOrOwn((usuarioDe(c) as { id?: string } | null)?.id),
              inArray(dataEntries.id, ids)
            )
          );

        if (filas.length < 2) {
          return c.json(
            {
              error: `Solo se encontraron ${filas.length} de ${ids.length} entradas en este dataset`,
            },
            404
          );
        }

        return c.json({
          data: filas.map((f) => ({ id: f.id, title: f.title })),
          diferencias: compararEntradas(
            filas.map((f) => ({
              id: f.id,
              title: f.title,
              data: (f.data ?? {}) as Record<string, unknown>,
            }))
          ),
        });
      },
    })
  );

  ops.push(
    defineOperacion({
      id: "sugerir-indices",
      metodo: "GET",
      ruta: "/:id/indexes/suggest",
      resumen: "Suggest indexes for a dataset",
      descripcion: "Index suggestions for the dataset fields (read-only analysis). Staff only.",
      acceso: "sesion",
      permiso: { politica: { recurso: "dataset", accion: "update" } },
      entrada: { params: ParamId },
      salida: { esquema: z.object({ suggestions: z.array(Generico) }) },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (entrada, { c }) => {
        const dataSetId = entrada.params.id;
        if (!esUuid(dataSetId)) return c.json({ error: "Dataset not found" }, 404);

        try {
          const [dataset] = await ctx.db.instance
            .select()
            .from(dataSets)
            .where(eq(dataSets.id, dataSetId))
            .limit(1);

          if (!dataset) {
            return c.json({ error: "Dataset not found" }, 404);
          }

          const suggestions = suggestIndexesForDataset(dataset.slug, dataset.schema);

          return c.json({ suggestions });
        } catch (error: unknown) {
          return respuestaDeFallo(
            c,
            error,
            (m, d) => ctx.logger.error(m, d),
            "Index suggestion failed:"
          );
        }
      },
    })
  );

  /**
   * GET /indexes/stats - Get index statistics
   */
  ops.push(
    defineOperacion({
      id: "estadisticas-de-indices",
      metodo: "GET",
      ruta: "/indexes/stats",
      resumen: "Index statistics",
      descripcion: "Index usage statistics of the whole database. Admin only.",
      acceso: "sesion",
      permiso: { politica: { recurso: "dataset", accion: "manage-indexes" } },
      salida: { esquema: z.object({ stats: z.unknown() }) },
      manejar: async (_entrada, { c }) => {
        // Estadísticas de índices de TODA la base: de administración.
        try {
          const stats = await getIndexStats(ctx);
          return c.json({ stats });
        } catch (error: unknown) {
          return respuestaDeFallo(
            c,
            error,
            (m, d) => ctx.logger.error(m, d),
            "Index stats failed:"
          );
        }
      },
    })
  );

  /**
   * POST /indexes/report - Generate index report
   */
  ops.push(
    defineOperacion({
      id: "informe-de-indices",
      metodo: "POST",
      ruta: "/indexes/report",
      resumen: "Index report",
      descripcion: "A report of missing and unused indexes. Read-only analysis; admin only.",
      acceso: "sesion",
      permiso: { politica: { recurso: "dataset", accion: "manage-indexes" } },
      idempotente: true,
      soloLectura: true,
      salida: { esquema: Generico },
      manejar: async (_entrada, { c }) => {
        try {
          const report = await generateIndexReport(ctx);
          return c.json(report);
        } catch (error: unknown) {
          return respuestaDeFallo(
            c,
            error,
            (m, d) => ctx.logger.error(m, d),
            "Index report failed:"
          );
        }
      },
    })
  );

  /**
   * POST /:id/indexes/apply - Apply index configuration
   */
  ops.push(
    defineOperacion({
      id: "aplicar-indices",
      metodo: "POST",
      ruta: "/:id/indexes/apply",
      resumen: "Apply an index configuration",
      descripcion:
        "Creates the configured indexes for a dataset (DDL on the database). Admin only.",
      acceso: "sesion",
      permiso: { roles: ["admin"] },
      sensible: true,
      idempotente: true,
      entrada: { params: ParamId, cuerpo: AplicarIndices },
      salida: { esquema: Generico },
      mcp: { excluir: "runs DDL on the database; a human task" },
      manejar: async (entrada, { c }) => {
        const dataSetId = entrada.params.id;
        const body = entrada.cuerpo ?? {};

        try {
          // Sin `config` valen los valores por defecto del esquema (antes, `parse(undefined)` = 500).
          const config = indexConfigSchema.parse(body.config ?? {});
          const result = await applyIndexConfig(ctx, dataSetId, config);

          return c.json(result);
        } catch (error: unknown) {
          return respuestaDeFallo(
            c,
            error,
            (m, d) => ctx.logger.error(m, d),
            "Apply indexes failed:"
          );
        }
      },
    })
  );

  /**
   * POST /indexes/auto - Apply auto indexes
   */
  ops.push(
    defineOperacion({
      id: "indices-automaticos",
      metodo: "POST",
      ruta: "/indexes/auto",
      resumen: "Apply suggested indexes automatically",
      descripcion:
        "Creates every suggested index above a confidence level across all datasets (DDL). Admin only.",
      acceso: "sesion",
      permiso: { roles: ["admin"] },
      sensible: true,
      idempotente: true,
      entrada: { cuerpo: IndicesAuto },
      salida: { esquema: Generico },
      mcp: { excluir: "runs DDL on the database; a human task" },
      manejar: async (entrada, { c }) => {
        const body = entrada.cuerpo ?? {};

        try {
          // Get all suggestions
          const { dataSets: dsTable } = await import("./datasets.schema");
          const datasets = await ctx.db.instance.select().from(dsTable);

          const allSuggestions: any[] = [];
          for (const dataset of datasets) {
            allSuggestions.push(...suggestIndexesForDataset(dataset.slug, dataset.schema));
          }

          const result = await applyAutoIndexes(ctx, allSuggestions, body.minConfidence || "high");

          return c.json(result);
        } catch (error: unknown) {
          return respuestaDeFallo(
            c,
            error,
            (m, d) => ctx.logger.error(m, d),
            "Auto indexes failed:"
          );
        }
      },
    })
  );

  return ops;
}

/** El router REST de datasets, generado de sus operaciones. */
export function createDatasetsRouter(ctx: KonContext): Hono {
  return routerDeOperaciones(KON_ID, operacionesDeDatasets(ctx), ctx);
}

/** Fase F: el firmante del agente no deja crear la entrada (403). */
class FirmaRechazada extends Error {
  constructor(
    readonly code: string,
    mensaje: string
  ) {
    super(mensaje);
  }
}
