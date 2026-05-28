interface SdkOptions {
    lang?: string;
    output?: string;
    baseUrl?: string;
}
/**
 * Generate frontend SDK code from OpenAPI spec
 */
export declare function generateSdkCommand(options?: SdkOptions): Promise<void>;
export {};
//# sourceMappingURL=generate-sdk.d.ts.map