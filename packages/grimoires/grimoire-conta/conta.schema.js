/**
 * Conta — General Ledger Engine
 *
 * Architecture:
 *   - Journals      = Entry headers (date, description, metadata)
 *   - LedgerEntries = Double-entry lines (account_id, debit, credit, currency)
 *   - T-Accounts    = Aggregated views ONLY (no separate table)
 *
 * Moldable by design:
 *   - metadata (JSONB) carries domain-specific data (case_id, store_id, etc.)
 *   - journal_templates translate business events into ledger entries
 *   - currencies are first-class citizens on every ledger line
 */
import { pgTable, text, timestamp, numeric, integer, boolean, jsonb, pgEnum, index, } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
// ═══════════════════════════════════════════════════════════════════════════
// Enums
// ═══════════════════════════════════════════════════════════════════════════
export const accountTypeEnum = pgEnum("conta_account_type", [
    "asset",
    "liability",
    "equity",
    "revenue",
    "expense",
]);
export const entryStatusEnum = pgEnum("conta_entry_status", [
    "draft",
    "posted",
    "reversed",
]);
export const counterpartyTypeEnum = pgEnum("conta_counterparty_type", [
    "client",
    "vendor",
    "bank",
    "other",
]);
export const matterStatusEnum = pgEnum("conta_matter_status", [
    "open",
    "closed",
    "on_hold",
]);
export const disbursementStatusEnum = pgEnum("conta_disbursement_status", [
    "pending",
    "billed",
    "paid",
]);
export const journalTypeEnum = pgEnum("conta_journal_type", [
    "standard",
    "trust_deposit",
    "trust_withdrawal",
    "disbursement",
    "disbursement_billed",
]);
// ═══════════════════════════════════════════════════════════════════════════
// Currencies
// ═══════════════════════════════════════════════════════════════════════════
export const currencies = pgTable("conta_currencies", {
    code: text("code").primaryKey(),
    name: text("name").notNull(),
    symbol: text("symbol").notNull(),
    decimalPlaces: integer("decimal_places").default(2).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
// ═══════════════════════════════════════════════════════════════════════════
// Counterparties
// ═══════════════════════════════════════════════════════════════════════════
export const counterparties = pgTable("conta_counterparties", {
    id: text("id").primaryKey().$defaultFn(createId),
    name: text("name").notNull(),
    email: text("email"),
    taxId: text("tax_id"),
    type: counterpartyTypeEnum("type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
    index("idx_conta_cp_type").on(t.type),
    index("idx_conta_cp_tax").on(t.taxId),
]);
export const counterpartiesRelations = relations(counterparties, ({ many }) => ({
    matters: many(matters),
    journals: many(journals),
}));
// ═══════════════════════════════════════════════════════════════════════════
// Matters
// ═══════════════════════════════════════════════════════════════════════════
export const matters = pgTable("conta_matters", {
    id: text("id").primaryKey().$defaultFn(createId),
    clientId: text("client_id")
        .notNull()
        .references(() => counterparties.id),
    matterNumber: text("matter_number").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    status: matterStatusEnum("status").default("open").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
    index("idx_conta_matters_client").on(t.clientId),
    index("idx_conta_matters_status").on(t.status),
]);
export const mattersRelations = relations(matters, ({ one, many }) => ({
    client: one(counterparties, {
        fields: [matters.clientId],
        references: [counterparties.id],
    }),
    ledgerEntries: many(ledgerEntries),
    disbursements: many(disbursements),
}));
// ═══════════════════════════════════════════════════════════════════════════
// Accounts (Chart of Accounts)
// ═══════════════════════════════════════════════════════════════════════════
export const accounts = pgTable("conta_accounts", {
    id: text("id").primaryKey().$defaultFn(createId),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    type: accountTypeEnum("type").notNull(),
    parentAccountId: text("parent_account_id"),
    openingBalance: numeric("opening_balance", { precision: 19, scale: 4 }).default("0").notNull(),
    currentBalance: numeric("current_balance", { precision: 19, scale: 4 }).default("0").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    isTrustAccount: boolean("is_trust_account").default(false).notNull(),
    level: integer("level").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
    index("idx_conta_accounts_type").on(t.type),
    index("idx_conta_accounts_parent").on(t.parentAccountId),
    index("idx_conta_accounts_active").on(t.isActive),
    index("idx_conta_accounts_trust").on(t.isTrustAccount),
]);
export const accountsRelations = relations(accounts, ({ one, many }) => ({
    parent: one(accounts, {
        fields: [accounts.parentAccountId],
        references: [accounts.id],
    }),
    children: many(accounts),
    ledgerEntries: many(ledgerEntries),
}));
// ═══════════════════════════════════════════════════════════════════════════
// Journal Templates (Moldable Business Logic)
// ═══════════════════════════════════════════════════════════════════════════
export const journalTemplates = pgTable("conta_journal_templates", {
    id: text("id").primaryKey().$defaultFn(createId),
    name: text("name").notNull(),
    description: text("description"),
    templateType: text("template_type").notNull(),
    rules: jsonb("rules").notNull().$type(),
    requiredMetadata: jsonb("required_metadata").default([]).$type(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
    index("idx_conta_templates_type").on(t.templateType),
    index("idx_conta_templates_active").on(t.isActive),
]);
// ═══════════════════════════════════════════════════════════════════════════
// Journals (Entry Headers)
// ═══════════════════════════════════════════════════════════════════════════
export const journals = pgTable("conta_journals", {
    id: text("id").primaryKey().$defaultFn(createId),
    date: text("date").notNull(),
    description: text("description").notNull(),
    reference: text("reference"),
    counterpartyId: text("counterparty_id").references(() => counterparties.id),
    totalAmount: numeric("total_amount", { precision: 19, scale: 4 }).default("0").notNull(),
    status: entryStatusEnum("status").default("draft").notNull(),
    journalType: journalTypeEnum("journal_type").default("standard").notNull(),
    templateId: text("template_id").references(() => journalTemplates.id),
    metadata: jsonb("metadata").default({}).$type(),
    reversalOfId: text("reversal_of_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
    index("idx_conta_journals_date").on(t.date),
    index("idx_conta_journals_status").on(t.status),
    index("idx_conta_journals_type").on(t.journalType),
    index("idx_conta_journals_counterparty").on(t.counterpartyId),
    index("idx_conta_journals_template").on(t.templateId),
]);
export const journalsRelations = relations(journals, ({ one, many }) => ({
    counterparty: one(counterparties, {
        fields: [journals.counterpartyId],
        references: [counterparties.id],
    }),
    template: one(journalTemplates, {
        fields: [journals.templateId],
        references: [journalTemplates.id],
    }),
    ledgerEntries: many(ledgerEntries),
    reversalOf: one(journals, {
        fields: [journals.reversalOfId],
        references: [journals.id],
    }),
}));
// ═══════════════════════════════════════════════════════════════════════════
// Ledger Entries (Double-Entry Lines)
// ═══════════════════════════════════════════════════════════════════════════
export const ledgerEntries = pgTable("conta_ledger_entries", {
    id: text("id").primaryKey().$defaultFn(createId),
    journalId: text("journal_id")
        .notNull()
        .references(() => journals.id, { onDelete: "cascade" }),
    accountId: text("account_id")
        .notNull()
        .references(() => accounts.id),
    matterId: text("matter_id").references(() => matters.id),
    description: text("description"),
    debit: numeric("debit", { precision: 19, scale: 4 }).default("0").notNull(),
    credit: numeric("credit", { precision: 19, scale: 4 }).default("0").notNull(),
    currency: text("currency")
        .notNull()
        .references(() => currencies.code)
        .default("USD"),
    exchangeRate: numeric("exchange_rate", { precision: 19, scale: 8 }).default("1").notNull(),
    metadata: jsonb("metadata").default({}).$type(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
    index("idx_conta_ledger_journal").on(t.journalId),
    index("idx_conta_ledger_account").on(t.accountId),
    index("idx_conta_ledger_matter").on(t.matterId),
    index("idx_conta_ledger_currency").on(t.currency),
    index("idx_conta_ledger_created").on(t.createdAt),
]);
export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
    journal: one(journals, {
        fields: [ledgerEntries.journalId],
        references: [journals.id],
    }),
    account: one(accounts, {
        fields: [ledgerEntries.accountId],
        references: [accounts.id],
    }),
    matter: one(matters, {
        fields: [ledgerEntries.matterId],
        references: [matters.id],
    }),
    currencyRef: one(currencies, {
        fields: [ledgerEntries.currency],
        references: [currencies.code],
    }),
}));
// ═══════════════════════════════════════════════════════════════════════════
// Disbursements
// ═══════════════════════════════════════════════════════════════════════════
export const disbursements = pgTable("conta_disbursements", {
    id: text("id").primaryKey().$defaultFn(createId),
    matterId: text("matter_id")
        .notNull()
        .references(() => matters.id),
    journalId: text("journal_id").references(() => journals.id),
    description: text("description").notNull(),
    amount: numeric("amount", { precision: 19, scale: 4 }).notNull(),
    status: disbursementStatusEnum("status").default("pending").notNull(),
    billedAt: timestamp("billed_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
    index("idx_conta_disb_matter").on(t.matterId),
    index("idx_conta_disb_status").on(t.status),
    index("idx_conta_disb_journal").on(t.journalId),
]);
export const disbursementsRelations = relations(disbursements, ({ one }) => ({
    matter: one(matters, {
        fields: [disbursements.matterId],
        references: [matters.id],
    }),
    journal: one(journals, {
        fields: [disbursements.journalId],
        references: [journals.id],
    }),
}));
//# sourceMappingURL=conta.schema.js.map