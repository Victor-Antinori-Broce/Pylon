/**
 * DataSets Calculated Fields - API Routes
 * 
 * CRUD API para gestionar campos calculados de DataSets.
 * Endpoints:
 *   GET    /api/datasets/:datasetId/calculated-fields
 *   POST   /api/datasets/:datasetId/calculated-fields
 *   GET    /api/datasets/:datasetId/calculated-fields/:fieldId
 *   PATCH  /api/datasets/:datasetId/calculated-fields/:fieldId
 *   DELETE /api/datasets/:datasetId/calculated-fields/:fieldId
 *   POST   /api/datasets/:datasetId/calculated-fields/:fieldId/test
 */

import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import type { GrimoireContext } from "@gremius/shared";
import { dataSetCalculatedFields } from "./datasets.calculated.schema";
import {
  createCalculatedFieldSchema,
  updateCalculatedFieldSchema,
  evaluateCalculatedField,
  formatCalculatedValue,
  type EvaluationContext,
} from "./datasets.calculated";

export function createCalculatedFieldsRouter(ctx: GrimoireContext): Hono {
  const app = new Hono();
  const { db, logger } = ctx;

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST - GET /api/datasets/:datasetId/calculated-fields
  // ═══════════════════════════════════════════════════════════════════════════
  app.get("/", async (c) => {
    const datasetId = c.req.param("datasetId");
    
    try {
      const fields = await db.instance
        .select()
        .from(dataSetCalculatedFields)
        .where(eq(dataSetCalculatedFields.dataSetId, datasetId))
        .orderBy(dataSetCalculatedFields.sortOrder);
      
      return c.json({
        success: true,
        fields: fields.map(f => ({
          ...f,
          config: f.config || {},
          format: f.format || {},
          dependsOn: f.dependsOn || [],
        })),
      });
    } catch (err: any) {
      logger.error("Error fetching calculated fields:", err);
      return c.json({ success: false, error: err.message }, 500);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE - POST /api/datasets/:datasetId/calculated-fields
  // ═══════════════════════════════════════════════════════════════════════════
  app.post("/", async (c) => {
    const datasetId = c.req.param("datasetId");
    const body = await c.req.json();
    
    // Validar
    const validation = createCalculatedFieldSchema.safeParse({
      ...body,
      dataSetId: datasetId,
    });
    
    if (!validation.success) {
      return c.json({
        success: false,
        error: "Validation failed",
        details: validation.error.errors,
      }, 400);
    }
    
    const data = validation.data;
    
    try {
      // Verificar que no existe otro campo con el mismo nombre
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
        return c.json({
          success: false,
          error: `A calculated field with name "${data.name}" already exists`,
        }, 409);
      }
      
      // Crear
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
          isActive: true,
          sortOrder: 0,
        })
        .returning();
      
      logger.info(`Created calculated field "${data.name}" for dataset ${datasetId}`);
      
      return c.json({ success: true, field }, 201);
    } catch (err: any) {
      logger.error("Error creating calculated field:", err);
      return c.json({ success: false, error: err.message }, 500);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET ONE - GET /api/datasets/:datasetId/calculated-fields/:fieldId
  // ═══════════════════════════════════════════════════════════════════════════
  app.get("/:fieldId", async (c) => {
    const { datasetId, fieldId } = c.req.param();
    
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
      
      if (!field) {
        return c.json({ success: false, error: "Field not found" }, 404);
      }
      
      return c.json({
        success: true,
        field: {
          ...field,
          config: field.config || {},
          format: field.format || {},
          dependsOn: field.dependsOn || [],
        },
      });
    } catch (err: any) {
      logger.error("Error fetching calculated field:", err);
      return c.json({ success: false, error: err.message }, 500);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE - PATCH /api/datasets/:datasetId/calculated-fields/:fieldId
  // ═══════════════════════════════════════════════════════════════════════════
  app.patch("/:fieldId", async (c) => {
    const { datasetId, fieldId } = c.req.param();
    const body = await c.req.json();
    
    // Validar
    const validation = updateCalculatedFieldSchema.safeParse(body);
    
    if (!validation.success) {
      return c.json({
        success: false,
        error: "Validation failed",
        details: validation.error.errors,
      }, 400);
    }
    
    const data = validation.data;
    
    try {
      // Verificar que existe
      const [existing] = await db.instance
        .select({ id: dataSetCalculatedFields.id, name: dataSetCalculatedFields.name })
        .from(dataSetCalculatedFields)
        .where(
          and(
            eq(dataSetCalculatedFields.id, fieldId),
            eq(dataSetCalculatedFields.dataSetId, datasetId)
          )
        )
        .limit(1);
      
      if (!existing) {
        return c.json({ success: false, error: "Field not found" }, 404);
      }
      
      // Si cambia el nombre, verificar que no existe otro con ese nombre
      if (data.name && data.name !== existing.name) {
        const duplicate = await db.instance
          .select({ id: dataSetCalculatedFields.id })
          .from(dataSetCalculatedFields)
          .where(
            and(
              eq(dataSetCalculatedFields.dataSetId, datasetId),
              eq(dataSetCalculatedFields.name, data.name),
              eq(dataSetCalculatedFields.id, fieldId) // Excluir el actual
            )
          )
          .limit(1);
        
        if (duplicate.length > 0) {
          return c.json({
            success: false,
            error: `A calculated field with name "${data.name}" already exists`,
          }, 409);
        }
      }
      
      // Actualizar
      const [updated] = await db.instance
        .update(dataSetCalculatedFields)
        .set({
          ...(data.name && { name: data.name }),
          ...(data.label && { label: data.label }),
          ...(data.type && { type: data.type }),
          ...(data.config && { config: data.config }),
          ...(data.format && { format: data.format }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.category !== undefined && { category: data.category }),
          ...(data.isKpi !== undefined && { isKpi: data.isKpi }),
          ...(data.target !== undefined && { target: data.target }),
          ...(data.warningThreshold !== undefined && { warningThreshold: data.warningThreshold }),
          ...(data.dependsOn && { dependsOn: data.dependsOn }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
          ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
          updatedAt: new Date(),
        })
        .where(eq(dataSetCalculatedFields.id, fieldId))
        .returning();
      
      logger.info(`Updated calculated field ${fieldId}`);
      
      return c.json({ success: true, field: updated });
    } catch (err: any) {
      logger.error("Error updating calculated field:", err);
      return c.json({ success: false, error: err.message }, 500);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE - DELETE /api/datasets/:datasetId/calculated-fields/:fieldId
  // ═══════════════════════════════════════════════════════════════════════════
  app.delete("/:fieldId", async (c) => {
    const { datasetId, fieldId } = c.req.param();
    
    try {
      const [existing] = await db.instance
        .select({ id: dataSetCalculatedFields.id })
        .from(dataSetCalculatedFields)
        .where(
          and(
            eq(dataSetCalculatedFields.id, fieldId),
            eq(dataSetCalculatedFields.dataSetId, datasetId)
          )
        )
        .limit(1);
      
      if (!existing) {
        return c.json({ success: false, error: "Field not found" }, 404);
      }
      
      await db.instance
        .delete(dataSetCalculatedFields)
        .where(eq(dataSetCalculatedFields.id, fieldId));
      
      logger.info(`Deleted calculated field ${fieldId}`);
      
      return c.json({ success: true });
    } catch (err: any) {
      logger.error("Error deleting calculated field:", err);
      return c.json({ success: false, error: err.message }, 500);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST - POST /api/datasets/:datasetId/calculated-fields/:fieldId/test
  // Probar una fórmula con datos de ejemplo
  // ═══════════════════════════════════════════════════════════════════════════
  app.post("/:fieldId/test", async (c) => {
    const { fieldId } = c.req.param();
    const { sampleData } = await c.req.json();
    
    try {
      // Obtener el campo
      const [field] = await db.instance
        .select()
        .from(dataSetCalculatedFields)
        .where(eq(dataSetCalculatedFields.id, fieldId))
        .limit(1);
      
      if (!field) {
        return c.json({ success: false, error: "Field not found" }, 404);
      }
      
      // Evaluar con datos de ejemplo
      const context: EvaluationContext = {
        row: sampleData || {},
        now: new Date(),
      };
      
      const result = evaluateCalculatedField(field, context);
      const formatted = formatCalculatedValue(result, field.format || undefined);
      
      return c.json({
        success: true,
        result,
        formatted,
        type: typeof result,
      });
    } catch (err: any) {
      logger.error("Error testing calculated field:", err);
      return c.json({
        success: false,
        error: err.message,
      }, 500);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REORDER - POST /api/datasets/:datasetId/calculated-fields/reorder
  // ═══════════════════════════════════════════════════════════════════════════
  app.post("/reorder", async (c) => {
    const datasetId = c.req.param("datasetId");
    const { fieldIds } = await c.req.json();
    
    if (!Array.isArray(fieldIds)) {
      return c.json({ success: false, error: "fieldIds must be an array" }, 400);
    }
    
    try {
      // Actualizar orden de cada campo
      for (let i = 0; i < fieldIds.length; i++) {
        await db.instance
          .update(dataSetCalculatedFields)
          .set({ sortOrder: i })
          .where(
            and(
              eq(dataSetCalculatedFields.id, fieldIds[i]),
              eq(dataSetCalculatedFields.dataSetId, datasetId)
            )
          );
      }
      
      logger.info(`Reordered calculated fields for dataset ${datasetId}`);
      
      return c.json({ success: true });
    } catch (err: any) {
      logger.error("Error reordering calculated fields:", err);
      return c.json({ success: false, error: err.message }, 500);
    }
  });

  return app;
}
