import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

import noHardcodedHex from "./tools/eslint-rules/no-hardcoded-hex.js";

const arrPlugin = {
  rules: { "no-hardcoded-hex": noHardcodedHex },
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
    plugins: { arr: arrPlugin },
    rules: {
      "arr/no-hardcoded-hex": "error",
    },
  },
);
