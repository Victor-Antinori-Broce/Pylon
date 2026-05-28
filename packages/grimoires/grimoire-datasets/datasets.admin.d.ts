/**
 * DataSets Admin Configuration
 *
 * Core grimoire admin config for DataSets management.
 * Positioned first in the sidebar (order: 0).
 */
interface AdminViewColumn {
    name: string;
    type: string;
    label?: string;
    hidden?: boolean;
    sortable?: boolean;
    filterable?: boolean;
    displayField?: string;
    badgeColor?: Record<string, string>;
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
    actions?: string[];
    bulkActions?: Array<{
        id: string;
        label: string;
        icon: string;
        confirm?: string;
        refresh?: boolean;
    }>;
    filters?: Array<{
        field: string;
        type: string;
        label: string;
        options?: string[];
        table?: string;
    }>;
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
export declare const sidebarConfig: {
    id: string;
    label: string;
    icon: string;
    href: string;
    order: number;
    category: string;
    badge: {
        text: string;
        variant: string;
    };
};
export default adminConfig;
//# sourceMappingURL=datasets.admin.d.ts.map