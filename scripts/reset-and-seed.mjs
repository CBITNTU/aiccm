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
    console.error(
      `Command failed with exit code ${result.status}: ${commandString}`,
    );
    process.exit(result.status ?? 1);
  }
}

console.log("=== Reset & Seed Local Database ===\n");

run("node scripts/reset-local-db-for-drizzle.mjs");

console.log("");

run("node scripts/seed-local-db.mjs");

console.log("");

run("node scripts/seed-reference-data.mjs");

console.log("\n=== Done! Database is fresh and seeded. ===");
