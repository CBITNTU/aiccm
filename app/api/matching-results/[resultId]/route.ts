import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError, AuthError } from "@/lib/api/validation";
import {
  getCompanyAccess,
  suppressEmailForAdminOverride,
} from "@/lib/api/companyAccess";
import { db } from "@/lib/db";
import { matchingResults } from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ resultId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { resultId } = await params;

    // Fetch the matching result's company
    const result = await db
      .select({ companyId: matchingResults.companyId })
      .from(matchingResults)
      .where(eq(matchingResults.id, resultId))
      .limit(1);

    if (!result[0]) {
      throw new AuthError("Matching result not found");
    }

    // Owner, approved member, or a superadmin preparing the account.
    const access = await getCompanyAccess(user.id, result[0].companyId);
    if (!access.hasAccess) {
      throw new AuthError("No access to this matching result");
    }
    // Must be in this frame — see enableEmailSuppression's contract.
    suppressEmailForAdminOverride(access, user.id);

    await db.delete(matchingResults).where(eq(matchingResults.id, resultId));

    return apiResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
