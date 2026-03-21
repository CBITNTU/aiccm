import { spawnSync } from "node:child_process";

function run(commandString) {
  const result = spawnSync(commandString, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  if (result.error) {
    console.error(`Failed to run command: ${commandString}`);
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`Command failed with exit code ${result.status}: ${commandString}`);
    process.exit(result.status ?? 1);
  }
}

console.log("=== Reset & Seed Local Database ===\n");

run("node scripts/reset-local-db-for-drizzle.mjs");

// Use db:push instead of db:migrate as it reliably creates tables
// The reset script already runs db:migrate but it may not always apply
// db:push ensures the schema is synced directly
run("npm run db:push");

console.log("");

run("node scripts/seed-local-db.mjs");

console.log("\n=== Done! Database is fresh and seeded. ===");
