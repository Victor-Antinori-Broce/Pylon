/**
 * Media Library Admin Configuration
 *
 * Configures the admin panel for Media Library.
 */
interface GrimoireAdminConfig {
    views?: Array<{
        label: string;
        slug: string;
        icon?: string;
        defaultView?: boolean;
        component?: string;
    }>;
    category?: string;
    order?: number;
}
/**
 * Admin configuration for Media Library
 */
export declare const adminConfig: GrimoireAdminConfig;
export {};
//# sourceMappingURL=admin.d.ts.map