import { config } from "dotenv";
import { Client } from "pg";
import { spawnSync } from "node:child_process";

config({ path: ".env.local" });

function isLikelyLocalDatabase(urlString) {
  try {
    const { hostname } = new URL(urlString);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function runCommand(commandString) {
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
    console.error(`Command failed: ${commandString}`);
    process.exit(result.status ?? 1);
  }
}

async function resetPublicSchema(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });

  await client.connect();

  await client.query(`
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO postgres;
    GRANT ALL ON SCHEMA public TO public;
  `);

  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'GRANT USAGE ON SCHEMA public TO anon';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'GRANT USAGE ON SCHEMA public TO authenticated';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'GRANT USAGE ON SCHEMA public TO service_role';
      END IF;
    END $$;
  `);

  await client.end();
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("DATABASE_URL is missing. Check .env.local.");
    process.exit(1);
  }

  const forceReset = process.env.FORCE_LOCAL_DB_RESET === "true";
  if (!isLikelyLocalDatabase(databaseUrl) && !forceReset) {
    console.error("Refusing to reset a non-local database.");
    console.error(
      "Set FORCE_LOCAL_DB_RESET=true only if you intentionally want this destructive operation.",
    );
    process.exit(1);
  }

  console.log("Resetting local public schema for Drizzle baseline migration...");
  console.log("Warning: this is destructive and should only be used for local development.");
  console.log("Note: avoid mixing `supabase db push` and `drizzle-kit migrate` on the same local DB lifecycle.");

  await resetPublicSchema(databaseUrl);

  runCommand("npm run db:migrate");
}

main().catch((error) => {
  console.error("Failed to reset and migrate local database.");
  console.error(error);
  process.exit(1);
});
