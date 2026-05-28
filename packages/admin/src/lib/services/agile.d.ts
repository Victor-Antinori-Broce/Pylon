/**
 * Agile Service
 * API client tipado para el grimoire Agile
 */
export interface AgileProject {
    id: string;
    key: string;
    name: string;
    description?: string;
    icon?: string;
    color?: string;
    isPublic: boolean;
    defaultIssueStateId?: string;
    createdAt: string;
    updatedAt: string;
}
export interface AgileState {
    id: string;
    projectId: string;
    name: string;
    color: string;
    group: "backlog" | "unstarted" | "started" | "completed" | "canceled";
    order: number;
    isDefault: boolean;
    createdAt: string;
}
export interface AgileIssue {
    id: string;
    projectId: string;
    key: string;
    title: string;
    description?: string;
    type: "story" | "task" | "bug" | "epic" | "subtask";
    priority: "low" | "medium" | "high" | "urgent";
    stateId: string;
    state?: AgileState;
    assigneeId?: string;
    cycleId?: string;
    moduleId?: string;
    parentId?: string;
    estimate?: number;
    dueDate?: string;
    completedAt?: string;
    createdAt: string;
    updatedAt: string;
}
export interface AgileCycle {
    id: string;
    projectId: string;
    name: string;
    number: number;
    startDate: string;
    endDate: string;
    status: "planned" | "active" | "completed";
    createdAt: string;
    updatedAt: string;
}
export interface AgileModule {
    id: string;
    projectId: string;
    name: string;
    description?: string;
    color?: string;
    status: "planned" | "in_progress" | "paused" | "completed";
    targetDate?: string;
    createdAt: string;
    updatedAt: string;
}
export interface AgileIntake {
    id: string;
    projectId: string;
    title: string;
    description?: string;
    submitterEmail: string;
    submitterName?: string;
    status: "pending" | "approved" | "declined" | "duplicate";
    issueId?: string;
    createdAt: string;
    updatedAt: string;
}
export interface AgileComment {
    id: string;
    issueId: string;
    authorId: string;
    content: string;
    parentId?: string;
    createdAt: string;
    updatedAt: string;
}
export declare function getAgileProjects(): Promise<AgileProject[]>;
export declare function getAgileProject(id: string): Promise<AgileProject & {
    states: AgileState[];
}>;
export declare function createAgileProject(data: Partial<AgileProject>): Promise<AgileProject>;
export declare function getAgileIssues(projectId: string): Promise<AgileIssue[]>;
export declare function getAgileIssue(key: string): Promise<AgileIssue>;
export declare function createAgileIssue(projectId: string, data: Partial<AgileIssue>): Promise<AgileIssue>;
export declare function updateAgileIssue(key: string, data: Partial<AgileIssue>): Promise<AgileIssue>;
export declare function getAgileIssueComments(key: string): Promise<AgileComment[]>;
export declare function createAgileIssueComment(key: string, content: string): Promise<AgileComment>;
export declare function getAgileIntakes(projectId: string): Promise<AgileIntake[]>;
export declare function createAgileIntake(projectId: string, data: Partial<AgileIntake>): Promise<AgileIntake>;
export declare function approveAgileIntake(intakeId: string): Promise<AgileIntake>;
export declare function declineAgileIntake(intakeId: string): Promise<AgileIntake>;
export declare function duplicateAgileIntake(intakeId: string): Promise<AgileIntake>;
export declare function getAgileCycles(projectId: string): Promise<AgileCycle[]>;
export declare function createAgileCycle(projectId: string, data: Partial<AgileCycle>): Promise<AgileCycle>;
export declare function getAgileModules(projectId: string): Promise<AgileModule[]>;
export declare function createAgileModule(projectId: string, data: Partial<AgileModule>): Promise<AgileModule>;
//# sourceMappingURL=agile.d.ts.map