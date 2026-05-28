/**
 * Conta Service
 * API client tipado para el grimoire de Contabilidad
 */
export interface Currency {
    id: string;
    code: string;
    name: string;
    symbol: string;
    decimalPlaces: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}
export interface Account {
    id: string;
    code: string;
    name: string;
    type: "asset" | "liability" | "equity" | "revenue" | "expense";
    parentId?: string;
    isActive: boolean;
    isTrustAccount: boolean;
    currencyCode: string;
    description?: string;
    openingBalance: number;
    currentBalance: number;
    createdAt: string;
    updatedAt: string;
}
export interface Counterparty {
    id: string;
    name: string;
    type: "client" | "supplier" | "bank" | "government" | "other";
    taxId?: string;
    email?: string;
    phone?: string;
    address?: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}
export interface Matter {
    id: string;
    matterNumber: string;
    name: string;
    description?: string;
    clientId?: string;
    status: "open" | "closed" | "on_hold";
    openDate: string;
    closeDate?: string;
    responsibleId?: string;
    currencyCode: string;
    createdAt: string;
    updatedAt: string;
}
export interface JournalTemplate {
    id: string;
    name: string;
    templateType: string;
    description?: string;
    isActive: boolean;
    lines: Array<{
        accountId: string;
        description?: string;
        debitAmount?: number;
        creditAmount?: number;
        percentage?: number;
    }>;
    createdAt: string;
    updatedAt: string;
}
export interface Journal {
    id: string;
    journalNumber: string;
    description: string;
    reference?: string;
    date: string;
    journalType: "manual" | "recurring" | "reversal" | "closing" | "adjustment";
    status: "draft" | "posted" | "reversed";
    currencyCode: string;
    totalDebit: number;
    totalCredit: number;
    isBalanced: boolean;
    postedAt?: string;
    reversedAt?: string;
    matterId?: string;
    createdAt: string;
    updatedAt: string;
}
export interface LedgerEntry {
    id: string;
    journalId: string;
    accountId: string;
    description?: string;
    debitAmount: number;
    creditAmount: number;
    currencyCode: string;
    exchangeRate: number;
    matterId?: string;
    counterpartyId?: string;
    createdAt: string;
}
export interface Disbursement {
    id: string;
    description: string;
    amount: number;
    currencyCode: string;
    status: "pending" | "billed" | "paid" | "written_off";
    matterId?: string;
    date: string;
    billedAt?: string;
    paidAt?: string;
    createdAt: string;
    updatedAt: string;
}
export interface TrialBalanceReport {
    accounts: Array<{
        accountId: string;
        accountCode: string;
        accountName: string;
        debitTotal: number;
        creditTotal: number;
        balance: number;
    }>;
    totalDebit: number;
    totalCredit: number;
}
export interface BalanceSheetReport {
    assets: Array<{
        accountId: string;
        name: string;
        amount: number;
    }>;
    liabilities: Array<{
        accountId: string;
        name: string;
        amount: number;
    }>;
    equity: Array<{
        accountId: string;
        name: string;
        amount: number;
    }>;
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
}
export interface ProfitLossReport {
    revenue: Array<{
        accountId: string;
        name: string;
        amount: number;
    }>;
    expenses: Array<{
        accountId: string;
        name: string;
        amount: number;
    }>;
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
}
export declare function getCurrencies(): Promise<Currency[]>;
export declare function createCurrency(data: Partial<Currency>): Promise<Currency>;
export declare function getAccounts(): Promise<Account[]>;
export declare function getAccount(id: string): Promise<Account>;
export declare function createAccount(data: Partial<Account>): Promise<Account>;
export declare function updateAccount(id: string, data: Partial<Account>): Promise<Account>;
export declare function deleteAccount(id: string): Promise<void>;
export declare function getCounterparties(): Promise<Counterparty[]>;
export declare function getCounterparty(id: string): Promise<Counterparty>;
export declare function createCounterparty(data: Partial<Counterparty>): Promise<Counterparty>;
export declare function updateCounterparty(id: string, data: Partial<Counterparty>): Promise<Counterparty>;
export declare function deleteCounterparty(id: string): Promise<void>;
export declare function getMatters(): Promise<Matter[]>;
export declare function getMatter(id: string): Promise<Matter>;
export declare function createMatter(data: Partial<Matter>): Promise<Matter>;
export declare function updateMatter(id: string, data: Partial<Matter>): Promise<Matter>;
export declare function deleteMatter(id: string): Promise<void>;
export declare function getJournalTemplates(): Promise<JournalTemplate[]>;
export declare function getJournalTemplate(id: string): Promise<JournalTemplate>;
export declare function createJournalTemplate(data: Partial<JournalTemplate>): Promise<JournalTemplate>;
export declare function updateJournalTemplate(id: string, data: Partial<JournalTemplate>): Promise<JournalTemplate>;
export declare function deleteJournalTemplate(id: string): Promise<void>;
export declare function applyJournalTemplate(id: string, data?: Record<string, unknown>): Promise<Journal>;
export declare function getJournals(): Promise<Journal[]>;
export declare function getJournal(id: string): Promise<Journal>;
export declare function createJournal(data: Partial<Journal>): Promise<Journal>;
export declare function updateJournal(id: string, data: Partial<Journal>): Promise<Journal>;
export declare function deleteJournal(id: string): Promise<void>;
export declare function postJournal(id: string): Promise<Journal>;
export declare function reverseJournal(id: string): Promise<Journal>;
export declare function getDisbursements(): Promise<Disbursement[]>;
export declare function getDisbursement(id: string): Promise<Disbursement>;
export declare function createDisbursement(data: Partial<Disbursement>): Promise<Disbursement>;
export declare function billDisbursement(id: string): Promise<Disbursement>;
export declare function payDisbursement(id: string): Promise<Disbursement>;
export declare function deleteDisbursement(id: string): Promise<void>;
export declare function getTrialBalance(): Promise<TrialBalanceReport>;
export declare function getBalanceSheet(): Promise<BalanceSheetReport>;
export declare function getProfitLoss(): Promise<ProfitLossReport>;
export declare function getTAccount(accountId: string): Promise<LedgerEntry[]>;
export declare function getTrustBalances(): Promise<Record<string, number>>;
//# sourceMappingURL=conta.d.ts.map