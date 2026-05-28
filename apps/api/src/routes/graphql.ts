/**
 * GremiusCMS — Dynamic GraphQL API Layer v2 (100% Auto-Generated)
 *
 * Auto-generated GraphQL schema for ALL content:
 *   - Datasets (data_sets → data_entries JSONB)
 *   - Native tables (any table in mergedSchema from core + grimoires)
 *
 * No hardcoded domain types. Any new grimoire or dataset automatically
 * appears in the GraphQL schema without code changes.
 *
 * Endpoint: POST /api/graphql
 * Playground: GET /api/graphql (returns GraphiQL HTML)
 */

import { Hono } from "hono";
import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLList,
  GraphQLNonNull,
  GraphQLEnumType,
  graphql,
  type GraphQLFieldConfigMap,
  type GraphQLOutputType,
} from "graphql";
import GraphQLJSON from "graphql-type-json";
import { db } from "../db";
import { dataSets, dataEntries } from "../db/schema-core";
import { eq, desc, asc, ilike, and, sql, count } from "drizzle-orm";
import { logger } from "../lib/logger";

import { buildMergedSchema } from "../lib/schema-merger";

export const graphqlRoutes = new Hono();

// ═══════════════════════════════════════════════════════════════
// CACHE — Distributed via Valkey (with local fallback)
// ═══════════════════════════════════════════════════════════════

import { getValkeyClient } from "../lib/valkey";

