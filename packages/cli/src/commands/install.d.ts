interface InstallOptions {
    dev?: boolean;
    /** Internal: previene loops en dependencias circulares */
    _installChain?: Set<string>;
}
/**
 * Install a grimoire from npm and register it.
 *
 * Flow:
 *   1. Detect project root & package manager
 *   2. npm install <grimoireName>
 *   3. Read grimoire.json / package.json#gremius
 *   4. Recursively install grimoire dependencies (with cycle detection)
 *   5. Run SQL migrations
 *   6. Register in installed_grimoires table
 *   7. Update gremius.config.ts to enable it
 */
export declare function installCommand(grimoireName: string, options?: InstallOptions): Promise<void>;
export {};
//# sourceMappingURL=install.d.ts.map