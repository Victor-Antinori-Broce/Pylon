import { SQL, and, or, not, eq, ne, gt, gte, lt, lte, like, inArray, isNull, isNotNull } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

/**
 * Q() objects - Queries complejas con AND/OR/NOT
 * 
 * Ejemplo:
 * Post.objects.filter(
 *   Q.or(
 *     Q({ status: 'published' }),
 *     Q.and(
 *       Q({ status: 'draft' }),
 *       Q({ authorId: '123' })
 *     )
 *   )
 * )
 * -> WHERE status = 'published' OR (status = 'draft' AND author_id = '123')
 */

type FilterCondition = Record<string, any>;
type Operator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'isNull' | 'isNotNull';

interface Filter {
  field: string;
  operator: Operator;
  value?: any;
}

export class Q {
  private conditions: Array<Q | FilterCondition> = [];
  private connector: 'AND' | 'OR' = 'AND';
  private negated = false;

  constructor(conditions?: FilterCondition) {
    if (conditions) {
      this.conditions = [conditions];
    }
  }

  // Factory methods
  static and(...conditions: (Q | FilterCondition)[]): Q {
    const q = new Q();
    q.connector = 'AND';
    q.conditions = conditions;
    return q;
  }

  static or(...conditions: (Q | FilterCondition)[]): Q {
    const q = new Q();
    q.connector = 'OR';
    q.conditions = conditions;
    return q;
  }

  static not(condition: Q | FilterCondition): Q {
    const q = new Q();
    q.negated = true;
    q.conditions = [condition];
    return q;
  }

  // Negar esta condición
  negate(): this {
    this.negated = !this.negated;
    return this;
  }

  // Construir SQL a partir de Q object
  toSQL(table: Record<string, PgColumn<any>>): SQL | undefined {
    const sqlConditions: SQL[] = [];

    for (const condition of this.conditions) {
      if (condition instanceof Q) {
        const sql = condition.toSQL(table);
        if (sql) sqlConditions.push(sql);
      } else {
        // FilterCondition simple
        const sql = this.buildConditionSQL(condition, table);
        if (sql) sqlConditions.push(sql);
      }
    }

    if (sqlConditions.length === 0) {
      return undefined;
    }

    let result: SQL;
    if (this.connector === 'AND') {
      result = and(...sqlConditions) as SQL;
    } else {
      result = or(...sqlConditions) as SQL;
    }

    if (this.negated) {
      result = not(result) as SQL;
    }

    return result;
  }

  private buildConditionSQL(
    condition: FilterCondition,
    table: Record<string, PgColumn<any>>
  ): SQL | undefined {
    const sqlParts: SQL[] = [];

    for (const [key, value] of Object.entries(condition)) {
      // Parsear field__operator (ej: age__gte)
      const [fieldName, operator = 'eq'] = key.split('__');
      const column = table[fieldName];

      if (!column) {
        console.warn(`Column "${fieldName}" not found in table`);
        continue;
      }

      let sql: SQL;

      switch (operator) {
        case 'eq':
          sql = eq(column, value);
          break;
        case 'ne':
        case 'neq':
          sql = ne(column, value);
          break;
        case 'gt':
          sql = gt(column, value);
          break;
        case 'gte':
          sql = gte(column, value);
          break;
        case 'lt':
          sql = lt(column, value);
          break;
        case 'lte':
          sql = lte(column, value);
          break;
        case 'like':
        case 'contains':
          sql = like(column, `%${value}%`);
          break;
        case 'startswith':
          sql = like(column, `${value}%`);
          break;
        case 'endswith':
          sql = like(column, `%${value}`);
          break;
        case 'in':
          sql = inArray(column, Array.isArray(value) ? value : [value]);
          break;
        case 'isNull':
          sql = isNull(column);
          break;
        case 'isNotNull':
          sql = isNotNull(column);
          break;
        default:
          sql = eq(column, value);
      }

      sqlParts.push(sql);
    }

    if (sqlParts.length === 0) return undefined;
    if (sqlParts.length === 1) return sqlParts[0];
    return and(...sqlParts) as SQL;
  }
}

// Aliases para uso más sencillo
export const QAnd = Q.and;
export const QOr = Q.or;
export const QNot = Q.not;