const SCHEMA_CACHE_KEY = "gremius:graphql:schema_version";
let cachedSchema: GraphQLSchema | null = null;
let schemaBuildTime = 0;
let localSchemaVersion = 0;
const SCHEMA_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getGlobalSchemaVersion(): Promise<number> {
  try {
    const client = await getValkeyClient();
    const val = await client.get(SCHEMA_CACHE_KEY);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

export async function invalidateGraphQLCache(): Promise<void> {
  cachedSchema = null;
  schemaBuildTime = 0;
  try {
    const client = await getValkeyClient();
    await client.incr(SCHEMA_CACHE_KEY);
  } catch {
    // Valkey not available — local invalidation only
  }
  console.log("[GraphQL] Schema cache invalidated");
}

async function isCacheStale(): Promise<boolean> {
  if (!cachedSchema) return true;
  if (schemaBuildTime === 0) return true;
  if (Date.now() - schemaBuildTime > SCHEMA_CACHE_TTL_MS) return true;
  const globalVersion = await getGlobalSchemaVersion();
  return globalVersion !== localSchemaVersion;
}

// ═══════════════════════════════════════════════════════════════
// DRIZZLE TABLE INTROSPECTION (Runtime)
// ═══════════════════════════════════════════════════════════════

function isDrizzleTable(val: unknown): boolean {
  return (
    typeof val === "object" &&
    val !== null &&
    typeof (val as any)[Symbol.for("drizzle:Name")] === "string"
  );
}

interface DrizzleColumnInfo {
  key: string;
  name: string;
  dataType: string;
  notNull: boolean;
  isEnum: boolean;
  enumValues?: string[];
}

function getTableColumns(table: any): DrizzleColumnInfo[] {
  const columns: DrizzleColumnInfo[] = [];

  for (const [key, val] of Object.entries(table)) {
    // Skip symbols and non-objects
    if (typeof key !== "string") continue;
    if (!val || typeof val !== "object") continue;

    // Skip relation objects (drizzle-orm relations)
    const ctorName = Object.getPrototypeOf(val)?.constructor?.name || "";
    if (ctorName === "Relations" || ctorName.includes("Relation")) continue;

    // Detect Drizzle columns by constructor name
    if (!ctorName.startsWith("Pg")) continue;
    if (ctorName === "PgTable") continue;

    const col = val as any;
    const isEnum = ctorName.includes("Enum") || Array.isArray(col.enumValues);

    columns.push({
      key,
      name: col.name || key,
      dataType: col.dataType || "string",
      notNull: !!col.notNull,
      isEnum,
      enumValues: isEnum ? col.enumValues : undefined,
    });
  }

  return columns;
}

function mapDrizzleTypeToGraphQL(
  col: DrizzleColumnInfo,
  enumTypeCache: Map<string, GraphQLEnumType>
): GraphQLOutputType {
  if (col.isEnum && col.enumValues && col.enumValues.length > 0) {
    const enumName = `Enum_${toPascalCase(col.name)}_${col.enumValues.map((v) => toPascalCase(v)).join("")}`;
    if (enumTypeCache.has(enumName)) {
      return enumTypeCache.get(enumName)!;
    }
    const enumType = new GraphQLEnumType({
      name: enumName,
      values: Object.fromEntries(col.enumValues.map((v) => [toPascalCase(v) || v, { value: v }])),
    });
    enumTypeCache.set(enumName, enumType);
    return enumType;
  }

  switch (col.dataType) {
    case "number":
      return GraphQLFloat;
    case "boolean":
      return GraphQLBoolean;
    case "json":
      return GraphQLJSON;
    case "date":
      return GraphQLString;
    case "string":
    default:
      return GraphQLString;
  }
}

// ═══════════════════════════════════════════════════════════════
// NATIVE TABLE TYPES (Dynamic from mergedSchema)
// ═══════════════════════════════════════════════════════════════

interface TableGraphQLTypes {
  itemType: GraphQLObjectType;
  pageType: GraphQLObjectType;
  table: any;
  columns: DrizzleColumnInfo[];
  hasIdColumn: boolean;
}

const DeletionResultType = new GraphQLObjectType({
  name: "DeletionResult",
  fields: {
    success: { type: new GraphQLNonNull(GraphQLBoolean) },
    id: { type: new GraphQLNonNull(GraphQLString) },
  },
});

async function buildNativeTableTypes(
  schema: Record<string, unknown>
): Promise<{
  typeMap: Map<string, TableGraphQLTypes>;
  queries: GraphQLFieldConfigMap<any, any>;
}> {
  const typeMap = new Map<string, TableGraphQLTypes>();
  const queries: GraphQLFieldConfigMap<any, any> = {};
  const enumTypeCache = new Map<string, GraphQLEnumType>();

  const schemaToUse = schema;

  for (const [exportKey, exportedValue] of Object.entries(schemaToUse)) {
    if (!isDrizzleTable(exportedValue)) continue;

    // Skip enums and relations (they are not tables)
    if (exportKey.endsWith("Enum")) continue;
    if (exportKey.endsWith("Relations")) continue;
    if (exportKey === "default") continue;

    const table = exportedValue as any;
    const tableName = table[Symbol.for("drizzle:Name")];
    const typeName = toPascalCase(exportKey);
    const columns = getTableColumns(table);
    const hasIdColumn = columns.some((c) => c.key === "id");

    // Build GraphQL fields from columns
    const fields: GraphQLFieldConfigMap<any, any> = {};
    for (const col of columns) {
      const gqlType = mapDrizzleTypeToGraphQL(col, enumTypeCache);
      fields[col.key] = {
        type: col.notNull ? new GraphQLNonNull(gqlType) : gqlType,
        description: `${col.name} (${col.dataType})`,
      };
    }

    const itemType = new GraphQLObjectType({
      name: typeName,
      fields,
      description: `Auto-generated type for table ${tableName}`,
    });

    const pageType = new GraphQLObjectType({
      name: `${typeName}Page`,
      fields: {
        docs: { type: new GraphQLList(itemType) },
        totalDocs: { type: GraphQLInt },
        page: { type: GraphQLInt },
        limit: { type: GraphQLInt },
        hasNextPage: { type: GraphQLBoolean },
      },
    });

    typeMap.set(exportKey, { itemType, pageType, table, columns, hasIdColumn });

    // ── Query: get one ──
    if (hasIdColumn) {
      queries[toCamelCase(exportKey)] = {
        type: itemType,
        args: {
          id: { type: new GraphQLNonNull(GraphQLString) },
        },
        async resolve(_: any, args: any) {
          try {
            const [doc] = await db
              .select()
              .from(table)
              .where(eq(table.id, args.id))
              .limit(1);
            return doc || null;
          } catch (err: any) {
            logger.error({ table: tableName, error: err.message }, "GraphQL single query failed");
            throw new Error(`Failed to query ${tableName}: ${err.message}`);
          }
        },
      };
    }

    // ── Query: list ──
    queries[toCamelCasePlural(exportKey)] = {
      type: pageType,
      args: {
        page: { type: GraphQLInt, defaultValue: 1 },
        limit: { type: GraphQLInt, defaultValue: 50 },
        search: { type: GraphQLString },
        sort: { type: GraphQLString },
        order: { type: GraphQLString, defaultValue: "desc" },
      },
      async resolve(_: any, args: any) {
        try {
          const limit = Math.min(args.limit || 50, 1000);
          const offset = ((args.page || 1) - 1) * limit;

          // Build conditions
          const conditions: any[] = [];

          if (args.search) {
            // Search in first text column
            const textCol = columns.find((c) => c.dataType === "string" && ["title", "name", "slug", "email"].some((n) => c.key.toLowerCase().includes(n)));
            if (textCol) {
              conditions.push(ilike(table[textCol.key], `%${args.search}%`));
            }
          }

          const where = conditions.length > 0 ? and(...conditions) : undefined;

          // Determine sort column
          let orderByCol = table.createdAt || table.id;
          if (args.sort && table[args.sort]) {
            orderByCol = table[args.sort];
          }
          const orderBy = args.order === "asc" ? asc(orderByCol) : desc(orderByCol);

          const [docs, [total]] = await Promise.all([
            db.select().from(table).where(where).orderBy(orderBy).limit(limit).offset(offset),
            db.select({ value: sql<number>`count(*)` }).from(table).where(where),
          ]);

          return {
            docs,
            totalDocs: total?.value || 0,
            page: args.page || 1,
            limit,
            hasNextPage: offset + docs.length < (total?.value || 0),
          };
        } catch (err: any) {
          logger.error({ table: tableName, error: err.message }, "GraphQL list query failed");
          throw new Error(`Failed to list ${tableName}: ${err.message}`);
        }
      },
    };
  }

  return { typeMap, queries };
}

async function buildNativeTableMutations(
  typeMap: Map<string, TableGraphQLTypes>
): Promise<GraphQLFieldConfigMap<any, any>> {
  const mutations: GraphQLFieldConfigMap<any, any> = {};

  for (const [exportKey, { itemType, table, hasIdColumn }] of typeMap) {
    if (!hasIdColumn) continue;

    const tableName = table[Symbol.for("drizzle:Name")];
    const typeName = toPascalCase(exportKey);

    mutations[`create${typeName}`] = {
      type: itemType,
      args: {
        input: { type: new GraphQLNonNull(GraphQLJSON) },
      },
      async resolve(_: any, args: any) {
        try {
          const input = args.input ? { ...args.input } : {};
          delete input.id;
          const [doc] = await (db.insert(table).values(input).returning() as Promise<any[]>);
          await invalidateGraphQLCache();
          return doc;
        } catch (err: any) {
          logger.error({ table: tableName, error: err.message }, "GraphQL create mutation failed");
          throw new Error(`Failed to create ${tableName}: ${err.message}`);
        }
      },
    };

    mutations[`update${typeName}`] = {
      type: itemType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLString) },
        input: { type: new GraphQLNonNull(GraphQLJSON) },
      },
      async resolve(_: any, args: any) {
        try {
          const input = args.input ? { ...args.input } : {};
          delete input.id;
          const [doc] = await db
            .update(table)
            .set(input)
            .where(eq(table.id, args.id))
            .returning();
          await invalidateGraphQLCache();
          return doc || null;
        } catch (err: any) {
          logger.error({ table: tableName, error: err.message }, "GraphQL update mutation failed");
          throw new Error(`Failed to update ${tableName}: ${err.message}`);
        }
      },
    };

    mutations[`delete${typeName}`] = {
      type: DeletionResultType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLString) },
      },
      async resolve(_: any, args: any) {
        try {
          await db.delete(table).where(eq(table.id, args.id));
          await invalidateGraphQLCache();
          return { success: true, id: args.id };
        } catch (err: any) {
          logger.error({ table: tableName, error: err.message }, "GraphQL delete mutation failed");
          throw new Error(`Failed to delete ${tableName}: ${err.message}`);
        }
      },
    };
  }

  return mutations;
}

