import type { PgTable } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { SQL, sql, eq, and, ne, inArray, asc, desc, count, avg, sum, min, max } from 'drizzle-orm';

export type FilterOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'isNull' | 'isNotNull';

export interface Filter<T = any> {
  field: keyof T;
  operator: FilterOperator;
  value?: any;
}

export interface QueryOptions<T = any> {
  filters?: Filter<T>[];
  select?: (keyof T)[];
  orderBy?: { field: keyof T; direction: 'asc' | 'desc' }[];
  limit?: number;
  offset?: number;
}

export class QuerySet<T extends PgTable<any>, TResult = any> {
  private filters: SQL[] = [];
  private joins: Map<string, { table: PgTable; on: SQL; type: 'inner' | 'left' }> = new Map();
  private prefetches: string[] = [];
  private annotations: Map<string, SQL> = new Map();
  private orderFields: { sql: SQL; direction: 'asc' | 'desc' }[] = [];
  private limitValue?: number;
  private offsetValue?: number;

  constructor(
    private db: PostgresJsDatabase,
    private table: T,
    private relations: Record<string, RelationConfig> = {}
  ) {}

  // ========== FILTERING ==========
  
  filter(conditions: Partial<{ [K in keyof TResult]: any }>): QuerySet<T, TResult> {
    for (const [key, value] of Object.entries(conditions)) {
      if (value === undefined) continue;
      
      const column = this.table[key as keyof T] as any;
      if (column) {
        this.filters.push(eq(column, value));
      }
    }
    return this;
  }

  filterRaw(sqlCondition: SQL): QuerySet<T, TResult> {
    this.filters.push(sqlCondition);
    return this;
  }

  exclude(conditions: Partial<{ [K in keyof TResult]: any }>): QuerySet<T, TResult> {
    for (const [key, value] of Object.entries(conditions)) {
      const column = this.table[key as keyof T] as any;
      if (column) {
        this.filters.push(ne(column, value));
      }
    }
    return this;
  }

  // ========== RELATIONS - select_related ==========
  
  selectRelated(...relations: string[]): QuerySet<T, TResult> {
    for (const relName of relations) {
      const config = this.relations[relName];
      if (!config) {
        console.warn(`Relation "${relName}" not found`);
        continue;
      }
      
      if (config.type === 'belongsTo' || config.type === 'hasOne') {
        this.joins.set(relName, {
          table: config.targetTable,
          on: eq(
            (this.table as any)[config.foreignKey],
            (config.targetTable as any)[config.targetKey || 'id']
          ),
          type: 'left'
        });
      }
    }
    return this;
  }

  // ========== RELATIONS - prefetch_related ==========
  
  prefetchRelated(...relations: string[]): QuerySet<T, TResult> {
    for (const relName of relations) {
      const config = this.relations[relName];
      if (!config) {
        console.warn(`Relation "${relName}" not found`);
        continue;
      }
      this.prefetches.push(relName);
    }
    return this;
  }

  // ========== ANNOTATIONS ==========
  
  annotate(annotations: Record<string, Annotation<T>>): QuerySet<T, TResult> {
    for (const [name, annotation] of Object.entries(annotations)) {
      const sqlExpr = this.buildAnnotation(annotation);
      this.annotations.set(name, sqlExpr);
    }
    return this;
  }

  private buildAnnotation(annotation: Annotation<T>): SQL {
    switch (annotation.type) {
      case 'count':
        return sql`COUNT(${(this.table as any)[annotation.field]})`;
      case 'avg':
        return sql`AVG(${(this.table as any)[annotation.field]})`;
      case 'sum':
        return sql`SUM(${(this.table as any)[annotation.field]})`;
      case 'min':
        return sql`MIN(${(this.table as any)[annotation.field]})`;
      case 'max':
        return sql`MAX(${(this.table as any)[annotation.field]})`;
      case 'raw':
        return sql.raw(annotation.sql);
      default:
        return sql`0`;
    }
  }

  // ========== ORDERING ==========
  
  orderBy(...fields: (keyof T | `-${string}`)[]): QuerySet<T, TResult> {
    for (const field of fields) {
      const isDesc = String(field).startsWith('-');
      const actualField = isDesc ? String(field).slice(1) : field;
      const column = (this.table as any)[actualField];
      
      if (column) {
        this.orderFields.push({
          sql: isDesc ? desc(column) : asc(column),
          direction: isDesc ? 'desc' : 'asc'
        });
      }
    }
    return this;
  }

  // ========== PAGINATION ==========
  
  limit(n: number): QuerySet<T, TResult> {
    this.limitValue = n;
    return this;
  }

  offset(n: number): QuerySet<T, TResult> {
    this.offsetValue = n;
    return this;
  }

  distinct(): QuerySet<T, TResult> {
    // TODO: implement DISTINCT support
    return this;
  }

  // ========== EXECUTION ==========
  
