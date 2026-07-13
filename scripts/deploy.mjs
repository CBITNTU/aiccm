/**
 * Region-aware Vercel deploy.
 *
 *   node scripts/deploy.mjs <uk|cn> [--prod]
 *
 * Targets the region's Vercel project statelessly via VERCEL_ORG_ID /
 * VERCEL_PROJECT_ID (no re-linking, no mutation of .vercel/project.json).
 * DEPLOYMENT_PROFILE is NOT passed here — it lives in each Vercel project's env,
 * so the build resolves it automatically.
 *
 * Prod deploys require typing the region id to confirm.
 */
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { resolveTarget } from "./deploy-targets.mjs";

async function prompt(question) {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const prod = args.includes("--prod");
  const region = args.find((a) => !a.startsWith("--"));
  const target = resolveTarget(region);

  console.log("\n=== Vercel Deploy ===");
  console.log(`  Region:      ${target.label} (${target.id})`);
  console.log(`  Profile:     DEPLOYMENT_PROFILE=${target.profile} (set on the Vercel project)`);
  console.log(`  Project:     ${target.vercelProjectName} (${target.vercelProjectId})`);
  console.log(`  Environment: ${prod ? "PRODUCTION" : "preview"}`);
  console.log(`  Domain:      ${prod ? target.prodDomain : "(preview URL)"}`);
  console.log("");

  if (prod) {
    const answer = await prompt(
      `This deploys to PRODUCTION (${target.prodDomain}). Type "${target.id}" to confirm: `,
    );
    if (answer !== target.id) {
      console.log("Aborted — confirmation did not match.");
      process.exit(1);
    }
  } else {
    const answer = await prompt("Deploy a preview? [y/N]: ");
    if (answer.toLowerCase() !== "y") {
      console.log("Aborted.");
      process.exit(1);
    }
  }

  const vercelArgs = ["deploy", ...(prod ? ["--prod"] : []), "--yes"];
  console.log(`\n> vercel ${vercelArgs.join(" ")}\n`);

  const result = spawnSync("vercel", vercelArgs, {
    stdio: "inherit",
    env: {
      ...process.env,
      VERCEL_ORG_ID: target.vercelOrgId,
      VERCEL_PROJECT_ID: target.vercelProjectId,
    },
  });

  if (result.error) {
    console.error("Failed to run vercel:", result.error.message);
    console.error("Is the Vercel CLI installed and are you logged in? (`vercel login`)");
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

main();
