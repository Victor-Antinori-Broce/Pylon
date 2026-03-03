/**
 * Theme Engine (Svelte 5 Runes)
 * Loads and applies active theme CSS variables
 */

import { writable } from "svelte/store";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

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

// Default themes
export const themes: ThemeConfig[] = [
  {
    id: "mocha",
    name: "Mocha (Dark)",
    description: "Deep elegant dark mode",
    preview: "linear-gradient(135deg, #1e1e2e, #cba6f7)",
    cssVars: {
      "--gremius-primary": "137 180 250",
      "--gremius-cyan": "137 180 250",
      "--gremius-secondary": "243 139 168",
      "--gremius-pink": "243 139 168",
      "--gremius-accent": "203 166 247",
      "--gremius-purple": "203 166 247",

      "--gremius-bg": "17 17 27",
      "--gremius-card": "24 24 37",
      "--gremius-surface": "30 30 46",
      "--gremius-border": "49 50 68",
      "--gremius-muted": "69 71 90",
      "--gremius-subtle": "88 91 112",
      "--gremius-text": "205 214 244",
      "--gremius-text-dim": "166 173 200",
      "--gremius-green": "166 227 161",
      "--gremius-amber": "249 226 175",
    }
  },
  {
    id: "latte",
    name: "Latte (Light)",
    description: "Warm soothing light mode",
    preview: "linear-gradient(135deg, #eff1f5, #8839ef)",
    cssVars: {
      "--gremius-primary": "30 102 245",
      "--gremius-cyan": "30 102 245",
      "--gremius-secondary": "210 15 57",
      "--gremius-pink": "210 15 57",
      "--gremius-accent": "136 57 239",
      "--gremius-purple": "136 57 239",

      "--gremius-bg": "239 241 245",
      "--gremius-card": "255 255 255",
      "--gremius-surface": "230 233 239",
      "--gremius-border": "188 192 204",
      "--gremius-muted": "172 176 190",
      "--gremius-subtle": "140 143 161",
      "--gremius-text": "76 79 105",
      "--gremius-text-dim": "92 95 119",
      "--gremius-green": "64 160 43",
      "--gremius-amber": "223 142 29",
    }
  }
];

// Current theme store
export const currentTheme = writable<string>("mocha");

let themeLoaded = $state(false);

export function getThemeLoaded() {
  return themeLoaded;
}

export async function loadTheme() {
  try {
    // Load from localStorage (no API call needed)
    const saved = localStorage.getItem("gremius-theme");
    if (saved) {
      const theme = themes.find(t => t.id === saved);
      if (theme) {
        applyTheme(theme);
        currentTheme.set(saved);
      }
    }
  } catch {
    // localStorage not available — use default (already in CSS)
  } finally {
    themeLoaded = true;
  }
}

export function setTheme(themeId: string) {
  const theme = themes.find(t => t.id === themeId);
  if (theme) {
    applyTheme(theme);
    currentTheme.set(themeId);
    localStorage.setItem("gremius-theme", themeId);
  }
}

function applyTheme(theme: Partial<ThemeConfig>) {
  const root = document.documentElement;

  if (theme.cssVars) {
    for (const [key, value] of Object.entries(theme.cssVars)) {
      root.style.setProperty(key, value);
    }
  }

  if (theme.primary) {
    root.style.setProperty("--gremius-primary", theme.primary);
    root.style.setProperty("--gremius-cyan", theme.primary);
  }

  if (theme.secondary) {
    root.style.setProperty("--gremius-secondary", theme.secondary);
    root.style.setProperty("--gremius-pink", theme.secondary);
  }

  if (theme.accent) {
    root.style.setProperty("--gremius-accent", theme.accent);
    root.style.setProperty("--gremius-purple", theme.accent);
  }
}
