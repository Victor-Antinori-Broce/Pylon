/**
 * GremiusCMS — Central Configuration (Feature Flags + Grimoire Config)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CORE LAYER (Nivel 1): Infraestructura Apagable
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The `core` section controls 5 infrastructure pieces that shape data
 * but can be disabled to save resources for a pure database backend.
 *
 * - dataSets:        Always active (the spreadsheet panel)
 * - mediaLibrary:    File uploads to S3/MinIO
 * - pageBuilder:     Visual JSON block editor (scaffold)
 * - promoteToContent: SEO & URL modifier for content publishing
 * - webhooks:        Event-driven HTTP callbacks (n8n, Zapier, etc.)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * GRIMOIRE CONFIG (Nivel 2+): Business Modules
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The `modules` / `grimoires` section controls optional and realm-based
 * grimoires loaded by the module-loader at startup.
 *
 * @see packages/core/ for Core infrastructure code
 * @see packages/grimoires/ for business grimoire code
 */

// ═══════════════════════════════════════════════════════════════
// Core Feature Flag Types
// ═══════════════════════════════════════════════════════════════

export interface CoreFeatureFlag {
    /** Whether this core piece is active */
    enabled: boolean;
    /** If true, cannot be disabled (e.g., dataSets) */
    alwaysActive?: boolean;
}

export interface CoreConfig {
    dataSets: CoreFeatureFlag;
    mediaLibrary: CoreFeatureFlag;
    pageBuilder: CoreFeatureFlag;
    promoteToContent: CoreFeatureFlag;
    webhooks: CoreFeatureFlag;
}

export interface GremiusConfig {
    /** Core infrastructure feature flags (Nivel 1) */
    core: CoreConfig;
    /** @deprecated Use "grimoires" instead. "modules" is kept for backward compatibility. */
    modules: string[];
    /** New property for grimoire configuration */
    grimoires?: string[];
}

// ═══════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════

const config: GremiusConfig = {
    // ═══ NIVEL 1: THE CORE — Infraestructura Apagable ═══
    core: {
        dataSets: {
            enabled: true,
            alwaysActive: true, // Cannot be disabled — the foundation
        },
        mediaLibrary: {
            enabled: true,
        },
        pageBuilder: {
            enabled: true,
        },
        promoteToContent: {
            enabled: true,
        },
        webhooks: {
            enabled: true,
        },
    },

    // ═══ NIVEL 2+: GRIMOIRES — Business Modules ═══
    // Note: "promote" and "webhooks" have been ascended to Core.
    // They are no longer loaded as grimoires by the module-loader.
    modules: [
        // ═══ CORE GRIMOIRES (BaaS Pro features) ═══
        "connectors",   // External APIs and databases

        // ═══ OPTIONAL GRIMOIRES (Enterprise features) ═══
        "academy",      // LMS with courses and quizzes
        "booking",      // Room reservations
        "directory",    // Employee directory
        "dms",          // Document management
        "formulas",     // KPI formulas
        "blog",         // Blog posts (optional CMS feature)

        // "gremius-crm",  // CRM (init-only, no routes)
    ],
};

export default config;
