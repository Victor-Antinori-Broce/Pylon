interface PaginatedResponse<T> {
    docs: T[];
    totalDocs: number;
    limit: number;
    totalPages: number;
    page: number;
    pagingCounter: number;
    hasPrevPage: boolean;
    hasNextPage: boolean;
    prevPage: number | null;
    nextPage: number | null;
}
interface Game {
    id: string;
    title: string;
    slug: string;
    description?: string;
    content?: string;
    status: "draft" | "published" | "archived";
    coverImage?: string;
    platform?: string[];
    tags?: string[];
    releaseDate?: string;
    createdAt: string;
    updatedAt: string;
}
interface BlogPost {
    id: string;
    title: string;
    slug: string;
    content?: string;
    excerpt?: string;
    status: "draft" | "published" | "scheduled" | "archived";
    coverImage?: string;
    featuredImageId?: string;
    featuredImage?: {
        id: string;
        url: string;
        alt?: string;
    };
    tags?: Array<{
        id: string;
        name: string;
        slug: string;
    }>;
    authorId?: string;
    author?: {
        id: string;
        name: string;
        email: string;
        image?: string;
    };
    publishedAt?: string;
    seoOverrides?: {
        metaTitle?: string;
        metaDescription?: string;
        ogTitle?: string;
        ogDescription?: string;
        ogImageId?: string;
        canonicalUrl?: string;
        robotsIndex?: boolean;
        robotsFollow?: boolean;
        structuredData?: any;
    };
    createdAt: string;
    updatedAt: string;
}
interface Platform {
    id: string;
    name: string;
    slug: string;
    icon?: string;
    createdAt: string;
    updatedAt: string;
}
interface Tag {
    id: string;
    name: string;
    slug: string;
    color?: string;
    createdAt: string;
    updatedAt: string;
}
interface Streamer {
    id: string;
    name: string;
    slug: string;
    platform: string;
    channelUrl?: string;
    isLive?: boolean;
    createdAt: string;
    updatedAt: string;
}
interface Media {
    id: string;
    filename: string;
    url: string;
    alt?: string;
    mimeType: string;
    size: number;
    width?: number;
    height?: number;
    createdAt: string;
    updatedAt: string;
}
interface SiteSettings {
    id: string;
    siteName: string;
    siteDescription?: string;
    logo?: string;
    favicon?: string;
    primaryColor?: string;
    socialLinks?: Record<string, string>;
    createdAt: string;
    updatedAt: string;
}
interface AuthResponse {
    user: {
        id: string;
        email: string;
        displayName: string;
        role: string;
    };
    token: string;
}
declare class ApiClient {
    private token;
    setToken(token: string): void;
    getToken(): string | null;
    clearToken(): void;
    private request;
    get<T>(path: string, options?: RequestInit): Promise<T>;
    post<T>(path: string, body?: any, options?: RequestInit): Promise<T>;
    patch<T>(path: string, body?: any, options?: RequestInit): Promise<T>;
    put<T>(path: string, body?: any, options?: RequestInit): Promise<T>;
    delete<T>(path: string, options?: RequestInit): Promise<T>;
    login(email: string, password: string): Promise<AuthResponse>;
    register(email: string, password: string, displayName: string): Promise<any>;
    getGames(params?: {
        limit?: number;
        page?: number;
        search?: string;
        status?: string;
    }): Promise<PaginatedResponse<Game>>;
    getGame(id: string): Promise<Game>;
    getGameBySlug(slug: string): Promise<Game>;
    createGame(data: Partial<Game>): Promise<Game>;
    updateGame(id: string, data: Partial<Game>): Promise<Game>;
    deleteGame(id: string): Promise<{
        deleted: boolean;
    }>;
    getPosts(params?: {
        limit?: number;
        page?: number;
        status?: string;
    }): Promise<PaginatedResponse<BlogPost>>;
    getPost(id: string): Promise<BlogPost>;
    getPostBySlug(slug: string): Promise<BlogPost>;
    createPost(data: Partial<BlogPost>): Promise<BlogPost>;
    updatePost(id: string, data: Partial<BlogPost>): Promise<BlogPost>;
    deletePost(id: string): Promise<{
        deleted: boolean;
    }>;
    getAcademyCursos(params?: {
        limit?: number;
    }): Promise<{
        cursos: any[];
    }>;
    getAcademyCurso(id: string): Promise<any>;
    createAcademyCurso(data: Partial<any>): Promise<any>;
    updateAcademyCurso(id: string, data: Partial<any>): Promise<any>;
    deleteAcademyCurso(id: string): Promise<{
        deleted: boolean;
    }>;
    getAcademyModulosByCurso(cursoId: string): Promise<{
        modulos: any[];
    }>;
    getAcademyModulo(id: string): Promise<any>;
    createAcademyModulo(data: Partial<any>): Promise<any>;
    deleteAcademyModulo(id: string): Promise<{
        deleted: boolean;
    }>;
    updateAcademyModulo(id: string, data: any): Promise<any>;
    deleteAcademyLearningPath(id: string): Promise<{
        deleted: boolean;
    }>;
    deleteAcademyGrupo(id: string): Promise<{
        deleted: boolean;
    }>;
    getAcademyTema(id: string): Promise<any>;
    createAcademyTema(data: Partial<any>): Promise<any>;
    updateAcademyTema(id: string, data: Partial<any>): Promise<any>;
    deleteAcademyTema(id: string): Promise<{
        deleted: boolean;
    }>;
    completarTema(id: string): Promise<any>;
    getYouTubeInfo(url: string): Promise<any>;
    getAcademyQuiz(id: string): Promise<any>;
    responderQuiz(id: string, respuestas: any[]): Promise<any>;
    getAcademyLearningPaths(): Promise<{
        learningPaths: any[];
    }>;
    getAcademyLearningPath(id: string): Promise<any>;
    createAcademyLearningPath(data: Partial<any>): Promise<any>;
    getAcademyGrupos(): Promise<{
        grupos: any[];
    }>;
    getAcademyGrupo(id: string): Promise<any>;
    createAcademyGrupo(data: Partial<any>): Promise<any>;
    getAcademyAsignaciones(): Promise<{
        asignaciones: any[];
    }>;
    createAcademyAsignacion(data: Partial<any>): Promise<any>;
    getAcademyDashboard(): Promise<{
        metricas: any;
    }>;
    getAcademyCertificado(cursoId: string): Promise<any>;
    getAcademyCertificadoPDF(cursoId: string): Promise<Blob>;
    verificarCertificado(codigo: string): Promise<any>;
    getPages(): Promise<{
        pages: any[];
    }>;
    getPage(id: string): Promise<any>;
    createPage(data: Partial<any>): Promise<any>;
    updatePage(id: string, data: Partial<any>): Promise<any>;
    deletePage(id: string): Promise<{
        deleted: boolean;
    }>;
    clonePage(id: string, data: Partial<any>): Promise<any>;
    getBlocks(pageId: string): Promise<{
        blocks: any[];
    }>;
    createBlock(pageId: string, data: Partial<any>): Promise<any>;
    updateBlock(pageId: string, blockId: string, data: Partial<any>): Promise<any>;
    deleteBlock(pageId: string, blockId: string): Promise<{
        deleted: boolean;
    }>;
    renderPage(slug: string): Promise<any>;
    getDatasets(params?: {
        limit?: number;
        page?: number;
        search?: string;
    }): Promise<PaginatedResponse<{
        id: string;
        name: string;
        slug: string;
        description?: string;
        icon?: string;
        schema?: any;
        entryCount?: number;
        createdAt: string;
        updatedAt: string;
    }>>;
    getDataset(id: string): Promise<{
        id: string;
        name: string;
        slug: string;
        description?: string;
        icon?: string;
        schema?: any;
        policyJson?: any;
        workflowJson?: any;
        createdAt: string;
        updatedAt: string;
    }>;
    getDatasetEntries(datasetId: string, params?: {
        limit?: number;
        page?: number;
        search?: string;
        status?: string;
    }): Promise<PaginatedResponse<{
        id: string;
        datasetId: string;
        data: Record<string, any>;
        status?: string;
        publishedAt?: string;
        createdAt: string;
        updatedAt: string;
    }>>;
    getDatasetEntry(datasetId: string, entryId: string): Promise<{
        id: string;
        datasetId: string;
        data: Record<string, any>;
        status?: string;
        publishedAt?: string;
        createdAt: string;
        updatedAt: string;
    }>;
    getPlatforms(): Promise<PaginatedResponse<Platform>>;
    createPlatform(data: Partial<Platform>): Promise<Platform>;
    getTags(): Promise<PaginatedResponse<Tag>>;
    createTag(data: Partial<Tag>): Promise<Tag>;
    getStreamers(): Promise<PaginatedResponse<Streamer>>;
    createStreamer(data: Partial<Streamer>): Promise<Streamer>;
    getMedia(params?: {
        limit?: number;
        page?: number;
    }): Promise<PaginatedResponse<Media>>;
    uploadMedia(file: File, alt?: string): Promise<Media>;
    deleteMedia(id: string): Promise<{
        deleted: boolean;
    }>;
    getSettings(): Promise<SiteSettings>;
    updateSettings(data: Partial<SiteSettings>): Promise<SiteSettings>;
    getContaJournals(params?: {
        status?: string;
        type?: string;
        limit?: number;
        page?: number;
    }): Promise<{
        data: any[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    getContaJournal(id: string): Promise<{
        data: any;
    }>;
    createContaJournal(data: any): Promise<any>;
    updateContaJournal(id: string, data: any): Promise<any>;
    deleteContaJournal(id: string): Promise<{
        success: boolean;
    }>;
    postContaJournal(id: string): Promise<any>;
    reverseContaJournal(id: string, date?: string): Promise<any>;
    getContaAccounts(params?: {
        type?: string;
        isTrust?: string;
        limit?: number;
    }): Promise<{
        data: any[];
    }>;
    getContaAccount(id: string): Promise<{
        data: any;
    }>;
    createContaAccount(data: any): Promise<any>;
    updateContaAccount(id: string, data: any): Promise<any>;
    deleteContaAccount(id: string): Promise<{
        success: boolean;
    }>;
    getContaTrialBalance(params?: {
        dateFrom?: string;
        dateTo?: string;
    }): Promise<{
        data: any[];
    }>;
    getContaBalanceSheet(asOf?: string): Promise<{
        data: any;
    }>;
    getContaProfitLoss(params?: {
        dateFrom?: string;
        dateTo?: string;
    }): Promise<{
        data: any;
    }>;
    getContaCurrencies(): Promise<{
        data: any[];
    }>;
    getContaCounterparties(): Promise<{
        data: any[];
    }>;
    getContaMatters(): Promise<{
        data: any[];
    }>;
    getContaTAccount(accountId: string, params?: {
        dateFrom?: string;
        dateTo?: string;
    }): Promise<{
        data: any;
    }>;
    getContaDisbursements(params?: {
        matterId?: string;
        status?: string;
        limit?: number;
    }): Promise<{
        data: any[];
    }>;
    getContaDisbursement(id: string): Promise<{
        data: any;
    }>;
    createContaDisbursement(data: any): Promise<any>;
    billContaDisbursement(id: string): Promise<any>;
    payContaDisbursement(id: string): Promise<any>;
    deleteContaDisbursement(id: string): Promise<{
        success: boolean;
    }>;
    getContaTemplates(type?: string): Promise<{
        data: any[];
    }>;
    getContaTemplate(id: string): Promise<{
        data: any;
    }>;
    createContaTemplate(data: any): Promise<any>;
    updateContaTemplate(id: string, data: any): Promise<any>;
    deleteContaTemplate(id: string): Promise<{
        success: boolean;
    }>;
    applyContaTemplate(id: string, variables: Record<string, any>, metadata?: Record<string, any>): Promise<any>;
    getCrmStats(): Promise<{
        data: any;
    }>;
    getCrmCompanies(params?: {
        industry?: string;
        search?: string;
        limit?: number;
        offset?: number;
    }): Promise<{
        data: any[];
        pagination?: any;
    }>;
    getCrmCompany(id: string): Promise<{
        data: any;
    }>;
    createCrmCompany(data: any): Promise<any>;
    updateCrmCompany(id: string, data: any): Promise<any>;
    deleteCrmCompany(id: string): Promise<{
        success: boolean;
    }>;
    getCrmContacts(params?: {
        companyId?: string;
        status?: string;
        search?: string;
        limit?: number;
        offset?: number;
    }): Promise<{
        data: any[];
        pagination?: any;
    }>;
    getCrmContact(id: string): Promise<{
        data: any;
    }>;
    createCrmContact(data: any): Promise<any>;
    updateCrmContact(id: string, data: any): Promise<any>;
    deleteCrmContact(id: string): Promise<{
        success: boolean;
    }>;
    getCrmPipelines(): Promise<{
        data: any[];
    }>;
    getCrmPipeline(id: string): Promise<{
        data: any;
    }>;
    createCrmPipeline(data: any): Promise<any>;
    updateCrmPipeline(id: string, data: any): Promise<any>;
    deleteCrmPipeline(id: string): Promise<{
        success: boolean;
    }>;
    createCrmStage(pipelineId: string, data: any): Promise<any>;
    updateCrmStage(id: string, data: any): Promise<any>;
    deleteCrmStage(id: string): Promise<{
        success: boolean;
    }>;
    getCrmDeals(params?: {
        pipelineId?: string;
        stageId?: string;
        status?: string;
        search?: string;
        limit?: number;
        offset?: number;
    }): Promise<{
        data: any[];
        pagination?: any;
    }>;
    getCrmDeal(id: string): Promise<{
        data: any;
    }>;
    createCrmDeal(data: any): Promise<any>;
    updateCrmDeal(id: string, data: any): Promise<any>;
    deleteCrmDeal(id: string): Promise<{
        success: boolean;
    }>;
    moveCrmDeal(id: string, targetStageId: string): Promise<any>;
    getCrmActivities(params?: {
        contactId?: string;
        companyId?: string;
        dealId?: string;
        type?: string;
        completed?: string;
        limit?: number;
        offset?: number;
    }): Promise<{
        data: any[];
        pagination?: any;
    }>;
    getCrmActivity(id: string): Promise<{
        data: any;
    }>;
    createCrmActivity(data: any): Promise<any>;
    updateCrmActivity(id: string, data: any): Promise<any>;
    completeCrmActivity(id: string, data?: {
        outcome?: string;
        notes?: string;
    }): Promise<any>;
    deleteCrmActivity(id: string): Promise<{
        success: boolean;
    }>;
    getDirectoryOrganizations(): Promise<{
        docs: any[];
    }>;
    getDirectoryDepartments(): Promise<{
        docs: any[];
    }>;
    getDirectoryPositions(): Promise<{
        docs: any[];
    }>;
    getDirectoryEmployees(params?: {
        limit?: number;
    }): Promise<{
        docs: any[];
    }>;
    createDirectoryOrganization(data: {
        name: string;
    }): Promise<any>;
    createDirectoryEmployee(data: any): Promise<any>;
    getDirectoryOrgChart(organizationId: string): Promise<{
        roots: any[];
    }>;
    getBookingRooms(): Promise<{
        docs: any[];
    }>;
    getBookingRoomSlots(roomId: string, date: string, duration: number): Promise<{
        slots: any[];
    }>;
    createBookingRoom(data: any): Promise<any>;
    getBookingBookings(params?: {
        startAfter?: string;
        startBefore?: string;
        limit?: number;
        page?: number;
    }): Promise<{
        docs: any[];
        totalDocs: number;
    }>;
    getBookingBooking(id: string): Promise<any>;
    createBooking(data: any): Promise<any>;
    patchBookingBooking(id: string, data: any): Promise<any>;
    createBookingNote(id: string, note: string, isInternal: boolean): Promise<any>;
    health(): Promise<{
        status: string;
    }>;
}
export declare const api: ApiClient;
export {};
//# sourceMappingURL=api.d.ts.map