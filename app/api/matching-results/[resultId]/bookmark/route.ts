import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { matchingResults } from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ resultId: string }> },
) {
  try {
    await requireAuth(request);
    const { resultId } = await params;

    const body = await request.json();
    const { is_bookmarked } = body as { is_bookmarked: boolean };

    const data = await db
      .update(matchingResults)
      .set({ isBookmarked: is_bookmarked })
      .where(eq(matchingResults.id, resultId))
      .returning({ id: matchingResults.id, isBookmarked: matchingResults.isBookmarked });

    if (!data[0]) {
      return apiResponse({ error: "Result not found" }, 404);
    }

    return apiResponse({ result: data[0] });
  } catch (error) {
    return handleApiError(error);
  }
}
