/**
 * DEV Command - Start development server
 */
interface DevOptions {
    port?: string;
    host?: string;
    apiOnly?: boolean;
    adminOnly?: boolean;
}
export declare function devCommand(options: DevOptions): Promise<void>;
export {};
//# sourceMappingURL=dev.d.ts.map