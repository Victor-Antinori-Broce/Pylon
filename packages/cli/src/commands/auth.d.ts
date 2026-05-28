/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUTH COMMAND — Zero-Config Social Auth Setup
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Usage:
 *   gremius auth add google --client-id xxx --client-secret yyy
 *   gremius auth add github --client-id xxx --client-secret yyy
 *   gremius auth add microsoft --client-id xxx --client-secret yyy --tenant common
 *   gremius auth list
 *   gremius auth remove google
 */
export declare function addProvider(providerId: string, options: Record<string, string | undefined>): Promise<void>;
export declare function listProviders(): Promise<void>;
export declare function removeProvider(providerId: string): Promise<void>;
//# sourceMappingURL=auth.d.ts.map