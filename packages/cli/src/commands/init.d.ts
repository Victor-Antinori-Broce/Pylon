export interface InitOptions {
    template?: string;
    mode?: 'vibecoder' | 'developer';
    database?: string;
    autoStart?: boolean;
    start?: boolean;
}
export declare function initCommand(name: string | undefined, options: InitOptions): Promise<void>;
//# sourceMappingURL=init.d.ts.map