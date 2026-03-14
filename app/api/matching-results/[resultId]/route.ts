import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError, AuthError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { matchingResults, companies } from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ resultId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { resultId } = await params;

    // Verify ownership via join
    const result = await db
      .select({ companyUserId: companies.userId })
      .from(matchingResults)
      .innerJoin(companies, eq(matchingResults.companyId, companies.id))
      .where(eq(matchingResults.id, resultId))
      .limit(1);

    if (!result[0] || result[0].companyUserId !== user.id) {
      throw new AuthError("No access to this matching result");
    }

    await db.delete(matchingResults).where(eq(matchingResults.id, resultId));

    return apiResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
