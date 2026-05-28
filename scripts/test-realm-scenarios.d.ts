#!/usr/bin/env bun
/**
 * Script de prueba para todos los escenarios de realm y grimoires
 */
declare const db: {
    siteSettings: {
        activeTheme: string | null;
    };
    modules: any[];
};
declare function getRealmGrimoires(realmId: string): string[];
declare function scenario1_ActivateRealm(): boolean;
declare function scenario2_DeactivateRealm(): boolean;
declare function scenario3_ToggleIndividual_Off(): boolean;
declare function scenario4_ToggleIndividual_On(): boolean;
declare function scenario5_SwitchRealm(): boolean;
//# sourceMappingURL=test-realm-scenarios.d.ts.map