/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TEST EVENT TRACKING
 * ═══════════════════════════════════════════════════════════════════════════════
 */
/**
 * Create event tracker for testing
 */
export function createTestEvents() {
    const events = [];
    return {
        get all() {
            return [...events];
        },
        wasEmitted: (name, data) => {
            return events.some(e => {
                if (e.name !== name)
                    return false;
                if (!data)
                    return true;
                // Check if event data matches
                return Object.entries(data).every(([key, value]) => {
                    return e.data?.[key] === value;
                });
            });
        },
        last: (name) => {
            return [...events].reverse().find(e => e.name === name);
        },
        clear: () => {
            events.length = 0;
        }
    };
}
export default { createTestEvents };
//# sourceMappingURL=events.js.map