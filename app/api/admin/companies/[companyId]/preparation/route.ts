import { NextRequest } from "next/server";
import { apiResponse, apiError, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companies, profiles } from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";

/**
 * Header payload for the company-scoped preparation console at
 * /admin/companies/[companyId].
 *
 * The approvals counterpart (/api/admin/approvals/[userId]) starts from a user
 * and resolves a company to curate. Here it is the other way round: the admin
 * picked a specific company, so the owner is looked up from it and may not
 * exist at all (imported and system companies have no `userId`).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    if (!(await checkSuperadminRole(user.id))) {
      return apiError("Forbidden: Superadmin access required", 403);
    }

    const { companyId } = await params;

    const company = await db
      .select({
        id: companies.id,
        companyName: companies.companyName,
        userId: companies.userId,
        status: companies.status,
        verificationStatus: companies.verificationStatus,
        isSystemCompany: companies.isSystemCompany,
        adminPreparedAt: companies.adminPreparedAt,
        adminPreparedBy: companies.adminPreparedBy,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!company) {
      return apiError("Company not found", 404);
    }

    const owner = company.userId
      ? await db
          .select({
            userId: profiles.userId,
            email: profiles.email,
            firstName: profiles.firstName,
            lastName: profiles.lastName,
            approvalStatus: profiles.approvalStatus,
          })
          .from(profiles)
          .where(eq(profiles.userId, company.userId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : null;

    return apiResponse({
      company,
      owner,
      adminPrepared: company.adminPreparedAt
        ? { at: company.adminPreparedAt, by: company.adminPreparedBy }
        : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Clear the admin-prepared marker on this company alone, so approval runs the
 * automatic AI prefill again. The approvals route clears every company the
 * owner has; from here only the company on screen should be affected.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    if (!(await checkSuperadminRole(user.id))) {
      return apiError("Forbidden: Superadmin access required", 403);
    }

    const { companyId } = await params;

    const updated = await db
      .update(companies)
      .set({ adminPreparedAt: null, adminPreparedBy: null })
      .where(eq(companies.id, companyId))
      .returning({ id: companies.id });

    if (updated.length === 0) {
      return apiError("Company not found", 404);
    }

    return apiResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
