/**
 * Auth Store (Svelte 5 Runes)
 *
 * Manages session state for the Admin Panel.
 * Uses Better-Auth's cookie-based sessions via fetch.
 */
export interface AuthUser {
    id: string;
    name: string;
    email: string;
    image?: string | null;
    role: string;
}
export declare function getUser(): AuthUser | null;
export declare function getLoading(): boolean;
export declare function getError(): string | null;
export declare function getChecked(): boolean;
export declare function isLoggedIn(): boolean;
export declare function isAdmin(): boolean;
export declare function isInitialized(): boolean;
/**
 * Check if the system is initialized (has at least one user)
 */
export declare function checkInit(): Promise<void>;
/**
 * Check current session (cookie-based)
 */
export declare function checkSession(): Promise<void>;
/**
 * Sign in with email + password
 */
export declare function signIn(email: string, password: string): Promise<any>;
/**
 * Sign out
 */
export declare function signOut(): Promise<void>;
//# sourceMappingURL=auth.svelte.d.ts.map