/**
 * Academy Grimoire - Admin Configuration
 *
 * LMS-style admin with courses, lessons, and enrollment management
 */
interface AdminViewColumn {
    name: string;
    type: string;
    label?: string;
    hidden?: boolean;
    sortable?: boolean;
    filterable?: boolean;
    displayField?: string;
    badge?: boolean;
    badgeColor?: Record<string, string>;
    width?: string;
}
interface AdminView {
    id: string;
    type: string;
    title: string;
    table: string;
    columns: AdminViewColumn[];
    defaultSort?: {
        column: string;
        direction: "asc" | "desc";
    };
    filters?: Array<{
        field: string;
        type: string;
        label: string;
        options?: Array<{
            value: string;
            label: string;
        }>;
    }>;
    actions?: string[];
    groupBy?: string;
    cardFields?: string[];
    draggable?: boolean;
}
interface AdminConfig {
    name: string;
    singularName: string;
    icon: string;
    category: string;
    order: number;
    views: AdminView[];
    forms?: Record<string, any>;
    apiEndpoint: string;
}
export declare const adminConfig: AdminConfig;
export default adminConfig;
//# sourceMappingURL=academy.admin.d.ts.map