import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { findProjectRoot } from '../utils/project.js';

function toCamelCase(str: string): string {
  return str
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/^(.)/, (_, char) => char.toLowerCase());
}

function toPascalCase(str: string): string {
  return str
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/^(.)/, (_, char) => char.toUpperCase());
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

export async function grimoireCreateCommand(
  rawName: string,
  options: { withAdmin?: boolean }
) {
  // Normalize name: accept "my-feature" or "myFeature" -> "my-feature"
  const kebabName = toKebabCase(rawName).replace(/^grimoire-/, '');
  const grimoireId = `grimoire-${kebabName}`;
  const camelName = toCamelCase(kebabName);
  const pascalName = toPascalCase(kebabName);
  const apiPrefix = kebabName;

  console.log(chalk.blue(`🔮 Creating grimoire: ${grimoireId}\n`));

  try {
    const projectRoot = await findProjectRoot();
    const grimoiresPath = path.join(projectRoot, 'packages', 'grimoires');
    const grimoirePath = path.join(grimoiresPath, grimoireId);

    // Check if already exists
    try {
      await fs.access(grimoirePath);
      console.error(chalk.red(`❌ Grimoire "${grimoireId}" already exists!`));
      process.exit(1);
    } catch {
      // doesn't exist, continue
    }

    // Create directory
    await fs.mkdir(grimoirePath, { recursive: true });

    // 1. grimoire.json (modern standard)
    const grimoireJson = {
      id: grimoireId,
      name: pascalName,
      description: `${pascalName} grimoire for GremiusCMS`,
      version: '1.0.0',
      type: 'grimoire',
      icon: 'Box',
      tables: [
        {
          name: `${camelName}Items`,
          label: `${pascalName} Items`,
          icon: 'Box',
          description: `Main table for ${pascalName}`,
          searchableFields: ['title'],
          filterableFields: ['status']
        }
      ],
      dependencies: {
        grimoires: [],
        core: ['auth']
      },
      admin: options.withAdmin
        ? {
            category: 'content',
            defaultView: 'grid',
            views: [
              {
                id: 'grid',
                type: 'grid',
                title: 'All Items',
                table: `${camelName}Items`
              }
            ]
          }
        : undefined
    };

    await fs.writeFile(
      path.join(grimoirePath, 'grimoire.json'),
      JSON.stringify(grimoireJson, null, 2)
    );

    // 2. schema.ts
    const schemaContent = `import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

export const ${camelName}Items = pgTable("${kebabName}_items", {
  id: text("id").primaryKey().\$defaultFn(createId),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").default("draft").notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ${pascalName}Item = typeof ${camelName}Items.\$inferSelect;
export type New${pascalName}Item = typeof ${camelName}Items.\$inferInsert;
`;

    await fs.writeFile(
      path.join(grimoirePath, `${kebabName}.schema.ts`),
      schemaContent
    );

    // 3. routes.ts
    const routesContent = `import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import type { GrimoireContext } from "@gremius/shared";
import { ${camelName}Items } from "./${kebabName}.schema.js";

export function create${pascalName}Router(ctx: GrimoireContext): Hono {
  const app = new Hono();
  const db = ctx.db.instance;
  const { requireAuth } = ctx.auth;

  // Apply auth to all routes
  app.use("/*", requireAuth);

  // List items
  app.get("/items", async (c) => {
    const limit = Math.min(Number(c.req.query("limit")) || 50, 100);
    const items = await db
      .select()
      .from(${camelName}Items)
      .orderBy(desc(${camelName}Items.createdAt))
      .limit(limit);
    return c.json({ data: items });
  });

  // Get single item
  app.get("/items/:id", async (c) => {
    const [item] = await db
      .select()
      .from(${camelName}Items)
      .where(eq(${camelName}Items.id, c.req.param("id")))
      .limit(1);
    if (!item) return c.json({ error: "Not found" }, 404);
    return c.json({ data: item });
  });

  // Create item
  app.post("/items", async (c) => {
    const body = await c.req.json();
    const [item] = await db
      .insert(${camelName}Items)
      .values({ ...body, updatedAt: new Date() })
      .returning();
    return c.json({ data: item }, 201);
  });

  // Update item
  app.patch("/items/:id", async (c) => {
    const body = await c.req.json();
    const [item] = await db
      .update(${camelName}Items)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(${camelName}Items.id, c.req.param("id")))
      .returning();
    if (!item) return c.json({ error: "Not found" }, 404);
    return c.json({ data: item });
  });

  // Delete item
  app.delete("/items/:id", async (c) => {
    const [item] = await db
      .delete(${camelName}Items)
      .where(eq(${camelName}Items.id, c.req.param("id")))
      .returning();
    if (!item) return c.json({ error: "Not found" }, 404);
    return c.json({ success: true });
  });

  return app;
}
`;

    await fs.writeFile(
      path.join(grimoirePath, `${kebabName}.routes.ts`),
      routesContent
    );

    // 4. index.ts (modern defineGrimoire)
    const indexContent = `import type { GrimoireContext } from "@gremius/shared";
import { defineGrimoire } from "@gremius/shared";
import { Hono } from "hono";
import { create${pascalName}Router } from "./${kebabName}.routes.js";

// Re-export schema for schema-merger
export * from "./${kebabName}.schema.js";

export function createGrimoire${pascalName}(ctx: GrimoireContext): Hono {
  const app = new Hono();
  app.route("/", create${pascalName}Router(ctx));
  return app;
}

export const grimoire = defineGrimoire({
  id: "${grimoireId}",
  name: "${pascalName}",
  version: "1.0.0",
  description: "${pascalName} grimoire for GremiusCMS",
  icon: "Box",
  mountPath: "/api/${apiPrefix}",
  createRouter: createGrimoire${pascalName},

  tables: ["${camelName}Items"],

  admin: {
    category: "content",
    views: [
      { id: "grid", type: "grid", title: "All Items", table: "${camelName}Items" },
    ],
  },

  dependencies: {
    grimoires: [],
    core: ["auth"],
  },

  hooks: {
    onStartup: async (ctx) => {
      ctx.logger.info("📦 ${pascalName} grimoire initialized");
    },
    onEnable: async (ctx) => {
      ctx.logger.info("✅ ${pascalName} grimoire enabled");
    },
    onDisable: async (ctx) => {
      ctx.logger.info("🛑 ${pascalName} grimoire disabled");
    },
  },
});

export default grimoire;
`;

    await fs.writeFile(path.join(grimoirePath, 'index.ts'), indexContent);

    // 5. README.md
    const readmeContent = `# ${pascalName} Grimoire

Auto-generated grimoire for GremiusCMS.

## Structure

\`\`\`
packages/grimoires/${grimoireId}/
├── grimoire.json           # Grimoire manifest
├── ${kebabName}.schema.ts  # Drizzle ORM schema
├── ${kebabName}.routes.ts  # Hono API routes
├── index.ts                # Entry point & definition
└── README.md               # This file
\`\`\`

## Installation

1. The grimoire is auto-discovered by \`apps/api/gremius.config.ts\`.
2. Enable it in the config or via the Admin UI.
3. Run migrations if you added new tables:
   \`\`\`bash
   cd apps/api && bunx drizzle-kit generate
   \`\`\`

## API Endpoints

Mounted at \`/api/${apiPrefix}\`:

- \`GET /api/${apiPrefix}/items\` - List items
- \`GET /api/${apiPrefix}/items/:id\` - Get single item
- \`POST /api/${apiPrefix}/items\` - Create item
- \`PATCH /api/${apiPrefix}/items/:id\` - Update item
- \`DELETE /api/${apiPrefix}/items/:id\` - Delete item
`;

    await fs.writeFile(path.join(grimoirePath, 'README.md'), readmeContent);

    // Print success
    console.log(chalk.green('✅ Grimoire created successfully!\n'));
    console.log(chalk.gray('Created files:'));
    console.log(chalk.gray(`  📁 packages/grimoires/${grimoireId}/`));
    console.log(chalk.gray(`     📄 grimoire.json`));
    console.log(chalk.gray(`     📄 ${kebabName}.schema.ts`));
    console.log(chalk.gray(`     📄 ${kebabName}.routes.ts`));
    console.log(chalk.gray(`     📄 index.ts`));
    console.log(chalk.gray(`     📄 README.md`));

    console.log(chalk.blue('\nNext steps:'));
    console.log(chalk.gray(`  1. Edit ${kebabName}.schema.ts to define your tables`));
    console.log(chalk.gray(`  2. Edit ${kebabName}.routes.ts to add your business logic`));
    console.log(chalk.gray('  3. Run: cd apps/api && bunx drizzle-kit generate'));
    console.log(chalk.gray('  4. Enable the grimoire in gremius.config.ts if needed'));
    console.log(chalk.gray('  5. Restart the dev server\n'));
  } catch (error: any) {
    console.error(chalk.red('❌ Error creating grimoire:'), error.message || error);
    process.exit(1);
  }
}
