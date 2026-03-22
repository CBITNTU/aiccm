import { NextRequest } from "next/server";
import { apiResponse, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError, AuthError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companyVerificationRequests, companies } from "@/lib/db/schema/app";
import { eq, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    const requests = await db
      .select({
        id: companyVerificationRequests.id,
        companyId: companyVerificationRequests.companyId,
        submittedBy: companyVerificationRequests.submittedBy,
        status: companyVerificationRequests.status,
        submissionNotes: companyVerificationRequests.submissionNotes,
        reviewNotes: companyVerificationRequests.reviewNotes,
        reviewedBy: companyVerificationRequests.reviewedBy,
        reviewedAt: companyVerificationRequests.reviewedAt,
        companySnapshot: companyVerificationRequests.companySnapshot,
        createdAt: companyVerificationRequests.createdAt,
        companyName: companies.companyName,
        companyStatus: companies.status,
        verificationStatus: companies.verificationStatus,
      })
      .from(companyVerificationRequests)
      .innerJoin(companies, eq(companyVerificationRequests.companyId, companies.id))
      .orderBy(desc(companyVerificationRequests.createdAt));

    return apiResponse({ requests });
  } catch (error) {
    return handleApiError(error);
  }
}
