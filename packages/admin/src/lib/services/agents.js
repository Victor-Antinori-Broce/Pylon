/**
 * Agents Service
 * Servicio para interactuar con el API de agentes
 */
const API_BASE = '/api/v1';
// ============== Agents ==============
export async function listAgents() {
    const res = await fetch(`${API_BASE}/agents`);
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function getAgent(id) {
    const res = await fetch(`${API_BASE}/agents/${id}`);
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function createAgent(data) {
    const res = await fetch(`${API_BASE}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const error = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(error.message || 'Error creating agent');
    }
    return res.json();
}
export async function updateAgent(id, data) {
    const res = await fetch(`${API_BASE}/agents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function deleteAgent(id) {
    const res = await fetch(`${API_BASE}/agents/${id}`, {
        method: 'DELETE'
    });
    if (!res.ok)
        throw new Error(await res.text());
}
export async function regenerateToken(agentId) {
    const res = await fetch(`${API_BASE}/agents/${agentId}/token`, {
        method: 'POST'
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function listTraces(options = {}) {
    const params = new URLSearchParams();
    if (options.agentId)
        params.set('agentId', options.agentId);
    if (options.sessionId)
        params.set('sessionId', options.sessionId);
    if (options.limit)
        params.set('limit', String(options.limit));
    if (options.offset)
        params.set('offset', String(options.offset));
    const res = await fetch(`${API_BASE}/traces?${params}`);
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function getTrace(id) {
    const res = await fetch(`${API_BASE}/traces/${id}?expand=steps`);
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function listTraceSteps(traceId) {
    const res = await fetch(`${API_BASE}/traces/${traceId}/steps`);
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function sendPlaygroundMessage(agentId, messages) {
    const res = await fetch(`${API_BASE}/agents/${agentId}/playground`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
    });
    if (!res.ok) {
        const error = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(error.message || 'Error in playground');
    }
    return res.json();
}
// ============== Agent Identities ==============
export async function listIdentities() {
    const res = await fetch(`${API_BASE}/identities`);
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function getIdentity(id) {
    const res = await fetch(`${API_BASE}/identities/${id}`);
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function createIdentity(data) {
    const res = await fetch(`${API_BASE}/identities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function updateIdentity(id, data) {
    const res = await fetch(`${API_BASE}/identities/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
}
export async function deleteIdentity(id) {
    const res = await fetch(`${API_BASE}/identities/${id}`, {
        method: 'DELETE'
    });
    if (!res.ok)
        throw new Error(await res.text());
}
//# sourceMappingURL=agents.js.map