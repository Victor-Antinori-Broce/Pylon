/**
 * Theme Engine (Svelte 5 Runes)
 * Loads and applies active theme CSS variables
 */
interface ThemeConfig {
    id: string;
    name: string;
    description: string;
    preview: string;
    primary?: string;
    secondary?: string;
    accent?: string;
    cssVars?: Record<string, string>;
}
export declare const themes: ThemeConfig[];
export declare const currentTheme: import("svelte/store").Writable<string>;
export declare function getThemeLoaded(): boolean;
export declare function loadTheme(): Promise<void>;
export declare function setTheme(themeId: string): void;
export {};
//# sourceMappingURL=theme.svelte.d.ts.map