/**
 * DEPLOY Command - Deploy to production
 */
export interface DeployOptions {
    preview?: boolean;
    prod?: boolean;
    region?: string;
    provider?: string;
    railway?: boolean;
    build?: boolean;
}
export declare function deployCommand(options: DeployOptions): Promise<void>;
//# sourceMappingURL=deploy.d.ts.map