/**
 * Kitsuden — Calculated Fields Routes
 * ============================================================================
 *
 * CRUD de campos calculados (KPIs) de un dataset.
 *
 * Son operaciones del SDK de kons que `operacionesDeDatasets` añade a las
 * suyas, en `/:id/calculated-fields` (el `:id` es el del dataset). Antes era
 * un sub-router con un `app.use("*")` que autorizaba: ahora cada operación
 * llama a `autorizarCampos()` al empezar, con las mismas respuestas.
 */

import {
  can,
  defineOperacion,
  errorDeEntradaDePostgres,
  esUuid,
  messageOf,
  type AuthzUser,
  type ContextoDeOperacion,
  type OperacionCualquiera,
} from "@kitsuden/engine";
import type { KonContext } from "@kitsuden/shared";
import { and, eq } from "drizzle-orm";
import type { Context } from "hono";

import { createCalculatedFieldSchema, updateCalculatedFieldSchema } from "./datasets.calculated";
import { dataSetCalculatedFields } from "./datasets.calculated.schema";
import {
  CampoCalculadoCambios,
  CampoCalculadoEntrada,
  CampoCalculadoSalida,
  Exito,
  ListaDeCamposCalculados,
  ParamCampo,
  ParamId,
} from "./datasets.esquemas";
import { puedeVerDataset } from "./datasets.policy";
import { dataSets } from "./datasets.schema";