// ═══════════════════════════════════════════════════════════════
// DATASET TYPES (Dynamic from data_sets table)
// ═══════════════════════════════════════════════════════════════

interface DatasetField {
  fieldName: string;
  fieldType: string;
  required?: boolean;
  options?: string;
  defaultValue?: string;
}

function datasetFieldTypeToGraphQL(fieldType: string): GraphQLOutputType {
  switch (fieldType) {
    case "text":
    case "email":
    case "url":
    case "richtext":
    case "select":
    case "image":
    case "relation":
      return GraphQLString;
    case "number":
    case "kpi":
      return GraphQLFloat;
    case "boolean":
      return GraphQLBoolean;
    case "date":
      return GraphQLString;
    case "json":
      return GraphQLJSON;
    default:
      return GraphQLString;
  }
}

async function buildDatasetTypes(): Promise<{
  types: Record<string, GraphQLObjectType>;
  pageTypes: Record<string, GraphQLObjectType>;
  queries: GraphQLFieldConfigMap<any, any>;
}> {
  const datasets = await db.select().from(dataSets);
  const types: Record<string, GraphQLObjectType> = {};
  const pageTypes: Record<string, GraphQLObjectType> = {};
  const queries: GraphQLFieldConfigMap<any, any> = {};

  for (const ds of datasets) {
    const typeName = `Dataset_${toPascalCase(ds.slug)}`;
    const pageTypeName = `${typeName}Page`;

    const fields: GraphQLFieldConfigMap<any, any> = {
      id: { type: new GraphQLNonNull(GraphQLString) },
      title: { type: GraphQLString },
      dataSetId: { type: GraphQLString },
      status: { type: GraphQLString },
      sortOrder: { type: GraphQLInt },
      createdAt: { type: GraphQLString },
      updatedAt: { type: GraphQLString },
    };

    for (const field of (ds.schema || []) as DatasetField[]) {
      const gqlType = datasetFieldTypeToGraphQL(field.fieldType);
      fields[field.fieldName] = {
        type: field.required ? new GraphQLNonNull(gqlType) : gqlType,
      };
    }

    const itemType = new GraphQLObjectType({ name: typeName, fields });
    types[ds.slug] = itemType;

    const pageType = new GraphQLObjectType({
      name: pageTypeName,
      fields: {
        docs: { type: new GraphQLList(itemType) },
        totalDocs: { type: GraphQLInt },
        page: { type: GraphQLInt },
        limit: { type: GraphQLInt },
        hasNextPage: { type: GraphQLBoolean },
      },
    });
    pageTypes[ds.slug] = pageType;

    // Query: dataset singular (by id)
    queries[toCamelCase(ds.slug)] = {
      type: itemType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLString) },
      },
      async resolve(_, args) {
        const [doc] = await db
          .select()
          .from(dataEntries)
          .where(and(eq(dataEntries.dataSetId, ds.id), eq(dataEntries.id, args.id)))
          .limit(1);
        return doc
          ? { id: doc.id, title: doc.title, dataSetId: doc.dataSetId, status: doc.status, sortOrder: doc.sortOrder, createdAt: doc.createdAt, updatedAt: doc.updatedAt, ...doc.data }
          : null;
      },
    };

    // Query: dataset list (paginated)
    queries[toCamelCasePlural(ds.slug)] = {
      type: pageType,
      args: {
        page: { type: GraphQLInt, defaultValue: 1 },
        limit: { type: GraphQLInt, defaultValue: 50 },
        status: { type: GraphQLString },
      },
      async resolve(_, args) {
        const conditions = [eq(dataEntries.dataSetId, ds.id)];
        if (args.status) conditions.push(eq(dataEntries.status, args.status));
        const where = and(...conditions);
        const offset = (args.page - 1) * args.limit;

        const [docs, [total]] = await Promise.all([
          db.select().from(dataEntries).where(where).orderBy(asc(dataEntries.sortOrder)).limit(args.limit).offset(offset),
          db.select({ value: count() }).from(dataEntries).where(where),
        ]);

        return {
          docs: docs.map((d) => ({ id: d.id, title: d.title, dataSetId: d.dataSetId, status: d.status, sortOrder: d.sortOrder, createdAt: d.createdAt, updatedAt: d.updatedAt, ...d.data })),
          totalDocs: total?.value || 0,
          page: args.page,
          limit: args.limit,
          hasNextPage: offset + docs.length < (total?.value || 0),
        };
      },
    };
  }

  return { types, pageTypes, queries };
}

