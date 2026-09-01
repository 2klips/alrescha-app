import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

import noHardcodedHex from "./tools/eslint-rules/no-hardcoded-hex.js";
import {
  noAdhocFontSize,
  noAdhocRadius,
} from "./tools/eslint-rules/no-adhoc-scale.js";

const alreschaPlugin = {
  rules: {
    "no-hardcoded-hex": noHardcodedHex,
    "no-adhoc-font-size": noAdhocFontSize,
    "no-adhoc-radius": noAdhocRadius,
  },
};

export default tseslint.config(
  {
    ignores: [
      "**/.next/**",
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/playwright-report/**",
      "**/test-results/**",
      // Supabase CLI runtime scratch — vendored Deno bundles, not our source.
      "supabase/.temp/**",
      // Claude Code session scratch: .claude/worktrees holds full working-tree
      // copies (git-excluded via .git/info/exclude, which ESLint cannot see) —
      // linting them double-parses every file against ambiguous tsconfig roots.
      ".claude/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // Ink & Seal (ADR-009-3): colours live only in app/styles/tokens.css.
    files: ["apps/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}"],
    plugins: { alrescha: alreschaPlugin },
    rules: {
      "alrescha/no-hardcoded-hex": "error",
      // Design roadmap step 3 (P7): inline styles must use the scale tokens.
      "alrescha/no-adhoc-font-size": "error",
      "alrescha/no-adhoc-radius": "error",
    },
  },
);
