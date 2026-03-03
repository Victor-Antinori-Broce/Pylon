/**
 * Formulas KPI — Type Definitions
 */

export interface FormulaInput {
    kpiName: string;
    formulaType?: string;
    expression: string;
    threshold?: number;
    description?: string;
    enabled?: boolean;
}

export interface FormulaUpdateInput {
    kpiName?: string;
    formulaType?: string;
    expression?: string;
    threshold?: number;
    description?: string;
    enabled?: boolean;
}

export interface FormulaDoc {
    id: string;
    kpiName: string;
    formulaType: string;
    expression: string;
    threshold: number | null;
    description: string | null;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
}