async function buildDatasetMutations(
  types: Record<string, GraphQLObjectType>
): Promise<GraphQLFieldConfigMap<any, any>> {
  const datasets = await db.select().from(dataSets);
  const mutations: GraphQLFieldConfigMap<any, any> = {};

  for (const ds of datasets) {
    const itemType = types[ds.slug];
    if (!itemType) continue;

    const pascalSlug = toPascalCase(ds.slug);

    mutations[`createDataset_${pascalSlug}`] = {
      type: itemType,
      args: {
        input: { type: new GraphQLNonNull(GraphQLJSON) },
      },
      async resolve(_, args) {
        try {
          const input = args.input ? { ...args.input } : {};
          delete input.id;
          const title = input.title || input.name || "Untitled";
          const [doc] = await db
            .insert(dataEntries)
            .values({
              dataSetId: ds.id,
              title,
              data: input,
              ownerId: null,
            })
            .returning();
          await invalidateGraphQLCache();
          return doc
            ? { id: doc.id, title: doc.title, dataSetId: doc.dataSetId, status: doc.status, sortOrder: doc.sortOrder, createdAt: doc.createdAt, updatedAt: doc.updatedAt, ...doc.data }
            : null;
        } catch (err: any) {
          logger.error({ dataset: ds.slug, error: err.message }, "GraphQL dataset create mutation failed");
          throw new Error(`Failed to create dataset entry in ${ds.slug}: ${err.message}`);
        }
      },
    };

    mutations[`updateDataset_${pascalSlug}`] = {
      type: itemType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLString) },
        input: { type: new GraphQLNonNull(GraphQLJSON) },
      },
      async resolve(_, args) {
        try {
          const input = args.input ? { ...args.input } : {};
          delete input.id;

          const [existing] = await db
            .select()
            .from(dataEntries)
            .where(eq(dataEntries.id, args.id))
            .limit(1);

          const mergedData = existing ? { ...existing.data, ...input } : input;
          const title = input.title || input.name || existing?.title || "Untitled";

          const [doc] = await db
            .update(dataEntries)
            .set({ data: mergedData, title })
            .where(eq(dataEntries.id, args.id))
            .returning();
          await invalidateGraphQLCache();
          return doc
            ? { id: doc.id, title: doc.title, dataSetId: doc.dataSetId, status: doc.status, sortOrder: doc.sortOrder, createdAt: doc.createdAt, updatedAt: doc.updatedAt, ...doc.data }
            : null;
        } catch (err: any) {
          logger.error({ dataset: ds.slug, error: err.message }, "GraphQL dataset update mutation failed");
          throw new Error(`Failed to update dataset entry in ${ds.slug}: ${err.message}`);
        }
      },
    };

    mutations[`deleteDataset_${pascalSlug}`] = {
      type: DeletionResultType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLString) },
      },
      async resolve(_, args) {
        try {
          await db.delete(dataEntries).where(eq(dataEntries.id, args.id));
          await invalidateGraphQLCache();
          return { success: true, id: args.id };
        } catch (err: any) {
          logger.error({ dataset: ds.slug, error: err.message }, "GraphQL dataset delete mutation failed");
          throw new Error(`Failed to delete dataset entry in ${ds.slug}: ${err.message}`);
        }
      },
    };
  }

  return mutations;
}

