import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, desc, and, count } from "drizzle-orm";
import { accounts, counterparties, journals, ledgerEntries, matters, disbursements, journalTemplates, currencies, } from "./conta.schema";
import { ContaService, validateLedgerLines, applyJournalTemplate, } from "./conta.service";
// ═══════════════════════════════════════════════════════════════════════════
// Zod Schemas
// ═══════════════════════════════════════════════════════════════════════════
const currencySchema = z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    symbol: z.string().min(1),
    decimalPlaces: z.number().int().min(0).default(2),
});
const accountSchema = z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
    parentAccountId: z.string().optional(),
    openingBalance: z.string().default("0"),
    isActive: z.boolean().default(true),
    isTrustAccount: z.boolean().default(false),
    level: z.number().int().min(1).default(1).optional(),
});
const counterpartySchema = z.object({
    name: z.string().min(1),
    email: z.string().email().optional(),
    taxId: z.string().optional(),
    type: z.enum(["client", "vendor", "bank", "other"]),
});
const matterSchema = z.object({
    clientId: z.string().min(1),
    matterNumber: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    status: z.enum(["open", "closed", "on_hold"]).optional(),
});
const ledgerLineSchema = z.object({
    accountId: z.string().min(1),
    matterId: z.string().optional(),
    description: z.string().optional(),
    debit: z.string().default("0"),
    credit: z.string().default("0"),
    currency: z.string().default("USD"),
    exchangeRate: z.string().default("1"),
    metadata: z.record(z.any()).optional(),
});
const journalSchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    description: z.string().min(1),
    reference: z.string().optional(),
    counterpartyId: z.string().optional(),
    journalType: z
        .enum(["standard", "trust_deposit", "trust_withdrawal", "disbursement", "disbursement_billed"])
        .optional(),
    templateId: z.string().optional(),
    metadata: z.record(z.any()).optional(),
    status: z.enum(["draft", "posted", "reversed"]).optional(),
    lines: z.array(ledgerLineSchema).min(2, "At least two ledger lines are required"),
});
const templateSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    templateType: z.string().min(1),
    rules: z.array(z.object({
        accountCode: z.string().min(1),
        side: z.enum(["debit", "credit"]),
        amountFormula: z.string().min(1),
        description: z.string().optional(),
    })),
    requiredMetadata: z.array(z.string()).default([]),
});
const disbursementSchema = z.object({
    matterId: z.string().min(1),
    description: z.string().min(1),
    amount: z.string().min(1),
    paidFromAccountId: z.string().min(1),
    metadata: z.record(z.any()).optional(),
});
// Patch schemas (partial)
const patchAccountSchema = accountSchema.partial();
const patchCounterpartySchema = counterpartySchema.partial();
const patchMatterSchema = matterSchema.partial();
const patchTemplateSchema = templateSchema.partial();
const patchJournalSchema = journalSchema.partial();
// ═══════════════════════════════════════════════════════════════════════════
// Middleware: Validate journal balance before posting
// ═══════════════════════════════════════════════════════════════════════════
function validateBalanceMiddleware() {
    return async (c, next) => {
        if (c.req.method !== "POST" && c.req.method !== "PATCH")
            return await next();
        const body = await c.req.json().catch(() => null);
        if (!body || !body.lines)
            return await next();
        const result = validateLedgerLines(body.lines);
        if (!result.ok) {
            return c.json({ error: "Validation failed", details: result.errors }, 400);
        }
        // Attach validated total to context for downstream use
        c.set("validatedTotal", result.totalDebits.toString());
        return await next();
    };
}
// ═══════════════════════════════════════════════════════════════════════════
// Router Factory
// ═══════════════════════════════════════════════════════════════════════════
export function createContaRouter(ctx) {
    const app = new Hono();
    const db = ctx.db.instance;
    const { requireAuth } = ctx.auth;
    const service = new ContaService(db);
    // ── Health / Info (público) ─────────────────────────────────────────────
    app.get("/", (c) => c.json({
        name: "Conta",
        description: "General Ledger Engine for GremiusCMS",
        endpoints: [
            "/currencies",
            "/accounts",
            "/counterparties",
            "/matters",
            "/templates",
            "/journals",
            "/t-account/:accountId",
            "/trust-balances",
            "/disbursements",
            "/reports",
            "/seed",
        ],
    }));
    // ── Currencies ──────────────────────────────────────────────────────────
    // ── Auth middleware para rutas protegidas ───────────────────────────────
    app.use("/*", requireAuth);
    // ── Currencies ──────────────────────────────────────────────────────────
    app.get("/currencies", async (c) => {
        const data = await db.select().from(currencies).where(eq(currencies.isActive, true));
        return c.json({ data });
    });
    app.post("/currencies", zValidator("json", currencySchema), async (c) => {
        const body = c.req.valid("json");
        const [curr] = await db.insert(currencies).values(body).returning();
        return c.json({ data: curr }, 201);
    });
    // ── Accounts ────────────────────────────────────────────────────────────
    app.get("/accounts", async (c) => {
        const type = c.req.query("type");
        const isTrust = c.req.query("isTrust");
        const limit = Math.min(Number(c.req.query("limit")) || 500, 1000);
        let query = db.select().from(accounts).where(eq(accounts.isActive, true)).orderBy(accounts.code).limit(limit);
        if (type) {
            query = db
                .select()
                .from(accounts)
                .where(and(eq(accounts.isActive, true), eq(accounts.type, type)))
                .orderBy(accounts.code)
                .limit(limit);
        }
        if (isTrust) {
            query = db
                .select()
                .from(accounts)
                .where(and(eq(accounts.isActive, true), eq(accounts.isTrustAccount, isTrust === "true")))
                .orderBy(accounts.code)
                .limit(limit);
        }
        const data = await query;
        return c.json({ data });
    });
    app.get("/accounts/:id", async (c) => {
        const [account] = await db.select().from(accounts).where(eq(accounts.id, c.req.param("id"))).limit(1);
        if (!account)
            return c.json({ error: "Account not found" }, 404);
        return c.json({ data: account });
    });
    app.post("/accounts", zValidator("json", accountSchema), async (c) => {
        const body = c.req.valid("json");
        const [account] = await db
            .insert(accounts)
            .values({
            ...body,
            currentBalance: body.openingBalance || "0",
            updatedAt: new Date(),
        })
            .returning();
        return c.json({ data: account }, 201);
    });
    app.patch("/accounts/:id", zValidator("json", patchAccountSchema), async (c) => {
        const body = c.req.valid("json");
        const [account] = await db
            .update(accounts)
            .set({ ...body, updatedAt: new Date() })
            .where(eq(accounts.id, c.req.param("id")))
            .returning();
        if (!account)
            return c.json({ error: "Account not found" }, 404);
        return c.json({ data: account });
    });
    app.delete("/accounts/:id", async (c) => {
        const [account] = await db
            .update(accounts)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(accounts.id, c.req.param("id")))
            .returning();
        if (!account)
            return c.json({ error: "Account not found" }, 404);
        return c.json({ success: true });
    });
    // ── Counterparties ──────────────────────────────────────────────────────
    app.get("/counterparties", async (c) => {
        const type = c.req.query("type");
        const limit = Math.min(Number(c.req.query("limit")) || 100, 500);
        if (type) {
            const data = await db
                .select()
                .from(counterparties)
                .where(eq(counterparties.type, type))
                .orderBy(counterparties.name)
                .limit(limit);
            return c.json({ data });
        }
        const data = await db.select().from(counterparties).orderBy(counterparties.name).limit(limit);
        return c.json({ data });
    });
    app.get("/counterparties/:id", async (c) => {
        const [cp] = await db.select().from(counterparties).where(eq(counterparties.id, c.req.param("id"))).limit(1);
        if (!cp)
            return c.json({ error: "Counterparty not found" }, 404);
        return c.json({ data: cp });
    });
    app.post("/counterparties", zValidator("json", counterpartySchema), async (c) => {
        const body = c.req.valid("json");
        const [cp] = await db.insert(counterparties).values({ ...body, updatedAt: new Date() }).returning();
        return c.json({ data: cp }, 201);
    });
    app.patch("/counterparties/:id", zValidator("json", patchCounterpartySchema), async (c) => {
        const body = c.req.valid("json");
        const [cp] = await db
            .update(counterparties)
            .set({ ...body, updatedAt: new Date() })
            .where(eq(counterparties.id, c.req.param("id")))
            .returning();
        if (!cp)
            return c.json({ error: "Counterparty not found" }, 404);
        return c.json({ data: cp });
    });
    app.delete("/counterparties/:id", async (c) => {
        const [cp] = await db.delete(counterparties).where(eq(counterparties.id, c.req.param("id"))).returning();
        if (!cp)
            return c.json({ error: "Counterparty not found" }, 404);
        return c.json({ success: true });
    });
    // ── Matters ─────────────────────────────────────────────────────────────
    app.get("/matters", async (c) => {
        const clientId = c.req.query("clientId");
        const status = c.req.query("status");
        const limit = Math.min(Number(c.req.query("limit")) || 100, 500);
        const conditions = [];
        if (clientId)
            conditions.push(eq(matters.clientId, clientId));
        if (status)
            conditions.push(eq(matters.status, status));
        const data = conditions.length > 0
            ? await db.select().from(matters).where(and(...conditions)).orderBy(desc(matters.openedAt)).limit(limit)
            : await db.select().from(matters).orderBy(desc(matters.openedAt)).limit(limit);
        return c.json({ data });
    });
    app.get("/matters/:id", async (c) => {
        const [matter] = await db.select().from(matters).where(eq(matters.id, c.req.param("id"))).limit(1);
        if (!matter)
            return c.json({ error: "Matter not found" }, 404);
        return c.json({ data: matter });
    });
    app.post("/matters", zValidator("json", matterSchema), async (c) => {
        const body = c.req.valid("json");
        const [matter] = await db.insert(matters).values({ ...body, updatedAt: new Date() }).returning();
        return c.json({ data: matter }, 201);
    });
    app.patch("/matters/:id", zValidator("json", patchMatterSchema), async (c) => {
        const body = c.req.valid("json");
        const [matter] = await db
            .update(matters)
            .set({ ...body, updatedAt: new Date() })
            .where(eq(matters.id, c.req.param("id")))
            .returning();
        if (!matter)
            return c.json({ error: "Matter not found" }, 404);
        return c.json({ data: matter });
    });
    app.delete("/matters/:id", async (c) => {
        const [matter] = await db.delete(matters).where(eq(matters.id, c.req.param("id"))).returning();
        if (!matter)
            return c.json({ error: "Matter not found" }, 404);
        return c.json({ success: true });
    });
    // ── Journal Templates ───────────────────────────────────────────────────
    app.get("/templates", async (c) => {
        const type = c.req.query("type");
        const data = type
            ? await db.select().from(journalTemplates).where(and(eq(journalTemplates.isActive, true), eq(journalTemplates.templateType, type))).orderBy(journalTemplates.name)
            : await db.select().from(journalTemplates).where(eq(journalTemplates.isActive, true)).orderBy(journalTemplates.name);
        return c.json({ data });
    });
    app.get("/templates/:id", async (c) => {
        const [tmpl] = await db.select().from(journalTemplates).where(eq(journalTemplates.id, c.req.param("id"))).limit(1);
        if (!tmpl)
            return c.json({ error: "Template not found" }, 404);
        return c.json({ data: tmpl });
    });
    app.post("/templates", zValidator("json", templateSchema), async (c) => {
        const body = c.req.valid("json");
        const [tmpl] = await db.insert(journalTemplates).values({ ...body, updatedAt: new Date() }).returning();
        return c.json({ data: tmpl }, 201);
    });
    app.patch("/templates/:id", zValidator("json", patchTemplateSchema), async (c) => {
        const body = c.req.valid("json");
        const [tmpl] = await db
            .update(journalTemplates)
            .set({ ...body, updatedAt: new Date() })
            .where(eq(journalTemplates.id, c.req.param("id")))
            .returning();
        if (!tmpl)
            return c.json({ error: "Template not found" }, 404);
        return c.json({ data: tmpl });
    });
    app.delete("/templates/:id", async (c) => {
        const [tmpl] = await db
            .update(journalTemplates)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(journalTemplates.id, c.req.param("id")))
            .returning();
        if (!tmpl)
            return c.json({ error: "Template not found" }, 404);
        return c.json({ success: true });
    });
    // Apply template preview
    app.post("/templates/:id/apply", async (c) => {
        try {
            const body = await c.req.json();
            const result = await applyJournalTemplate(db, c.req.param("id"), body.variables || {}, body.metadata || {});
            return c.json({ data: result });
        }
        catch (err) {
            return c.json({ error: err.message }, 400);
        }
    });
    // ── Journals ────────────────────────────────────────────────────────────
    app.get("/journals", async (c) => {
        const status = c.req.query("status");
        const type = c.req.query("type");
        const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
        const page = Math.max(Number(c.req.query("page")) || 1, 1);
        const offset = (page - 1) * limit;
        const conditions = [];
        if (status)
            conditions.push(eq(journals.status, status));
        if (type)
            conditions.push(eq(journals.journalType, type));
        const data = conditions.length > 0
            ? await db.select().from(journals).where(and(...conditions)).orderBy(desc(journals.date)).limit(limit).offset(offset)
            : await db.select().from(journals).orderBy(desc(journals.date)).limit(limit).offset(offset);
        const countResult = conditions.length > 0
            ? await db.select({ total: count() }).from(journals).where(and(...conditions))
            : await db.select({ total: count() }).from(journals);
        const total = Number(countResult[0].total);
        return c.json({
            data,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    });
    app.get("/journals/:id", async (c) => {
        const [entry] = await db.select().from(journals).where(eq(journals.id, c.req.param("id"))).limit(1);
        if (!entry)
            return c.json({ error: "Journal not found" }, 404);
        const lines = await db.select().from(ledgerEntries).where(eq(ledgerEntries.journalId, entry.id));
        return c.json({ data: { ...entry, lines } });
    });
    app.post("/journals/validate", zValidator("json", journalSchema), async (c) => {
        const body = c.req.valid("json");
        const result = validateLedgerLines(body.lines);
        return c.json({
            valid: result.ok,
            totalDebits: result.totalDebits.toString(),
            totalCredits: result.totalCredits.toString(),
            errors: result.errors,
        });
    });
    app.post("/journals", validateBalanceMiddleware(), zValidator("json", journalSchema), async (c) => {
        const body = c.req.valid("json");
        try {
            const result = await service.createJournal(body);
            return c.json({ data: result }, 201);
        }
        catch (err) {
            return c.json({ error: err.message }, 400);
        }
    });
    app.patch("/journals/:id", zValidator("json", patchJournalSchema), async (c) => {
        const body = c.req.valid("json");
        const { lines, ...txFields } = body;
        const journalId = c.req.param("id");
        const [entry] = await db
            .update(journals)
            .set({ ...txFields, updatedAt: new Date() })
            .where(eq(journals.id, journalId))
            .returning();
        if (!entry)
            return c.json({ error: "Journal not found" }, 404);
        // If lines provided, replace existing ledger entries
        if (lines && Array.isArray(lines) && lines.length >= 2) {
            const validation = validateLedgerLines(lines);
            if (!validation.ok) {
                return c.json({ error: "Validation failed", details: validation.errors }, 400);
            }
            // Delete old lines and insert new ones
            await db.delete(ledgerEntries).where(eq(ledgerEntries.journalId, journalId));
            const lineValues = lines.map((line) => ({
                journalId,
                accountId: line.accountId,
                matterId: line.matterId || null,
                description: line.description || entry.description,
                debit: line.debit || "0",
                credit: line.credit || "0",
                currency: line.currency || "USD",
                exchangeRate: line.exchangeRate || "1",
                metadata: line.metadata || {},
            }));
            await db.insert(ledgerEntries).values(lineValues);
            // Recalculate total
            const totalAmount = validation.totalDebits.toFixed(4);
            await db.update(journals).set({ totalAmount }).where(eq(journals.id, journalId));
        }
        return c.json({ data: entry });
    });
    app.delete("/journals/:id", async (c) => {
        const [entry] = await db.delete(journals).where(eq(journals.id, c.req.param("id"))).returning();
        if (!entry)
            return c.json({ error: "Journal not found" }, 404);
        return c.json({ success: true });
    });
    app.post("/journals/:id/post", async (c) => {
        try {
            const entry = await service.postJournal(c.req.param("id"));
            return c.json({ data: entry });
        }
        catch (err) {
            return c.json({ error: err.message }, 400);
        }
    });
    app.post("/journals/:id/reverse", async (c) => {
        try {
            const body = await c.req.json().catch(() => ({}));
            const result = await service.reverseJournal(c.req.param("id"), body.date);
            return c.json({ data: result });
        }
        catch (err) {
            return c.json({ error: err.message }, 400);
        }
    });
    // ── T-Account View ──────────────────────────────────────────────────────
    app.get("/t-account/:accountId", async (c) => {
        try {
            const result = await service.getTAccount(c.req.param("accountId"), {
                dateFrom: c.req.query("dateFrom") || undefined,
                dateTo: c.req.query("dateTo") || undefined,
                matterId: c.req.query("matterId") || undefined,
                currency: c.req.query("currency") || undefined,
            });
            return c.json({
                data: {
                    ...result,
                    openingBalance: result.openingBalance.toString(),
                    closingBalance: result.closingBalance.toString(),
                    movements: result.movements.map((m) => ({
                        ...m,
                        debit: m.debit.toString(),
                        credit: m.credit.toString(),
                        balance: m.balance.toString(),
                    })),
                },
            });
        }
        catch (err) {
            return c.json({ error: err.message }, 400);
        }
    });
    // ── Trust Balances ──────────────────────────────────────────────────────
    app.get("/trust-balances", async (c) => {
        const accountId = c.req.query("accountId");
        const matterId = c.req.query("matterId");
        if (!accountId)
            return c.json({ error: "accountId is required" }, 400);
        try {
            const result = await service.getTrustBalance(accountId, matterId || undefined);
            return c.json({
                data: {
                    ...result,
                    balance: result.balance.toString(),
                    movements: result.movements.map((m) => ({
                        ...m,
                        debit: m.debit.toString(),
                        credit: m.credit.toString(),
                        balance: m.balance.toString(),
                    })),
                },
            });
        }
        catch (err) {
            return c.json({ error: err.message }, 400);
        }
    });
    // ── Disbursements ───────────────────────────────────────────────────────
    app.get("/disbursements", async (c) => {
        const matterId = c.req.query("matterId");
        const status = c.req.query("status");
        const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
        const conditions = [];
        if (matterId)
            conditions.push(eq(disbursements.matterId, matterId));
        if (status)
            conditions.push(eq(disbursements.status, status));
        const data = conditions.length > 0
            ? await db.select().from(disbursements).where(and(...conditions)).orderBy(desc(disbursements.createdAt)).limit(limit)
            : await db.select().from(disbursements).orderBy(desc(disbursements.createdAt)).limit(limit);
        return c.json({ data });
    });
    app.get("/disbursements/:id", async (c) => {
        const [disb] = await db.select().from(disbursements).where(eq(disbursements.id, c.req.param("id"))).limit(1);
        if (!disb)
            return c.json({ error: "Disbursement not found" }, 404);
        return c.json({ data: disb });
    });
    app.post("/disbursements", zValidator("json", disbursementSchema), async (c) => {
        try {
            const body = c.req.valid("json");
            const result = await service.createDisbursement(body);
            return c.json({ data: result }, 201);
        }
        catch (err) {
            return c.json({ error: err.message }, 400);
        }
    });
    app.post("/disbursements/:id/bill", async (c) => {
        try {
            const result = await service.billDisbursement(c.req.param("id"));
            return c.json({ data: result });
        }
        catch (err) {
            return c.json({ error: err.message }, 400);
        }
    });
    app.post("/disbursements/:id/pay", async (c) => {
        try {
            const disb = await service.payDisbursement(c.req.param("id"));
            return c.json({ data: disb });
        }
        catch (err) {
            return c.json({ error: err.message }, 400);
        }
    });
    app.delete("/disbursements/:id", async (c) => {
        const [disb] = await db.delete(disbursements).where(eq(disbursements.id, c.req.param("id"))).returning();
        if (!disb)
            return c.json({ error: "Disbursement not found" }, 404);
        return c.json({ success: true });
    });
    // ── Reports ─────────────────────────────────────────────────────────────
    app.get("/reports/trial-balance", async (c) => {
        try {
            const data = await service.getTrialBalance({
                dateFrom: c.req.query("dateFrom") || undefined,
                dateTo: c.req.query("dateTo") || undefined,
            });
            return c.json({
                data: data.map((item) => ({
                    ...item,
                    totalDebit: item.totalDebit.toString(),
                    totalCredit: item.totalCredit.toString(),
                    balance: item.balance.toString(),
                })),
            });
        }
        catch (err) {
            return c.json({ error: err.message }, 500);
        }
    });
    app.get("/reports/balance-sheet", async (c) => {
        try {
            const data = await service.getBalanceSheet(c.req.query("asOf") || undefined);
            return c.json({
                data: {
                    ...data,
                    totalAssets: data.totalAssets.toString(),
                    totalLiabilities: data.totalLiabilities.toString(),
                    totalEquity: data.totalEquity.toString(),
                    assets: data.assets.map((a) => ({ ...a, balance: a.balance.toString() })),
                    liabilities: data.liabilities.map((a) => ({ ...a, balance: a.balance.toString() })),
                    equity: data.equity.map((a) => ({ ...a, balance: a.balance.toString() })),
                },
            });
        }
        catch (err) {
            return c.json({ error: err.message }, 500);
        }
    });
    app.get("/reports/profit-loss", async (c) => {
        try {
            const data = await service.getProfitAndLoss({
                dateFrom: c.req.query("dateFrom") || undefined,
                dateTo: c.req.query("dateTo") || undefined,
            });
            return c.json({
                data: {
                    ...data,
                    totalRevenue: data.totalRevenue.toString(),
                    totalExpenses: data.totalExpenses.toString(),
                    netIncome: data.netIncome.toString(),
                    revenue: data.revenue.map((a) => ({ ...a, balance: a.balance.toString() })),
                    expenses: data.expenses.map((a) => ({ ...a, balance: a.balance.toString() })),
                },
            });
        }
        catch (err) {
            return c.json({ error: err.message }, 500);
        }
    });
    // ── Seed ────────────────────────────────────────────────────────────────
    app.post("/seed", async (c) => {
        try {
            await service.seedDefaultAccounts();
            return c.json({ success: true, message: "Default chart of accounts and currencies created" });
        }
        catch (err) {
            return c.json({ error: err.message }, 500);
        }
    });
    return app;
}
//# sourceMappingURL=conta.routes.js.map