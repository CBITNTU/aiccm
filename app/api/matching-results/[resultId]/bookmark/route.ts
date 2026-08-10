import { NextRequest } from "next/server";
import { apiResponse, apiError } from "@/lib/api";
import {
  requireAuth,
  handleApiError,
  AuthError,
  isUuid,
} from "@/lib/api/validation";
import {
  getCompanyAccess,
  suppressEmailForAdminOverride,
} from "@/lib/api/companyAccess";
import { db } from "@/lib/db";
import { matchingResults } from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ resultId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { resultId } = await params;

    // A non-uuid would reach Postgres as a failed cast and surface as a 500.
    if (!isUuid(resultId)) {
      return apiError("Result not found", 404);
    }

    // Verify user has access to the company associated with this result
    const result = await db
      .select({
        id: matchingResults.id,
        companyId: matchingResults.companyId,
      })
      .from(matchingResults)
      .where(eq(matchingResults.id, resultId))
      .limit(1);

    if (!result[0]) {
      return apiError("Result not found", 404);
    }

    // Owner, approved member, or a superadmin preparing the account.
    const access = await getCompanyAccess(user.id, result[0].companyId);
    if (!access.hasAccess) {
      throw new AuthError("No access to this matching result");
    }
    // Must be in this frame — see enableEmailSuppression's contract.
    suppressEmailForAdminOverride(access, user.id);

    const body = await request.json();
    const isBookmarked = body.isBookmarked ?? body.is_bookmarked;

    const data = await db
      .update(matchingResults)
      .set({ isBookmarked })
      .where(eq(matchingResults.id, resultId))
      .returning({ id: matchingResults.id, isBookmarked: matchingResults.isBookmarked });

    return apiResponse({ result: data[0] });
  } catch (error) {
    return handleApiError(error);
  }
}
