/**
 * ESLint rules to enforce event logging
 * Add this to your main ESLint config
 */
module.exports = {
  rules: {
    // Warn when API routes don't use withEventLogging or logApiEvent
    "no-restricted-imports": [
      "warn",
      {
        patterns: [
          {
            group: ["app/api/**/route.ts"],
            message:
              "API routes should use withEventLogging wrapper or manually call logApiEvent. See lib/middleware/withEventLogging.ts",
          },
        ],
      },
    ],
  },
};
