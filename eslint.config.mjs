import js from "@eslint/js";
import ts from "typescript-eslint";
import globals from "globals";
import hooks from "eslint-plugin-react-hooks";

export default ts.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "dist-api/**",
      "apps/web/.next/**",
      "apps/job-ingestion/**",
      "apps/company-discovery/**",
      "src/**",
      "tests/**",
      "scripts/**",
    ],
  },
  {
    files: [
      "apps/api/src/**/*.ts",
      "apps/web/src/**/*.ts",
      "apps/web/src/**/*.tsx",
      "packages/contracts/src/**/*.ts",
    ],
    extends: [js.configs.recommended, ...ts.configs.recommended],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    plugins: { "react-hooks": hooks },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
);
