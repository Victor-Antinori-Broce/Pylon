#!/usr/bin/env bun
/**
 * Script de prueba para flujos de eliminación de realms y grimoires
 */
declare const db: {
    siteSettings: {
        activeTheme: string | null;
    };
    modules: any[];
    realms: {
        id: string;
        name: string;
        grimoires: string[];
    }[];
};
declare function printDBState(): void;
declare function test1_DeleteRealmKeepGrimoires(): boolean;
declare function test2_DeleteRealmAndGrimoires(): boolean;
declare function test3_DeleteIndividualGrimoire(): boolean;
declare function test4_ErrorDeleteActiveRealm(): boolean;
declare function test5_MigrateGrimoires(): boolean;
//# sourceMappingURL=test-realm-deletion-flows.d.ts.map