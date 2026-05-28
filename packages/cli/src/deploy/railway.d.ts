/**
 * Railway Deploy Provider
 *
 * Deploys Gremius projects to Railway.app using the official CLI.
 * Supports both Nixpacks auto-detection and Dockerfile builds.
 */
interface RailwayDeployOptions {
    preview?: boolean;
    prod?: boolean;
    region?: string;
}
export interface RailwayDeployResult {
    success: boolean;
    url?: string | null;
}
export declare function deployToRailway(projectRoot: string, options: RailwayDeployOptions): Promise<RailwayDeployResult>;
export {};
//# sourceMappingURL=railway.d.ts.map