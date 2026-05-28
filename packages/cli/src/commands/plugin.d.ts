/**
 * PLUGIN Command - Manage grimoire plugins
 */
interface InstallOptions {
    version?: string;
    source?: string;
    save?: boolean;
    enable?: boolean;
}
export declare function install(packageName: string, options: InstallOptions): Promise<void>;
interface UninstallOptions {
    purge?: boolean;
}
export declare function uninstall(packageName: string, options: UninstallOptions): Promise<void>;
interface ListOptions {
    all?: boolean;
    json?: boolean;
}
export declare function list(options: ListOptions): Promise<void>;
interface SearchOptions {
    limit?: string;
}
export declare function search(query: string, options: SearchOptions): Promise<void>;
export declare function enable(packageName: string): Promise<void>;
export declare function disable(packageName: string): Promise<void>;
interface UpdateOptions {
    all?: boolean;
}
export declare function update(packageName: string | undefined, options: UpdateOptions): Promise<void>;
export declare const pluginCommand: {
    install: typeof install;
    uninstall: typeof uninstall;
    list: typeof list;
    search: typeof search;
    enable: typeof enable;
    disable: typeof disable;
    update: typeof update;
};
export {};
//# sourceMappingURL=plugin.d.ts.map