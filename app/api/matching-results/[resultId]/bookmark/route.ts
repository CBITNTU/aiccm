import { NextRequest } from "next/server";
import { apiResponse, apiError } from "@/lib/api";
import {
  requireAuth,
  handleApiError,
  isCompanyMember,
  AuthError,
} from "@/lib/api/validation";
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

    const hasAccess = await isCompanyMember(user.id, result[0].companyId);
    if (!hasAccess) {
      throw new AuthError("No access to this matching result");
    }

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
