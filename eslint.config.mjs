import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Custom rules for event logging enforcement
  {
    files: ["app/api/**/route.ts"],
    rules: {
      // This is a placeholder - we'll add a custom rule
      // For now, we rely on code review and documentation
    },
  },
]);

export default eslintConfig;
