import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError, sanitizeLikeParam } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { tenders } from "@/lib/db/schema/app";
import { inArray, asc, ilike, or, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");

    const conditions = [inArray(tenders.status, ["open", "closing_soon"])];

    if (search?.trim()) {
      const safeSearch = `%${sanitizeLikeParam(search)}%`;
      conditions.push(
        or(
          ilike(tenders.title, safeSearch),
          ilike(tenders.buyer, safeSearch),
          ilike(tenders.description, safeSearch),
        )!,
      );
    }

    const data = await db
      .select({
        id: tenders.id,
        title: tenders.title,
        buyer: tenders.buyer,
        deadline: tenders.deadline,
        status: tenders.status,
        location: tenders.location,
        budgetMin: tenders.budgetMin,
        budgetMax: tenders.budgetMax,
        currency: tenders.currency,
        description: tenders.description,
        referenceNumber: tenders.referenceNumber,
      })
      .from(tenders)
      .where(and(...conditions))
      .orderBy(asc(tenders.deadline))
      .limit(100);

    return apiResponse({ tenders: data });
  } catch (error) {
    return handleApiError(error);
  }
}
