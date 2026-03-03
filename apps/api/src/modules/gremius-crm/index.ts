/**
 * Gremius CRM Module
 *
 * Initializes CRM datasets (Contacts, Deals, Activities) and registers
 * automation hooks. Only runs when the gremius-crm module is enabled.
 *
 * HOW TO MOUNT:
 *   import { initGremiusCrmModule } from "./modules/gremius-crm";
 *   initGremiusCrmModule();
 */

import { db } from "../../db";
import { dataSets, dataEntries, modules } from "../../db/schema";
import { events } from "../../lib/events";
import { eq } from "drizzle-orm";

const REQUIRED_DATASETS = [
    {
        name: "Contacts",
        slug: "contacts",
        description: "CRM Contacts",
        icon: "Users",
        schema: [
            { fieldName: "name", fieldType: "text", required: true },
            { fieldName: "email", fieldType: "text" },
            { fieldName: "company", fieldType: "text" }
        ]
    },
    {
        name: "Deals",
        slug: "deals",
        description: "Sales Pipeline",
        icon: "DollarSign",
        schema: [
            { fieldName: "title", fieldType: "text", required: true },
            { fieldName: "value", fieldType: "number" },
            {
                fieldName: "stage",
                fieldType: "select",
                options: "Lead,Qualified,Proposal,Negotiation,Closed Won,Closed Lost"
            }
        ]
    },
    {
        name: "Activities",
        slug: "activities",
        description: "CRM Activity Log",
        icon: "Activity",
        schema: [
            { fieldName: "title", fieldType: "text", required: true },
            { fieldName: "type", fieldType: "select", options: "Call,Email,Meeting,System" },
            { fieldName: "notes", fieldType: "rich-text" }
        ]
    }
];

export async function initGremiusCrmModule() {
    // ── Check if module is enabled ──
    try {
        const [mod] = await db.select().from(modules).where(eq(modules.key, "gremius-crm")).limit(1);
        if (mod && !mod.enabled) {
            console.log("🔌 Gremius CRM module is disabled — skipping init.");
            return;
        }
    } catch {
        // modules table may not exist yet on first boot — proceed anyway
    }

    console.log("🔌 Initializing Gremius CRM Module...");

    // 1. Auto-migration: Ensure datasets exist
    for (const def of REQUIRED_DATASETS) {
        const existing = await db.select().from(dataSets).where(eq(dataSets.slug, def.slug)).limit(1);
        if (existing.length === 0) {
            console.log(`[Gremius CRM] Creating default dataset: ${def.name}`);
            await db.insert(dataSets).values({
                name: def.name,
                slug: def.slug,
                description: def.description,
                icon: def.icon,
                schema: def.schema,
            });
        }
    }

    // 2. Register Hooks
    events.on("entry:updated", async ({ datasetId, entry }) => {
        try {
            // Fetch dataset info to check if it's the "Deals" dataset
            const [dataset] = await db.select().from(dataSets).where(eq(dataSets.id, datasetId)).limit(1);

            if (dataset && dataset.slug === "deals") {
                const stage = entry.data?.stage;

                // Automation: If stage is "Closed Won", create a celebration activity
                if (stage === "Closed Won") {
                    const activityTitle = `🎉 Deal Won: ${entry.data.title}`;

                    // Find Activities dataset
                    const [activitiesDs] = await db.select().from(dataSets).where(eq(dataSets.slug, "activities")).limit(1);

                    if (activitiesDs) {
                        await db.insert(dataEntries).values({
                            dataSetId: activitiesDs.id,
                            title: activityTitle,
                            data: {
                                title: activityTitle,
                                type: "System",
                                notes: `Deal "${entry.data.title}" value ${entry.data.value} was marked as Won!`
                            },
                            status: "published"
                        });
                        console.log(`[Gremius CRM] Auto-created activity for won deal: ${entry.data.title}`);
                    }
                }
            }
        } catch (err) {
            console.error("[Gremius CRM] Hook error:", err);
        }
    });
}
