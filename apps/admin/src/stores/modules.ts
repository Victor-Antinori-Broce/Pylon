/**
 * Modules Store
 * 
 * Estado de los módulos del sistema (reemplazo de Pinia)
 */
import type { Writable } from "svelte/store";

export interface Module {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  version?: string;
  category: "core" | "optional" | "theme";
  enabled: boolean;
  color?: string;
  themeId?: string;
  tables?: string[];
  dependsOn?: string[];
  requires_modules?: string[];
  optional_modules?: string[];
}

// Estado reactivo simple
let modules: Module[] = $state([]);
let loading = $state(false);

export function getModules() {
  return modules;
}

export function setModules(newModules: Module[]) {
  modules = newModules;
}

export function isModuleEnabled(key: string): boolean {
  return modules.find((m) => m.id === key)?.enabled ?? false;
}

export function getLoading() {
  return loading;
}

export function setLoading(value: boolean) {
  loading = value;
}
