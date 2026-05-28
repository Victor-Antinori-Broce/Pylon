import type { PgTable } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { QuerySet, type RelationConfig } from './queryset.js';

export class Manager<T extends PgTable<any>, TResult = any> {
  protected db: PostgresJsDatabase | null = null;
  protected relations: Record<string, RelationConfig> = {};

  constructor(
    protected table: T,
    protected querySetClass: typeof QuerySet = QuerySet
  ) {}

  // Set database connection (called by Grimoire system)
  setDatabase(db: PostgresJsDatabase): void {
    this.db = db;
  }

  // Set relations configuration
  setRelations(relations: Record<string, RelationConfig>): void {
    this.relations = relations;
  }

  // Get QuerySet for querying
  getQuerySet(): QuerySet<T, TResult> {
    if (!this.db) {
      throw new Error('Database not set. Call setDatabase() first.');
    }
    return new this.querySetClass(this.db, this.table, this.relations);
  }

  // ========== CONVENIENCE METHODS ==========

  all(): QuerySet<T, TResult> {
    return this.getQuerySet();
  }

  filter(conditions: Partial<TResult>): QuerySet<T, TResult> {
    return this.getQuerySet().filter(conditions);
  }

  exclude(conditions: Partial<TResult>): QuerySet<T, TResult> {
    return this.getQuerySet().exclude(conditions);
  }

  orderBy(...fields: (keyof T | `-${string}`)[]): QuerySet<T, TResult> {
    return this.getQuerySet().orderBy(...fields);
  }

  // ========== SINGLE RECORD OPERATIONS ==========

  async get(id: string | number): Promise<TResult | null> {
    const pk = (this.table as any).id;
    return this.getQuerySet().filter({ [pk.name]: id } as any).first();
  }

  async create(data: Omit<TResult, 'id' | 'createdAt' | 'updatedAt'>): Promise<TResult> {
    if (!this.db) throw new Error('Database not set');
    
    const [result] = await this.db.insert(this.table).values(data as any).returning();
    return result as TResult;
  }

  async update(id: string | number, data: Partial<TResult>): Promise<TResult | null> {
    if (!this.db) throw new Error('Database not set');
    
    const pk = (this.table as any).id;
    const [result] = await this.db
      .update(this.table)
      .set(data as any)
      .where(eq(pk, id))
      .returning();
    
    return result as TResult || null;
  }

  async delete(id: string | number): Promise<boolean> {
    if (!this.db) throw new Error('Database not set');
    
    const pk = (this.table as any).id;
    const result = await this.db.delete(this.table).where(eq(pk, id));
    return (result as any).rowCount > 0;
  }

  // ========== BULK OPERATIONS ==========

  async bulkCreate(data: Omit<TResult, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<TResult[]> {
    if (!this.db) throw new Error('Database not set');
    
    return this.db.insert(this.table).values(data as any).returning() as Promise<TResult[]>;
  }

  async bulkUpdate(ids: (string | number)[], data: Partial<TResult>): Promise<number> {
    if (!this.db) throw new Error('Database not set');
    
    const pk = (this.table as any).id;
    const result = await this.db
      .update(this.table)
      .set(data as any)
      .where(inArray(pk, ids));
    
    return (result as any).rowCount || 0;
  }

  async bulkDelete(ids: (string | number)[]): Promise<number> {
    if (!this.db) throw new Error('Database not set');
    
    const pk = (this.table as any).id;
    const result = await this.db.delete(this.table).where(inArray(pk, ids));
    return (result as any).rowCount || 0;
  }

  // ========== AGGREGATIONS ==========

  async count(): Promise<number> {
    return this.getQuerySet().count();
  }

  async exists(conditions: Partial<TResult>): Promise<boolean> {
    return this.getQuerySet().filter(conditions).exists();
  }
}

// Custom Manager base class for users to extend
export abstract class CustomManager<T extends PgTable<any>, TResult = any> extends Manager<T, TResult> {
  abstract modifyQuerySet(qs: QuerySet<T, TResult>): QuerySet<T, TResult>;

  getQuerySet(): QuerySet<T, TResult> {
    const qs = super.getQuerySet();
    return this.modifyQuerySet(qs);
  }
}

// Import necesarios
import { eq, inArray } from 'drizzle-orm';
