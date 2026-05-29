import type { PgTable } from 'drizzle-orm/pg-core';
import { Manager, CustomManager } from './manager.js';
import type { RelationConfig } from './queryset.js';

/**
 * Crea un Manager para una tabla
 */
export function createManager<T extends PgTable<any>>(
  table: T,
  relations?: Record<string, RelationConfig>
): Manager<T> {
  const manager = new Manager(table);
  if (relations) {
    manager.setRelations(relations);
  }
  return manager;
}

/**
 * Crea un Custom Manager con lógica específica
 */
export function createCustomManager<T extends PgTable<any>>(
  table: T,
  modifyFn: (qs: any) => any,
  relations?: Record<string, RelationConfig>
): CustomManager<T> {
  const manager = new (class extends CustomManager<T> {
    modifyQuerySet(qs: any) {
      return modifyFn(qs);
    }
  })(table);
  
  if (relations) {
    manager.setRelations(relations);
  }
  
  return manager;
}

/**
 * Define relaciones para un modelo
 */
export function defineRelations<T extends PgTable<any>>(
  _table: T,
  relationsConfig: Record<string, Omit<RelationConfig, 'targetTable'> & { targetTable: PgTable<any> }>
): Record<string, RelationConfig> {
  const relations: Record<string, RelationConfig> = {};
  
  for (const [name, config] of Object.entries(relationsConfig)) {
    relations[name] = {
      type: config.type,
      targetTable: config.targetTable,
      foreignKey: config.foreignKey,
      targetKey: config.targetKey || 'id',
      through: config.through
    };
  }
  
  return relations;
}

/**
 * Helper para crear un modelo completo con managers
 */
export interface ModelConfig<T extends PgTable<any>> {
  table: T;
  relations?: Record<string, RelationConfig>;
  managers?: Record<string, CustomManager<T>>;
}

export function defineModel<T extends PgTable<any>>(config: ModelConfig<T>) {
  const defaultManager = createManager(config.table, config.relations);
  
  const model = {
    table: config.table,
    objects: defaultManager,
    relations: config.relations || {},
    ...config.managers
  };
  
  return model;
}
