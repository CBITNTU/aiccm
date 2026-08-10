import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["__tests__/unit/**/*.test.ts"],
          setupFiles: ["__tests__/setup/unit.setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["__tests__/integration/**/*.test.ts"],
          setupFiles: ["__tests__/setup/integration.setup.ts"],
          globalSetup: "__tests__/setup/integration.global.ts",
          // Suites share one database — run files sequentially in a single
          // fork to avoid truncate races.
          pool: "forks",
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
