/**
 * Extended Data Sets routes — PATCH/DELETE for definitions + entries
 * 
 * Real-time: Mutations broadcast to Valkey Pub/Sub for Live Queries.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * VALIDACIÓN ZOD: Todas las operaciones de escritura validan contra
 * el esquema compartido @gremius/shared para garantizar consistencia
 * entre Frontend y Backend.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db";
import { dataSets, dataEntries } from "../db/schema";
import {
  checkDatasetReadAccess,
  checkDatasetWriteAccess,
  resolveEntryStatus,
} from "../middleware/permissions";
import { 
  buildDrizzleWhere, 
  buildDatasetWhere,
  checkReadAccess,
  type PolicyJson 
} from "../lib/rls-builder";
import { events } from "../lib/events";
import { broadcastMutation } from "../lib/realtime";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Obtener DB o Transacción RLS
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Retorna la transacción activa si existe (RLS nativo habilitado),
 * o la conexión normal si no hay transacción.
 * 
 * Esto permite que las rutas funcionen tanto:
 * - Con middleware RLS transaccional (Fase AI-Ready)
 * - Sin middleware RLS (compatibilidad legacy)
 */
function getDB(c: any): typeof db {
  const tx = c.get("tx") as typeof db | undefined;
  return tx || db;
}

// ═══════════════════════════════════════════════════════════════════════════
// IMPORTACIONES DEL PUENTE ZOD - Esquemas compartidos
// ═══════════════════════════════════════════════════════════════════════════
import {
  CreateDatasetPayloadSchema,
  UpdateDatasetPayloadSchema,
  type CreateDatasetPayload,
  type UpdateDatasetPayload,
  type DatasetDefinition,
} from "@gremius/shared";

export const dataSetsFullRoutes = new Hono();

