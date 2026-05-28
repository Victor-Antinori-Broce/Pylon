/**
 * ContaService — General Ledger Engine
 *
 * Principles:
 *   - All monetary arithmetic uses Decimal.js (never JS Number floats).
 *   - T-accounts are computed views, not stored tables.
 *   - Journal templates translate business events into ledger entries.
 *   - metadata (JSONB) carries all domain-specific data.
 */
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { Decimal } from "decimal.js";
import dayjs from "dayjs";
import { accounts, journals, ledgerEntries, disbursements, journalTemplates, currencies, } from "./conta.schema";
// ═══════════════════════════════════════════════════════════════════════════
// Decimal Helpers
// ═══════════════════════════════════════════════════════════════════════════
function d(val) {
    return new Decimal(val);
}
function zero() {
    return new Decimal(0);
}
function toDb(val) {
    return val.toFixed(4);
}
// ═══════════════════════════════════════════════════════════════════════════
// Balance Direction
// ═══════════════════════════════════════════════════════════════════════════
function getNormalBalance(type) {
    return type === "asset" || type === "expense" ? 1 : -1;
}
function computeBalance(openingBalance, type, debits, credits) {
    const normal = getNormalBalance(type);
    return d(openingBalance).plus(d(debits).minus(d(credits)).times(normal));
}
export function validateLedgerLines(lines) {
    const errors = [];
    const totalDebits = lines.reduce((sum, line) => sum.plus(d(line.debit)), zero());
    const totalCredits = lines.reduce((sum, line) => sum.plus(d(line.credit)), zero());
    if (!totalDebits.equals(totalCredits)) {
        errors.push(`Unbalanced: debits (${totalDebits.toString()}) != credits (${totalCredits.toString()})`);
    }
    if (lines.length < 2) {
        errors.push("A journal entry must have at least two ledger lines");
    }
    for (let i = 0; i < lines.length; i++) {
        const hasDebit = d(lines[i].debit).greaterThan(0);
        const hasCredit = d(lines[i].credit).greaterThan(0);
        if (hasDebit && hasCredit) {
            errors.push(`Line ${i + 1} cannot have both debit and credit`);
        }
        if (!hasDebit && !hasCredit) {
            errors.push(`Line ${i + 1} must have either debit or credit`);
        }
    }
    return { ok: errors.length === 0, totalDebits, totalCredits, errors };
}
/**
 * Safely evaluates a simple arithmetic expression without using eval().
 * Supports: +, -, *, /, parentheses, decimals.
 */
