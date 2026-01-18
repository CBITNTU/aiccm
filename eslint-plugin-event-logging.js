/**
 * ESLint plugin to enforce event logging in API routes
 * Add this to your eslint.config.mjs
 */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce event logging in API route handlers",
      category: "Best Practices",
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      missingEventLogging:
        "API route handler should include event logging. Import 'logApiEvent' from '@/lib/services/eventLogger' and log events for success/error cases.",
    },
  },
  create(context) {
    return {
      // Check for exported async functions in route.ts files
      "ExportNamedDeclaration[declaration.type='FunctionDeclaration'][declaration.async=true]": function (
        node
      ) {
        const filename = context.getFilename();
        // Only check API route files
        if (!filename.includes("/api/") || !filename.endsWith("/route.ts")) {
          return;
        }

        const functionName = node.declaration.id?.name;
        // Check for POST, GET, PUT, DELETE, PATCH handlers
        if (!["POST", "GET", "PUT", "DELETE", "PATCH"].includes(functionName)) {
          return;
        }

        const sourceCode = context.getSourceCode();
        const functionBody = node.declaration.body;
        const functionText = sourceCode.getText(functionBody);

        // Check if logApiEvent is imported
        const imports = sourceCode.ast.body.filter(
          (n) => n.type === "ImportDeclaration"
        );
        const hasLogApiEventImport = imports.some(
          (imp) =>
            imp.source.value === "@/lib/services/eventLogger" &&
            imp.specifiers.some(
              (spec) =>
                spec.type === "ImportSpecifier" &&
                spec.imported.name === "logApiEvent"
            )
        );

        // Check if logApiEvent is called in the function
        const hasLogApiEventCall = functionText.includes("logApiEvent");

        // Warn if missing
        if (!hasLogApiEventImport || !hasLogApiEventCall) {
          context.report({
            node: node.declaration,
            messageId: "missingEventLogging",
          });
        }
      },
    };
  },
};
