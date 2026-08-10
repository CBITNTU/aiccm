import { execSync } from "node:child_process";
import { config } from "dotenv";
import { Client } from "pg";

/**
 * Global setup for the integration project. Runs once per `vitest run`:
 * 1. Loads .env.test (overriding any inherited DATABASE_URL).
 * 2. Refuses to run unless the target database name ends in `_test`.
 * 3. Creates the test database and the pgvector extension if missing.
 * 4. Pushes the current Drizzle schema into it.
 */
export default async function setup() {
  config({ path: ".env.test", override: true, quiet: true });

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set — check .env.test");
  }

  const parsed = new URL(url);
  const dbName = parsed.pathname.replace(/^\//, "");
  if (!dbName.endsWith("_test")) {
    throw new Error(
      `Refusing to run integration tests against database "${dbName}" — the database name must end in "_test" so real data can never be truncated.`,
    );
  }

  // Create the database if it doesn't exist (connect to the maintenance db).
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString() });
  try {
    await admin.connect();
  } catch (error) {
    throw new Error(
      `Could not connect to Postgres at ${adminUrl.host} — is the docker container running? (npm run docker:up)\n${String(error)}`,
    );
  }
  try {
    const exists = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName],
    );
    if (exists.rowCount === 0) {
      // Older docker volumes can carry a template1 collation-version mismatch
      // that makes CREATE DATABASE fail outright; refreshing is Postgres's
      // documented remedy and is a no-op when versions already match.
      await admin
        .query("ALTER DATABASE template1 REFRESH COLLATION VERSION")
        .catch(() => {});
      await admin.query(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await admin.end();
  }

  // The schema uses pgvector columns — the extension must exist before push.
  const testDb = new Client({ connectionString: url });
  await testDb.connect();
  try {
    await testDb.query("CREATE EXTENSION IF NOT EXISTS vector");
  } finally {
    await testDb.end();
  }

  // Sync schema. drizzle.config.ts loads .env.local without override, so the
  // DATABASE_URL passed here wins.
  execSync("npx drizzle-kit push --force", {
    stdio: "inherit",
    // DOTENV_CONFIG_QUIET keeps drizzle.config.ts's dotenv banner out of the
    // test output.
    env: { ...process.env, DATABASE_URL: url, DOTENV_CONFIG_QUIET: "true" },
  });
}
