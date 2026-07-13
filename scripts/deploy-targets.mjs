/**
 * Per-region deployment targets. Non-secret metadata only — imported by
 * `scripts/deploy.mjs` and `scripts/migrate.mjs`.
 *
 * The actual secrets (DATABASE_URL, BETTER_AUTH_SECRET, …) live in each Vercel
 * project's env and are pulled on demand (see migrate.mjs). Vercel org/project ids
 * are not secret, so they live here in git.
 *
 * A region is targeted by exporting `VERCEL_ORG_ID` + `VERCEL_PROJECT_ID` for the
 * Vercel CLI, which overrides `.vercel/project.json` without re-linking.
 *
 * See docs/deploying-regions.md for the one-time setup runbook.
 */
export const TARGETS = {
  uk: {
    id: "uk",
    label: "UK / EU",
    profile: "uk",
    vercelOrgId: "team_pbH4UiiCQFe5tHgdDSg8KH4a",
    vercelProjectId: "prj_5YTVbk3YUpfOPHMhSdhIcVplSRpp",
    vercelProjectName: "aiccm",
    prodDomain: "tndrx.com",
  },
  cn: {
    id: "cn",
    label: "China",
    profile: "cn",
    vercelOrgId: "team_pbH4UiiCQFe5tHgdDSg8KH4a",
    vercelProjectId: "prj_gIdu06fNb2Tqg2OOGEOV3Gu5U1pa",
    vercelProjectName: "aiccm-cn",
    // Using the default Vercel URL for now; swap for cn.tndrx.com once DNS is set.
    prodDomain: "aiccm-cn.vercel.app",
  },
};

/**
 * Resolve a target by region id, or exit(1) with a clear message. `needsProject`
 * additionally requires the Vercel project id to be populated.
 */
export function resolveTarget(region, { needsProject = true } = {}) {
  const target = TARGETS[region];
  if (!target) {
    const known = Object.keys(TARGETS).join(", ");
    console.error(
      `Unknown region "${region ?? ""}". Expected one of: ${known}.`,
    );
    process.exit(1);
  }
  if (needsProject && !target.vercelProjectId) {
    console.error(
      `Region "${region}" has no vercelProjectId set.\n` +
        `Create the "${target.vercelProjectName}" Vercel project first, then paste its\n` +
        `project id into scripts/deploy-targets.mjs (see docs/deploying-regions.md).`,
    );
    process.exit(1);
  }
  return target;
}
