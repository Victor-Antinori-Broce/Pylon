/**
 * ContaService — General Ledger Engine
 *
 * Principles:
 *   - All monetary arithmetic uses Decimal.js (never JS Number floats).
 *   - T-accounts are computed views, not stored tables.
 *   - Journal templates translate business events into ledger entries.
 *   - metadata (JSONB) carries all domain-specific data.
 */
import { Decimal } from "decimal.js";
import { type Account, type Journal, type LedgerEntry, type Disbursement } from "./conta.schema";
import type { ContaDb } from "./types";
export interface ValidationResult {
    ok: boolean;
    totalDebits: Decimal;
    totalCredits: Decimal;
    errors: string[];
}
export declare function validateLedgerLines(lines: Array<{
    debit: string | Decimal;
    credit: string | Decimal;
}>): ValidationResult;
export interface TemplateVariables {
    total?: string | number | Decimal;
    amount?: string | number | Decimal;
    taxRate?: string | number | Decimal;
    [key: string]: any;
}
export declare function evaluateFormula(formula: string, variables: TemplateVariables): Decimal;
export declare function applyJournalTemplate(db: ContaDb, templateId: string, variables: TemplateVariables, baseMetadata?: Record<string, any>): Promise<{
    lines: Array<{
        accountId: string;
        description?: string;
        debit: string;
        credit: string;
        metadata?: Record<string, any>;
    }>;
    totalAmount: string;
}>;
export declare class ContaService {
    private db;
    constructor(db: ContaDb);
    seedCurrencies(): Promise<void>;
    seedDefaultAccounts(): Promise<void>;
    createJournal(input: {
        date: string;
        description: string;
        reference?: string;
        counterpartyId?: string;
        journalType?: Journal["journalType"];
        templateId?: string;
        metadata?: Record<string, any>;
        status?: Journal["status"];
        lines: Array<{
            accountId: string;
            matterId?: string;
            description?: string;
            debit?: string | number | Decimal;
            credit?: string | number | Decimal;
            currency?: string;
            exchangeRate?: string | number | Decimal;
            metadata?: Record<string, any>;
        }>;
    }): Promise<{
        journal: Journal;
        lines: LedgerEntry[];
    }>;
    postJournal(journalId: string): Promise<Journal>;
    reverseJournal(journalId: string, reversalDate?: string): Promise<{
        original: Journal;
        reversal: Journal;
    }>;
    private applyBalances;
    recalculateAccountBalance(accountId: string): Promise<Decimal>;
    getTAccount(accountId: string, options?: {
        dateFrom?: string;
        dateTo?: string;
        matterId?: string;
        currency?: string;
    }): Promise<{
        account: Account;
        openingBalance: Decimal;
        movements: Array<{
            date: string;
            description: string;
            reference?: string;
            journalId: string;
            matterId?: string;
            debit: Decimal;
            credit: Decimal;
            balance: Decimal;
            metadata?: Record<string, any>;
        }>;
        closingBalance: Decimal;
    }>;
    getTrustBalance(trustAccountId: string, matterId?: string): Promise<{
        account: Account;
        matterId?: string;
        balance: Decimal;
        movements: Array<{
            date: string;
            description: string;
            debit: Decimal;
            credit: Decimal;
            balance: Decimal;
            metadata?: Record<string, any>;
        }>;
    }>;
    createDisbursement(input: {
        matterId: string;
        description: string;
        amount: string | number | Decimal;
        paidFromAccountId: string;
        metadata?: Record<string, any>;
    }): Promise<{
        disbursement: Disbursement;
        journal: Journal;
        lines: LedgerEntry[];
    }>;
    billDisbursement(disbursementId: string): Promise<{
        journal: Journal;
        lines: LedgerEntry[];
    }>;
    payDisbursement(disbursementId: string): Promise<Disbursement>;
    private resolveAccountCode;
    getTrialBalance(options?: {
        dateFrom?: string;
        dateTo?: string;
    }): Promise<Array<{
        account: Account;
        totalDebit: Decimal;
        totalCredit: Decimal;
        balance: Decimal;
    }>>;
    getBalanceSheet(asOfDate?: string): Promise<{
        assets: Array<{
            account: Account;
            balance: Decimal;
        }>;
        liabilities: Array<{
            account: Account;
            balance: Decimal;
        }>;
        equity: Array<{
            account: Account;
            balance: Decimal;
        }>;
        totalAssets: Decimal;
        totalLiabilities: Decimal;
        totalEquity: Decimal;
    }>;
    getProfitAndLoss(options?: {
        dateFrom?: string;
        dateTo?: string;
    }): Promise<{
        revenue: Array<{
            account: Account;
            balance: Decimal;
        }>;
        expenses: Array<{
            account: Account;
            balance: Decimal;
        }>;
        totalRevenue: Decimal;
        totalExpenses: Decimal;
        netIncome: Decimal;
    }>;
}
//# sourceMappingURL=conta.service.d.ts.map