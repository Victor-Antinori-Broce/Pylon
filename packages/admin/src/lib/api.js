// In production (Docker): VITE_API_URL is "" — relative URLs, proxied by nginx.
// In development: VITE_API_URL is "http://localhost:3001" (set in packages/admin/.env)
const API = import.meta.env.VITE_API_URL ?? "";
class ApiClient {
    token = null;
    setToken(token) {
        this.token = token;
        localStorage.setItem("gremius_token", token);
    }
    getToken() {
        if (!this.token)
            this.token = localStorage.getItem("gremius_token");
        return this.token;
    }
    clearToken() {
        this.token = null;
        localStorage.removeItem("gremius_token");
    }
    async request(path, options = {}) {
        const headers = {
            ...(options.headers || {}),
        };
        if (!(options.body instanceof FormData)) {
            headers["Content-Type"] = "application/json";
        }
        const token = this.getToken();
        if (token)
            headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`${API}/api${path}`, { ...options, headers, credentials: "include" });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || err.detail || `HTTP ${res.status}`);
        }
        return res.json();
    }
    // ── Generic HTTP Methods ──
    async get(path, options) {
        return this.request(path, { ...options, method: "GET" });
    }
    async post(path, body, options) {
        // Don't stringify if body is FormData
        const requestBody = body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined);
        return this.request(path, { ...options, method: "POST", body: requestBody });
    }
    async patch(path, body, options) {
        return this.request(path, { ...options, method: "PATCH", body: body ? JSON.stringify(body) : undefined });
    }
    async put(path, body, options) {
        return this.request(path, { ...options, method: "PUT", body: body ? JSON.stringify(body) : undefined });
    }
    async delete(path, options) {
        return this.request(path, { ...options, method: "DELETE" });
    }
    // ── Auth ──
    login(email, password) {
        return this.request("/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password }),
        });
    }
    register(email, password, displayName) {
        return this.request("/auth/register", {
            method: "POST",
            body: JSON.stringify({ email, password, displayName }),
        });
    }
    // ── Games ──
    getGames(params) {
        const q = new URLSearchParams();
        if (params?.limit)
            q.set("limit", String(params.limit));
        if (params?.page)
            q.set("page", String(params.page));
        if (params?.search)
            q.set("search", params.search);
        if (params?.status)
            q.set("status", params.status);
        return this.request(`/games?${q}`);
    }
    getGame(id) { return this.request(`/games/${id}`); }
    getGameBySlug(slug) { return this.request(`/games/slug/${slug}`); }
    createGame(data) { return this.request("/games", { method: "POST", body: JSON.stringify(data) }); }
    updateGame(id, data) { return this.request(`/games/${id}`, { method: "PATCH", body: JSON.stringify(data) }); }
    deleteGame(id) { return this.request(`/games/${id}`, { method: "DELETE" }); }
    // ── Blog Posts ──
    getPosts(params) {
        const q = new URLSearchParams();
        if (params?.limit)
            q.set("limit", String(params.limit));
        if (params?.page)
            q.set("page", String(params.page));
        if (params?.status)
            q.set("status", params.status);
        return this.request(`/blog?${q}`);
    }
    getPost(id) { return this.request(`/blog/${id}`); }
    getPostBySlug(slug) { return this.request(`/blog/slug/${slug}`); }
    createPost(data) { return this.request("/blog", { method: "POST", body: JSON.stringify(data) }); }
    updatePost(id, data) { return this.request(`/blog/${id}`, { method: "PATCH", body: JSON.stringify(data) }); }
    deletePost(id) { return this.request(`/blog/${id}`, { method: "DELETE" }); }
    // ── Academy LMS ──
    // Cursos
    getAcademyCursos(params) {
        const q = new URLSearchParams();
        if (params?.limit)
            q.set("limit", String(params.limit));
        return this.request(`/academy/cursos?${q}`);
    }
    getAcademyCurso(id) { return this.request(`/academy/cursos/${id}`); }
    createAcademyCurso(data) { return this.request("/academy/cursos", { method: "POST", body: JSON.stringify(data) }); }
    updateAcademyCurso(id, data) { return this.request(`/academy/cursos/${id}`, { method: "PATCH", body: JSON.stringify(data) }); }
    deleteAcademyCurso(id) { return this.request(`/academy/cursos/${id}`, { method: "DELETE" }); }
    // Módulos
    getAcademyModulosByCurso(cursoId) { return this.request(`/academy/cursos/${cursoId}/modulos`); }
    getAcademyModulo(id) { return this.request(`/academy/modulos/${id}`); }
    createAcademyModulo(data) { return this.request("/academy/modulos", { method: "POST", body: JSON.stringify(data) }); }
    deleteAcademyModulo(id) { return this.request(`/academy/modulos/${id}`, { method: "DELETE" }); }
    updateAcademyModulo(id, data) { return this.request(`/academy/modulos/${id}`, { method: "PUT", body: JSON.stringify(data) }); }
    deleteAcademyLearningPath(id) { return this.request(`/academy/learning-paths/${id}`, { method: "DELETE" }); }
    deleteAcademyGrupo(id) { return this.request(`/academy/grupos/${id}`, { method: "DELETE" }); }
    // Temas
    getAcademyTema(id) { return this.request(`/academy/temas/${id}`); }
    createAcademyTema(data) { return this.request("/academy/temas", { method: "POST", body: JSON.stringify(data) }); }
    updateAcademyTema(id, data) { return this.request(`/academy/temas/${id}`, { method: "PUT", body: JSON.stringify(data) }); }
    deleteAcademyTema(id) { return this.request(`/academy/temas/${id}`, { method: "DELETE" }); }
    completarTema(id) { return this.request(`/academy/temas/${id}/completar`, { method: "POST" }); }
    // YouTube/Media
    getYouTubeInfo(url) { return this.request("/academy/media/youtube-info", { method: "POST", body: JSON.stringify({ url }) }); }
    // Quizzes
    getAcademyQuiz(id) { return this.request(`/academy/quizzes/${id}`); }
    responderQuiz(id, respuestas) { return this.request(`/academy/quizzes/${id}/responder`, { method: "POST", body: JSON.stringify({ respuestas }) }); }
    // Learning Paths
    getAcademyLearningPaths() { return this.request("/academy/learning-paths"); }
    getAcademyLearningPath(id) { return this.request(`/academy/learning-paths/${id}`); }
    createAcademyLearningPath(data) { return this.request("/academy/learning-paths", { method: "POST", body: JSON.stringify(data) }); }
    // Grupos
    getAcademyGrupos() { return this.request("/academy/grupos"); }
    getAcademyGrupo(id) { return this.request(`/academy/grupos/${id}`); }
    createAcademyGrupo(data) { return this.request("/academy/grupos", { method: "POST", body: JSON.stringify(data) }); }
    // Asignaciones
    getAcademyAsignaciones() { return this.request("/academy/asignaciones"); }
    createAcademyAsignacion(data) { return this.request("/academy/asignaciones", { method: "POST", body: JSON.stringify(data) }); }
    // Dashboard
    getAcademyDashboard() { return this.request("/academy/dashboard/mi-progreso"); }
    // Certificados
    getAcademyCertificado(cursoId) { return this.request(`/academy/certificados/${cursoId}`); }
    getAcademyCertificadoPDF(cursoId) { return this.request(`/academy/certificados/${cursoId}/pdf`); }
    verificarCertificado(codigo) { return this.request(`/academy/certificados/verificar/${codigo}`); }
    // ── Page Builder (Blocks) ──
    getPages() { return this.request("/page-builder/pages"); }
    getPage(id) { return this.request(`/page-builder/pages/${id}`); }
    createPage(data) { return this.request("/page-builder/pages", { method: "POST", body: JSON.stringify(data) }); }
    updatePage(id, data) { return this.request(`/page-builder/pages/${id}`, { method: "PATCH", body: JSON.stringify(data) }); }
    deletePage(id) { return this.request(`/page-builder/pages/${id}`, { method: "DELETE" }); }
    clonePage(id, data) { return this.request(`/page-builder/pages/${id}/clone`, { method: "POST", body: JSON.stringify(data) }); }
    getBlocks(pageId) { return this.request(`/page-builder/pages/${pageId}/blocks`); }
    createBlock(pageId, data) { return this.request(`/page-builder/pages/${pageId}/blocks`, { method: "POST", body: JSON.stringify(data) }); }
    updateBlock(pageId, blockId, data) { return this.request(`/page-builder/pages/${pageId}/blocks/${blockId}`, { method: "PATCH", body: JSON.stringify(data) }); }
    deleteBlock(pageId, blockId) { return this.request(`/page-builder/pages/${pageId}/blocks/${blockId}`, { method: "DELETE" }); }
    renderPage(slug) { return this.request(`/page-builder/render/${slug}`); }
    // ── Datasets ──
    getDatasets(params) {
        const q = new URLSearchParams();
        if (params?.limit)
            q.set("limit", String(params.limit));
        if (params?.page)
            q.set("page", String(params.page));
        if (params?.search)
            q.set("search", params.search);
        return this.request(`/data-sets?${q}`);
    }
    getDataset(id) {
        return this.request(`/data-sets/${id}`);
    }
    getDatasetEntries(datasetId, params) {
        const q = new URLSearchParams();
        if (params?.limit)
            q.set("limit", String(params.limit));
        if (params?.page)
            q.set("page", String(params.page));
        if (params?.search)
            q.set("search", params.search);
        if (params?.status)
            q.set("status", params.status);
        return this.request(`/data-sets/${datasetId}/entries?${q}`);
    }
    getDatasetEntry(datasetId, entryId) {
        return this.request(`/data-sets/${datasetId}/entries/${entryId}`);
    }
    // ── Platforms / Tags ──
    getPlatforms() { return this.request("/platforms"); }
    createPlatform(data) { return this.request("/platforms", { method: "POST", body: JSON.stringify(data) }); }
    getTags() { return this.request("/tags"); }
    createTag(data) { return this.request("/tags", { method: "POST", body: JSON.stringify(data) }); }
    // ── Streamers ──
    getStreamers() { return this.request("/streamers"); }
    createStreamer(data) { return this.request("/streamers", { method: "POST", body: JSON.stringify(data) }); }
    // ── Media ──
    getMedia(params) {
        const q = new URLSearchParams();
        if (params?.limit)
            q.set("limit", String(params.limit));
        if (params?.page)
            q.set("page", String(params.page));
        return this.request(`/media?${q}`);
    }
    uploadMedia(file, alt) {
        const form = new FormData();
        form.append("file", file);
        if (alt)
            form.append("alt", alt);
        return this.request("/media/upload", { method: "POST", body: form });
    }
    deleteMedia(id) { return this.request(`/media/${id}`, { method: "DELETE" }); }
    // ── Settings ──
    getSettings() { return this.request("/settings"); }
    updateSettings(data) { return this.request("/settings", { method: "PATCH", body: JSON.stringify(data) }); }
    // ── Conta (General Ledger) ──
    getContaJournals(params) {
        const q = new URLSearchParams();
        if (params?.status)
            q.set("status", params.status);
        if (params?.type)
            q.set("type", params.type);
        if (params?.limit)
            q.set("limit", String(params.limit));
        if (params?.page)
            q.set("page", String(params.page));
        return this.request(`/conta/journals?${q}`);
    }
    getContaJournal(id) { return this.request(`/conta/journals/${id}`); }
    createContaJournal(data) { return this.request("/conta/journals", { method: "POST", body: JSON.stringify(data) }); }
    updateContaJournal(id, data) { return this.request(`/conta/journals/${id}`, { method: "PATCH", body: JSON.stringify(data) }); }
    deleteContaJournal(id) { return this.request(`/conta/journals/${id}`, { method: "DELETE" }); }
    postContaJournal(id) { return this.request(`/conta/journals/${id}/post`, { method: "POST" }); }
    reverseContaJournal(id, date) { return this.request(`/conta/journals/${id}/reverse`, { method: "POST", body: JSON.stringify({ date }) }); }
    getContaAccounts(params) {
        const q = new URLSearchParams();
        if (params?.type)
            q.set("type", params.type);
        if (params?.isTrust)
            q.set("isTrust", params.isTrust);
        if (params?.limit)
            q.set("limit", String(params.limit));
        return this.request(`/conta/accounts?${q}`);
    }
    getContaAccount(id) { return this.request(`/conta/accounts/${id}`); }
    createContaAccount(data) { return this.request("/conta/accounts", { method: "POST", body: JSON.stringify(data) }); }
    updateContaAccount(id, data) { return this.request(`/conta/accounts/${id}`, { method: "PATCH", body: JSON.stringify(data) }); }
    deleteContaAccount(id) { return this.request(`/conta/accounts/${id}`, { method: "DELETE" }); }
    getContaTrialBalance(params) {
        const q = new URLSearchParams();
        if (params?.dateFrom)
            q.set("dateFrom", params.dateFrom);
        if (params?.dateTo)
            q.set("dateTo", params.dateTo);
        return this.request(`/conta/reports/trial-balance?${q}`);
    }
    getContaBalanceSheet(asOf) {
        const q = new URLSearchParams();
        if (asOf)
            q.set("asOf", asOf);
        return this.request(`/conta/reports/balance-sheet?${q}`);
    }
    getContaProfitLoss(params) {
        const q = new URLSearchParams();
        if (params?.dateFrom)
            q.set("dateFrom", params.dateFrom);
        if (params?.dateTo)
            q.set("dateTo", params.dateTo);
        return this.request(`/conta/reports/profit-loss?${q}`);
    }
    getContaCurrencies() { return this.request("/conta/currencies"); }
    getContaCounterparties() { return this.request("/conta/counterparties"); }
    getContaMatters() { return this.request("/conta/matters"); }
    getContaTAccount(accountId, params) {
        const q = new URLSearchParams();
        if (params?.dateFrom)
            q.set("dateFrom", params.dateFrom);
        if (params?.dateTo)
            q.set("dateTo", params.dateTo);
        return this.request(`/conta/t-account/${accountId}?${q}`);
    }
    // ── Disbursements ──
    getContaDisbursements(params) {
        const q = new URLSearchParams();
        if (params?.matterId)
            q.set("matterId", params.matterId);
        if (params?.status)
            q.set("status", params.status);
        if (params?.limit)
            q.set("limit", String(params.limit));
        return this.request(`/conta/disbursements?${q}`);
    }
    getContaDisbursement(id) { return this.request(`/conta/disbursements/${id}`); }
    createContaDisbursement(data) { return this.request("/conta/disbursements", { method: "POST", body: JSON.stringify(data) }); }
    billContaDisbursement(id) { return this.request(`/conta/disbursements/${id}/bill`, { method: "POST" }); }
    payContaDisbursement(id) { return this.request(`/conta/disbursements/${id}/pay`, { method: "POST" }); }
    deleteContaDisbursement(id) { return this.request(`/conta/disbursements/${id}`, { method: "DELETE" }); }
    // ── Templates ──
    getContaTemplates(type) {
        const q = new URLSearchParams();
        if (type)
            q.set("type", type);
        return this.request(`/conta/templates?${q}`);
    }
    getContaTemplate(id) { return this.request(`/conta/templates/${id}`); }
    createContaTemplate(data) { return this.request("/conta/templates", { method: "POST", body: JSON.stringify(data) }); }
    updateContaTemplate(id, data) { return this.request(`/conta/templates/${id}`, { method: "PATCH", body: JSON.stringify(data) }); }
    deleteContaTemplate(id) { return this.request(`/conta/templates/${id}`, { method: "DELETE" }); }
    applyContaTemplate(id, variables, metadata) {
        return this.request(`/conta/templates/${id}/apply`, { method: "POST", body: JSON.stringify({ variables, metadata }) });
    }
    // ═══════════════════════════════════════════════════════════
    // CRM
    // ═══════════════════════════════════════════════════════════
    // ── Stats ──
    getCrmStats() { return this.request("/crm/stats"); }
    // ── Companies ──
    getCrmCompanies(params) {
        const q = new URLSearchParams();
        if (params?.industry)
            q.set("industry", params.industry);
        if (params?.search)
            q.set("search", params.search);
        if (params?.limit)
            q.set("limit", String(params.limit));
        if (params?.offset)
            q.set("offset", String(params.offset));
        return this.request(`/crm/companies?${q}`);
    }
    getCrmCompany(id) { return this.request(`/crm/companies/${id}`); }
    createCrmCompany(data) { return this.request("/crm/companies", { method: "POST", body: JSON.stringify(data) }); }
    updateCrmCompany(id, data) { return this.request(`/crm/companies/${id}`, { method: "PATCH", body: JSON.stringify(data) }); }
    deleteCrmCompany(id) { return this.request(`/crm/companies/${id}`, { method: "DELETE" }); }
    // ── Contacts ──
    getCrmContacts(params) {
        const q = new URLSearchParams();
        if (params?.companyId)
            q.set("companyId", params.companyId);
        if (params?.status)
            q.set("status", params.status);
        if (params?.search)
            q.set("search", params.search);
        if (params?.limit)
            q.set("limit", String(params.limit));
        if (params?.offset)
            q.set("offset", String(params.offset));
        return this.request(`/crm/contacts?${q}`);
    }
    getCrmContact(id) { return this.request(`/crm/contacts/${id}`); }
    createCrmContact(data) { return this.request("/crm/contacts", { method: "POST", body: JSON.stringify(data) }); }
    updateCrmContact(id, data) { return this.request(`/crm/contacts/${id}`, { method: "PATCH", body: JSON.stringify(data) }); }
    deleteCrmContact(id) { return this.request(`/crm/contacts/${id}`, { method: "DELETE" }); }
    // ── Pipelines ──
    getCrmPipelines() { return this.request("/crm/pipelines"); }
    getCrmPipeline(id) { return this.request(`/crm/pipelines/${id}`); }
    createCrmPipeline(data) { return this.request("/crm/pipelines", { method: "POST", body: JSON.stringify(data) }); }
    updateCrmPipeline(id, data) { return this.request(`/crm/pipelines/${id}`, { method: "PATCH", body: JSON.stringify(data) }); }
    deleteCrmPipeline(id) { return this.request(`/crm/pipelines/${id}`, { method: "DELETE" }); }
    // ── Pipeline Stages ──
    createCrmStage(pipelineId, data) { return this.request(`/crm/pipelines/${pipelineId}/stages`, { method: "POST", body: JSON.stringify(data) }); }
    updateCrmStage(id, data) { return this.request(`/crm/stages/${id}`, { method: "PATCH", body: JSON.stringify(data) }); }
    deleteCrmStage(id) { return this.request(`/crm/stages/${id}`, { method: "DELETE" }); }
    // ── Deals ──
    getCrmDeals(params) {
        const q = new URLSearchParams();
        if (params?.pipelineId)
            q.set("pipelineId", params.pipelineId);
        if (params?.stageId)
            q.set("stageId", params.stageId);
        if (params?.status)
            q.set("status", params.status);
        if (params?.search)
            q.set("search", params.search);
        if (params?.limit)
            q.set("limit", String(params.limit));
        if (params?.offset)
            q.set("offset", String(params.offset));
        return this.request(`/crm/deals?${q}`);
    }
    getCrmDeal(id) { return this.request(`/crm/deals/${id}`); }
    createCrmDeal(data) { return this.request("/crm/deals", { method: "POST", body: JSON.stringify(data) }); }
    updateCrmDeal(id, data) { return this.request(`/crm/deals/${id}`, { method: "PATCH", body: JSON.stringify(data) }); }
    deleteCrmDeal(id) { return this.request(`/crm/deals/${id}`, { method: "DELETE" }); }
    moveCrmDeal(id, targetStageId) { return this.request(`/crm/deals/${id}/move`, { method: "POST", body: JSON.stringify({ targetStageId }) }); }
    // ── Activities ──
    getCrmActivities(params) {
        const q = new URLSearchParams();
        if (params?.contactId)
            q.set("contactId", params.contactId);
        if (params?.companyId)
            q.set("companyId", params.companyId);
        if (params?.dealId)
            q.set("dealId", params.dealId);
        if (params?.type)
            q.set("type", params.type);
        if (params?.completed)
            q.set("completed", params.completed);
        if (params?.limit)
            q.set("limit", String(params.limit));
        if (params?.offset)
            q.set("offset", String(params.offset));
        return this.request(`/crm/activities?${q}`);
    }
    getCrmActivity(id) { return this.request(`/crm/activities/${id}`); }
    createCrmActivity(data) { return this.request("/crm/activities", { method: "POST", body: JSON.stringify(data) }); }
    updateCrmActivity(id, data) { return this.request(`/crm/activities/${id}`, { method: "PATCH", body: JSON.stringify(data) }); }
    completeCrmActivity(id, data) { return this.request(`/crm/activities/${id}/complete`, { method: "POST", body: JSON.stringify(data || {}) }); }
    deleteCrmActivity(id) { return this.request(`/crm/activities/${id}`, { method: "DELETE" }); }
    // ── Health ──
    // ── Directory ──
    getDirectoryOrganizations() { return this.request("/directory/organizations"); }
    getDirectoryDepartments() { return this.request("/directory/departments"); }
    getDirectoryPositions() { return this.request("/directory/positions"); }
    getDirectoryEmployees(params) {
        const q = new URLSearchParams();
        if (params?.limit)
            q.set("limit", String(params.limit));
        return this.request(`/directory/employees?${q}`);
    }
    createDirectoryOrganization(data) { return this.request("/directory/organizations", { method: "POST", body: JSON.stringify(data) }); }
    createDirectoryEmployee(data) { return this.request("/directory/employees", { method: "POST", body: JSON.stringify(data) }); }
    getDirectoryOrgChart(organizationId) {
        return this.request(`/directory/org-chart?organizationId=${organizationId}`);
    }
    // ── Booking ──
    getBookingRooms() { return this.request("/booking/rooms"); }
    getBookingRoomSlots(roomId, date, duration) {
        return this.request(`/booking/rooms/${roomId}/slots?date=${date}&duration=${duration}`);
    }
    createBookingRoom(data) { return this.request("/booking/rooms", { method: "POST", body: JSON.stringify(data) }); }
    getBookingBookings(params) {
        const q = new URLSearchParams();
        if (params?.startAfter)
            q.set("startAfter", params.startAfter);
        if (params?.startBefore)
            q.set("startBefore", params.startBefore);
        if (params?.limit)
            q.set("limit", String(params.limit));
        if (params?.page)
            q.set("page", String(params.page));
        return this.request(`/booking/bookings?${q}`);
    }
    getBookingBooking(id) { return this.request(`/booking/bookings/${id}`); }
    createBooking(data) { return this.request("/booking/bookings", { method: "POST", body: JSON.stringify(data) }); }
    patchBookingBooking(id, data) { return this.request(`/booking/bookings/${id}`, { method: "PATCH", body: JSON.stringify(data) }); }
    createBookingNote(id, note, isInternal) {
        return this.request(`/booking/bookings/${id}/notes`, { method: "POST", body: JSON.stringify({ note, isInternal }) });
    }
    health() { return this.request("/health"); }
}
export const api = new ApiClient();
//# sourceMappingURL=api.js.map