// ═══════════════════════════════════════════════════════════════
// UNIVERSAL ITEMS QUERY
// ═══════════════════════════════════════════════════════════════

function buildUniversalQuery(
  _nativeQueries: GraphQLFieldConfigMap<any, any>,
  _datasetQueries: GraphQLFieldConfigMap<any, any>,
  schema: Record<string, unknown>
) {
  return {
    type: GraphQLJSON,
    args: {
      collection: { type: new GraphQLNonNull(GraphQLString) },
      id: { type: GraphQLString },
      page: { type: GraphQLInt, defaultValue: 1 },
      limit: { type: GraphQLInt, defaultValue: 50 },
      where: { type: GraphQLJSON },
    },
    async resolve(_: any, args: any) {
      const collection = args.collection;
      const limit = Math.min(args.limit || 50, 1000);
      const offset = ((args.page || 1) - 1) * limit;

      // Try dataset first
      const [ds] = await db.select().from(dataSets).where(eq(dataSets.slug, collection)).limit(1);
      if (ds) {
        if (args.id) {
          const [doc] = await db
            .select()
            .from(dataEntries)
            .where(and(eq(dataEntries.dataSetId, ds.id), eq(dataEntries.id, args.id)))
            .limit(1);
          return doc ? { id: doc.id, ...doc.data } : null;
        }

        const conditions = [eq(dataEntries.dataSetId, ds.id)];
        if (args.where) {
          for (const [k, v] of Object.entries(args.where)) {
            conditions.push(sql`data->>${k} = ${v as string}`);
          }
        }
        const [docs, [total]] = await Promise.all([
          db.select().from(dataEntries).where(and(...conditions)).orderBy(desc(dataEntries.createdAt)).limit(limit).offset(offset),
          db.select({ value: sql<number>`count(*)` }).from(dataEntries).where(and(...conditions)),
        ]);
        return {
          docs: docs.map((d) => ({ id: d.id, ...d.data })),
          totalDocs: total?.value || 0,
          page: args.page,
          limit,
        };
      }

      // Try native table
      const tableKey = Object.keys(schema).find((k) => k.toLowerCase() === collection.toLowerCase());
      const table = tableKey ? (schema as any)[tableKey] : null;

      if (table && isDrizzleTable(table)) {
        if (args.id && table.id) {
          const [doc] = await db.select().from(table).where(eq(table.id, args.id)).limit(1);
          return doc || null;
        }

        const [docs, [total]] = await Promise.all([
          db.select().from(table).orderBy(desc(table.createdAt || table.id)).limit(limit).offset(offset),
          db.select({ value: sql<number>`count(*)` }).from(table),
        ]);
        return {
          docs,
          totalDocs: total?.value || 0,
          page: args.page,
          limit,
        };
      }

      return null;
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// SCHEMA BUILDER
// ═══════════════════════════════════════════════════════════════

async function buildSchema(): Promise<GraphQLSchema> {
  if (cachedSchema && !await isCacheStale()) return cachedSchema;

  console.log("[GraphQL] Building dynamic schema...");
  const start = Date.now();

  // Rebuild merged schema at runtime to pick up newly installed grimoires
  const freshMergedSchema = await buildMergedSchema();

  const { typeMap, queries: nativeQueries } = await buildNativeTableTypes(freshMergedSchema);
  const nativeMutations = await buildNativeTableMutations(typeMap);

  const { types, queries: datasetQueries } = await buildDatasetTypes();
  const datasetMutations = await buildDatasetMutations(types);

  const queryFields: GraphQLFieldConfigMap<any, any> = {
    // ── Universal query ──
    items: buildUniversalQuery(nativeQueries, datasetQueries, freshMergedSchema),

    // ── Collections discovery ──
    collections: {
      type: GraphQLJSON,
      async resolve() {
        const datasets = await db.select({ slug: dataSets.slug, name: dataSets.name }).from(dataSets);
        const tables = Object.entries(freshMergedSchema)
          .filter(([k, v]) => isDrizzleTable(v) && !k.endsWith("Relations") && !k.endsWith("Enum"))
          .map(([k, v]) => ({ type: "table", name: k, dbName: (v as any)[Symbol.for("drizzle:Name")] }));

        return {
          datasets: datasets.map((d) => ({ type: "dataset", slug: d.slug, name: d.name })),
          tables,
        };
      },
    },

    // ── Native table queries (auto-generated) ──
    ...nativeQueries,

    // ── Dataset queries ──
    ...datasetQueries,
  };

  const QueryRoot = new GraphQLObjectType({
    name: "Query",
    fields: queryFields,
    description: "Auto-generated GraphQL schema for GremiusCMS. All tables and datasets are discoverable.",
  });

  const mutationFields: GraphQLFieldConfigMap<any, any> = {
    // ── Native table mutations (auto-generated) ──
    ...nativeMutations,

    // ── Dataset mutations (auto-generated) ──
    ...datasetMutations,
  };

  const MutationRoot = new GraphQLObjectType({
    name: "Mutation",
    fields: mutationFields,
    description: "Auto-generated GraphQL mutations for GremiusCMS.",
  });

  cachedSchema = new GraphQLSchema({ query: QueryRoot, mutation: MutationRoot });
  schemaBuildTime = Date.now() - start;
  localSchemaVersion = await getGlobalSchemaVersion() || Date.now();
  try {
    const client = await getValkeyClient();
    const exists = await client.exists(SCHEMA_CACHE_KEY);
    if (!exists) {
      await client.set(SCHEMA_CACHE_KEY, String(localSchemaVersion));
    }
  } catch {
    // Valkey not available — local cache only
  }
  console.log(`[GraphQL] Schema built in ${schemaBuildTime}ms`);

  return cachedSchema;
}

// ═══════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════

// POST /api/graphql — Execute query
graphqlRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const { query: queryStr, variables, operationName } = body;

  if (!queryStr) {
    return c.json({ errors: [{ message: "Query string required" }] }, 400);
  }

  try {
    const schema = await buildSchema();
    const result = await graphql({
      schema,
      source: queryStr,
      variableValues: variables,
      operationName,
    });

    return c.json(result);
  } catch (err: any) {
    logger.error({ error: err.message }, "GraphQL execution error");
    return c.json({ errors: [{ message: err.message }] }, 500);
  }
});

// GET /api/graphql — GraphiQL playground
graphqlRoutes.get("/", (c) => {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>GremiusCMS GraphQL — Dynamic Schema</title>
  <style>body { height: 100%; margin: 0; width: 100%; overflow: hidden; }</style>
  <link href="https://unpkg.com/graphiql@3/graphiql.min.css" rel="stylesheet" />
</head>
<body>
  <div id="graphiql" style="height: 100vh;"></div>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/graphiql@3/graphiql.min.js"></script>
  <script>
    const fetcher = GraphiQL.createFetcher({ url: window.location.href });
    ReactDOM.createRoot(document.getElementById('graphiql')).render(
      React.createElement(GraphiQL, { fetcher })
    );
  </script>
</body>
</html>`;
  return c.html(html);
});

// GET /api/graphql/schema — Introspection helper for AI
graphqlRoutes.get("/schema", async (c) => {
  try {
    const schema = await buildSchema();
    const typeMap = schema.getTypeMap();
    const types = Object.entries(typeMap)
      .filter(([name]) => !name.startsWith("__"))
      .map(([name, type]) => ({
        name,
        kind: type.constructor.name.replace("GraphQL", ""),
      }));

    return c.json({
      generatedAt: new Date().toISOString(),
      typeCount: types.length,
      types,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /api/graphql/invalidate — Force schema rebuild
graphqlRoutes.post("/invalidate", async (c) => {
  await invalidateGraphQLCache();
  return c.json({ success: true, message: "GraphQL schema cache invalidated" });
});

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function toPascalCase(str: string): string {
  return str
    .replace(/^grimoire[-_]/, "")
    .split(/[_-]+/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join("");
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function toCamelCasePlural(str: string): string {
  const singular = toCamelCase(str);
  // If it already looks plural, don't add another s
  if (singular.endsWith("s") || singular.endsWith("x") || singular.endsWith("ch") || singular.endsWith("ies")) {
    return singular;
  }
  if (singular.endsWith("y") && !/[aeiou]/.test(singular[singular.length - 2])) {
    return singular.slice(0, -1) + "ies";
  }
  return singular + "s";
}
