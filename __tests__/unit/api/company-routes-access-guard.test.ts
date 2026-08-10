import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Scans all of `app/api`, not just `app/api/companies`: the standards
// catalogue route gates on a `companyId` query param while living outside the
// companies tree, and a narrower scan let it slip past the migration.
const ROUTES_DIR = path.join(process.cwd(), "app/api");

/**
 * Company-scoped routes must gate on `@/lib/api/companyAccess`, never on bare
 * `isCompanyMember` — the latter has no superadmin awareness and locks an admin
 * out of the very accounts they have to prepare before approving.
 *
 * These two are member-only on purpose: submitting for verification, or
 * submitting changes for review, is the owner's act. An admin's edits already
 * bypass the review queue, so they have nothing to submit. The pre-approval
 * console hides those buttons (VerificationBanner, PendingChangesBar) instead
 * of granting the admin the route.
 */
const MEMBER_ONLY_ALLOWLIST = [
  "companies/[companyId]/submit-changes/route.ts",
  "companies/[companyId]/verification/route.ts",
];

/**
 * Not exemptions — debt. These predate the companyAccess migration, which only
 * covered `app/api/companies`, and nobody has decided yet whether a superadmin
 * should be able to drive VO projects or the job queue on a company's behalf.
 * Audit them one at a time and delete each entry as it moves to
 * `requireCompanyAccess`; the `it.each` below fails if a listed file no longer
 * uses `isCompanyMember`, so the list cannot rot silently.
 *
 * The `match-tenders/*` routes have been audited: the admin console runs tender
 * matching on a company it is preparing, so they all gate on `companyAccess`.
 */
const UNAUDITED_ALLOWLIST = [
  "analyze-company-ai/route.ts",
  "create-project/route.ts",
  "projects/[projectId]/members/[memberId]/route.ts",
  "projects/[projectId]/members/route.ts",
  "projects/[projectId]/route.ts",
  "projects/invitations/[invitationId]/respond/route.ts",
  "projects/route.ts",
  "queue/company-ai/route.ts",
  "queue/job-status/route.ts",
  "send-project-invitations/route.ts",
];

const ALLOWLIST = [...MEMBER_ONLY_ALLOWLIST, ...UNAUDITED_ALLOWLIST];

function routeFiles(): string[] {
  return readdirSync(ROUTES_DIR, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith("route.ts"))
    .map((entry) => entry.split(path.sep).join("/"))
    .sort();
}

/**
 * True when the file pulls `isCompanyMember` out of the validation module.
 *
 * Deliberately matches the import specifier list rather than the bare
 * identifier, so a route that merely *mentions* the helper in a comment
 * explaining why it doesn't use it isn't flagged.
 */
function importsIsCompanyMember(source: string): boolean {
  const patterns = [
    /import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/api\/validation["']/g,
    /\{([^}]*)\}\s*=\s*await\s+import\(\s*["']@\/lib\/api\/validation["']\s*\)/g,
  ];
  return patterns.some((pattern) =>
    [...source.matchAll(pattern)].some((match) =>
      /\bisCompanyMember\b/.test(match[1]),
    ),
  );
}

function readRoute(file: string): string {
  return readFileSync(path.join(ROUTES_DIR, file), "utf8");
}

describe("company API routes gate on companyAccess", () => {
  const files = routeFiles();

  it("finds the route files it is supposed to police", () => {
    // Guards against a silent pass if the directory moves or the glob breaks.
    expect(files.length).toBeGreaterThan(ALLOWLIST.length);
  });

  it("no non-allowlisted route imports isCompanyMember", () => {
    const offenders = files.filter(
      (file) =>
        !ALLOWLIST.includes(file) && importsIsCompanyMember(readRoute(file)),
    );

    expect(offenders).toEqual([]);
  });

  // Keeps the allowlist honest: a renamed or since-migrated file must be
  // removed from it rather than silently narrowing the guard's coverage.
  it.each(ALLOWLIST)("%s still gates on isCompanyMember", (file) => {
    expect(files).toContain(file);
    expect(importsIsCompanyMember(readRoute(file))).toBe(true);
  });
});
