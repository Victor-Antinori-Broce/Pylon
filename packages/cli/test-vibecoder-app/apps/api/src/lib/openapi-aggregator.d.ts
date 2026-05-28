/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * OPENAPI AGGREGATOR - Dynamic OpenAPI Spec Generation from Grimoires
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This module aggregates OpenAPI specifications from all loaded grimoires
 * into a single unified API specification.
 *
 * Features:
 * - Auto-generates OpenAPI 3.0.0 spec from grimoire definitions
 * - Converts Zod schemas to JSON Schema
 * - Prefixes schemas with grimoire ID to avoid conflicts
 * - Auto-generates operationIds for code generation
 * - Supports tags, webhooks, and reusable components
 */
import type { OpenAPIObject } from "openapi3-ts/oas30";
import type { GrimoireDefinition } from "@gremius/shared";
/**
 * Options for generating OpenAPI specification
 */
export interface OpenApiAggregatorOptions {
    /** API title */
    title?: string;
    /** API version */
    version?: string;
    /** API description */
    description?: string;
    /** Server URLs */
    servers?: Array<{
        url: string;
        description?: string;
    }>;
    /** Include only specific grimoires (default: all) */
    includeGrimoires?: string[];
    /** Exclude specific grimoires */
    excludeGrimoires?: string[];
}
/**
 * Generate complete OpenAPI specification from grimoires
 */
export declare function generateOpenAPISpec(grimoires: GrimoireDefinition[], options?: OpenApiAggregatorOptions): Promise<OpenAPIObject>;
/**
 * Generate OpenAPI spec for a single grimoire
 */
export declare function generateGrimoireSpec(grimoire: GrimoireDefinition): Promise<OpenAPIObject | null>;
/**
 * Get operation ID for a specific endpoint
 */
export declare function getOperationId(grimoire: GrimoireDefinition, method: string, path: string): string | undefined;
/**
 * List all available operations across grimoires
 */
export declare function listOperations(grimoires: GrimoireDefinition[]): Array<{
    grimoireId: string;
    operationId: string;
    method: string;
    path: string;
    summary: string;
    tags: string[];
}>;
declare const _default: {
    generateOpenAPISpec: typeof generateOpenAPISpec;
    generateGrimoireSpec: typeof generateGrimoireSpec;
    getOperationId: typeof getOperationId;
    listOperations: typeof listOperations;
};
export default _default;
//# sourceMappingURL=openapi-aggregator.d.ts.map