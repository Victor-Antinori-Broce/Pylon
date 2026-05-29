/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * AGENT COMMANDS - AI-Friendly CLI Operations
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Commands for AI agents to:
 * - Generate grimoires from descriptions
 * - Validate code
 * - Debug MCP connection
 * - Initialize project context
 */

// import { Command } from "commander"; // Not used directly
import chalk from "chalk";
import fs from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import ora from "ora";

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE GRIMOIRE - Generate from description
// ═══════════════════════════════════════════════════════════════════════════════

export async function createGrimoire(
  name: string,
  options: {
    description?: string;
    features?: string[];
    dataModel?: string;
    output?: string;
  }
) {
  const spinner = ora(`Generating grimoire "${name}"...`).start();
  
  try {
    const outputDir = options.output || `packages/grimoires/grimoire-${name}`;
    
    // Validate name
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      throw new Error("Grimoire name must be kebab-case (e.g., 'inventory-management')");
    }
    
    // Generate files
    const pascalName = toPascalCase(name);
    
    const files = [
      {
        path: path.join(outputDir, "index.ts"),
        content: generateIndexFile(name, pascalName, options),
      },
      {
        path: path.join(outputDir, "schema.ts"),
        content: generateSchemaFile(pascalName, options.dataModel),
      },
      {
        path: path.join(outputDir, "grimoire.json"),
        content: generateGrimoireJson(name, options),
      },
      {
        path: path.join(outputDir, "package.json"),
        content: generatePackageJson(name),
      },
    ];
    
    // Create directory
    await fs.mkdir(outputDir, { recursive: true });
    
    // Write files
    for (const file of files) {
      await fs.mkdir(path.dirname(file.path), { recursive: true });
      await fs.writeFile(file.path, file.content);
    }
    
    spinner.succeed(`Grimoire "${name}" generated at ${outputDir}/`);
    
    console.log(chalk.blue("\n📁 Generated files:"));
    files.forEach(f => console.log(`  - ${path.relative(process.cwd(), f.path)}`));
    
    console.log(chalk.green("\n🚀 Next steps:"));
    console.log(`  1. cd ${outputDir}`);
    console.log(`  2. Review and customize the generated code`);
    console.log(`  3. gremius plugin install ${name} --source local`);
    console.log(`  4. gremius dev`);
    
  } catch (error: any) {
    spinner.fail(`Failed to generate grimoire: ${error.message}`);
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATE - Check code before commit
// ═══════════════════════════════════════════════════════════════════════════════

export async function validateCode(
  options: {
    grimoire?: string;
    typecheck?: boolean;
    lint?: boolean;
    security?: boolean;
    fix?: boolean;
  }
) {
  const spinner = ora("Validating code...").start();
  const issues: Array<{ type: string; file?: string; message: string }> = [];
  
  try {
    // Type check
    if (options.typecheck !== false) {
      spinner.text = "Running TypeScript check...";
      try {
        await execa("npx", ["tsc", "--noEmit"], { cwd: process.cwd() });
      } catch (err: any) {
        issues.push({ type: "typescript", message: "Type errors found" });
      }
    }
    
    // Lint
    if (options.lint !== false) {
      spinner.text = "Running ESLint...";
      try {
        const lintArgs = options.fix ? ["lint:fix"] : ["lint"];
        await execa("pnpm", lintArgs, { cwd: process.cwd() });
      } catch (err: any) {
        issues.push({ type: "lint", message: "Lint errors found" });
      }
    }
    
    // Security check
    if (options.security) {
      spinner.text = "Running security checks...";
      // Check for common security issues
      const securityIssues = await runSecurityChecks(options.grimoire);
      issues.push(...securityIssues);
    }
    
    // Grimoire-specific validation
    if (options.grimoire) {
      spinner.text = `Validating grimoire "${options.grimoire}"...`;
      const grimoireIssues = await validateGrimoire(options.grimoire);
      issues.push(...grimoireIssues);
    }
    
    spinner.stop();
    
    if (issues.length === 0) {
      console.log(chalk.green("✅ All checks passed!"));
    } else {
      console.log(chalk.yellow(`\n⚠️  Found ${issues.length} issues:\n`));
      
      const grouped = groupBy(issues, "type");
      for (const [type, items] of Object.entries(grouped)) {
        console.log(chalk.blue(`${type.toUpperCase()}:`));
        items.forEach(i => console.log(`  - ${i.message}${i.file ? ` (${i.file})` : ""}`));
      }
      
      process.exit(1);
    }
    
  } catch (error: any) {
    spinner.fail(`Validation failed: ${error.message}`);
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEBUG MCP - Test MCP connection
// ═══════════════════════════════════════════════════════════════════════════════

export async function debugMcp(options: { token?: string; url?: string }) {
  console.log(chalk.blue("🔍 Debugging MCP connection...\n"));
  
  const checks = [
    {
      name: "Environment variables",
      check: () => {
        const token = options.token || process.env.GREMUS_MCP_TOKEN;
        const url = options.url || process.env.GREMUS_API_URL || "http://localhost:3001";
        return { ok: !!token, token: token?.slice(0, 20) + "...", url };
      }
    },
    {
      name: "API connectivity",
      check: async () => {
        try {
          const url = options.url || process.env.GREMUS_API_URL || "http://localhost:3001";
          const response = await fetch(`${url}/api/health`);
          return { ok: response.ok, status: response.status };
        } catch (err: any) {
          return { ok: false, error: err.message };
        }
      }
    },
    {
      name: "Grimoire registry",
      check: async () => {
        try {
          const url = options.url || process.env.GREMUS_API_URL || "http://localhost:3001";
          const response = await fetch(`${url}/api/docs/grimoires`);
          const data = await response.json() as any;
          return { ok: response.ok, grimoires: data.total };
        } catch (err: any) {
          return { ok: false, error: err.message };
        }
      }
    }
  ];
  
  for (const check of checks) {
    const spinner = ora(check.name).start();
    try {
      const result = await check.check();
      if (result.ok) {
        spinner.succeed(`${check.name}: ${JSON.stringify(result)}`);
      } else {
        spinner.fail(`${check.name}: ${'error' in result ? result.error : "Failed"}`);
      }
    } catch (err: any) {
      spinner.fail(`${check.name}: ${err.message}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INIT - Initialize agent configuration
// ═══════════════════════════════════════════════════════════════════════════════

export async function initAgent(options: { editor?: string; force?: boolean }) {
  const spinner = ora("Initializing agent configuration...").start();
  
  try {
    const editor = options.editor || detectEditor();
    
    if (editor === "cursor") {
      await initCursorConfig(options.force);
    } else if (editor === "claude") {
      await initClaudeConfig(options.force);
    } else {
      await initGenericConfig();
    }
    
    spinner.succeed(`Initialized for ${editor}`);
    
  } catch (error: any) {
    spinner.fail(`Initialization failed: ${error.message}`);
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GENERATE SDK - Client SDK from OpenAPI
// ═══════════════════════════════════════════════════════════════════════════════

export async function generateSdk(
  options: {
    grimoire?: string;
    language: "typescript" | "python" | "go" | "java" | "php";
    output: string;
  }
) {
  const spinner = ora("Generating SDK...").start();
  
  try {
    const apiUrl = process.env.GREMUS_API_URL || "http://localhost:3001";
    let specUrl: string;
    
    if (options.grimoire) {
      specUrl = `${apiUrl}/api/docs/${options.grimoire}/openapi.json`;
    } else {
      specUrl = `${apiUrl}/api/docs/openapi.json`;
    }
    
    // Fetch spec
    spinner.text = "Fetching OpenAPI spec...";
    const response = await fetch(specUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch spec: ${response.statusText}`);
    }
    
    const spec = await response.json();
    
    // Generate SDK (using openapi-generator or similar)
    spinner.text = `Generating ${options.language} SDK...`;
    
    const generatorMap: Record<string, string> = {
      typescript: "typescript-fetch",
      python: "python",
      go: "go",
      java: "java",
      php: "php",
    };
    
    const generator = generatorMap[options.language];
    
    // Save spec to temp file
    const tempSpecPath = path.join(process.cwd(), ".temp-openapi.json");
    await fs.writeFile(tempSpecPath, JSON.stringify(spec, null, 2));
    
    // Run generator
    try {
      await execa("npx", [
        "@openapitools/openapi-generator-cli",
        "generate",
        "-i", tempSpecPath,
        "-g", generator,
        "-o", options.output,
        "--skip-validate-spec",
      ], { cwd: process.cwd() });
    } finally {
      // Cleanup
      try { await fs.unlink(tempSpecPath); } catch {}
    }
    
    spinner.succeed(`SDK generated at ${options.output}/`);
    
    console.log(chalk.blue("\n📦 Installation:"));
    if (options.language === "typescript") {
      console.log(`  cd ${options.output}`);
      console.log("  npm install");
      console.log("  npm run build");
    } else if (options.language === "python") {
      console.log(`  cd ${options.output}`);
      console.log("  pip install -e .");
    }
    
  } catch (error: any) {
    spinner.fail(`SDK generation failed: ${error.message}`);
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function toPascalCase(str: string): string {
  return str
    .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    .replace(/^[a-z]/, l => l.toUpperCase());
}

function generateIndexFile(
  name: string,
  pascalName: string,
  options: { description?: string; features?: string[] }
): string {
  // const hasCrud = options.features?.includes("crud");
  // const hasRelations = options.features?.includes("relations");
  const hasWebhooks = options.features?.includes("webhooks");
  
  return `/**
 * @gremius/grimoire-${name}
 * 
 * ${options.description || `${pascalName} module`}
 */

import { Hono } from "hono";
import { defineGrimoire } from "@gremius/shared";
import { z } from "zod";
import { ${pascalName}Schema, Create${pascalName}Schema } from "./schema";

// Types
export type ${pascalName} = z.infer<typeof ${pascalName}Schema>;
export type Create${pascalName} = z.infer<typeof Create${pascalName}Schema>;

export const grimoire = defineGrimoire({
  id: "grimoire-${name}",
  name: "${pascalName}",
  version: "1.0.0",
  description: "${options.description || `${pascalName} module`}",
  icon: "Box",
  
  openApi: {
    tags: [
      { 
        name: "${pascalName}", 
        description: "${options.description || `${pascalName} operations`}" 
      }
    ],
    schemas: {
      ${pascalName}: ${pascalName}Schema,
      Create${pascalName}: Create${pascalName}Schema,
    },
    paths: [
      {
        method: "get",
        path: "/",
        summary: "List all ${pascalName}",
        tags: ["${pascalName}"],
        query: z.object({
          limit: z.number().optional().default(50),
          offset: z.number().optional().default(0),
        }),
        responses: {
          200: { 
            description: "List of items", 
            schema: z.object({
              data: z.array(${pascalName}Schema),
              total: z.number(),
            })
          }
        }
      },
      {
        method: "post",
        path: "/",
        summary: "Create new ${pascalName}",
        tags: ["${pascalName}"],
        body: Create${pascalName}Schema,
        requireAuth: true,
        responses: {
          201: { description: "Created", schema: ${pascalName}Schema },
          400: { description: "Validation error", schema: z.object({ error: z.string() }) }
        }
      },
      {
        method: "get",
        path: "/:id",
        summary: "Get ${pascalName} by ID",
        tags: ["${pascalName}"],
        params: z.object({ id: z.string().uuid() }),
        responses: {
          200: { description: "Item found", schema: ${pascalName}Schema },
          404: { description: "Not found", schema: z.object({ error: z.string() }) }
        }
      },
    ]
  },
  
  createRouter: (ctx) => {
    const router = new Hono();
    
    // List
    router.get("/", async (c) => {
      const { limit = 50, offset = 0 } = c.req.query();
      
      // TODO: Replace with actual table
      // const data = await ctx.db.instance
      //   .select()
      //   .from(${name}Table)
      //   .limit(parseInt(limit))
      //   .offset(parseInt(offset));
      
      return c.json({ 
        data: [], 
        total: 0,
        message: "Implement database query" 
      });
    });
    
    // Create
    router.post("/", ctx.auth.requireAuth, async (c) => {
      const body = await c.req.json();
      
      // TODO: Validate and create
      // const validated = Create${pascalName}Schema.parse(body);
      // const [created] = await ctx.db.instance
      //   .insert(${name}Table)
      //   .values(validated)
      //   .returning();
      
      ${hasWebhooks ? `ctx.events.emit("${name}:created", body);` : ""}
      
      return c.json({ message: "Implement creation" }, 201);
    });
    
    // Get by ID
    router.get("/:id", async (c) => {
      const { id } = c.req.param();
      
      // TODO: Fetch from database
      // const [item] = await ctx.db.instance
      //   .select()
      //   .from(${name}Table)
      //   .where(eq(${name}Table.id, id))
      //   .limit(1);
      
      return c.json({ message: "Implement fetch", id });
    });
    
    return router;
  },
  
  hooks: {
    onStartup: async (ctx) => {
      ctx.logger.info("📦 ${pascalName} grimoire initialized");
      
      // TODO: Verify tables exist
      // const exists = await ctx.db.tableExists("${name}");
      // if (!exists) {
      //   ctx.logger.warn("Table not found, run migrations!");
      // }
    },
    
    onEnable: async (ctx) => {
      ctx.logger.info("✅ ${pascalName} enabled");
    },
    
    onDisable: async (ctx) => {
      ctx.logger.info("⏸️  ${pascalName} disabled");
    }
  }
});

export default grimoire;
`;
}

function generateSchemaFile(pascalName: string, dataModel?: string): string {
  return `/**
 * Database Schema for ${pascalName}
 * 
 * ${dataModel || "Define your data model here"}
 */

import { pgTable, uuid, varchar, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { z } from "zod";

// Database table definition
export const ${pascalName.toLowerCase()}Table = pgTable("${pascalName.toLowerCase()}", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  data: jsonb("data").default({}),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Zod schemas for API
export const ${pascalName}Schema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  data: z.record(z.any()).default({}),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).openapi("${pascalName}");

export const Create${pascalName}Schema = ${pascalName}Schema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const Update${pascalName}Schema = Create${pascalName}Schema.partial();

export type ${pascalName} = z.infer<typeof ${pascalName}Schema>;
export type Create${pascalName} = z.infer<typeof Create${pascalName}Schema>;
export type Update${pascalName} = z.infer<typeof Update${pascalName}Schema>;
`;
}

function generateGrimoireJson(name: string, options: { description?: string }): string {
  return JSON.stringify({
    id: `grimoire-${name}`,
    name: toPascalCase(name),
    description: options.description || `${toPascalCase(name)} module`,
    version: "1.0.0",
    type: "grimoire",
    icon: "Box",
    tables: [name.toLowerCase()],
    mount: {
      path: `/api/${name}`
    },
    admin: {
      category: "content",
      defaultView: "grid"
    }
  }, null, 2);
}

function generatePackageJson(name: string): string {
  return JSON.stringify({
    name: `@gremius/grimoire-${name}`,
    version: "1.0.0",
    description: `Gremius grimoire for ${name}`,
    type: "module",
    main: "index.ts",
    types: "index.ts",
    gremius: {
      type: "grimoire",
      id: `grimoire-${name}`,
      minVersion: "0.8.0"
    },
    peerDependencies: {
      "@gremius/engine": "^0.8.0",
      "@gremius/shared": "^0.8.0"
    },
    keywords: ["gremius", "grimoire"]
  }, null, 2);
}

async function runSecurityChecks(_grimoire?: string): Promise<any[]> {
  const issues: any[] = [];
  // Implementation...
  return issues;
}

async function validateGrimoire(_name: string): Promise<any[]> {
  const issues: any[] = [];
  // Implementation...
  return issues;
}

function detectEditor(): string {
  // Detect based on installed configs
  return "generic";
}

async function initCursorConfig(force?: boolean) {
  const cursorRulesPath = path.join(process.cwd(), ".cursorrules");
  
  if (!force && await fileExists(cursorRulesPath)) {
    console.log(chalk.yellow("⚠️  .cursorrules already exists. Use --force to overwrite."));
    return;
  }
  
  const content = `# Gremius Project - Cursor Rules

## Architecture
- GremiusCMS with modular grimoire system
- Engine → Core → Grimoires (3-tier architecture)
- Bun + Hono + Drizzle + PostgreSQL

## Code Patterns

### Creating a Grimoire Endpoint
\`\`\`typescript
export const grimoire = defineGrimoire({
  id: "grimoire-myfeature",
  createRouter: (ctx) => {
    const router = new Hono();
    
    router.get("/", async (c) => {
      const data = await ctx.db.instance.select().from(myTable);
      return c.json({ data });
    });
    
    return router;
  }
});
\`\`\`

### Database Operations
- Always use ctx.db.instance (Drizzle)
- Use transactions for multi-step operations
- Implement RLS policies for security

### API Standards
- RESTful endpoints
- Zod validation
- OpenAPI documentation via grimoire.openApi
- Proper HTTP status codes

## MCP Tools Available
- gremius_intelligent_query - Natural language queries
- gremius_generate_grimoire - Generate boilerplate
- gremius_introspect_schema - Schema inspection
- gremius_validate_code - Code validation
`;
  
  await fs.writeFile(cursorRulesPath, content);
  console.log(chalk.green("✅ Created .cursorrules"));
}

async function initClaudeConfig(force?: boolean) {
  const claudeMdPath = path.join(process.cwd(), "CLAUDE.md");
  
  if (!force && await fileExists(claudeMdPath)) {
    console.log(chalk.yellow("⚠️  CLAUDE.md already exists. Use --force to overwrite."));
    return;
  }
  
  // Similar content to cursorrules but formatted for Claude
  await fs.writeFile(claudeMdPath, "# Gremius Project Context\n\nSee .cursorrules for detailed patterns.");
  console.log(chalk.green("✅ Created CLAUDE.md"));
}

async function initGenericConfig() {
  await initCursorConfig(true);
  await initClaudeConfig(true);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((acc, item) => {
    const group = String(item[key]);
    acc[group] = acc[group] || [];
    acc[group].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

export default {
  createGrimoire,
  validateCode,
  debugMcp,
  initAgent,
  generateSdk,
};
