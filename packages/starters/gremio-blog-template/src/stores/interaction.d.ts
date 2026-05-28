/**
 * Interaction Store — lightweight cross-island state via CustomEvent + reactive ref.
 * Used for the dynamic background hover effect on the homepage.
 * No external deps needed — works with Astro's partial hydration model.
 */
/** Set the active background image URL (or null to clear). */
export declare function setActiveBackground(url: string | null): void;
/** Get the current active background URL. */
export declare function getActiveBackground(): string | null;
/** Subscribe to background changes. Returns an unsubscribe function. */
export declare function onBackgroundChange(callback: (url: string | null) => void): () => void;
//# sourceMappingURL=interaction.d.ts.map