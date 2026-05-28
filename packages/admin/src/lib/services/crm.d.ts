/**
 * CRM Service
 * API client tipado para el grimoire CRM
 */
import type { CrmContact, CrmCompany, CrmPipeline, CrmPipelineStage, CrmDeal, CrmActivity, CRMStats, KanbanData, DealTimelineEntry, CrmEntityConfig } from "$views/crm/types";
export declare function getCrmCompanies(params?: {
    organizationId?: string;
    industry?: string;
    search?: string;
    limit?: number;
    offset?: number;
}): Promise<{
    docs: CrmCompany[];
    totalDocs: number;
}>;
export declare function getCrmCompany(id: string): Promise<CrmCompany>;
export declare function createCrmCompany(data: Partial<CrmCompany>): Promise<CrmCompany>;
export declare function updateCrmCompany(id: string, data: Partial<CrmCompany>): Promise<CrmCompany>;
export declare function deleteCrmCompany(id: string): Promise<void>;
export declare function getCrmContacts(params?: {
    companyId?: string;
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
}): Promise<{
    docs: CrmContact[];
    totalDocs: number;
}>;
export declare function getCrmContact(id: string): Promise<CrmContact>;
export declare function createCrmContact(data: Partial<CrmContact>): Promise<CrmContact>;
export declare function updateCrmContact(id: string, data: Partial<CrmContact>): Promise<CrmContact>;
export declare function deleteCrmContact(id: string): Promise<void>;
export declare function getCrmPipelines(): Promise<CrmPipeline[]>;
export declare function getCrmPipeline(id: string): Promise<CrmPipeline & {
    stages: CrmPipelineStage[];
}>;
export declare function createCrmPipeline(data: Partial<CrmPipeline>): Promise<CrmPipeline>;
export declare function updateCrmPipeline(id: string, data: Partial<CrmPipeline>): Promise<CrmPipeline>;
export declare function deleteCrmPipeline(id: string): Promise<void>;
export declare function getCrmDeals(params?: {
    pipelineId?: string;
    stageId?: string;
    status?: string;
    contactId?: string;
    companyId?: string;
    limit?: number;
    offset?: number;
}): Promise<{
    docs: CrmDeal[];
    totalDocs: number;
}>;
export declare function getCrmDeal(id: string): Promise<CrmDeal>;
export declare function createCrmDeal(data: Partial<CrmDeal>): Promise<CrmDeal>;
export declare function updateCrmDeal(id: string, data: Partial<CrmDeal>): Promise<CrmDeal>;
export declare function deleteCrmDeal(id: string): Promise<void>;
export declare function moveCrmDeal(id: string, stageId: string): Promise<CrmDeal>;
export declare function getCrmDealTimeline(id: string): Promise<DealTimelineEntry[]>;
export declare function getCrmActivities(params?: {
    contactId?: string;
    companyId?: string;
    dealId?: string;
    type?: string;
    limit?: number;
    offset?: number;
}): Promise<{
    docs: CrmActivity[];
    totalDocs: number;
}>;
export declare function getCrmActivity(id: string): Promise<CrmActivity>;
export declare function createCrmActivity(data: Partial<CrmActivity>): Promise<CrmActivity>;
export declare function updateCrmActivity(id: string, data: Partial<CrmActivity>): Promise<CrmActivity>;
export declare function completeCrmActivity(id: string): Promise<CrmActivity>;
export declare function deleteCrmActivity(id: string): Promise<void>;
export declare function getCrmKanban(pipelineId: string): Promise<KanbanData>;
export declare function getCrmStats(): Promise<CRMStats>;
export declare function getCrmEntityConfigs(): Promise<CrmEntityConfig[]>;
//# sourceMappingURL=crm.d.ts.map