// ══════════════════════════════════════════════════════════════
// Dataset CRUD
// ══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// GET /datasets - Listar datasets (transformado al nuevo formato)
// ═══════════════════════════════════════════════════════════════════════════
dataSetsFullRoutes.get("/", async (c) => {
  const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
  const rows = await db.select().from(dataSets).orderBy(dataSets.name).limit(limit);
  
  // Transformamos cada row al formato DatasetDefinition estandarizado
  const docs: DatasetDefinition[] = rows.map((row) => {
    const schemaData = row.schema as any;
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description || undefined,
      icon: row.icon || undefined,
      fields: schemaData?.fields || [], // Extraemos fields del schema JSONB
      policyJson: row.policyJson as any,
      workflowJson: row.workflowJson as any,
      createdAt: row.createdAt?.toISOString(),
    };
  });
  
  return c.json({ docs, totalDocs: docs.length });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /datasets/slug/:slug - Obtener por slug (formato estandarizado)
// ═══════════════════════════════════════════════════════════════════════════
dataSetsFullRoutes.get("/slug/:slug", async (c) => {
  const result = await db.select().from(dataSets).where(eq(dataSets.slug, c.req.param("slug"))).limit(1);
  if (!result.length) return c.json({ error: "DataSet not found" }, 404);
  
  const row = result[0];
  const schemaData = row.schema as any;
  const response: DatasetDefinition = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description || undefined,
    icon: row.icon || undefined,
    fields: schemaData?.fields || [],
    policyJson: row.policyJson as any,
    workflowJson: row.workflowJson as any,
    createdAt: row.createdAt?.toISOString(),
  };
  
  return c.json(response);
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /datasets/:id - Obtener por ID (formato estandarizado)
// ═══════════════════════════════════════════════════════════════════════════
dataSetsFullRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (id === "slug") return c.notFound();
  const result = await db.select().from(dataSets).where(eq(dataSets.id, id)).limit(1);
  if (!result.length) return c.json({ error: "DataSet not found" }, 404);
  
  const row = result[0];
  const schemaData = row.schema as any;
  const response: DatasetDefinition = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description || undefined,
    icon: row.icon || undefined,
    fields: schemaData?.fields || [],
    policyJson: row.policyJson as any,
    workflowJson: row.workflowJson as any,
    createdAt: row.createdAt?.toISOString(),
  };
  
  return c.json(response);
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /datasets - Crear nuevo dataset con validación Zod estricta
// ═══════════════════════════════════════════════════════════════════════════
dataSetsFullRoutes.post(
  "/",
  zValidator("json", CreateDatasetPayloadSchema),
  async (c) => {
    // El middleware zValidator garantiza que body cumple CreateDatasetPayloadSchema
    const body = c.req.valid("json") as CreateDatasetPayload;
    
    // CRÍTICO: Transformamos el nuevo formato (fields) al formato legacy de DB (schema)
    // para mantener compatibilidad mientras migramos
    const dbSchema = {
      fields: body.fields, // Guardamos la estructura nested correcta
      version: "2.0", // Marcamos que usa el nuevo formato
    };

    const [row] = await db.insert(dataSets).values({
      name: body.name,
      slug: body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      description: body.description,
      gameId: body.gameId,
      icon: body.icon,
      schema: dbSchema as any, // Guardamos como JSONB
      displayConfig: body.displayConfig,
      policyJson: body.policyJson || null,
      workflowJson: body.workflowJson || null,
    }).returning();
    
    // Retornamos en el nuevo formato estandarizado
    const response: DatasetDefinition = {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description || undefined,
      icon: row.icon || undefined,
      fields: body.fields, // Retornamos los fields validados
      policyJson: row.policyJson as any,
      workflowJson: row.workflowJson as any,
      createdAt: row.createdAt?.toISOString(),
    };
    
    return c.json(response, 201);
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /datasets/:id - Actualizar dataset con validación Zod
// ═══════════════════════════════════════════════════════════════════════════
dataSetsFullRoutes.patch(
  "/:id",
  zValidator("json", UpdateDatasetPayloadSchema),
  async (c) => {
    const body = c.req.valid("json") as UpdateDatasetPayload;
    const updates: Record<string, any> = {};
    
    // Solo actualizamos los campos proporcionados
    if (body.name !== undefined) updates.name = body.name;
    if (body.slug !== undefined) updates.slug = body.slug;
    if (body.description !== undefined) updates.description = body.description;
    if (body.icon !== undefined) updates.icon = body.icon;
    if (body.displayConfig !== undefined) updates.displayConfig = body.displayConfig;
    if (body.gameId !== undefined) updates.gameId = body.gameId;
    if (body.policyJson !== undefined) updates.policyJson = body.policyJson;
    if (body.workflowJson !== undefined) updates.workflowJson = body.workflowJson;
    
    // CRÍTICO: Si se envían fields, transformamos al formato DB
    if (body.fields !== undefined) {
      updates.schema = {
        fields: body.fields,
        version: "2.0",
      };
    }

    const [updated] = await db.update(dataSets)
      .set(updates)
      .where(eq(dataSets.id, c.req.param("id")))
      .returning();
      
    if (!updated) return c.json({ error: "DataSet not found" }, 404);
    
    // Transformamos la respuesta al nuevo formato
    const schemaData = updated.schema as any;
    const response: DatasetDefinition = {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      description: updated.description || undefined,
      icon: updated.icon || undefined,
      // Usamos fields del nuevo formato si existe, o array vacío
      fields: schemaData?.fields || [],
      policyJson: updated.policyJson as any,
      workflowJson: updated.workflowJson as any,
      createdAt: updated.createdAt?.toISOString(),
    };
    
    return c.json(response);
  }
);

dataSetsFullRoutes.delete("/:id", async (c) => {
  const [deleted] = await db.delete(dataSets)
    .where(eq(dataSets.id, c.req.param("id")))
    .returning();
  if (!deleted) return c.json({ error: "DataSet not found" }, 404);
  return c.json({ success: true, id: deleted.id });
});

// ══════════════════════════════════════════════════════════════
// Data Entries — With Real-time Broadcasting + Application RLS
// ══════════════════════════════════════════════════════════════

dataSetsFullRoutes.get("/:id/entries", async (c) => {
  const datasetId = c.req.param("id");
  const user = c.get("user") as any;
  const limit = Math.min(Number(c.req.query("limit")) || 500, 1000);
  
  // ═══ FASE AI-READY: Usar transacción RLS si existe ═══
  const dbOrTx = getDB(c);
  
  // ═══ FASE DE RESCATE: Optimización de RAM y RLS ═══
  // 1. Obtener política del dataset (para verificar acceso y RLS)
  const [dataset] = await dbOrTx
    .select({ policyJson: dataSets.policyJson })
    .from(dataSets)
    .where(eq(dataSets.id, datasetId))
    .limit(1);
  
  if (!dataset) {
    return c.json({ error: "Dataset not found" }, 404);
  }
  
  const policy = dataset.policyJson as PolicyJson | null;
  
  // 2. Verificar acceso de lectura
  if (!checkReadAccess(policy, user)) {
    return c.json({ error: "Unauthorized" }, 403);
  }
  
  // 3. Construir condición WHERE con RLS (¡Salvando la RAM!)
  // Antes: Traíamos TODOS los entries a memoria y filtrábamos con .filter()
  // Después: PostgreSQL filtra usando condiciones Drizzle nativas
  const { where, hasRLS } = buildDatasetWhere(
    datasetId,
    policy?.rlsRules,
    user
  );
  
  // 4. Ejecutar query optimizada - PostgreSQL hace el trabajo pesado
  // Si hay transacción RLS, PostgreSQL NATIVO también aplica sus políticas (Nivel 2)
  const docs = await dbOrTx
    .select()
    .from(dataEntries)
    .where(where!)
    .orderBy(dataEntries.sortOrder)
    .limit(limit);
  
  return c.json({ 
    docs, 
    totalDocs: docs.length,
    _meta: { 
      rlsEnabled: hasRLS,
      // Indicar si estamos usando RLS nativo (transacción) o solo App RLS
      rlsNative: !!c.get("tx"),
      filteredBy: hasRLS ? "database" : "none"
    }
  });
});

// ── Create entry(ies) ──
dataSetsFullRoutes.post("/:id/entries", async (c) => {
  const body = await c.req.json();
  const datasetId = c.req.param("id");
  const user = c.get("user") as any;
  
  // ═══ FASE AI-READY: Usar transacción RLS si existe ═══
  const dbOrTx = getDB(c);

  const [dataset] = await dbOrTx.select({ workflowJson: dataSets.workflowJson })
    .from(dataSets).where(eq(dataSets.id, datasetId)).limit(1);

  const entryStatus = resolveEntryStatus(dataset?.workflowJson);

  const entries = Array.isArray(body) ? body : [body];
  const rows = await dbOrTx.insert(dataEntries).values(
    entries.map((e: any) => ({
      title: e.title || "Untitled",
      dataSetId: datasetId,
      // ═══ FASE AI-READY: Establecer owner_id automáticamente ═══
      ownerId: user?.id || e.ownerId || null,
      data: e.data,
      thumbnailId: e.thumbnailId,
      sortOrder: e.sortOrder || 0,
      status: e.status || entryStatus,
    }))
  ).returning();

  // ═══ EMIT EVENTS ═══
  for (const row of rows) {
    // EventEmitter (for Webhooks)
    events.emit("entry:created", { datasetId, entry: row });

    // Valkey Pub/Sub (for Live Queries)
    broadcastMutation(datasetId, "insert", row as any).catch(() => {});
  }

  return c.json(rows.length === 1 ? rows[0] : rows, 201);
});

// ── Update entry ──
dataSetsFullRoutes.patch("/:id/entries/:entryId", async (c) => {
  const body = await c.req.json();
  const datasetId = c.req.param("id");
  const updates: Record<string, any> = { updatedAt: new Date() };
  
  // ═══ FASE AI-READY: Usar transacción RLS si existe ═══
  const dbOrTx = getDB(c);
  
  if (body.title !== undefined) updates.title = body.title;
  if (body.data !== undefined) updates.data = body.data;
  if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;
  if (body.status !== undefined) updates.status = body.status;
  if (body.thumbnailId !== undefined) updates.thumbnailId = body.thumbnailId;

  const [updated] = await dbOrTx.update(dataEntries)
    .set(updates)
    .where(eq(dataEntries.id, c.req.param("entryId")))
    .returning();

  if (!updated) return c.json({ error: "Entry not found" }, 404);

  // ═══ EMIT EVENTS ═══
  // EventEmitter (for Webhooks)
  events.emit("entry:updated", { datasetId, entry: updated });

  // Valkey Pub/Sub (for Live Queries)
  broadcastMutation(datasetId, "update", updated as any).catch(() => {});

  return c.json(updated);
});

// ── Delete entry ──
dataSetsFullRoutes.delete("/:id/entries/:entryId", async (c) => {
  const datasetId = c.req.param("id");
  
  // ═══ FASE AI-READY: Usar transacción RLS si existe ═══
  const dbOrTx = getDB(c);

  const [deleted] = await dbOrTx.delete(dataEntries)
    .where(eq(dataEntries.id, c.req.param("entryId")))
    .returning();
    
  if (!deleted) return c.json({ error: "Entry not found" }, 404);

  // ═══ EMIT EVENTS ═══
  // EventEmitter (for Webhooks)
  events.emit("entry:deleted", { datasetId, entry: deleted });

  // Valkey Pub/Sub (for Live Queries)
  broadcastMutation(datasetId, "delete", deleted as any).catch(() => {});

  return c.json({ success: true, id: deleted.id });
});

// ══════════════════════════════════════════════════════════════
// Public Form Submission (no auth required)
// ══════════════════════════════════════════════════════════════

dataSetsFullRoutes.post("/:id/public-submit", async (c) => {
  const datasetId = c.req.param("id");

  const [dataset] = await db.select().from(dataSets)
    .where(eq(dataSets.id, datasetId))
    .limit(1);

  if (!dataset) return c.json({ error: "Dataset not found" }, 404);

  const body = await c.req.json();
  const formData: Record<string, any> = body.data || body;

  const schema: any = dataset.schema || {};
  const fields: any[] = schema.fields || [];

  const errors: { field: string; message: string }[] = [];

  for (const field of fields) {
    const value = formData[field.key];

    if (field.isRequired && (value === undefined || value === null || value === "")) {
      errors.push({ field: field.key, message: `${field.label || field.key} is required` });
      continue;
    }

    if (field.validationRegex && value && typeof value === "string") {
      try {
        const regex = new RegExp(field.validationRegex);
        if (!regex.test(value)) {
          errors.push({ field: field.key, message: `${field.label || field.key} format is invalid` });
        }
      } catch {}
    }

    if (field.type === "number" && value !== undefined && value !== null && value !== "") {
      const num = Number(value);
      if (field.minValue !== undefined && num < field.minValue) {
        errors.push({ field: field.key, message: `${field.label || field.key} must be at least ${field.minValue}` });
      }
      if (field.maxValue !== undefined && num > field.maxValue) {
        errors.push({ field: field.key, message: `${field.label || field.key} must be at most ${field.maxValue}` });
      }
    }
  }

  if (errors.length > 0) {
    return c.json({ error: "Validation failed", errors }, 422);
  }

  const title = formData.title || formData.name || `Submission ${new Date().toISOString().slice(0, 10)}`;

  const [entry] = await db.insert(dataEntries).values({
    title,
    dataSetId: datasetId,
    data: formData,
    sortOrder: 0,
    status: "draft",
  }).returning();

  // Broadcast new submission
  broadcastMutation(datasetId, "insert", entry as any).catch(() => {});

  return c.json({ success: true, id: entry.id }, 201);
});
