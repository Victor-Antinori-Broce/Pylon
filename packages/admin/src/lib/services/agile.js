/**
 * Agile Service
 * API client tipado para el grimoire Agile
 */
const API_BASE = "/api/agile";
// ============== Projects ==============
export async function getAgileProjects() {
    const res = await fetch(`${API_BASE}/projects`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function getAgileProject(id) {
    const res = await fetch(`${API_BASE}/projects/${id}`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function createAgileProject(data) {
    const res = await fetch(`${API_BASE}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
// ============== Issues ==============
export async function getAgileIssues(projectId) {
    const res = await fetch(`${API_BASE}/${projectId}/issues`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function getAgileIssue(key) {
    const res = await fetch(`${API_BASE}/issues/${key}`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function createAgileIssue(projectId, data) {
    const res = await fetch(`${API_BASE}/${projectId}/issues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function updateAgileIssue(key, data) {
    const res = await fetch(`${API_BASE}/issues/${key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function getAgileIssueComments(key) {
    const res = await fetch(`${API_BASE}/issues/${key}/comments`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function createAgileIssueComment(key, content) {
    const res = await fetch(`${API_BASE}/issues/${key}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content }),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
// ============== Intakes ==============
export async function getAgileIntakes(projectId) {
    const res = await fetch(`${API_BASE}/${projectId}/intakes`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function createAgileIntake(projectId, data) {
    const res = await fetch(`${API_BASE}/${projectId}/intakes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function approveAgileIntake(intakeId) {
    const res = await fetch(`${API_BASE}/intakes/${intakeId}/approve`, {
        method: "POST",
        credentials: "include",
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function declineAgileIntake(intakeId) {
    const res = await fetch(`${API_BASE}/intakes/${intakeId}/decline`, {
        method: "POST",
        credentials: "include",
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function duplicateAgileIntake(intakeId) {
    const res = await fetch(`${API_BASE}/intakes/${intakeId}/duplicate`, {
        method: "POST",
        credentials: "include",
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
// ============== Cycles ==============
export async function getAgileCycles(projectId) {
    const res = await fetch(`${API_BASE}/${projectId}/cycles`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function createAgileCycle(projectId, data) {
    const res = await fetch(`${API_BASE}/${projectId}/cycles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
// ============== Modules ==============
export async function getAgileModules(projectId) {
    const res = await fetch(`${API_BASE}/${projectId}/modules`, { credentials: "include" });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function createAgileModule(projectId, data) {
    const res = await fetch(`${API_BASE}/${projectId}/modules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
//# sourceMappingURL=agile.js.map