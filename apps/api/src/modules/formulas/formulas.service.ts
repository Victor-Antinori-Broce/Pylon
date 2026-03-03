/**
 * Formulas KPI — Service Layer
 *
 * CRUD operations for the formulas table.
 */

import { db } from "../../db";
import { formulas } from "../../db/schema";
import { eq, desc } from "drizzle-orm";
import type { FormulaInput, FormulaUpdateInput } from "./formulas.schema";

export const formulasService = {
    /** List all formulas, newest first */
    async list() {
        return db.select().from(formulas).orderBy(desc(formulas.createdAt));
    },

    /** Get a single formula by ID */
    async getById(id: string) {
        const [row] = await db.select().from(formulas).where(eq(formulas.id, id)).limit(1);
        return row || null;
    },

    /** Create a new formula */
    async create(data: FormulaInput) {
        const [row] = await db.insert(formulas).values({
            kpiName: data.kpiName,
            formulaType: data.formulaType || "custom",
            expression: data.expression,
            threshold: data.threshold ?? 95.0,
            description: data.description || null,
            enabled: data.enabled ?? true,
        }).returning();
        return row;
    },

    /** Update an existing formula (partial) */
    async update(id: string, data: FormulaUpdateInput) {
        const updates: Record<string, any> = {};

        if (data.kpiName !== undefined) updates.kpiName = data.kpiName;
        if (data.formulaType !== undefined) updates.formulaType = data.formulaType;
        if (data.expression !== undefined) updates.expression = data.expression;
        if (data.threshold !== undefined) updates.threshold = data.threshold;
        if (data.description !== undefined) updates.description = data.description;
        if (data.enabled !== undefined) updates.enabled = data.enabled;

        updates.updatedAt = new Date();

        const [row] = await db.update(formulas)
            .set(updates)
            .where(eq(formulas.id, id))
            .returning();
        return row || null;
    },

    /** Delete a formula */
    async remove(id: string) {
        const [row] = await db.delete(formulas).where(eq(formulas.id, id)).returning();
        return row || null;
    },
};
