/**
 * Interaction Store — lightweight cross-island state via CustomEvent + reactive ref.
 * Used for the dynamic background hover effect on the homepage.
 * No external deps needed — works with Astro's partial hydration model.
 */
let _current = null;
const EVENT_NAME = "gremius:bg-change";
/** Set the active background image URL (or null to clear). */
export function setActiveBackground(url) {
    _current = url;
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: url }));
    }
}
/** Get the current active background URL. */
export function getActiveBackground() {
    return _current;
}
/** Subscribe to background changes. Returns an unsubscribe function. */
export function onBackgroundChange(callback) {
    if (typeof window === "undefined")
        return () => { };
    const handler = (e) => callback(e.detail);
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
}
//# sourceMappingURL=interaction.js.map