  async execute(): Promise<TResult[]> {
    // Construir query base
    let query = this.db.select().from(this.table);
    
    // Aplicar joins (select_related)
    for (const [_name, join] of this.joins) {
      if (join.type === 'left') {
        query = (query as any).leftJoin(join.table, join.on);
      } else {
        query = (query as any).innerJoin(join.table, join.on);
      }
    }
    
    // Aplicar filtros
    if (this.filters.length > 0) {
      query = query.where(and(...this.filters)) as any;
    }
    
    // Aplicar ordenamiento
    if (this.orderFields.length > 0) {
      query = query.orderBy(...this.orderFields.map(f => f.sql)) as any;
    }
    
    // Aplicar limit/offset
    if (this.limitValue) {
      query = query.limit(this.limitValue) as any;
    }
    if (this.offsetValue) {
      query = query.offset(this.offsetValue) as any;
    }
    
    // Ejecutar query principal
    let results = await query;
    
    // Aplicar prefetches (prefetch_related)
    if (this.prefetches.length > 0 && results.length > 0) {
      results = await this.applyPrefetches(results);
    }
    
    // Aplicar anotaciones
    if (this.annotations.size > 0 && results.length > 0) {
      results = await this.applyAnnotations(results);
    }
    
    return results as TResult[];
  }

  private async applyPrefetches(results: any[]): Promise<any[]> {
    const ids = results.map(r => r.id).filter(Boolean);
    if (ids.length === 0) return results;
    
    for (const prefetchName of this.prefetches) {
      const config = this.relations[prefetchName];
      if (!config) continue;
      
      if (config.type === 'hasMany') {
        // Cargar relaciones relacionadas
        const relatedData = await this.db
          .select()
          .from(config.targetTable)
          .where(inArray((config.targetTable as any)[config.foreignKey], ids));
        
        // Agrupar por parent
        const grouped = new Map();
        for (const item of relatedData) {
          const parentId = item[config.foreignKey];
          if (!grouped.has(parentId)) grouped.set(parentId, []);
          grouped.get(parentId).push(item);
        }
        
        // Asignar a resultados
        for (const result of results) {
          result[prefetchName] = grouped.get(result.id) || [];
        }
      }
    }
    
    return results;
  }

  private async applyAnnotations(results: any[]): Promise<any[]> {
    if (this.annotations.size === 0) return results;
    
    // Para cada fila, calcular anotaciones
    for (const result of results) {
      for (const [name, sqlExpr] of this.annotations) {
        // Ejecutar subquery o cálculo
        const [{ value }] = await this.db.execute(
          sql`SELECT ${sqlExpr} as value WHERE ${(this.table as any).id} = ${result.id}`
        );
        result[name] = value;
      }
    }
    
    return results;
  }

  // ========== AGGREGATIONS ==========
  
  async count(): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(this.table)
      .where(this.filters.length > 0 ? and(...this.filters) : undefined);
    
    return Number(result?.count || 0);
  }

  async exists(): Promise<boolean> {
    const cnt = await this.limit(1).count();
    return cnt > 0;
  }

  async first(): Promise<TResult | null> {
    const results = await this.limit(1).execute();
    return results[0] || null;
  }

  async aggregate(aggregations: Record<string, { type: 'sum' | 'avg' | 'min' | 'max'; field: keyof T }>): Promise<Record<string, number>> {
    const aggFields: any = {};
    
    for (const [name, agg] of Object.entries(aggregations)) {
      const column = (this.table as any)[agg.field];
      switch (agg.type) {
        case 'sum':
          aggFields[name] = sum(column);
          break;
        case 'avg':
          aggFields[name] = avg(column);
          break;
        case 'min':
          aggFields[name] = min(column);
          break;
        case 'max':
          aggFields[name] = max(column);
          break;
      }
    }
    
    const [result] = await this.db
      .select(aggFields)
      .from(this.table)
      .where(this.filters.length > 0 ? and(...this.filters) : undefined);
    
    return result as Record<string, number>;
  }

  // ========== MUTATIONS ==========
  
  async update(data: Partial<TResult>): Promise<number> {
    const result = await this.db
      .update(this.table)
      .set(data as any)
      .where(this.filters.length > 0 ? and(...this.filters) : sql`TRUE`);
    
    // Drizzle no retorna count directamente, usar rowCount si existe
    return (result as any).rowCount || 0;
  }

  async delete(): Promise<number> {
    const result = await this.db
      .delete(this.table)
      .where(this.filters.length > 0 ? and(...this.filters) : sql`TRUE`);
    
    return (result as any).rowCount || 0;
  }

  // ========== DEBUG ==========
  
  toSQL(): { query: string; params: any[] } {
    // Esto es simplificado - en producción usaría SQL generator de Drizzle
    return {
      query: `SELECT * FROM ${(this.table as any).name} WHERE ...`,
      params: []
    };
  }
}

// ========== TYPES ==========

export interface RelationConfig {
  type: 'belongsTo' | 'hasOne' | 'hasMany' | 'manyToMany';
  targetTable: PgTable<any>;
  foreignKey: string;
  targetKey?: string;
  through?: PgTable<any>;
}

export type Annotation<T> = 
  | { type: 'count'; field: keyof T }
  | { type: 'avg'; field: keyof T }
  | { type: 'sum'; field: keyof T }
  | { type: 'min'; field: keyof T }
  | { type: 'max'; field: keyof T }
  | { type: 'raw'; sql: string };
