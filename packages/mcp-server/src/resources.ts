import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { eq } from "drizzle-orm";
import type { McpServerDependencies } from "./index";

export function registerResources(server: McpServer, deps: McpServerDependencies) {
    const { db, schema, grimoireRegistry } = deps;

    // 1. List all datasets
    server.registerResource(
        "datasets",
        "gremius://datasets",
        {
            title: "Gremius Datasets",
            description: "List of all active dynamic datasets in the CMS",
            mimeType: "application/json"
        },
        async (uri) => {
            const allDatasets = await db.select().from(schema.dataSets);
            const mapped = allDatasets.map((ds: any) => ({
                id: ds.id,
                name: ds.name,
                slug: ds.slug,
                description: ds.description,
                schema: ds.schema
            }));

            return {
                contents: [
                    {
                        uri: uri.href,
                        text: JSON.stringify(mapped, null, 2)
                    }
                ]
            };
        }
    );

    // 2. Individual dataset schema via template
    server.registerResource(
        "dataset-schema",
        new ResourceTemplate("gremius://dataset/{id}", {
            list: async () => {
                const allDatasets = await db.select().from(schema.dataSets);
                return {
                    resources: allDatasets.map((ds: any) => ({
                        uri: `gremius://dataset/${ds.id}`,
                        name: `Dataset Schema: ${ds.name}`
                    }))
                };
            }
        }),
        {
            title: "Individual Dataset Schema",
            description: "Schema definition for a specific dataset",
            mimeType: "application/json"
        },
        async (uri, { id }) => {
            const [dataset] = await db
                .select()
                .from(schema.dataSets)
                .where(eq(schema.dataSets.id, id))
                .limit(1);

            if (!dataset) {
                throw new Error(`Dataset not found: ${id}`);
            }

            return {
                contents: [
                    {
                        uri: uri.href,
                        text: JSON.stringify(dataset.schema, null, 2)
                    }
                ]
            };
        }
    );

    // 3. List active grimoires (from registry)
    server.registerResource(
        "grimoires",
        "gremius://grimoires",
        {
            title: "Active Grimoires",
            description: "List of active core and realm grimoire modules",
            mimeType: "application/json"
        },
        async (uri) => {
            return {
                contents: [
                    {
                        uri: uri.href,
                        text: JSON.stringify(grimoireRegistry, null, 2)
                    }
                ]
            };
        }
    );
}