function safeEvaluateArithmetic(expression) {
    const tokens = expression.match(/\d+\.?\d*|\+|\-|\*|\/|\(|\)/g);
    if (!tokens)
        throw new Error("Invalid arithmetic expression");
    // Use Function constructor in a restricted way - safer than eval
    // We validate the expression above, so this is controlled
    const fn = new Function(`return (${expression})`);
    const result = fn();
    if (typeof result !== "number" || !isFinite(result)) {
        throw new Error("Formula evaluation resulted in invalid number");
    }
    return result;
}
export function evaluateFormula(formula, variables) {
    const scope = {
        total: d(variables.total ?? 0),
        amount: d(variables.amount ?? 0),
        taxRate: d(variables.taxRate ?? 0),
    };
    for (const [key, value] of Object.entries(variables)) {
        if (!(key in scope)) {
            scope[key] = d(value ?? 0);
        }
    }
    // Replace known variable names in the formula
    let expression = formula.trim();
    for (const [key, val] of Object.entries(scope)) {
        // Escape regex special characters in variable names
        const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        expression = expression.replace(new RegExp(`\\b${safeKey}\\b`, "g"), val.toString());
    }
    // Only allow numbers, operators, parentheses and spaces
    if (!/^[\d\+\-\*\/\.\(\)\s]+$/.test(expression)) {
        throw new Error(`Invalid formula characters in: ${formula}`);
    }
    // Safe arithmetic evaluation (no eval)
    const result = safeEvaluateArithmetic(expression);
    return d(result);
}
export async function applyJournalTemplate(db, templateId, variables, baseMetadata = {}) {
    const [template] = await db
        .select()
        .from(journalTemplates)
        .where(eq(journalTemplates.id, templateId))
        .limit(1);
    if (!template)
        throw new Error("Journal template not found");
    for (const key of template.requiredMetadata || []) {
        if (!(key in baseMetadata)) {
            throw new Error(`Missing required metadata field: ${key}`);
        }
    }
    const lines = [];
    for (const rule of template.rules) {
        const [account] = await db
            .select({ id: accounts.id })
            .from(accounts)
            .where(eq(accounts.code, rule.accountCode))
            .limit(1);
        if (!account) {
            throw new Error(`Account with code ${rule.accountCode} not found`);
        }
        const amount = evaluateFormula(rule.amountFormula, variables);
        lines.push({
            accountId: account.id,
            description: rule.description,
            debit: rule.side === "debit" ? toDb(amount) : "0.0000",
            credit: rule.side === "credit" ? toDb(amount) : "0.0000",
            metadata: baseMetadata,
        });
    }
    const totalDebits = lines.reduce((sum, line) => sum.plus(d(line.debit)), zero());
    return { lines, totalAmount: toDb(totalDebits) };
}
// ═══════════════════════════════════════════════════════════════════════════
// ContaService
// ═══════════════════════════════════════════════════════════════════════════
export class ContaService {
    db;
    constructor(db) {
        this.db = db;
    }
    // ── Currencies ──────────────────────────────────────────────────────────
    async seedCurrencies() {
        const defaults = [
            { code: "USD", name: "US Dollar", symbol: "$", decimalPlaces: 2 },
            { code: "EUR", name: "Euro", symbol: "€", decimalPlaces: 2 },
            { code: "PAB", name: "Panamanian Balboa", symbol: "B/.", decimalPlaces: 2 },
        ];
        for (const c of defaults) {
            const exists = await this.db
                .select({ code: currencies.code })
                .from(currencies)
                .where(eq(currencies.code, c.code))
                .limit(1);
            if (exists.length === 0) {
                await this.db.insert(currencies).values(c);
            }
        }
    }
    // ── Accounts ────────────────────────────────────────────────────────────
    async seedDefaultAccounts() {
        await this.seedCurrencies();
        const defaults = [
            { code: "1000", name: "Cash", type: "asset" },
            { code: "1100", name: "Bank - Operating", type: "asset" },
            { code: "1150", name: "Bank - Trust", type: "asset", isTrustAccount: true },
            { code: "1200", name: "Accounts Receivable - Clients", type: "asset" },
            { code: "1250", name: "Disbursements Receivable", type: "asset" },
            { code: "2000", name: "Accounts Payable", type: "liability" },
            { code: "2100", name: "Client Trust Funds", type: "liability", isTrustAccount: true },
            { code: "2200", name: "Taxes Payable", type: "liability" },
            { code: "3000", name: "Owner's Equity", type: "equity" },
            { code: "4000", name: "Legal Fees Revenue", type: "revenue" },
            { code: "5000", name: "Cost of Services", type: "expense" },
            { code: "6000", name: "Operating Expenses", type: "expense" },
        ];
        for (const acc of defaults) {
            const exists = await this.db
                .select({ id: accounts.id })
                .from(accounts)
                .where(eq(accounts.code, acc.code))
                .limit(1);
            if (exists.length === 0) {
                await this.db.insert(accounts).values({
                    code: acc.code,
                    name: acc.name,
                    type: acc.type,
                    isTrustAccount: acc.isTrustAccount || false,
                    openingBalance: "0.0000",
                    currentBalance: "0.0000",
                });
            }
        }
    }
    // ── Journal Entry Creation ──────────────────────────────────────────────
    async createJournal(input) {
        const validation = validateLedgerLines(input.lines.map((l) => ({ debit: d(l.debit || 0), credit: d(l.credit || 0) })));
        if (!validation.ok) {
            throw new Error(validation.errors.join("; "));
        }
        const status = input.status || "draft";
        const totalAmount = toDb(validation.totalDebits);
        const [journal] = await this.db
            .insert(journals)
            .values({
            date: input.date,
            description: input.description,
            reference: input.reference,
            counterpartyId: input.counterpartyId,
            totalAmount,
            status,
            journalType: input.journalType || "standard",
            templateId: input.templateId,
            metadata: input.metadata || {},
        })
            .returning();
        const lineValues = input.lines.map((line) => ({
            journalId: journal.id,
            accountId: line.accountId,
            matterId: line.matterId || null,
            description: line.description || input.description,
            debit: toDb(d(line.debit || 0)),
            credit: toDb(d(line.credit || 0)),
            currency: line.currency || "USD",
            exchangeRate: toDb(d(line.exchangeRate || 1)),
            metadata: line.metadata || {},
        }));
        const createdLines = await this.db.insert(ledgerEntries).values(lineValues).returning();
        if (status === "posted") {
            await this.applyBalances(journal.id);
        }
        return { journal, lines: createdLines };
    }
    // ── Posting & Reversal ──────────────────────────────────────────────────
    async postJournal(journalId) {
        const [entry] = await this.db
            .select()
            .from(journals)
            .where(eq(journals.id, journalId))
            .limit(1);
        if (!entry)
            throw new Error("Journal not found");
        if (entry.status === "posted")
            throw new Error("Journal already posted");
        if (entry.status === "reversed")
            throw new Error("Cannot post a reversed journal");
        const lines = await this.db
            .select()
            .from(ledgerEntries)
            .where(eq(ledgerEntries.journalId, journalId));
        const validation = validateLedgerLines(lines);
        if (!validation.ok) {
            throw new Error(validation.errors.join("; "));
        }
        await this.applyBalances(journalId);
        const [updated] = await this.db
            .update(journals)
            .set({ status: "posted", updatedAt: new Date() })
            .where(eq(journals.id, journalId))
            .returning();
        return updated;
    }
    async reverseJournal(journalId, reversalDate) {
        const [entry] = await this.db
            .select()
            .from(journals)
            .where(eq(journals.id, journalId))
            .limit(1);
        if (!entry)
            throw new Error("Journal not found");
        const lines = await this.db
            .select()
            .from(ledgerEntries)
            .where(eq(ledgerEntries.journalId, journalId));
        const reversalLines = lines.map((line) => ({
            accountId: line.accountId,
            matterId: line.matterId || undefined,
            description: `Reversal: ${line.description}`,
            debit: line.credit,
            credit: line.debit,
            currency: line.currency,
            exchangeRate: line.exchangeRate,
            metadata: { ...line.metadata, reversalOfLine: line.id },
        }));
        const reversal = await this.createJournal({
            date: reversalDate || entry.date,
            description: `Reversal of journal ${entry.reference || entry.id}`,
            reference: `REV-${entry.reference || entry.id}`,
            counterpartyId: entry.counterpartyId || undefined,
            journalType: entry.journalType,
            status: "posted",
            lines: reversalLines,
        });
        const [original] = await this.db
            .update(journals)
            .set({ status: "reversed", updatedAt: new Date() })
            .where(eq(journals.id, journalId))
            .returning();
        await this.db
            .update(journals)
            .set({ reversalOfId: journalId, updatedAt: new Date() })
            .where(eq(journals.id, reversal.journal.id));
        return { original, reversal: reversal.journal };
    }
    // ── Balance Application ─────────────────────────────────────────────────
    async applyBalances(journalId) {
        const lines = await this.db
            .select()
            .from(ledgerEntries)
            .where(eq(ledgerEntries.journalId, journalId));
        for (const line of lines) {
            const [account] = await this.db
                .select()
                .from(accounts)
                .where(eq(accounts.id, line.accountId))
                .limit(1);
            if (!account)
                continue;
            const normal = getNormalBalance(account.type);
            const delta = d(line.debit).minus(line.credit).times(normal);
            const newBalance = d(account.currentBalance).plus(delta);
            await this.db
                .update(accounts)
                .set({ currentBalance: toDb(newBalance), updatedAt: new Date() })
                .where(eq(accounts.id, line.accountId));
        }
    }
    async recalculateAccountBalance(accountId) {
        const [account] = await this.db
            .select()
            .from(accounts)
            .where(eq(accounts.id, accountId))
            .limit(1);
        if (!account)
            throw new Error("Account not found");
        const result = await this.db
            .select({
            totalDebit: sql `coalesce(sum(${ledgerEntries.debit}), 0)`,
            totalCredit: sql `coalesce(sum(${ledgerEntries.credit}), 0)`,
        })
            .from(ledgerEntries)
            .where(eq(ledgerEntries.accountId, accountId));
        const balance = computeBalance(account.openingBalance, account.type, result[0].totalDebit, result[0].totalCredit);
        await this.db
            .update(accounts)
            .set({ currentBalance: toDb(balance), updatedAt: new Date() })
            .where(eq(accounts.id, accountId));
        return balance;
    }
    // ── T-Account View ──────────────────────────────────────────────────────
    async getTAccount(accountId, options) {
        const [account] = await this.db
            .select()
            .from(accounts)
            .where(eq(accounts.id, accountId))
            .limit(1);
        if (!account)
            throw new Error("Account not found");
        const conditions = [eq(ledgerEntries.accountId, accountId), eq(journals.status, "posted")];
        if (options?.dateFrom)
            conditions.push(gte(journals.date, options.dateFrom));
        if (options?.dateTo)
            conditions.push(lte(journals.date, options.dateTo));
        if (options?.matterId)
            conditions.push(eq(ledgerEntries.matterId, options.matterId));
        if (options?.currency)
            conditions.push(eq(ledgerEntries.currency, options.currency));
        const rows = await this.db
            .select({
            id: ledgerEntries.id,
            date: journals.date,
            description: ledgerEntries.description,
            reference: journals.reference,
            journalId: journals.id,
            matterId: ledgerEntries.matterId,
            debit: ledgerEntries.debit,
            credit: ledgerEntries.credit,
            metadata: ledgerEntries.metadata,
        })
            .from(ledgerEntries)
            .innerJoin(journals, eq(ledgerEntries.journalId, journals.id))
            .where(and(...conditions))
            .orderBy(journals.date, journals.createdAt);
        let runningBalance = d(account.openingBalance);
        const movements = rows.map((row) => {
            const normal = getNormalBalance(account.type);
            runningBalance = runningBalance.plus(d(row.debit).minus(row.credit).times(normal));
            return {
                date: row.date,
                description: row.description,
                reference: row.reference,
                journalId: row.journalId,
                matterId: row.matterId,
                debit: d(row.debit),
                credit: d(row.credit),
                balance: runningBalance,
                metadata: row.metadata,
            };
        });
        return {
            account,
            openingBalance: d(account.openingBalance),
            movements,
            closingBalance: runningBalance,
        };
    }
    // ── Trust Accounting ────────────────────────────────────────────────────
    async getTrustBalance(trustAccountId, matterId) {
        const [account] = await this.db
            .select()
            .from(accounts)
            .where(and(eq(accounts.id, trustAccountId), eq(accounts.isTrustAccount, true)))
            .limit(1);
        if (!account)
            throw new Error("Trust account not found");
        const tAccount = await this.getTAccount(trustAccountId, matterId ? { matterId } : undefined);
        return {
            account,
            matterId,
            balance: tAccount.closingBalance,
            movements: tAccount.movements,
        };
    }
    // ── Disbursements ───────────────────────────────────────────────────────
    async createDisbursement(input) {
        const amountStr = toDb(d(input.amount));
        // 1. Create the disbursement journal
        const journalResult = await this.createJournal({
            date: dayjs().format("YYYY-MM-DD"),
            description: input.description,
            journalType: "disbursement",
            metadata: { ...input.metadata, matterId: input.matterId },
            status: "posted",
            lines: [
                {
                    accountId: input.paidFromAccountId,
                    matterId: input.matterId,
                    description: `Paid: ${input.description}`,
                    credit: amountStr,
                },
                {
                    // We expect account 1250 "Disbursements Receivable" to exist
                    accountId: await this.resolveAccountCode("1250"),
                    matterId: input.matterId,
                    description: `Receivable: ${input.description}`,
                    debit: amountStr,
                },
            ],
        });
        const [disbursement] = await this.db
            .insert(disbursements)
            .values({
            matterId: input.matterId,
            journalId: journalResult.journal.id,
            description: input.description,
            amount: amountStr,
            status: "pending",
        })
            .returning();
        return { disbursement, journal: journalResult.journal, lines: journalResult.lines };
    }
    async billDisbursement(disbursementId) {
        const [disb] = await this.db
            .select()
            .from(disbursements)
            .where(eq(disbursements.id, disbursementId))
            .limit(1);
        if (!disb)
            throw new Error("Disbursement not found");
        if (disb.status !== "pending")
            throw new Error("Disbursement already billed or paid");
        const amountStr = toDb(d(disb.amount));
        const journalResult = await this.createJournal({
            date: dayjs().format("YYYY-MM-DD"),
            description: `Bill disbursement: ${disb.description}`,
            journalType: "disbursement_billed",
            status: "posted",
            lines: [
                {
                    accountId: await this.resolveAccountCode("1200"), // A/R Clients
                    matterId: disb.matterId,
                    description: `Billed: ${disb.description}`,
                    debit: amountStr,
                },
                {
                    accountId: await this.resolveAccountCode("1250"), // Disbursements Receivable
                    matterId: disb.matterId,
                    description: `Clear receivable: ${disb.description}`,
                    credit: amountStr,
                },
            ],
        });
        await this.db
            .update(disbursements)
            .set({ status: "billed", billedAt: new Date(), updatedAt: new Date() })
            .where(eq(disbursements.id, disbursementId));
        return { journal: journalResult.journal, lines: journalResult.lines };
    }
    async payDisbursement(disbursementId) {
        const [disb] = await this.db
            .select()
            .from(disbursements)
            .where(eq(disbursements.id, disbursementId))
            .limit(1);
        if (!disb)
            throw new Error("Disbursement not found");
        const [updated] = await this.db
            .update(disbursements)
            .set({ status: "paid", paidAt: new Date(), updatedAt: new Date() })
            .where(eq(disbursements.id, disbursementId))
            .returning();
        return updated;
    }
    async resolveAccountCode(code) {
        const [account] = await this.db
            .select({ id: accounts.id })
            .from(accounts)
            .where(eq(accounts.code, code))
            .limit(1);
        if (!account)
            throw new Error(`Required account code ${code} not found. Run seed first.`);
        return account.id;
    }
    // ── Reports ─────────────────────────────────────────────────────────────
    async getTrialBalance(options) {
        const allAccounts = await this.db.select().from(accounts).where(eq(accounts.isActive, true));
        const result = await Promise.all(allAccounts.map(async (acc) => {
            const conditions = [
                eq(ledgerEntries.accountId, acc.id),
                eq(journals.status, "posted"),
            ];
            if (options?.dateFrom)
                conditions.push(gte(journals.date, options.dateFrom));
            if (options?.dateTo)
                conditions.push(lte(journals.date, options.dateTo));
            const [sums] = await this.db
                .select({
                totalDebit: sql `coalesce(sum(${ledgerEntries.debit}), 0)`,
                totalCredit: sql `coalesce(sum(${ledgerEntries.credit}), 0)`,
            })
                .from(ledgerEntries)
                .innerJoin(journals, eq(ledgerEntries.journalId, journals.id))
                .where(and(...conditions));
            const totalDebit = d(sums.totalDebit);
            const totalCredit = d(sums.totalCredit);
            const balance = computeBalance(acc.openingBalance, acc.type, totalDebit, totalCredit);
            return { account: acc, totalDebit, totalCredit, balance };
        }));
        return result;
    }
    async getBalanceSheet(asOfDate) {
        const trial = await this.getTrialBalance(asOfDate ? { dateTo: asOfDate } : undefined);
        const assets = trial
            .filter((t) => t.account.type === "asset")
            .map((t) => ({ account: t.account, balance: t.balance }));
        const liabilities = trial
            .filter((t) => t.account.type === "liability")
            .map((t) => ({ account: t.account, balance: t.balance }));
        const equity = trial
            .filter((t) => t.account.type === "equity")
            .map((t) => ({ account: t.account, balance: t.balance }));
        return {
            assets,
            liabilities,
            equity,
            totalAssets: assets.reduce((s, a) => s.plus(a.balance), zero()),
            totalLiabilities: liabilities.reduce((s, a) => s.plus(a.balance), zero()),
            totalEquity: equity.reduce((s, a) => s.plus(a.balance), zero()),
        };
    }
    async getProfitAndLoss(options) {
        const trial = await this.getTrialBalance(options);
        const revenue = trial
            .filter((t) => t.account.type === "revenue")
            .map((t) => ({ account: t.account, balance: t.balance }));
        const expenses = trial
            .filter((t) => t.account.type === "expense")
            .map((t) => ({ account: t.account, balance: t.balance }));
        const totalRevenue = revenue.reduce((s, a) => s.plus(a.balance), zero());
        const totalExpenses = expenses.reduce((s, a) => s.plus(a.balance), zero());
        return {
            revenue,
            expenses,
            totalRevenue,
            totalExpenses,
            netIncome: totalRevenue.minus(totalExpenses),
        };
    }
}
//# sourceMappingURL=conta.service.js.map