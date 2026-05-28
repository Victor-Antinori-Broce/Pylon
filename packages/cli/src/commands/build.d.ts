/**
 * BUILD Command - Build for production
 */
interface BuildOptions {
    analyze?: boolean;
    target?: string;
}
export declare function buildCommand(options: BuildOptions): Promise<void>;
export {};
//# sourceMappingURL=build.d.ts.map