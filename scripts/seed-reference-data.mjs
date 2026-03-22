import { config } from "dotenv";
import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

config({ path: ".env.local" });

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_DIR = join(__dirname, "..", "drizzle", "seed");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    // Find all .sql files in drizzle/seed/, sorted by name (numeric prefix)
    const files = readdirSync(SEED_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    if (files.length === 0) {
      console.log("No seed files found in drizzle/seed/");
      return;
    }

    console.log(`Found ${files.length} seed file(s):\n`);

    await client.query("BEGIN");

    for (const file of files) {
      const filePath = join(SEED_DIR, file);
      const sql = readFileSync(filePath, "utf-8");

      console.log(`  Executing ${file}...`);
      await client.query(sql);
      console.log(`  ✓ ${file} done`);
    }

    await client.query("COMMIT");

    // Print summary counts
    console.log("\nSeed summary:");
    const tables = [
      "competency_taxonomy_seed",
      "company_capabilities_ref",
      "markets",
      "standards_ref",
    ];
    for (const table of tables) {
      try {
        const { rows } = await client.query(
          `SELECT count(*)::int AS count FROM ${table}`,
        );
        console.log(`  ${table}: ${rows[0].count} rows`);
      } catch {
        // Table may not exist yet
      }
    }

    console.log("\nReference data seeded successfully.");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Seed failed, rolled back:", error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
