/**
 * Region-aware production migration.
 *
 *   node scripts/migrate.mjs <uk|cn> --prod
 *
 * Pulls the region's PRODUCTION env from its Vercel project (single source of
 * truth), extracts DATABASE_URL, and runs `drizzle-kit migrate` against it.
 *
 * This replaces the old habit of commenting/uncommenting the prod DATABASE_URL in
 * .env.local. Because dotenv's config() does NOT override an already-set env var,
 * the DATABASE_URL we pass here wins over the one drizzle.config.ts reads from
 * .env.local — so no config change is needed.
 *
 * Requires typing the region id to confirm before applying.
 */
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { readFileSync, rmSync } from "node:fs";
import { parse } from "dotenv";
import { resolveTarget } from "./deploy-targets.mjs";

async function prompt(question) {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

function maskDbUrl(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

async function main() {
  const args = process.argv.slice(2);
  const prod = args.includes("--prod");
  const region = args.find((a) => !a.startsWith("--"));
  const target = resolveTarget(region);

  if (!prod) {
    console.error(
      "migrate.mjs targets a REMOTE production DB and requires --prod.\n" +
        "For your local database use `npm run db:migrate` instead.",
    );
    process.exit(1);
  }

  const envFile = `.vercel/.env.${target.id}.production.local`;
  const vercelEnv = {
    ...process.env,
    VERCEL_ORG_ID: target.vercelOrgId,
    VERCEL_PROJECT_ID: target.vercelProjectId,
  };

  try {
    console.log(`\nPulling production env for ${target.label} from Vercel…`);
    const pull = spawnSync(
      "vercel",
      ["env", "pull", "--environment=production", "--yes", envFile],
      { stdio: "inherit", env: vercelEnv },
    );
    if (pull.error) {
      console.error("Failed to run vercel:", pull.error.message);
      console.error("Is the Vercel CLI installed and are you logged in? (`vercel login`)");
      process.exit(1);
    }
    if (pull.status !== 0) process.exit(pull.status ?? 1);

    const parsed = parse(readFileSync(envFile, "utf8"));
    const databaseUrl = parsed.DATABASE_URL;
    if (!databaseUrl) {
      console.error(
        `No DATABASE_URL found in the pulled production env for "${target.id}".\n` +
          `Set it on the ${target.vercelProjectName} Vercel project first.`,
      );
      process.exit(1);
    }

    console.log("\n=== Production Migration ===");
    console.log(`  Region:   ${target.label} (${target.id})`);
    console.log(`  Project:  ${target.vercelProjectName}`);
    console.log(`  Database: ${maskDbUrl(databaseUrl)}`);
    console.log("");

    const answer = await prompt(
      `This applies migrations to the ${target.label} PRODUCTION database. Type "${target.id}" to confirm: `,
    );
    if (answer !== target.id) {
      console.log("Aborted — confirmation did not match.");
      process.exit(1);
    }

    console.log("\n> drizzle-kit migrate\n");
    const migrate = spawnSync("npx", ["drizzle-kit", "migrate"], {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    if (migrate.error) {
      console.error("Failed to run drizzle-kit:", migrate.error.message);
      process.exit(1);
    }
    process.exitCode = migrate.status ?? 1;
  } finally {
    // The pulled file holds live secrets. It's gitignored, but remove it anyway.
    rmSync(envFile, { force: true });
  }
}

main();
