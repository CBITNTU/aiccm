import { checkSuperadminRole } from "@/lib/api";
import { isCompanyMember, AuthError } from "@/lib/api/validation";
import { enableEmailSuppression } from "@/lib/email/suppression";
import { logEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";

/**
 * Who the caller is relative to a company.
 *
 * Company-scoped routes historically gated on `isCompanyMember` alone, which
 * locks a superadmin out of the very accounts they have to prepare before
 * approving. `adminOverride` marks the case where access exists *only* because
 * the caller is a superadmin — routes use it to bypass the pending-changes
 * review queue and the monthly AI quotas, and to withhold email.
 */
export interface CompanyAccess {
  /** Owner or approved team member of the company. */
  isMember: boolean;
  /**
   * Access granted solely by the superadmin role, not by membership. A
   * superadmin who *is* a member is treated as an ordinary member — they are
   * acting on their own company, so the normal review rules apply.
   */
  adminOverride: boolean;
  hasAccess: boolean;
}

/**
 * Resolve the caller's relationship to a company. Never throws — use
 * `requireCompanyAccess` when absence of access should be a 401.
 *
 * Membership is checked first and short-circuits, so the common case costs no
 * extra role lookup.
 */
export async function getCompanyAccess(
  userId: string,
  companyId: string,
): Promise<CompanyAccess> {
  if (await isCompanyMember(userId, companyId)) {
    return { isMember: true, adminOverride: false, hasAccess: true };
  }

  const isSuperadmin = await checkSuperadminRole(userId);
  return {
    isMember: false,
    adminOverride: isSuperadmin,
    hasAccess: isSuperadmin,
  };
}

/**
 * Resolve access and throw `AuthError` when the caller is neither a member nor
 * a superadmin.
 *
 * NOTE: this deliberately does NOT enable email suppression, even though every
 * admin-override request needs it. `enableEmailSuppression` has to run in the
 * route handler's own frame — see the warning on that function — so each route
 * calls `suppressEmailForAdminOverride(access, userId)` itself right after
 * awaiting this. The guarantee that nothing escapes still lives in one place:
 * `sendEmail` refuses to send whenever a suppression scope is active.
 */
export async function requireCompanyAccess(
  userId: string,
  companyId: string,
): Promise<CompanyAccess> {
  const access = await getCompanyAccess(userId, companyId);

  if (!access.hasAccess) {
    throw new AuthError("No access to this company");
  }

  return access;
}

/**
 * Like `requireCompanyAccess`, but for routes that mutate the company record
 * itself — where a plain `member` must not write.
 *
 * `requireCompanyAccess` cannot express this: `CompanyAccess` only knows
 * member-or-not, and a company `member` is a legitimate member who still may
 * not edit company details. `getCompanyMemberRole` reports the owner as
 * `admin`, so the owner passes.
 *
 * Returns a `CompanyAccess` so callers can hand it straight to
 * `suppressEmailForAdminOverride` — which, per that function's contract, they
 * must still call from their own frame.
 */
export async function requireCompanyAdmin(
  userId: string,
  companyId: string,
): Promise<CompanyAccess> {
  const { getCompanyMemberRole } = await import("@/lib/db/queries");
  const [memberRole, isSuperadmin] = await Promise.all([
    getCompanyMemberRole(userId, companyId),
    checkSuperadminRole(userId),
  ]);

  if (!memberRole && !isSuperadmin) {
    throw new AuthError("No access to this company");
  }
  if (memberRole && memberRole !== "admin" && !isSuperadmin) {
    throw new AuthError("Only company admins can update company details");
  }

  // A superadmin who is not a member is acting on the user's behalf (typically
  // preparing an account before approving it). Their edits are already reviewed
  // by definition, so they bypass the change-review queue and send no email.
  return {
    isMember: !!memberRole,
    adminOverride: !memberRole && isSuperadmin,
    hasAccess: true,
  };
}

/**
 * Withhold email for the rest of this request when the caller is acting purely
 * as an admin. Must be called from the route handler body.
 */
export function suppressEmailForAdminOverride(
  access: CompanyAccess,
  actorUserId: string,
): void {
  if (!access.adminOverride) return;
  enableEmailSuppression({
    reason: "admin-acting-on-behalf",
    actorUserId,
  });
}

/**
 * Record that a superadmin curated this company on the owner's behalf.
 *
 * Read by `POST /api/admin/approve-user`, which skips its automatic AI prefill
 * for prepared companies so the curated values survive approval. Best-effort —
 * a failure here must never break the admin's save.
 */
export async function markCompanyAdminPrepared(
  companyId: string,
  adminUserId: string,
): Promise<void> {
  try {
    // Read the prior state before overwriting it, so the audit log can tell a
    // first on-behalf edit from the twentieth. Deliberately isolated: the marker
    // write is what approval depends on, and it must not be lost because the
    // lookup failed.
    let alreadyPrepared = true;
    try {
      const [existing] = await db
        .select({ preparedAt: companies.adminPreparedAt })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
      alreadyPrepared = !!existing?.preparedAt;
    } catch {
      // Fall through with the write; skip the event rather than risk a duplicate.
    }

    await db
      .update(companies)
      .set({ adminPreparedAt: new Date(), adminPreparedBy: adminUserId })
      .where(eq(companies.id, companyId));

    // Only the first edit of a preparation session is worth recording; logging
    // every field save would bury the signal. Without this the edits are
    // unattributable — they land on the owner's record looking like the owner
    // made them.
    if (!alreadyPrepared) {
      await logEvent({
        actionType: "admin_company_prepared",
        userId: adminUserId,
        entityType: "company",
        entityId: companyId,
      });
    }
  } catch (error) {
    console.error("Failed to mark company as admin-prepared:", error);
  }
}
