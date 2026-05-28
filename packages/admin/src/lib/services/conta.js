/**
 * Conta Service
 * API client tipado para el grimoire de Contabilidad
 */
const API_BASE = "/api/conta";
// ============== Currencies ==============
export async function getCurrencies() {
    const res = await fetch(`${API_BASE}/currencies`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function createCurrency(data) {
    const res = await fetch(`${API_BASE}/currencies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
// ============== Accounts ==============
export async function getAccounts() {
    const res = await fetch(`${API_BASE}/accounts`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function getAccount(id) {
    const res = await fetch(`${API_BASE}/accounts/${id}`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function createAccount(data) {
    const res = await fetch(`${API_BASE}/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function updateAccount(id, data) {
    const res = await fetch(`${API_BASE}/accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function deleteAccount(id) {
    const res = await fetch(`${API_BASE}/accounts/${id}`, {
        method: "DELETE",
        credentials: "include",
    });
    if (!res.ok)
        throw new Error(await res.text());
}
// ============== Counterparties ==============
export async function getCounterparties() {
    const res = await fetch(`${API_BASE}/counterparties`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function getCounterparty(id) {
    const res = await fetch(`${API_BASE}/counterparties/${id}`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function createCounterparty(data) {
    const res = await fetch(`${API_BASE}/counterparties`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function updateCounterparty(id, data) {
    const res = await fetch(`${API_BASE}/counterparties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function deleteCounterparty(id) {
    const res = await fetch(`${API_BASE}/counterparties/${id}`, {
        method: "DELETE",
        credentials: "include",
    });
    if (!res.ok)
        throw new Error(await res.text());
}
// ============== Matters ==============
export async function getMatters() {
    const res = await fetch(`${API_BASE}/matters`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function getMatter(id) {
    const res = await fetch(`${API_BASE}/matters/${id}`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function createMatter(data) {
    const res = await fetch(`${API_BASE}/matters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function updateMatter(id, data) {
    const res = await fetch(`${API_BASE}/matters/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function deleteMatter(id) {
    const res = await fetch(`${API_BASE}/matters/${id}`, {
        method: "DELETE",
        credentials: "include",
    });
    if (!res.ok)
        throw new Error(await res.text());
}
// ============== Templates ==============
export async function getJournalTemplates() {
    const res = await fetch(`${API_BASE}/templates`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function getJournalTemplate(id) {
    const res = await fetch(`${API_BASE}/templates/${id}`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function createJournalTemplate(data) {
    const res = await fetch(`${API_BASE}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function updateJournalTemplate(id, data) {
    const res = await fetch(`${API_BASE}/templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function deleteJournalTemplate(id) {
    const res = await fetch(`${API_BASE}/templates/${id}`, {
        method: "DELETE",
        credentials: "include",
    });
    if (!res.ok)
        throw new Error(await res.text());
}
export async function applyJournalTemplate(id, data) {
    const res = await fetch(`${API_BASE}/templates/${id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data || {}),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
// ============== Journals ==============
export async function getJournals() {
    const res = await fetch(`${API_BASE}/journals`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function getJournal(id) {
    const res = await fetch(`${API_BASE}/journals/${id}`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function createJournal(data) {
    const res = await fetch(`${API_BASE}/journals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function updateJournal(id, data) {
    const res = await fetch(`${API_BASE}/journals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function deleteJournal(id) {
    const res = await fetch(`${API_BASE}/journals/${id}`, {
        method: "DELETE",
        credentials: "include",
    });
    if (!res.ok)
        throw new Error(await res.text());
}
export async function postJournal(id) {
    const res = await fetch(`${API_BASE}/journals/${id}/post`, {
        method: "POST",
        credentials: "include",
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function reverseJournal(id) {
    const res = await fetch(`${API_BASE}/journals/${id}/reverse`, {
        method: "POST",
        credentials: "include",
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
// ============== Disbursements ==============
export async function getDisbursements() {
    const res = await fetch(`${API_BASE}/disbursements`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function getDisbursement(id) {
    const res = await fetch(`${API_BASE}/disbursements/${id}`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function createDisbursement(data) {
    const res = await fetch(`${API_BASE}/disbursements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function billDisbursement(id) {
    const res = await fetch(`${API_BASE}/disbursements/${id}/bill`, {
        method: "POST",
        credentials: "include",
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function payDisbursement(id) {
    const res = await fetch(`${API_BASE}/disbursements/${id}/pay`, {
        method: "POST",
        credentials: "include",
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function deleteDisbursement(id) {
    const res = await fetch(`${API_BASE}/disbursements/${id}`, {
        method: "DELETE",
        credentials: "include",
    });
    if (!res.ok)
        throw new Error(await res.text());
}
// ============== Reports ==============
export async function getTrialBalance() {
    const res = await fetch(`${API_BASE}/reports/trial-balance`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function getBalanceSheet() {
    const res = await fetch(`${API_BASE}/reports/balance-sheet`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function getProfitLoss() {
    const res = await fetch(`${API_BASE}/reports/profit-loss`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
// ============== T-Account & Trust ==============
export async function getTAccount(accountId) {
    const res = await fetch(`${API_BASE}/t-account/${accountId}`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function getTrustBalances() {
    const res = await fetch(`${API_BASE}/trust-balances`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
//# sourceMappingURL=conta.js.map