import { checkSuperadminRole } from "@/lib/api";
import { isCompanyMember, AuthError } from "@/lib/api/validation";
import { enableEmailSuppression } from "@/lib/email/suppression";
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
    await db
      .update(companies)
      .set({ adminPreparedAt: new Date(), adminPreparedBy: adminUserId })
      .where(eq(companies.id, companyId));
  } catch (error) {
    console.error("Failed to mark company as admin-prepared:", error);
  }
}
