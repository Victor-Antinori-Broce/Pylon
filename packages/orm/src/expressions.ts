import { SQL, sql } from 'drizzle-orm';

/**
 * F() expressions - Referencias a columnas de base de datos
 * Permite usar valores actuales de la DB en updates (evita race conditions)
 * 
 * Ejemplo:
 * Post.objects.filter({ id: 1 }).update({ views: F('views').add(1) })
 * -> UPDATE posts SET views = views + 1 WHERE id = 1
 */

export class F {
  private name: string;
  private operations: Array<{ op: string; value: F | number | string }> = [];

  constructor(name: string) {
    this.name = name;
  }

  // Operaciones aritméticas
  add(value: number | F): F {
    const newF = new F(this.name);
    newF.operations = [...this.operations, { op: '+', value }];
    return newF;
  }

  sub(value: number | F): F {
    const newF = new F(this.name);
    newF.operations = [...this.operations, { op: '-', value }];
    return newF;
  }

  mul(value: number | F): F {
    const newF = new F(this.name);
    newF.operations = [...this.operations, { op: '*', value }];
    return newF;
  }

  div(value: number | F): F {
    const newF = new F(this.name);
    newF.operations = [...this.operations, { op: '/', value }];
    return newF;
  }

  // Construir SQL
  toSQL(): SQL {
    let expr: SQL = sql.raw(`"${this.name}"`);

    for (const op of this.operations) {
      const valueSQL = op.value instanceof F 
        ? op.value.toSQL()
        : sql`${op.value}`;
      
      expr = sql`${expr} ${sql.raw(op.op)} ${valueSQL}`;
    }

    return expr;
  }
}

/**
 * Wrapper para usar F() expressions en updates
 */
export class ExpressionWrapper<T = any> {
  constructor(private expression: F | SQL) {}

  toSQL(): SQL {
    if (this.expression instanceof F) {
      return this.expression.toSQL();
    }
    return this.expression;
  }
}

// Helper para detectar si un valor es F() expression
export function isFExpression(value: any): value is F {
  return value instanceof F;
}
