import { afterAll } from "vitest";
import { config } from "dotenv";

// Per-test-file setup for the integration project. Env must be loaded here
// too (globalSetup runs in a separate process).
config({ path: ".env.test", override: true, quiet: true });

afterAll(async () => {
  // Ending a pool that never opened a connection is a no-op, so this is safe
  // even for files that don't touch the DB.
  const { closeDb } = await import("@/lib/db");
  await closeDb();
});
