/**
 * GremiusCMS — Theme Engine Composable
 *
 * Reads the active theme's config (theme.json / gremius.json) from the API
 * and injects CSS custom properties into :root, compatible with Tailwind's
 * gremius-* token system.
 *
 * The engine maps theme JSON color values to both:
 *   1. CSS Custom Properties (--gremius-color-primary, etc.)
 *   2. Overrides for existing --gremius-* vars used by Tailwind
 *
 * Also exposes logo paths and theme metadata for use in sidebar/login.
 */

import { ref, readonly } from 'vue';
import { useApi } from './useApi';

export interface ThemeConfig {
  id: string;
  name: string;
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    surface?: string;
    card?: string;
    text?: string;
    textDim?: string;
    border?: string;
    success?: string;
    warning?: string;
    error?: string;
    info?: string;
  };
  logos?: {
    sidebar?: string;   // URL or path
    login?: string;
    favicon?: string;
  };
  fonts?: {
    display?: string;
    body?: string;
    mono?: string;
  };
  meta?: Record<string, unknown>;
}

// Singleton state
const themeConfig = ref<ThemeConfig | null>(null);
const themeLoaded = ref(false);
const themeError = ref<string | null>(null);

/**
 * Maps ThemeConfig color keys to CSS custom property names.
 * These override the variables that Tailwind/gremius-* tokens consume.
 */
const COLOR_VAR_MAP: Record<string, string[]> = {
  primary:    ['--gremius-cyan', '--gremius-color-primary'],
  secondary:  ['--gremius-pink', '--gremius-color-secondary'],
  accent:     ['--gremius-purple', '--gremius-color-accent'],
  background: ['--gremius-bg', '--gremius-color-bg'],
  surface:    ['--gremius-surface', '--gremius-color-surface'],
  card:       ['--gremius-card', '--gremius-color-card'],
  text:       ['--gremius-text', '--gremius-color-text'],
  textDim:    ['--gremius-text-dim', '--gremius-color-text-dim'],
  border:     ['--gremius-border', '--gremius-color-border'],
  success:    ['--gremius-green', '--gremius-success'],
  warning:    ['--gremius-amber', '--gremius-warning'],
  error:      ['--gremius-pink', '--gremius-error'],
  info:       ['--gremius-info'],
};

const FONT_VAR_MAP: Record<string, string> = {
  display: '--font-display',
  body:    '--font-body',
  mono:    '--font-mono',
};

/**
 * Inject CSS custom properties into :root
 */
function applyThemeToDOM(config: ThemeConfig): void {
  const root = document.documentElement;

  // Apply colors
  if (config.colors) {
    for (const [key, value] of Object.entries(config.colors)) {
      if (!value) continue;
      const vars = COLOR_VAR_MAP[key];
      if (vars) {
        for (const varName of vars) {
          root.style.setProperty(varName, value);
        }
      }
      // Always set the generic --gremius-color-{key}
      root.style.setProperty(`--gremius-color-${key}`, value);
    }
  }

  // Apply fonts
  if (config.fonts) {
    for (const [key, value] of Object.entries(config.fonts)) {
      if (!value) continue;
      const varName = FONT_VAR_MAP[key];
      if (varName) {
        root.style.setProperty(varName, value);
      }
    }
  }

  // Set theme ID as data attribute for CSS selectors
  root.dataset.gremiusTheme = config.id;
}

/**
 * Remove all injected theme properties
 */
function clearThemeFromDOM(): void {
  const root = document.documentElement;
  for (const vars of Object.values(COLOR_VAR_MAP)) {
    for (const varName of vars) {
      root.style.removeProperty(varName);
    }
  }
  for (const varName of Object.values(FONT_VAR_MAP)) {
    root.style.removeProperty(varName);
  }
  delete root.dataset.gremiusTheme;
}

export function useThemeEngine() {
  const api = useApi();

  /**
   * Load the active theme configuration from the API and apply it.
   */
  async function loadTheme(): Promise<void> {
    if (themeLoaded.value) return;

    try {
      // Fetch active theme config — the API returns the parsed gremius.json
      // plus any runtime overrides from siteSettings.branding
      const res = await api.get<{
        theme: ThemeConfig | null;
        branding?: Record<string, string>;
      }>('/system/active-theme-config');

      if (res.theme) {
        // Merge branding overrides from site settings
        if (res.branding) {
          if (!res.theme.colors) res.theme.colors = {};
          if (res.branding.primaryColor) res.theme.colors.primary = res.branding.primaryColor;
          if (res.branding.accentColor) res.theme.colors.accent = res.branding.accentColor;
          if (!res.theme.logos) res.theme.logos = {};
          if (res.branding.logoId) res.theme.logos.sidebar = `/api/media/${res.branding.logoId}/url`;
        }

        themeConfig.value = res.theme;
        applyThemeToDOM(res.theme);
      }

      themeLoaded.value = true;
    } catch (err: any) {
      themeError.value = err.message;
      console.warn('[ThemeEngine] Failed to load theme config:', err.message);
      themeLoaded.value = true; // Don't retry
    }
  }

  /**
   * Hot-apply a theme config (for preview/editor use).
   */
  function previewTheme(config: ThemeConfig): void {
    applyThemeToDOM(config);
  }

  /**
   * Reset to default (remove overrides).
   */
  function resetTheme(): void {
    clearThemeFromDOM();
    themeConfig.value = null;
    themeLoaded.value = false;
  }

  return {
    themeConfig: readonly(themeConfig),
    themeLoaded: readonly(themeLoaded),
    themeError: readonly(themeError),
    loadTheme,
    previewTheme,
    resetTheme,
  };
}
