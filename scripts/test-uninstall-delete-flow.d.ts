#!/usr/bin/env bun
/**
 * Test del flujo completo: Uninstall → Recover → Delete
 */
declare const db: {
    modules: any[];
    tables: Record<string, any[]>;
};
declare function printState(label: string): void;
declare function test1_uninstall(): boolean;
declare function test2_listUninstalled(): boolean;
declare function test3_recover(): boolean;
declare function test4_deletePermanent(): boolean;
declare function test5_errorDirectDelete(): boolean;
//# sourceMappingURL=test-uninstall-delete-flow.d.ts.map