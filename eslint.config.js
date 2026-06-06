/**
 * GremiusCMS ESLint Configuration — Flat Config (ESLint v9)
 * Style and code-quality only; type-checking is handled by `tsc --noEmit`.
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import unusedImports from "eslint-plugin-unused-imports";
import svelte from "eslint-plugin-svelte";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  // ── Ignored paths ──
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.svelte-kit/**",
      "**/drizzle/**",
      "**/*.config.*",
      "**/_legacy_*/**",
      "**/build/**",
      "**/coverage/**",
      "**/*.d.ts",
      "**/*.d.ts.map",
      "**/.claude/**",
      "**/.git/**",
      "**/*.json",
      "**/*.md",
      "**/*.log",
      "**/*.sql",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/*.min.js",
      "**/*.min.css",
      "**/*.svelte",
      "**/*.svelte.ts",
      "**/*.svelte.js",
      "**/*.bin",
      "packages/testing/diag.ts",
      "packages/cli/test-vibecoder-app/**",
    ],
  },

  // ── Base: recommended JS + TS (no type-checking) ──
  {
    files: ["**/*.{js,mjs,cjs,ts,svelte}"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.typescript,

  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2022,
        Bun: true,
        $state: true,
        $derived: true,
        $effect: true,
        $effect_pre: true,
        $props: true,
        $bindable: true,
        $inspect: true,
        $host: true,
      },
    },
    plugins: {
      "unused-imports": unusedImports,
    },
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: ["./tsconfig.json", "./apps/*/tsconfig.json", "./packages/*/tsconfig.json"],
        },
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-require-imports": "off",

      "import/order": [
        "warn",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "import/no-unresolved": "off",
      "import/no-cycle": "warn",
      "unused-imports/no-unused-imports": "warn",

      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      "no-debugger": "error",
      "prefer-const": "warn",
      "no-var": "error",
      "object-shorthand": "warn",
      eqeqeq: ["warn", "always"],
      "no-useless-escape": "off",
      "no-empty": "off",
      "no-case-declarations": "off",
      "import/export": "off",
      "no-async-promise-executor": "off",
      "no-duplicate-case": "off",
      "svelte/no-useless-children-snippet": "off",
    },
  },

  // ── Test files ──
  {
    files: ["**/*.test.ts", "**/*.spec.ts", "**/*.test.js", "**/*.spec.js"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
    },
  },

  // ── Scripts ──
  {
    files: ["**/scripts/**", "**/migrations/**"],
    rules: {
      "no-console": "off",
    },
  },

  // ── Prettier must be last ──
  prettier
);
