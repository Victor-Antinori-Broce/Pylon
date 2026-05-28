/**
 * CRM Service
 * API client tipado para el grimoire CRM
 */
const API_BASE = "/api/crm";
// ============== Companies ==============
export async function getCrmCompanies(params) {
    const query = new URLSearchParams();
    if (params?.organizationId)
        query.set("organizationId", params.organizationId);
    if (params?.industry)
        query.set("industry", params.industry);
    if (params?.search)
        query.set("search", params.search);
    if (params?.limit)
        query.set("limit", String(params.limit));
    if (params?.offset)
        query.set("offset", String(params.offset));
    const res = await fetch(`${API_BASE}/companies?${query}`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function getCrmCompany(id) {
    const res = await fetch(`${API_BASE}/companies/${id}`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function createCrmCompany(data) {
    const res = await fetch(`${API_BASE}/companies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function updateCrmCompany(id, data) {
    const res = await fetch(`${API_BASE}/companies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function deleteCrmCompany(id) {
    const res = await fetch(`${API_BASE}/companies/${id}`, {
        method: "DELETE",
        credentials: "include",
    });
    if (!res.ok)
        throw new Error(await res.text());
}
// ============== Contacts ==============
export async function getCrmContacts(params) {
    const query = new URLSearchParams();
    if (params?.companyId)
        query.set("companyId", params.companyId);
    if (params?.status)
        query.set("status", params.status);
    if (params?.search)
        query.set("search", params.search);
    if (params?.limit)
        query.set("limit", String(params.limit));
    if (params?.offset)
        query.set("offset", String(params.offset));
    const res = await fetch(`${API_BASE}/contacts?${query}`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function getCrmContact(id) {
    const res = await fetch(`${API_BASE}/contacts/${id}`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function createCrmContact(data) {
    const res = await fetch(`${API_BASE}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function updateCrmContact(id, data) {
    const res = await fetch(`${API_BASE}/contacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function deleteCrmContact(id) {
    const res = await fetch(`${API_BASE}/contacts/${id}`, {
        method: "DELETE",
        credentials: "include",
    });
    if (!res.ok)
        throw new Error(await res.text());
}
// ============== Pipelines ==============
export async function getCrmPipelines() {
    const res = await fetch(`${API_BASE}/pipelines`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function getCrmPipeline(id) {
    const res = await fetch(`${API_BASE}/pipelines/${id}`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function createCrmPipeline(data) {
    const res = await fetch(`${API_BASE}/pipelines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function updateCrmPipeline(id, data) {
    const res = await fetch(`${API_BASE}/pipelines/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function deleteCrmPipeline(id) {
    const res = await fetch(`${API_BASE}/pipelines/${id}`, {
        method: "DELETE",
        credentials: "include",
    });
    if (!res.ok)
        throw new Error(await res.text());
}
// ============== Deals ==============
export async function getCrmDeals(params) {
    const query = new URLSearchParams();
    if (params?.pipelineId)
        query.set("pipelineId", params.pipelineId);
    if (params?.stageId)
        query.set("stageId", params.stageId);
    if (params?.status)
        query.set("status", params.status);
    if (params?.contactId)
        query.set("contactId", params.contactId);
    if (params?.companyId)
        query.set("companyId", params.companyId);
    if (params?.limit)
        query.set("limit", String(params.limit));
    if (params?.offset)
        query.set("offset", String(params.offset));
    const res = await fetch(`${API_BASE}/deals?${query}`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function getCrmDeal(id) {
    const res = await fetch(`${API_BASE}/deals/${id}`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function createCrmDeal(data) {
    const res = await fetch(`${API_BASE}/deals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function updateCrmDeal(id, data) {
    const res = await fetch(`${API_BASE}/deals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function deleteCrmDeal(id) {
    const res = await fetch(`${API_BASE}/deals/${id}`, {
        method: "DELETE",
        credentials: "include",
    });
    if (!res.ok)
        throw new Error(await res.text());
}
export async function moveCrmDeal(id, stageId) {
    const res = await fetch(`${API_BASE}/deals/${id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ stageId }),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function getCrmDealTimeline(id) {
    const res = await fetch(`${API_BASE}/deals/${id}/timeline`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
// ============== Activities ==============
export async function getCrmActivities(params) {
    const query = new URLSearchParams();
    if (params?.contactId)
        query.set("contactId", params.contactId);
    if (params?.companyId)
        query.set("companyId", params.companyId);
    if (params?.dealId)
        query.set("dealId", params.dealId);
    if (params?.type)
        query.set("type", params.type);
    if (params?.limit)
        query.set("limit", String(params.limit));
    if (params?.offset)
        query.set("offset", String(params.offset));
    const res = await fetch(`${API_BASE}/activities?${query}`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function getCrmActivity(id) {
    const res = await fetch(`${API_BASE}/activities/${id}`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function createCrmActivity(data) {
    const res = await fetch(`${API_BASE}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function updateCrmActivity(id, data) {
    const res = await fetch(`${API_BASE}/activities/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function completeCrmActivity(id) {
    const res = await fetch(`${API_BASE}/activities/${id}/complete`, {
        method: "POST",
        credentials: "include",
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function deleteCrmActivity(id) {
    const res = await fetch(`${API_BASE}/activities/${id}`, {
        method: "DELETE",
        credentials: "include",
    });
    if (!res.ok)
        throw new Error(await res.text());
}
// ============== Kanban & Stats ==============
export async function getCrmKanban(pipelineId) {
    const res = await fetch(`${API_BASE}/pipelines/${pipelineId}/kanban`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function getCrmStats() {
    const res = await fetch(`${API_BASE}/stats`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
// ============== Entity Configs ==============
export async function getCrmEntityConfigs() {
    const res = await fetch(`${API_BASE}/entity-configs`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
//# sourceMappingURL=crm.js.map