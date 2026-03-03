import type { Component } from 'vue';

export interface ViewType {
    type: string;
    label: string;
    icon: Component;
    component: Component;
}

class ViewRegistry {
    private views = new Map<string, ViewType>();

    register(type: string, label: string, icon: Component, component: Component) {
        this.views.set(type, { type, label, icon, component });
    }

    get(type: string): ViewType | undefined {
        return this.views.get(type);
    }

    getAll(): ViewType[] {
        return Array.from(this.views.values());
    }
}

export const viewRegistry = new ViewRegistry();