export function operacionesDeCamposCalculados(ctx: KonContext): OperacionCualquiera[] {
  const { db, logger } = ctx;
  const ops: OperacionCualquiera[] = [];

  /** Lee el id del dataset del router padre (`/:id/calculated-fields`). */
  const datasetIdOf = (c: { req: { param: (k: string) => string | undefined } }) =>
    c.req.param("id") ?? c.req.param("datasetId");

  /**
   * Autorización de TODO el sub-router, antes de cada handler.
   *
   * No tenía ninguna: cualquier sesión (el alta es pública) creaba, cambiaba
   * o borraba fórmulas de cualquier dataset, y la fórmula se ejecutaba con
   * `new Function` al listar entradas. Leer exige poder ver el dataset;
   * escribir, poder editarlo (el equipo). 404 en vez de 403 al leer para no
   * confirmar que existe.
   */
  async function autorizarCampos(
    c: Context,
    autorizar: ContextoDeOperacion["autorizar"]
  ): Promise<Response | null> {
    const datasetId = datasetIdOf(c);
    if (!datasetId || !esUuid(datasetId)) {
      return c.json({ success: false, error: "Dataset not found" }, 404);
    }
    const [dataset] = await db.instance
      .select({ id: dataSets.id, policyJson: dataSets.policyJson })
      .from(dataSets)
      .where(eq(dataSets.id, datasetId))
      .limit(1);
    const user = ((c as unknown as { get(k: string): unknown }).get("user") ??
      null) as AuthzUser | null;
    if (!dataset || !(await puedeVerDataset(user, dataset))) {
      return c.json({ success: false, error: "Dataset not found" }, 404);
    }
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);
      // El permiso de la operación (política `dataset:update` o su scope fino)
      await autorizar(dataset);
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST — GET /api/datasets/:id/calculated-fields
  // ═══════════════════════════════════════════════════════════════════════════
  ops.push(
    defineOperacion({
      id: "listar-campos-calculados",
      metodo: "GET",
      ruta: "/:id/calculated-fields",
      resumen: "List the calculated fields of a dataset",
      descripcion:
        "The calculated fields (formulas, aggregates, KPIs) of a dataset this caller can read.",
      acceso: "publico",
      entrada: { params: ParamId },
      salida: { esquema: ListaDeCamposCalculados },
      errores: ["KITSUDEN_E_NOT_FOUND"],
      manejar: async (_entrada, { c, autorizar }) => {
        const no = await autorizarCampos(c, autorizar);
        if (no) return no;
        const datasetId = datasetIdOf(c);
        if (!datasetId) return c.json({ success: false, error: "datasetId requerido" }, 400);

        try {
          const fields = await db.instance
            .select()
            .from(dataSetCalculatedFields)
            .where(eq(dataSetCalculatedFields.dataSetId, datasetId))
            .orderBy(dataSetCalculatedFields.sortOrder);

          return c.json({
            success: true,
            fields: fields.map((f: any) => ({
              ...f,
              config: f.config || {},
              format: f.format || {},
              dependsOn: f.dependsOn || [],
            })),
          });
        } catch (err: unknown) {
          logger.error("Failed to list calculated fields", { err, datasetId });
          return c.json({ success: false, error: messageOf(err) }, 500);
        }
      },
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE — POST /api/datasets/:id/calculated-fields
  // ═══════════════════════════════════════════════════════════════════════════
  ops.push(
    defineOperacion({
      id: "crear-campo-calculado",
      metodo: "POST",
      ruta: "/:id/calculated-fields",
      resumen: "Create a calculated field",
      descripcion:
        "Adds a calculated field. Formulas are parsed by Kitsuden's own interpreter, never executed as code. Staff only.",
      acceso: "sesion",
      permiso: { politica: { recurso: "dataset", accion: "update", enHandler: true } },
      entrada: { params: ParamId, cuerpo: CampoCalculadoEntrada },
      salida: { estado: 201, esquema: CampoCalculadoSalida },
      errores: ["KITSUDEN_E_NOT_FOUND", "KITSUDEN_E_CONFLICT"],
      manejar: async (entrada, { c, autorizar }) => {
        const no = await autorizarCampos(c, autorizar);
        if (no) return no;
        const datasetId = datasetIdOf(c);
        if (!datasetId) return c.json({ success: false, error: "datasetId requerido" }, 400);

        // El cuerpo que ya leyó el SDK: `c.req.json()` sobre un cuerpo vacío
        // lanzaba «Unexpected EOF» y salía como 500 (Schemathesis, 2026-10-26).
        const body = entrada.cuerpo ?? {};
        const validation = createCalculatedFieldSchema.omit({ dataSetId: true }).safeParse(body);
        if (!validation.success) {
          return c.json(
            { success: false, error: "Validation failed", details: validation.error.format() },
            400
          );
        }
        const data = validation.data;

        try {
          // Nombre único dentro del dataset.
          const existing = await db.instance
            .select({ id: dataSetCalculatedFields.id })
            .from(dataSetCalculatedFields)
            .where(
              and(
                eq(dataSetCalculatedFields.dataSetId, datasetId),
                eq(dataSetCalculatedFields.name, data.name)
              )
            )
            .limit(1);

          if (existing.length > 0) {
            return c.json(
              { success: false, error: `Ya existe un campo calculado llamado "${data.name}"` },
              409
            );
          }

          const [field] = await db.instance
            .insert(dataSetCalculatedFields)
            .values({
              dataSetId: datasetId,
              name: data.name,
              label: data.label,
              type: data.type,
              config: data.config,
              format: data.format,
              description: data.description,
              category: data.category,
              isKpi: data.isKpi,
              target: data.target,
              warningThreshold: data.warningThreshold,
              dependsOn: data.dependsOn,
            })
            .returning();

          await ctx.cache.invalidate(`dataset:${datasetId}:*`);
          return c.json({ success: true, field }, 201);
        } catch (err: unknown) {
          const deEntrada = errorDeEntradaDePostgres(err);
          if (deEntrada) {
            return c.json(
              { success: false, error: deEntrada.message },
              deEntrada.status as 400 | 409 | 422
            );
          }
          logger.error("Failed to create calculated field", { err, datasetId });
          return c.json({ success: false, error: messageOf(err) }, 500);
        }
      },
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // GET ONE — GET /api/datasets/:id/calculated-fields/:fieldId
  // ═══════════════════════════════════════════════════════════════════════════
  ops.push(
    defineOperacion({
      id: "obtener-campo-calculado",
      metodo: "GET",
      ruta: "/:id/calculated-fields/:fieldId",
      resumen: "Get a calculated field",
      descripcion: "One calculated field of a dataset this caller can read.",
      acceso: "publico",
      entrada: { params: ParamCampo },
      salida: { esquema: CampoCalculadoSalida },
      errores: ["KITSUDEN_E_NOT_FOUND", "KITSUDEN_E_BAD_REQUEST"],
      manejar: async (entrada, { c, autorizar }) => {
        const no = await autorizarCampos(c, autorizar);
        if (no) return no;
        const datasetId = datasetIdOf(c);
        const fieldId = entrada.params.fieldId;
        if (!datasetId || !fieldId || !esUuid(fieldId)) {
          return c.json({ success: false, error: "datasetId y fieldId requeridos" }, 400);
        }

        try {
          const [field] = await db.instance
            .select()
            .from(dataSetCalculatedFields)
            .where(
              and(
                eq(dataSetCalculatedFields.id, fieldId),
                eq(dataSetCalculatedFields.dataSetId, datasetId)
              )
            )
            .limit(1);

          if (!field) return c.json({ success: false, error: "Campo no encontrado" }, 404);
          return c.json({ success: true, field });
        } catch (err: unknown) {
          logger.error("Failed to get calculated field", { err, fieldId });
          return c.json({ success: false, error: messageOf(err) }, 500);
        }
      },
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE — PATCH /api/datasets/:id/calculated-fields/:fieldId
  // ═══════════════════════════════════════════════════════════════════════════
  ops.push(
    defineOperacion({
      id: "editar-campo-calculado",
      metodo: "PATCH",
      ruta: "/:id/calculated-fields/:fieldId",
      resumen: "Update a calculated field",
      descripcion:
        "Changes a calculated field (including activating it or reordering). Staff only.",
      acceso: "sesion",
      permiso: { politica: { recurso: "dataset", accion: "update", enHandler: true } },
      entrada: { params: ParamCampo, cuerpo: CampoCalculadoCambios },
      salida: { esquema: CampoCalculadoSalida },
      errores: ["KITSUDEN_E_NOT_FOUND", "KITSUDEN_E_BAD_REQUEST"],
      manejar: async (entrada, { c, autorizar }) => {
        const no = await autorizarCampos(c, autorizar);
        if (no) return no;
        const datasetId = datasetIdOf(c);
        const fieldId = entrada.params.fieldId;
        if (!datasetId || !fieldId || !esUuid(fieldId)) {
          return c.json({ success: false, error: "datasetId y fieldId requeridos" }, 400);
        }

        const body = entrada.cuerpo ?? {};
        const validation = updateCalculatedFieldSchema.safeParse(body);
        if (!validation.success) {
          return c.json(
            { success: false, error: "Validation failed", details: validation.error.format() },
            400
          );
        }
        const data = validation.data;

        try {
          const [updated] = await db.instance
            .update(dataSetCalculatedFields)
            .set({
              ...(data.name !== undefined && { name: data.name }),
              ...(data.label !== undefined && { label: data.label }),
              ...(data.type !== undefined && { type: data.type }),
              ...(data.config !== undefined && { config: data.config }),
              ...(data.format !== undefined && { format: data.format }),
              ...(data.description !== undefined && { description: data.description }),
              ...(data.category !== undefined && { category: data.category }),
              ...(data.isKpi !== undefined && { isKpi: data.isKpi }),
              ...(data.target !== undefined && { target: data.target }),
              ...(data.warningThreshold !== undefined && {
                warningThreshold: data.warningThreshold,
              }),
              ...(data.dependsOn && { dependsOn: data.dependsOn }),
              ...(data.isActive !== undefined && { isActive: data.isActive }),
              ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(dataSetCalculatedFields.id, fieldId),
                eq(dataSetCalculatedFields.dataSetId, datasetId)
              )
            )
            .returning();

          if (!updated) return c.json({ success: false, error: "Campo no encontrado" }, 404);

          await ctx.cache.invalidate(`dataset:${datasetId}:*`);
          return c.json({ success: true, field: updated });
        } catch (err: unknown) {
          logger.error("Failed to update calculated field", { err, fieldId });
          return c.json({ success: false, error: messageOf(err) }, 500);
        }
      },
    })
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE — DELETE /api/datasets/:id/calculated-fields/:fieldId
  // ═══════════════════════════════════════════════════════════════════════════
  ops.push(
    defineOperacion({
      id: "borrar-campo-calculado",
      metodo: "DELETE",
      ruta: "/:id/calculated-fields/:fieldId",
      resumen: "Delete a calculated field",
      descripcion: "Removes a calculated field from a dataset. Staff only.",
      acceso: "sesion",
      permiso: { politica: { recurso: "dataset", accion: "update", enHandler: true } },
      entrada: { params: ParamCampo },
      salida: { esquema: Exito },
      errores: ["KITSUDEN_E_NOT_FOUND", "KITSUDEN_E_BAD_REQUEST"],
      manejar: async (entrada, { c, autorizar }) => {
        const no = await autorizarCampos(c, autorizar);
        if (no) return no;
        const datasetId = datasetIdOf(c);
        const fieldId = entrada.params.fieldId;
        if (!datasetId || !fieldId || !esUuid(fieldId)) {
          return c.json({ success: false, error: "datasetId y fieldId requeridos" }, 400);
        }

        try {
          const [deleted] = await db.instance
            .delete(dataSetCalculatedFields)
            .where(
              and(
                eq(dataSetCalculatedFields.id, fieldId),
                eq(dataSetCalculatedFields.dataSetId, datasetId)
              )
            )
            .returning();

          if (!deleted) return c.json({ success: false, error: "Campo no encontrado" }, 404);

          await ctx.cache.invalidate(`dataset:${datasetId}:*`);
          return c.json({ success: true });
        } catch (err: unknown) {
          logger.error("Failed to delete calculated field", { err, fieldId });
          return c.json({ success: false, error: messageOf(err) }, 500);
        }
      },
    })
  );

  return ops;
}
