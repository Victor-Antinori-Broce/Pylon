import type { Component } from 'vue';

export interface UiComponent {
    id: string;
    component: Component;
    order: number;
}

class UiRegistry {
    private locations = new Map<string, UiComponent[]>();

    register(location: string, id: string, component: Component, order = 0) {
        if (!this.locations.has(location)) {
            this.locations.set(location, []);
        }
        const list = this.locations.get(location)!;
        list.push({ id, component, order });
        // Sort by order descending (higher order = top/first)
        list.sort((a, b) => b.order - a.order);
    }

    get(location: string): UiComponent[] {
        return this.locations.get(location) || [];
    }
}

export const uiRegistry = new UiRegistry();
