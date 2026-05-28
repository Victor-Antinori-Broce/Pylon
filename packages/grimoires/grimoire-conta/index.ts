import type { GrimoireContext } from "@gremius/shared";
import { defineGrimoire } from "@gremius/shared";
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { join } from "path";
import { readdir } from "fs/promises";
import { readFileSync } from "fs";

/**
 * Parsea un archivo SQL en statements individuales.
 * Respeta bloques DO $$ ... $$; y no ejecuta statements vacíos.
 */
function parseSQLStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inDollarQuote = false;
  let dollarTag = "";

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    current += char;

    // Detectar inicio de bloque DO $$
    if (!inDollarQuote && char === "$" && sql.slice(i, i + 2) === "$$") {
      inDollarQuote = true;
      dollarTag = "$$";
      i++; // skip second $
      current += "$";
      continue;
    }

    // Detectar fin de bloque $$
    if (inDollarQuote && char === "$" && sql.slice(i, i + 2) === "$$") {
      inDollarQuote = false;
      dollarTag = "";
      i++; // skip second $
      current += "$";
      continue;
    }

    // Statement terminator solo fuera de bloques
    if (!inDollarQuote && char === ";") {
      const trimmed = current.trim();
      if (trimmed.length > 1) {
        statements.push(trimmed);
      }
      current = "";
    }
  }

  // Último statement si no termina en ;
  const trimmed = current.trim();
  if (trimmed.length > 0) {
    statements.push(trimmed);
  }

  return statements;
}
import { createContaRouter } from "./conta.routes";
import { ContaService } from "./conta.service";

// Re-export schema for schema-merger
export * from "./conta.schema";

// Re-export shared types
export type { ContaDb } from "./types";

// Re-export engine for advanced usage
export {
  ContaService,
  validateLedgerLines,
  applyJournalTemplate,
  type ValidationResult,
  type TemplateVariables,
} from "./conta.service";

export function createGrimoireConta(ctx: GrimoireContext): Hono {
  const app = new Hono();
  app.route("/", createContaRouter(ctx));
  return app;
}

export const grimoire = defineGrimoire({
  id: "grimoire-conta",
  name: "Contabilidad",
  version: "1.0.0",
  description:
    "Motor de Libro Mayor General (General Ledger Engine) con partida doble, multidivisa, plantillas de asientos, metadata JSONB y soporte para contabilidad legal (trust accounting y disbursements).",
  icon: "Landmark",
  mountPath: "/api/conta",
  createRouter: createGrimoireConta,

  tables: [
    "conta_currencies",
    "conta_accounts",
    "conta_counterparties",
    "conta_matters",
    "conta_journal_templates",
    "conta_journals",
    "conta_ledger_entries",
    "conta_disbursements",
  ],

  admin: {
    category: "data",
    views: [
      { id: "accounts", type: "grid", title: "Cuentas", table: "conta_accounts" },
      { id: "journals", type: "grid", title: "Asientos", table: "conta_journals" },
      { id: "ledger", type: "grid", title: "Líneas de Mayor", table: "conta_ledger_entries" },
      { id: "matters", type: "grid", title: "Expedientes", table: "conta_matters" },
      { id: "templates", type: "grid", title: "Plantillas", table: "conta_journal_templates" },
    ],
  },

  dependencies: {
    grimoires: [],
    core: ["auth"],
  },

  hooks: {
    onStartup: async (ctx: GrimoireContext) => {
      ctx.logger.info("📊 Grimoire Conta (General Ledger Engine) initializing...");

      const tables = [
        "conta_currencies",
        "conta_accounts",
        "conta_counterparties",
        "conta_matters",
        "conta_journal_templates",
        "conta_journals",
        "conta_ledger_entries",
        "conta_disbursements",
      ];

      try {
        let allExist = true;
        for (const table of tables) {
          const result = await ctx.db.instance.execute(sql`
            SELECT EXISTS (
              SELECT FROM information_schema.tables
              WHERE table_schema = 'public'
              AND table_name = ${table}
            );
          `);
          const exists = result.rows?.[0]?.exists ?? false;
          if (!exists) {
            allExist = false;
            break;
          }
        }

        if (!allExist) {
          ctx.logger.info("[Conta] Tables missing. Running migrations...");
          const migrationsDir = join(process.cwd(), "packages", "grimoires", "grimoire-conta", "migrations");
          try {
            const files = await readdir(migrationsDir);
            const sqlFiles = files.filter((f) => f.endsWith(".sql")).sort();
            for (const file of sqlFiles) {
              const filePath = join(migrationsDir, file);
              const content = readFileSync(filePath, "utf-8");
              const statements = parseSQLStatements(content);
              for (const statement of statements) {
                if (!statement.trim()) continue;
                try {
                  await ctx.db.instance.execute(sql.raw(statement));
                } catch (stmtErr: any) {
                  // Ignore "already exists" errors for idempotent migrations
                  const ignoreCodes = ["42P07", "42710", "23505", "42P16"];
                  const ignoreMsgs = ["already exists", "duplicate"];
                  const shouldIgnore = ignoreCodes.includes(stmtErr.code) ||
                    ignoreMsgs.some(m => stmtErr.message?.toLowerCase().includes(m));
                  if (!shouldIgnore) {
                    throw stmtErr;
                  }
                }
              }
              ctx.logger.info(`[Conta] Executed migration: ${file} (${statements.length} statements)`);
            }
            ctx.logger.info("[Conta] ✓ Migrations completed");
          } catch (migErr: any) {
            ctx.logger.error("[Conta] Migration failed", { error: migErr.message });
          }
        } else {
          ctx.logger.info("[Conta] ✓ All tables verified");
        }

        // Seed default accounts and currencies
        const service = new ContaService(ctx.db.instance);
        await service.seedDefaultAccounts();
        ctx.logger.info("[Conta] ✓ Default chart of accounts seeded");
      } catch (err: any) {
        ctx.logger.error("[Conta] Failed to initialize", { error: err.message });
      }
    },
    onEnable: async (ctx: GrimoireContext) => {
      ctx.logger.info("✅ Grimoire Conta enabled");
    },
    onDisable: async (ctx: GrimoireContext) => {
      ctx.logger.info("🛑 Grimoire Conta disabled");
    },
  },
});

export default grimoire;
