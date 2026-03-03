/**
 * GremiusCMS — Plugin Registry
 *
 * Central hub for module extensibility in the Admin panel.
 * Modules can register:
 *   1. Widgets  → rendered in named slots (e.g., "dashboard:top", "sidebar:bottom")
 *   2. Routes   → dynamic Vue Router routes injected at runtime
 *   3. Blocks   → custom content blocks for the editor (extends BLOCK_REGISTRY)
 *   4. Actions  → toolbar/context-menu actions
 *
 * Uses a singleton pattern. Modules call `pluginRegistry.register(...)` at startup
 * (typically in main.ts or via a plugin install function).
 *
 * Example:
 *   pluginRegistry.registerWidget({
 *     slot: 'dashboard:top',
 *     id: 'gremio-tournaments-widget',
 *     component: TournamentsWidget,
 *     order: 10,
 *     module: 'tournaments',
 *   });
 */

import type { Component } from 'vue';
import type { RouteRecordRaw } from 'vue-router';
import type { BlockDefinition } from '../types/blocks';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface PluginWidget {
  /** Unique identifier */
  id: string;
  /** Named slot where this widget renders (e.g., "dashboard:top") */
  slot: string;
  /** The Vue component to render */
  component: Component;
  /** Sort order within the slot (higher = rendered first) */
  order: number;
  /** Module key (for filtering when modules are toggled) */
  module?: string;
  /** Props to pass to the component */
  props?: Record<string, unknown>;
}

export interface PluginRoute {
  /** Module that owns this route */
  module: string;
  /** Vue Router route definition */
  route: RouteRecordRaw;
  /** If true, wraps inside the SidebarLayout */
  authenticated?: boolean;
}

export interface PluginAction {
  id: string;
  label: string;
  icon?: Component;
  handler: () => void | Promise<void>;
  /** Where this action appears */
  location: 'toolbar' | 'context-menu' | 'bulk-actions';
  module?: string;
  order?: number;
}

export type PluginBlockDefinition = BlockDefinition & {
  /** Module that registered this block */
  module?: string;
};

// ═══════════════════════════════════════════════════════════════
// Registry Implementation
// ═══════════════════════════════════════════════════════════════

class PluginRegistry {
  private widgets = new Map<string, PluginWidget[]>(); // slot → widgets[]
  private routes: PluginRoute[] = [];
  private actions: PluginAction[] = [];
  private blocks: PluginBlockDefinition[] = [];
  private enabledModules = new Set<string>();

  // ─── Module Awareness ─────────────────────────────────────

  /**
   * Sync enabled modules from the ModulesStore.
   * Call this after modules are loaded.
   */
  setEnabledModules(keys: Set<string> | string[]): void {
    this.enabledModules = new Set(keys);
  }

  private isModuleActive(module?: string): boolean {
    if (!module) return true; // No module requirement = always visible
    return this.enabledModules.has(module);
  }

  // ─── Widgets ──────────────────────────────────────────────

  registerWidget(widget: PluginWidget): void {
    const { slot } = widget;
    if (!this.widgets.has(slot)) {
      this.widgets.set(slot, []);
    }
    const list = this.widgets.get(slot)!;

    // Prevent duplicate IDs in same slot
    const existing = list.findIndex((w) => w.id === widget.id);
    if (existing >= 0) {
      list[existing] = widget;
    } else {
      list.push(widget);
    }

    // Sort by order descending (higher order = first)
    list.sort((a, b) => b.order - a.order);
  }

  getWidgets(slot: string): PluginWidget[] {
    const all = this.widgets.get(slot) || [];
    return all.filter((w) => this.isModuleActive(w.module));
  }

  getAllSlots(): string[] {
    return Array.from(this.widgets.keys());
  }

  // ─── Routes ───────────────────────────────────────────────

  registerRoute(pluginRoute: PluginRoute): void {
    // Prevent duplicate routes
    const exists = this.routes.some(
      (r) => r.route.path === pluginRoute.route.path && r.module === pluginRoute.module
    );
    if (!exists) {
      this.routes.push(pluginRoute);
    }
  }

  getRoutes(authenticated = true): PluginRoute[] {
    return this.routes
      .filter((r) => this.isModuleActive(r.module))
      .filter((r) => r.authenticated === authenticated);
  }

  // ─── Blocks ───────────────────────────────────────────────

  registerBlock(block: PluginBlockDefinition): void {
    const existing = this.blocks.findIndex((b) => b.type === block.type);
    if (existing >= 0) {
      this.blocks[existing] = block;
    } else {
      this.blocks.push(block);
    }
  }

  getBlocks(): PluginBlockDefinition[] {
    return this.blocks.filter((b) => this.isModuleActive(b.module));
  }

  // ─── Actions ──────────────────────────────────────────────

  registerAction(action: PluginAction): void {
    const existing = this.actions.findIndex((a) => a.id === action.id);
    if (existing >= 0) {
      this.actions[existing] = action;
    } else {
      this.actions.push(action);
    }
    this.actions.sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
  }

  getActions(location: PluginAction['location']): PluginAction[] {
    return this.actions
      .filter((a) => a.location === location)
      .filter((a) => this.isModuleActive(a.module));
  }

  // ─── Cleanup ──────────────────────────────────────────────

  /**
   * Remove all registrations from a specific module.
   */
  unregisterModule(moduleKey: string): void {
    // Widgets
    for (const [slot, widgets] of this.widgets) {
      this.widgets.set(slot, widgets.filter((w) => w.module !== moduleKey));
    }
    // Routes
    this.routes = this.routes.filter((r) => r.module !== moduleKey);
    // Blocks
    this.blocks = this.blocks.filter((b) => b.module !== moduleKey);
    // Actions
    this.actions = this.actions.filter((a) => a.module !== moduleKey);
  }
}

// Singleton
export const pluginRegistry = new PluginRegistry();
