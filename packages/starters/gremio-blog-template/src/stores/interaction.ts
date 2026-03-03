/**
 * Interaction Store — lightweight cross-island state via CustomEvent + reactive ref.
 * Used for the dynamic background hover effect on the homepage.
 * No external deps needed — works with Astro's partial hydration model.
 */

let _current: string | null = null;
const EVENT_NAME = "gremius:bg-change";

/** Set the active background image URL (or null to clear). */
export function setActiveBackground(url: string | null) {
    _current = url;
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: url }));
    }
}

/** Get the current active background URL. */
export function getActiveBackground(): string | null {
    return _current;
}

/** Subscribe to background changes. Returns an unsubscribe function. */
export function onBackgroundChange(callback: (url: string | null) => void): () => void {
    if (typeof window === "undefined") return () => { };
    const handler = (e: Event) => callback((e as CustomEvent).detail);
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
}
