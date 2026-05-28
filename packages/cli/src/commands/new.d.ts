/**
 * NEW Command - Create a new GremiusCMS project from a starter/realm
 *
 * Fase 3: CLI Mágica - Quickstart con rollback
 */
interface NewOptions {
    realm?: string;
    template?: string;
    grimoires?: string[];
    quickstart?: boolean;
    git?: boolean;
    install?: boolean;
    skipDb?: boolean;
}
export declare function newCommand(projectName: string, options: NewOptions): Promise<void>;
export {};
//# sourceMappingURL=new.d.ts.map