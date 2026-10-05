/**
 * Kitsuden ESLint Configuration — Flat Config (ESLint v9)
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
      "**/.venv*/**",
      "packages/admin/.venv-admin/**",
      "**/tmp_*.py",
      // Salida del bundler que queda suelta en el arbol (esta en .gitignore,
      // pero el flat config de ESLint NO lee .gitignore). Son ficheros de una
      // sola linea de hasta 8 MB: al lintarlos, la cache de resultados se
      // serializa y revienta con `RangeError: Invalid string length`, asi que
      // `pnpm lint` —y con el `pnpm qa`— no terminaba nunca en local.
      "**/tmp_build_*/**",
      "**/tserrors-*.txt",
      "**/build-diag*.txt",
      "**/kitsuden_progress.txt",
      "**/progress.txt",
      "**/tmp_labels.txt",
      "**/null",
      "**/api.err",
      "**/api.log",
      "**/*.test-results.*",
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
      // `x != null` es el idioma para "ni null ni undefined" y se usa a
      // propósito en todo el repo. Marcarlo empuja a "arreglarlo" a `!== null`,
      // que deja pasar `undefined` — o sea, la regla estaba generando bugs en
      // vez de evitarlos. Con `null: "ignore"` se sigue persiguiendo el `==`
      // de verdad, que es el que escondía el fallo de los filtros de datasets.
      eqeqeq: ["warn", "always", { null: "ignore" }],
      // Los espacios de ancho cero que hay por el repo NO son basura pegada:
      // están dentro de JSDoc, y sirven para escribir un `*` seguido de `/`
      // dentro del propio comentario sin cerrarlo. Es la única forma de
      // documentar un glob como `packages/core/*​/migrations` o de citar
      // `import(/* @vite-ignore *​/ ...)`. Quitarlos rompería el comentario;
      // por eso se salta el chequeo AHÍ y solo ahí — en código real, un espacio
      // irregular sigue siendo un error.
      "no-irregular-whitespace": ["error", { skipComments: true }],
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

  // ── Scripts, CLI y runners de test ──
  // `console` es la interfaz de usuario aquí (no logging de servidor), así que
  // la regla no aplica: CLI imprime a stdout por diseño, los scripts de codegen
  // reportan su progreso y los runners caseros (pre-bun:test) muestran results.
  //
  // Se añaden las semillas y el arnés de tests por la misma razón: se invocan a
  // mano desde una terminal y su salida la lee una persona. Pasarlas por pino
  // convertiría "✅ 12 usuarios creados" en una línea de JSON.
  //
  // Lo que NO entra aquí es el código que corre POR PETICIÓN o POR JOB. Ahí
  // `console.log` sí es un defecto: la línea sale sin `trace_id` ni
  // `request_id`, así que no se puede correlacionar con nada y el logging
  // estructurado que monta `accessLogAndMetrics` deja de servir justo cuando
  // hace falta. Esos van al logger.
  {
    files: [
      "**/scripts/**",
      "**/migrations/**",
      "packages/cli/**",
      "**/test-*.ts",
      "**/*.test.ts",
      "**/db/seed*.ts",
      "apps/api/src/tests/**",
    ],
    rules: {
      "no-console": "off",
    },
  },

  // ── Prettier must be last ──
  prettier
);
